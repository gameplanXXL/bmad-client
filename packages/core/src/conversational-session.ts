import { EventEmitter } from 'eventemitter3';
import type { BmadClient } from './client.js';
import type {
  ConversationalOptions,
  ConversationTurn,
  ConversationResult,
  ConversationalStatus,
  Message,
  ContentBlock,
  AgentDefinition,
  CostReport,
  Document,
  ModelCost,
  ToolCall,
  LLMProvider,
} from './types.js';
import { SystemPromptGenerator } from './prompt-generator.js';
import { AgentLoader } from './agent-loader.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { FallbackToolExecutor } from './tools/fallback-executor.js';

/**
 * ConversationalSession - Multi-turn conversational interaction with an agent
 *
 * Unlike BmadSession (one-shot execution), ConversationalSession allows sending
 * multiple messages to the same agent, maintaining context across turns.
 * This provides a Claude Code-like REPL experience.
 */
export class ConversationalSession extends EventEmitter {
  readonly id: string;
  readonly agentId: string;

  private client: BmadClient;
  private options: ConversationalOptions;
  private status: ConversationalStatus = 'idle';
  private startTime?: number;
  private endTime?: number;

  // Components
  private promptGenerator: SystemPromptGenerator;
  private agentLoader: AgentLoader;
  private provider?: LLMProvider;
  private toolExecutor: FallbackToolExecutor;

  // Persistent state across turns
  private messages: Message[] = []; // Cumulative conversation history
  private turns: ConversationTurn[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private apiCallCount = 0;
  private perModelUsage = new Map<string, { inputTokens: number; outputTokens: number }>();

  // Current turn state
  private currentTurnStartTime?: number;
  private currentTurnUserMessage?: string;
  private currentTurnToolCalls: ToolCall[] = [];
  private currentTurnInputTokens = 0;
  private currentTurnOutputTokens = 0;

  // Question handling
  private pendingQuestion?: {
    question: string;
    context?: string;
    resolve: (answer: string) => void;
    reject: (error: Error) => void;
  };

  // Agent definition (loaded once)
  private agent?: AgentDefinition;

  constructor(
    client: BmadClient,
    agentId: string,
    options?: ConversationalOptions,
    testProvider?: LLMProvider // For testing only
  ) {
    super();
    this.client = client;
    this.agentId = agentId;
    this.options = options || {};
    this.id = this.generateConversationId();

    // Initialize components
    this.promptGenerator = new SystemPromptGenerator();
    this.agentLoader = new AgentLoader(client.getLogger());
    this.toolExecutor = new FallbackToolExecutor();

    // Use test provider if provided (for testing)
    if (testProvider) {
      this.provider = testProvider;
    }

    // Initialize VFS if context has initial files
    if (this.options.context?.['initialFiles']) {
      this.toolExecutor.initializeFiles(
        this.options.context['initialFiles'] as Record<string, string>
      );
    }

    this.client.getLogger().debug('Conversational session created', {
      conversationId: this.id,
      agentId,
    });
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateTurnId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Initialize the conversation (load agent, setup system prompt)
   */
  private async initialize(): Promise<void> {
    if (this.agent) {
      return; // Already initialized
    }

    this.startTime = Date.now();

    // 1. Load agent definition
    this.agent = await this.loadAgent();
    this.client.getLogger().debug('Agent loaded for conversation', { agentId: this.agentId });

    // 2. Load templates and agent files into VFS
    await this.loadTemplatesIntoVFS(this.agent);

    // 3. Initialize provider (skip if test provider was injected)
    if (!this.provider) {
      const config = this.client.getConfig();

      // Support direct provider instances (for testing)
      if ('sendMessage' in config.provider) {
        this.provider = config.provider as LLMProvider;
      } else {
        this.provider = new AnthropicProvider(
          config.provider.apiKey,
          config.provider.model || 'claude-sonnet-4-20250514'
        );
      }
    }

    // 4. Generate system prompt
    const tools = this.toolExecutor.getTools();
    const systemPrompt = this.promptGenerator.generate(this.agent, tools);

    // 5. Add system message (only once at start)
    this.messages.push({
      role: 'system',
      content: systemPrompt,
    });

    this.client.getLogger().info('Conversational session initialized', { conversationId: this.id });
  }

  private async loadAgent(): Promise<AgentDefinition> {
    const { resolve, join } = await import('path');
    const { readdir } = await import('fs/promises');
    const expansionPaths = this.client.getConfig().expansionPackPaths || [];
    const fallbackPaths = [
      './.bmad-core/agents',
      '../bmad-export-author/.bmad-core/agents',
      '../bmad-export-author/.bmad-expert-author/agents',
      '../bmad-export-author/.bmad-competency-assessor/agents',
    ];

    const searchPaths: string[] = [];

    // 1. Scan expansion pack paths for .bmad-* directories (like templates/tasks)
    for (const basePath of expansionPaths) {
      try {
        this.client.getLogger().debug(`Scanning expansion pack for agents: ${basePath}`);
        const entries = await readdir(basePath);

        // Find all .bmad-* directories
        const bmadDirs = entries.filter((entry) => entry.startsWith('.bmad-'));

        for (const bmadDir of bmadDirs) {
          const agentsPath = join(basePath, bmadDir, 'agents');
          searchPaths.push(agentsPath);
          this.client.getLogger().debug(`Found expansion pack agents directory: ${agentsPath}`);
        }
      } catch (error) {
        this.client.getLogger().debug(`Failed to scan expansion pack: ${basePath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // 2. Add fallback paths
    searchPaths.push(...fallbackPaths);

    // 3. Try to load agent from all discovered paths
    for (const basePath of searchPaths) {
      const agentPath = resolve(join(basePath, `${this.agentId}.md`));
      this.client.getLogger().debug(`Trying agent path: ${agentPath}`);

      try {
        const agent = await this.agentLoader.loadAgent(agentPath);
        this.client
          .getLogger()
          .info(`Agent loaded successfully: ${this.agentId} from ${agentPath}`);
        return agent;
      } catch (error) {
        // Log the specific error for debugging
        this.client.getLogger().debug(`Failed to load from ${agentPath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        // Try next path
        continue;
      }
    }

    throw new Error(`Agent '${this.agentId}' not found in any configured paths`);
  }

  private async loadTemplatesIntoVFS(agent: AgentDefinition): Promise<void> {
    // Load agent file itself
    const agentContent = `# ${agent.agent.name}\n\nAgent definition loaded into VFS`;

    // Use regular write (tools have async write, not sync)
    await this.toolExecutor.execute({
      id: 'init-agent',
      name: 'write_file',
      input: {
        file_path: `/.bmad-core/agents/${this.agentId}.md`,
        content: agentContent,
      },
    });

    // TODO: Load templates and tasks referenced in agent.dependencies
    // For now, we keep VFS minimal
  }

  /**
   * Send a user message (non-blocking)
   * Returns immediately, conversation processes in background
   */
  async send(message: string): Promise<void> {
    if (this.status === 'ended') {
      throw new Error('Cannot send message to ended conversation');
    }

    if (this.status === 'processing') {
      throw new Error('Cannot send message while agent is still processing previous message');
    }

    try {
      if (!this.agent) {
        await this.initialize();
      }

      // Ensure startTime is set (in case initialize was mocked in tests)
      if (!this.startTime) {
        this.startTime = Date.now();
      }

      this.client.getLogger().info('User message received', {
        conversationId: this.id,
        message: message.substring(0, 100),
      });

      // Set status to processing immediately to prevent race conditions
      this.status = 'processing';

      // Start processing this turn (non-blocking)
      this.processTurn(message).catch((error) => {
        this.client.getLogger().error('Turn processing failed', { error });
        this.status = 'error';
        this.emit('error', error);
      });
    } catch (error: unknown) {
      // Handle initialization errors
      this.client.getLogger().error('Initialization failed', { error });
      this.status = 'error';
      this.emit('error', error);
    }
  }

  /**
   * Process a single turn (internal)
   */
  private async processTurn(userMessage: string): Promise<void> {
    // Status is already set to 'processing' in send()
    this.currentTurnStartTime = Date.now();
    this.currentTurnUserMessage = userMessage;
    this.currentTurnToolCalls = [];
    this.currentTurnInputTokens = 0;
    this.currentTurnOutputTokens = 0;

    this.emit('turn-started');

    try {
      // Add user message to conversation
      this.messages.push({
        role: 'user',
        content: userMessage,
      });

      // Tool call loop (like BmadSession.execute)
      let agentResponse = '';
      let continueLoop = true;

      while (continueLoop) {
        // Send messages to LLM
        const response = await this.provider!.sendMessage(
          this.messages,
          this.toolExecutor.getTools()
        );

        // Track usage
        this.trackUsage(response.usage);

        // Check cost limit AFTER tracking usage
        this.checkCostLimit();

        // Extract text content
        const textContent = this.extractTextContent(response.message.content);
        if (textContent) {
          agentResponse += textContent + '\n';
        }

        // Handle different stop reasons
        if (response.stopReason === 'tool_use' && response.message.toolCalls) {
          // Debug logging
          this.client.getLogger().debug('[TOOL_USE] Response received:', {
            stopReason: response.stopReason,
            toolCallsCount: response.message.toolCalls?.length || 0,
            contentIsArray: Array.isArray(response.message.content),
            contentBlocks: Array.isArray(response.message.content)
              ? response.message.content.map((c) => ({ type: c.type }))
              : 'string',
          });

          // Execute tools
          this.currentTurnToolCalls.push(...response.message.toolCalls);

          // Add assistant message with tool calls
          this.messages.push({
            role: 'assistant',
            content: response.message.content,
          });

          this.client.getLogger().debug('[MESSAGES] Added assistant message with tool_use:', {
            messageIndex: this.messages.length - 1,
            hasToolUse:
              Array.isArray(response.message.content) &&
              response.message.content.some((c) => c.type === 'tool_use'),
          });

          // Execute tools and add results
          const toolResults = await this.executeTools(response.message.toolCalls);

          this.messages.push({
            role: 'user',
            content: toolResults,
          });

          this.client.getLogger().debug('[MESSAGES] Added user message with tool_results:', {
            messageIndex: this.messages.length - 1,
            toolResultsCount: toolResults.length,
          });

          // Continue loop
          continueLoop = true;
        } else if (response.stopReason === 'end_turn') {
          // Turn complete
          this.messages.push({
            role: 'assistant',
            content: response.message.content,
          });

          // Emit message event for assistant response
          this.emit('message', {
            role: 'assistant',
            content: textContent,
            usage: {
              input_tokens: response.usage.inputTokens,
              output_tokens: response.usage.outputTokens,
              total_tokens: response.usage.inputTokens + response.usage.outputTokens,
            },
          });

          continueLoop = false;
        } else {
          // Other stop reasons (max_tokens, stop_sequence)
          this.messages.push({
            role: 'assistant',
            content: response.message.content,
          });

          // Emit message event for assistant response
          this.emit('message', {
            role: 'assistant',
            content: textContent,
            usage: {
              input_tokens: response.usage.inputTokens,
              output_tokens: response.usage.outputTokens,
              total_tokens: response.usage.inputTokens + response.usage.outputTokens,
            },
          });

          continueLoop = false;
        }

        // Check if agent asked a question
        if (textContent && this.isQuestion(textContent)) {
          // Pause for answer
          continueLoop = false;
          await this.waitForAnswer(textContent, {
            input_tokens: response.usage.inputTokens,
            output_tokens: response.usage.outputTokens,
            total_tokens: response.usage.inputTokens + response.usage.outputTokens,
          });
          // After answer, continue processing
          continueLoop = true;
        }
      }

      // Turn completed successfully
      const turn: ConversationTurn = {
        id: this.generateTurnId(),
        userMessage: this.currentTurnUserMessage!,
        agentResponse: agentResponse.trim(),
        toolCalls: this.currentTurnToolCalls,
        tokensUsed: {
          input: this.currentTurnInputTokens,
          output: this.currentTurnOutputTokens,
        },
        cost: this.calculateTurnCost(),
        timestamp: this.currentTurnStartTime!,
      };

      this.turns.push(turn);
      this.status = 'idle';
      this.emit('turn-completed', turn);
      this.emit('idle');

      this.client.getLogger().info('Turn completed', {
        conversationId: this.id,
        turnId: turn.id,
        cost: turn.cost,
      });
    } catch (error) {
      this.client.getLogger().error('Turn failed', { error });
      this.status = 'error';
      throw error;
    }
  }

  private extractTextContent(content: string | ContentBlock[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((block: ContentBlock) => block.type === 'text')
        .map((block: ContentBlock) => block.text ?? '')
        .join('\n');
    }

    return '';
  }

  private async executeTools(toolCalls: ToolCall[]): Promise<ContentBlock[]> {
    const results: ContentBlock[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.toolExecutor.execute(toolCall);
        results.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result.content,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        });
      }
    }

    return results;
  }

  private isQuestion(text: string): boolean {
    // Simple heuristic: ends with '?'
    return text.trim().endsWith('?');
  }

  private async waitForAnswer(
    question: string,
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.status = 'waiting_for_answer';
      this.pendingQuestion = {
        question,
        resolve: () => {
          this.pendingQuestion = undefined;
          this.status = 'processing';
          resolve();
        },
        reject,
      };

      this.emit('question', { question, usage });

      // TODO: Implement timeout
    });
  }

  /**
   * Answer a pending question
   */
  async answer(input: string): Promise<void> {
    if (!this.pendingQuestion) {
      throw new Error('No pending question to answer');
    }

    this.client.getLogger().debug('Answer received', { conversationId: this.id });

    // Add answer to messages
    this.messages.push({
      role: 'user',
      content: input,
    });

    // Resolve the promise to continue processing
    this.pendingQuestion.resolve(input);
  }

  /**
   * Check if agent is idle (ready for next message)
   */
  isIdle(): boolean {
    return this.status === 'idle';
  }

  /**
   * Wait for current processing to complete
   */
  async waitForCompletion(timeoutMs?: number): Promise<ConversationTurn> {
    const timeout = timeoutMs || 300000; // 5 minutes default

    return new Promise((resolve, reject) => {
      // If already idle, resolve immediately
      if (this.status === 'idle') {
        const lastTurn = this.turns[this.turns.length - 1];
        if (!lastTurn) {
          reject(new Error('No turns completed yet'));
          return;
        }
        resolve(lastTurn);
        return;
      }

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for completion'));
      }, timeout);

      // Listen for completion
      const handleTurnCompleted = (turn: ConversationTurn) => {
        cleanup();
        resolve(turn);
      };

      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.off('turn-completed', handleTurnCompleted);
        this.off('error', handleError);
      };

      this.once('turn-completed', handleTurnCompleted);
      this.once('error', handleError);
    });
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationTurn[] {
    return [...this.turns];
  }

  /**
   * Get accumulated documents so far
   */
  getDocuments(): Document[] {
    return this.toolExecutor.getDocuments();
  }

  /**
   * Get current costs
   */
  getCosts(): CostReport {
    const breakdown: ModelCost[] = [];
    const modelInfo = this.provider?.getModelInfo();

    for (const [model, usage] of this.perModelUsage.entries()) {
      breakdown.push({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        inputCost: (usage.inputTokens / 1000) * (modelInfo?.inputCostPer1k || 0),
        outputCost: (usage.outputTokens / 1000) * (modelInfo?.outputCostPer1k || 0),
      });
    }

    const totalCost = breakdown.reduce((sum, b) => sum + b.inputCost + b.outputCost, 0);

    return {
      totalCost,
      currency: 'USD',
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      apiCalls: this.apiCallCount,
      breakdown,
    };
  }

  /**
   * Explicitly end the conversation
   */
  async end(): Promise<ConversationResult> {
    if (this.status === 'processing') {
      throw new Error('Cannot end conversation while processing');
    }

    this.status = 'ended';
    this.endTime = Date.now();

    const result: ConversationResult = {
      conversationId: this.id,
      turns: this.turns,
      documents: this.toolExecutor.getDocuments(),
      totalCost: this.getCosts().totalCost,
      totalTokens: {
        input: this.totalInputTokens,
        output: this.totalOutputTokens,
      },
      duration: this.endTime! - this.startTime!,
    };

    this.client.getLogger().info('Conversation ended', {
      conversationId: this.id,
      turns: result.turns.length,
      cost: result.totalCost,
    });

    return result;
  }

  private trackUsage(usage: { inputTokens: number; outputTokens: number }): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.currentTurnInputTokens += usage.inputTokens;
    this.currentTurnOutputTokens += usage.outputTokens;
    this.apiCallCount++;

    const model = this.provider!.getModelInfo().name;
    const current = this.perModelUsage.get(model) || { inputTokens: 0, outputTokens: 0 };
    this.perModelUsage.set(model, {
      inputTokens: current.inputTokens + usage.inputTokens,
      outputTokens: current.outputTokens + usage.outputTokens,
    });
  }

  private calculateTurnCost(): number {
    return this.provider!.calculateCost({
      inputTokens: this.currentTurnInputTokens,
      outputTokens: this.currentTurnOutputTokens,
    });
  }

  private checkCostLimit(): void {
    if (!this.options.costLimit) {
      return;
    }

    const costs = this.getCosts();
    const currentCost = costs.totalCost;

    // Emit warning at 80% BEFORE throwing error
    const warningThreshold = this.options.costLimit * 0.8;
    if (currentCost >= warningThreshold && currentCost < this.options.costLimit) {
      this.client
        .getLogger()
        .warn('Cost limit warning', { currentCost, limit: this.options.costLimit });
      this.emit('cost-warning', currentCost);
    }

    // Check if exceeded
    if (currentCost >= this.options.costLimit) {
      throw new Error(
        `Cost limit exceeded: $${currentCost.toFixed(4)} >= $${this.options.costLimit.toFixed(2)}`
      );
    }
  }
}
