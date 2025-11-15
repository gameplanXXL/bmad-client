import { EventEmitter } from 'eventemitter3';
import type { BmadClient } from './client.js';
import type {
  SessionOptions,
  SessionResult,
  SessionStatus,
  Message,
  ContentBlock,
  AgentDefinition,
  CostReport,
  ModelCost,
  ChildSessionCost,
  LLMProvider,
  Document,
} from './types.js';
import { SystemPromptGenerator } from './prompt-generator.js';
import { AgentLoader } from './agent-loader.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { FallbackToolExecutor } from './tools/fallback-executor.js';
import { CostTracker } from './cost/tracker.js';

/**
 * BmadSession - Represents a single agent execution session with tool call loop
 */
export class BmadSession extends EventEmitter {
  readonly id: string;
  readonly agentId: string;
  readonly command: string;

  private client: BmadClient;
  private options: SessionOptions;
  private status: SessionStatus = 'pending';
  private startTime?: number;

  // Components
  private promptGenerator: SystemPromptGenerator;
  private agentLoader: AgentLoader;
  private provider?: LLMProvider;
  private toolExecutor: FallbackToolExecutor;
  private costTracker?: CostTracker;

  // State
  private messages: Message[] = [];

  // Legacy tracking (TODO: Remove after full CostTracker integration)
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;
  private apiCallCount = 0;
  private childSessionCosts: ChildSessionCost[] = [];

  // Pause/Resume for user questions
  private pendingQuestion?: {
    question: string;
    context?: string;
    resolve: (answer: string) => void;
    reject: (error: Error) => void;
  };

  constructor(client: BmadClient, agentId: string, command: string, options?: SessionOptions) {
    super();
    this.client = client;
    this.agentId = agentId;
    this.command = command;
    this.options = options || {};
    this.id = this.generateSessionId();

    // Initialize components
    this.promptGenerator = new SystemPromptGenerator();
    this.agentLoader = new AgentLoader(client.getLogger());
    this.toolExecutor = new FallbackToolExecutor();

    // Set session reference in tool executor (for invoke_agent)
    this.toolExecutor.setSession(this);

    // Initialize VFS if context has initial files
    if (this.options.context?.['initialFiles']) {
      this.toolExecutor.initializeFiles(
        this.options.context['initialFiles'] as Record<string, string>
      );
    }

    this.client.getLogger().debug('Session created', {
      sessionId: this.id,
      agentId,
      command,
    });
  }

  /**
   * Continue the conversation with a new message in the same session
   *
   * Allows sending additional messages to the agent after initial execution.
   * Useful for multi-turn conversations within the same session context.
   *
   * @param message - User message to send to the agent
   * @returns Session result for this continuation
   *
   * @example
   * ```typescript
   * const session = await client.startAgent('pm', '*help');
   * const result1 = await session.execute();
   *
   * // Continue the same conversation
   * const result2 = await session.continueWith('What is your role?');
   * ```
   */
  async continueWith(message: string): Promise<SessionResult> {
    // Reset status to running
    this.status = 'running';
    const continueStartTime = Date.now();

    this.client.getLogger().info('Continuing session with new message', {
      sessionId: this.id,
      message,
    });

    try {
      // Add user message to conversation
      this.messages.push({
        role: 'user',
        content: message,
      });

      // Get tools for this continuation
      const tools = this.toolExecutor.getTools();

      // Continue tool call loop
      let loopCount = 0;
      const maxLoops = 50; // Safety limit

      while (loopCount < maxLoops) {
        loopCount++;

        // Send message to LLM
        const response = await this.provider!.sendMessage(this.messages, tools);

        // Track usage
        this.totalInputTokens += response.usage.inputTokens;
        this.totalOutputTokens += response.usage.outputTokens;
        this.apiCallCount++;

        if (this.costTracker) {
          const modelInfo = this.provider!.getModelInfo();
          this.costTracker.recordUsage(response.usage, modelInfo.name);
        }

        this.client.getLogger().debug('LLM response received', {
          stopReason: response.stopReason,
          hasToolCalls: !!response.message.toolCalls,
          toolCallCount: response.message.toolCalls?.length || 0,
        });

        // Add assistant message to conversation
        this.messages.push({
          role: 'assistant',
          content: response.message.content,
        });

        // Auto-save session state if enabled
        if (this.options.autoSave) {
          await this.autoSaveState();
        }

        // Check stop reason
        if (response.stopReason === 'end_turn' || response.stopReason === 'stop_sequence') {
          this.client.getLogger().info('Agent completed continuation', { loopCount });
          break;
        }

        if (response.stopReason === 'max_tokens') {
          this.client.getLogger().warn('Max tokens reached');
          break;
        }

        // Handle tool calls
        if (response.stopReason === 'tool_use' && response.message.toolCalls) {
          this.client.getLogger().debug('Executing tool calls', {
            count: response.message.toolCalls.length,
          });

          // Execute all tool calls
          const toolResults = await Promise.all(
            response.message.toolCalls.map((toolCall) =>
              this.executeTool(toolCall.id, toolCall.name, toolCall.input)
            )
          );

          // Add tool results to conversation
          this.messages.push({
            role: 'user',
            content: this.formatToolResults(response.message.toolCalls, toolResults),
          });

          // Check cost limit
          if (this.options.costLimit) {
            const currentCost = this.calculateCurrentCost();
            if (currentCost >= this.options.costLimit) {
              this.client.getLogger().warn('Cost limit exceeded', {
                currentCost,
                limit: this.options.costLimit,
              });
              throw new Error(
                `Cost limit exceeded: $${currentCost.toFixed(4)} >= $${this.options.costLimit}`
              );
            }
          }

          // Continue loop
          continue;
        }

        // Should not reach here
        break;
      }

      if (loopCount >= maxLoops) {
        throw new Error(`Max loop iterations (${maxLoops}) exceeded`);
      }

      // Build result for this continuation
      const documents = this.toolExecutor.getDocuments();
      const costs = this.buildCostReport();

      // Extract final assistant response
      const assistantMessages = this.messages.filter((m) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      const finalResponse = lastAssistantMessage
        ? this.extractTextContent(lastAssistantMessage.content)
        : undefined;

      const result: SessionResult = {
        status: 'completed',
        documents,
        costs,
        duration: Date.now() - continueStartTime,
        messages: this.messages,
        finalResponse,
      };

      this.status = 'completed';
      this.emit('completed', result);

      this.client.getLogger().info('Session continuation completed', {
        sessionId: this.id,
        documentCount: documents.length,
        totalCost: costs.totalCost,
        apiCalls: this.apiCallCount,
      });

      // Auto-save with completed status
      if (this.options.autoSave) {
        await this.autoSaveState();
      }

      return result;
    } catch (error) {
      this.status = 'failed';
      const result: SessionResult = {
        status: 'failed',
        documents: this.toolExecutor.getDocuments(),
        costs: this.buildCostReport(),
        duration: Date.now() - continueStartTime,
        error: error as Error,
      };

      this.client.getLogger().error('Session continuation failed', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Auto-save with failed status
      if (this.options.autoSave) {
        await this.autoSaveState();
      }

      this.emit('failed', error);
      return result;
    }
  }

  /**
   * Execute the session with tool call loop
   */
  async execute(): Promise<SessionResult> {
    this.status = 'running';
    this.startTime = Date.now();
    this.emit('started');

    this.client.getLogger().info('Session execution started', { sessionId: this.id });

    try {
      // 1. Load agent definition
      const agent = await this.loadAgent();
      this.client.getLogger().debug('Agent loaded', { agentId: this.agentId });

      // 2. Initialize provider
      this.initializeProvider();

      // 3. Initialize cost tracker
      this.initializeCostTracker();

      // 4. Load agents into VFS for discovery (e.g., bmad-orchestrator)
      await this.loadAgentsIntoVFS();

      // 4. Generate system prompt with tools
      const tools = this.toolExecutor.getTools();
      const systemPrompt = this.promptGenerator.generate(agent, tools);

      // 5. Initialize messages with system prompt and user command
      this.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.formatUserCommand(agent) },
      ];

      this.client.getLogger().debug('Starting tool call loop', {
        toolCount: tools.length,
      });

      // 6. Tool call loop
      let loopCount = 0;
      const maxLoops = 50; // Safety limit

      while (loopCount < maxLoops) {
        loopCount++;

        // Send message to LLM
        const response = await this.provider!.sendMessage(this.messages, tools);

        // Track usage via cost tracker AND legacy tracking
        this.totalInputTokens += response.usage.inputTokens;
        this.totalOutputTokens += response.usage.outputTokens;
        this.apiCallCount++;

        if (this.costTracker) {
          const modelInfo = this.provider!.getModelInfo();
          this.costTracker.recordUsage(response.usage, modelInfo.name);
        }

        this.client.getLogger().debug('LLM response received', {
          stopReason: response.stopReason,
          hasToolCalls: !!response.message.toolCalls,
          toolCallCount: response.message.toolCalls?.length || 0,
        });

        // Add assistant message to conversation
        this.messages.push({
          role: 'assistant',
          content: response.message.content,
        });

        // Auto-save session state if enabled
        if (this.options.autoSave) {
          await this.autoSaveState();
        }

        // Check stop reason
        if (response.stopReason === 'end_turn' || response.stopReason === 'stop_sequence') {
          // Agent is done
          this.client.getLogger().info('Agent completed', { loopCount });
          break;
        }

        if (response.stopReason === 'max_tokens') {
          this.client.getLogger().warn('Max tokens reached');
          break;
        }

        // Handle tool calls
        if (response.stopReason === 'tool_use' && response.message.toolCalls) {
          this.client.getLogger().debug('Executing tool calls', {
            count: response.message.toolCalls.length,
          });

          // Execute all tool calls
          const toolResults = await Promise.all(
            response.message.toolCalls.map((toolCall) =>
              this.executeTool(toolCall.id, toolCall.name, toolCall.input)
            )
          );

          // Add tool results to conversation
          this.messages.push({
            role: 'user',
            content: this.formatToolResults(response.message.toolCalls, toolResults),
          });

          // Check cost limit
          if (this.options.costLimit) {
            const currentCost = this.calculateCurrentCost();
            if (currentCost >= this.options.costLimit) {
              this.client.getLogger().warn('Cost limit exceeded', {
                currentCost,
                limit: this.options.costLimit,
              });
              throw new Error(
                `Cost limit exceeded: $${currentCost.toFixed(4)} >= $${this.options.costLimit}`
              );
            }
          }

          // Continue loop
          continue;
        }

        // Should not reach here
        break;
      }

      if (loopCount >= maxLoops) {
        throw new Error(`Max loop iterations (${maxLoops}) exceeded`);
      }

      // 7. Build result
      const documents = this.toolExecutor.getDocuments();
      const costs = this.buildCostReport();

      // 8. Save documents to storage (if configured)
      let storageUrls: string[] | undefined;
      const storage = this.client.getStorage();
      if (storage && documents.length > 0) {
        try {
          const results = await storage.saveBatch(documents, {
            sessionId: this.id,
            agentId: this.agentId,
            command: this.command,
            timestamp: this.startTime!,
          });

          storageUrls = results.filter((r) => r.success && r.url).map((r) => r.url!);

          this.client.getLogger().info('Documents saved to storage', {
            sessionId: this.id,
            count: storageUrls.length,
          });
        } catch (error) {
          this.client.getLogger().warn('Failed to save documents to storage', {
            sessionId: this.id,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      // Extract final assistant response
      const assistantMessages = this.messages.filter((m) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      const finalResponse = lastAssistantMessage
        ? this.extractTextContent(lastAssistantMessage.content)
        : undefined;

      const result: SessionResult = {
        status: 'completed',
        documents,
        costs,
        duration: Date.now() - this.startTime,
        messages: this.messages,
        finalResponse,
        storageUrls,
      };

      this.status = 'completed';
      this.emit('completed', result);

      this.client.getLogger().info('Session completed', {
        sessionId: this.id,
        documentCount: documents.length,
        totalCost: costs.totalCost,
        apiCalls: this.apiCallCount,
      });

      // Final auto-save with completed status
      if (this.options.autoSave) {
        await this.autoSaveState();
      }

      return result;
    } catch (error) {
      this.status = 'failed';
      const result: SessionResult = {
        status: 'failed',
        documents: this.toolExecutor.getDocuments(),
        costs: this.buildCostReport(),
        duration: Date.now() - (this.startTime || Date.now()),
        error: error as Error,
      };

      this.client.getLogger().error('Session failed', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Final auto-save with failed status
      if (this.options.autoSave) {
        await this.autoSaveState();
      }

      this.emit('failed', error);
      return result;
    }
  }

  // Note: answer() method is implemented below (synchronous version)

  /**
   * Get current session status
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Get remaining budget for this session (used by child sessions)
   */
  getRemainingBudget(): number | undefined {
    if (!this.options.costLimit) return undefined;

    const spent = this.calculateCurrentCost();
    return Math.max(0, this.options.costLimit - spent);
  }

  /**
   * Add costs from a child session (called by invoke_agent tool)
   */
  addChildSessionCost(childCost: ChildSessionCost): void {
    this.childSessionCosts.push(childCost);

    // Add child tokens to parent totals
    this.totalInputTokens += childCost.inputTokens;
    this.totalOutputTokens += childCost.outputTokens;
    this.apiCallCount += childCost.apiCalls;

    this.client.getLogger().debug('Child session cost added', {
      sessionId: this.id,
      childAgent: childCost.agent,
      childCost: childCost.totalCost,
    });

    // Check cost limit including child costs
    if (this.options.costLimit) {
      const totalCost = this.calculateCurrentCost();
      if (totalCost >= this.options.costLimit) {
        this.client.getLogger().warn('Cost limit exceeded (including child sessions)', {
          totalCost,
          limit: this.options.costLimit,
        });
        throw new Error(
          `Cost limit exceeded: $${totalCost.toFixed(4)} >= $${this.options.costLimit} (including child session costs)`
        );
      }
    }
  }

  /**
   * Get BmadClient instance (needed by invoke_agent tool)
   */
  getClient(): BmadClient {
    return this.client;
  }

  /**
   * Get tool executor (needed by invoke_agent tool to access VFS)
   */
  getToolExecutor(): FallbackToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Request user answer (called by ask_user tool)
   * This pauses the session and waits for answer() to be called
   */
  async requestUserAnswer(question: string, context?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Store the question and promise callbacks
      this.pendingQuestion = {
        question,
        context,
        resolve,
        reject,
      };

      // Update status to paused
      this.status = 'paused';

      // Emit question event
      this.emit('question', { question, context });

      this.client.getLogger().info('Session paused for user question', {
        sessionId: this.id,
        question,
      });
    });
  }

  /**
   * Provide answer to pending question (resumes session)
   * This is a public method that applications use to respond to questions
   */
  public answer(answer: string): void {
    if (!this.pendingQuestion) {
      throw new Error('No pending question to answer');
    }

    if (this.status !== 'paused') {
      throw new Error(`Cannot answer: session status is ${this.status}, expected 'paused'`);
    }

    this.client.getLogger().info('User answered question, resuming session', {
      sessionId: this.id,
      answer,
    });

    // Resume the session
    this.status = 'running';
    this.emit('resumed');

    // Resolve the promise (unblocks ask_user tool)
    const { resolve } = this.pendingQuestion;
    this.pendingQuestion = undefined;
    resolve(answer);
  }

  /**
   * Load document from storage into VFS
   *
   * Allows loading previously saved documents into the session's VFS
   * for continued work or reference.
   *
   * @param path - Document path to load
   * @returns Loaded document
   * @throws Error if storage not configured or document not found
   *
   * @example
   * ```typescript
   * // Load existing PRD for editing
   * const prd = await session.loadDocument('/docs/prd.md');
   * // Document is now available in VFS for agent to read/edit
   * ```
   */
  public async loadDocument(path: string): Promise<Document> {
    const storage = this.client.getStorage();

    if (!storage) {
      throw new Error('Storage not configured - cannot load documents');
    }

    try {
      this.client.getLogger().debug('Loading document from storage', {
        sessionId: this.id,
        path,
      });

      // Load from storage
      const document = await storage.load(path);

      // Add to VFS for agent access
      this.toolExecutor.initializeFiles({ [document.path]: document.content });

      this.client.getLogger().info('Document loaded into VFS', {
        sessionId: this.id,
        path: document.path,
        size: document.content.length,
      });

      return document;
    } catch (error) {
      this.client.getLogger().error('Failed to load document', {
        sessionId: this.id,
        path,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Load multiple documents from storage into VFS
   *
   * @param paths - Document paths to load
   * @returns Array of loaded documents
   * @throws Error if storage not configured
   *
   * @example
   * ```typescript
   * // Load multiple related documents
   * const docs = await session.loadDocuments([
   *   '/docs/prd.md',
   *   '/docs/architecture.md',
   *   '/docs/story-1.md'
   * ]);
   * ```
   */
  public async loadDocuments(paths: string[]): Promise<Document[]> {
    const storage = this.client.getStorage();

    if (!storage) {
      throw new Error('Storage not configured - cannot load documents');
    }

    this.client.getLogger().debug('Loading multiple documents from storage', {
      sessionId: this.id,
      count: paths.length,
    });

    const documents: Document[] = [];
    const files: Record<string, string> = {};

    for (const path of paths) {
      try {
        const document = await storage.load(path);
        documents.push(document);
        files[document.path] = document.content;
      } catch (error) {
        this.client.getLogger().warn('Failed to load document (continuing)', {
          sessionId: this.id,
          path,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // Add all to VFS at once
    if (Object.keys(files).length > 0) {
      this.toolExecutor.initializeFiles(files);
    }

    this.client.getLogger().info('Documents loaded into VFS', {
      sessionId: this.id,
      loaded: documents.length,
      failed: paths.length - documents.length,
    });

    return documents;
  }

  /**
   * Load all documents from a session into VFS
   *
   * Useful for resuming work on a previous session or reviewing its outputs.
   *
   * @param sessionId - Session ID to load documents from
   * @returns Array of loaded documents
   * @throws Error if storage not configured
   *
   * @example
   * ```typescript
   * // Resume previous session's work
   * const prevDocs = await session.loadSessionDocuments('sess_123_abc');
   * // All documents from sess_123_abc now in VFS
   * ```
   */
  public async loadSessionDocuments(sessionId: string): Promise<Document[]> {
    const storage = this.client.getStorage();

    if (!storage) {
      throw new Error('Storage not configured - cannot load documents');
    }

    this.client.getLogger().debug('Loading session documents', {
      currentSessionId: this.id,
      targetSessionId: sessionId,
    });

    try {
      // List all documents for that session
      const result = await storage.list({ sessionId });

      if (result.documents.length === 0) {
        this.client.getLogger().warn('No documents found for session', {
          sessionId,
        });
        return [];
      }

      // Load all documents
      const paths = result.documents.map((d) => d.path);
      return await this.loadDocuments(paths);
    } catch (error) {
      this.client.getLogger().error('Failed to load session documents', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Load agent definition
   */
  private async loadAgent(): Promise<AgentDefinition> {
    const { resolve } = await import('path');
    const { glob } = await import('glob');
    const triedPaths: string[] = [];

    // Try local .bmad-core first
    const agentPath = resolve(process.cwd(), `.bmad-core/agents/${this.agentId}.md`);
    triedPaths.push(agentPath);

    try {
      return await this.agentLoader.loadAgent(agentPath);
    } catch {
      // Continue to fallbacks
    }

    // Fallback: Try bmad-export-author for testing
    const fallbackPath = resolve(
      process.cwd(),
      `../bmad-export-author/.bmad-core/agents/${this.agentId}.md`
    );
    triedPaths.push(fallbackPath);

    try {
      return await this.agentLoader.loadAgent(fallbackPath);
    } catch {
      // Continue to expansion packs
    }

    // Try expansion packs
    const config = this.client.getConfig();
    const expansionPackPaths = config.expansionPackPaths || [resolve(process.cwd(), '../')];

    for (const searchPath of expansionPackPaths) {
      try {
        // Look for .bmad-*/agents/{agentId}.md
        const pattern = resolve(searchPath, `.bmad-*/agents/${this.agentId}.md`);
        const files = await glob(pattern, { windowsPathsNoEscape: true });

        if (files.length > 0) {
          triedPaths.push(pattern);
          return await this.agentLoader.loadAgent(files[0] as string);
        }
      } catch {
        // Continue to next search path
      }
    }

    throw new Error(`Agent not found: ${this.agentId}. Tried ${triedPaths.join(', ')}`);
  }

  /**
   * Initialize LLM provider
   */
  private initializeProvider(): void {
    const config = this.client.getConfig();

    // Support direct provider instances (for testing)
    if ('sendMessage' in config.provider) {
      this.provider = config.provider;
      return;
    }

    // Support provider config objects
    if (config.provider.type === 'anthropic') {
      this.provider = new AnthropicProvider(
        config.provider.apiKey,
        config.provider.model || 'claude-sonnet-4'
      );
    } else {
      throw new Error(`Unsupported provider: ${config.provider.type}`);
    }
  }

  /**
   * Format user command for agent
   */
  private formatUserCommand(agent: AgentDefinition): string {
    return `Execute command: ${this.command}

Agent: ${agent.agent.name} (${agent.agent.title})
Command: ${this.command}

Please follow the agent activation instructions and execute this command.`;
  }

  /**
   * Execute a tool call
   */
  private async executeTool(
    id: string,
    name: string,
    input: Record<string, unknown>
  ): Promise<{ id: string; result: string }> {
    this.client.getLogger().debug('Executing tool', { id, name, input });

    try {
      const result = await this.toolExecutor.execute({ id, name, input });

      if (result.success) {
        return {
          id,
          result: result.content || 'Success',
        };
      } else {
        return {
          id,
          result: `Error: ${result.error || 'Unknown error'}`,
        };
      }
    } catch (error) {
      this.client.getLogger().error('Tool execution failed', {
        tool: name,
        error: error instanceof Error ? error.message : 'Unknown',
      });

      return {
        id,
        result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Format tool results for LLM
   */
  private formatToolResults(
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    results: Array<{ id: string; result: string }>
  ): string {
    return results
      .map((result) => {
        const toolCall = toolCalls.find((tc) => tc.id === result.id);
        return `Tool: ${toolCall?.name || 'unknown'}
Result: ${result.result}`;
      })
      .join('\n\n');
  }

  /**
   * Extract text content from message content (string or content blocks array)
   */
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

  /**
   * Calculate current cost (delegates to cost tracker)
   */
  private calculateCurrentCost(): number {
    if (!this.costTracker) return 0;
    return this.costTracker.getTotalCost();
  }

  /**
   * Build cost report
   */
  private buildCostReport(): CostReport {
    if (!this.provider) {
      return {
        totalCost: 0,
        currency: 'USD',
        inputTokens: 0,
        outputTokens: 0,
        apiCalls: 0,
        breakdown: [],
      };
    }

    const modelInfo = this.provider.getModelInfo();
    const totalCost = this.calculateCurrentCost();

    const breakdown: ModelCost[] = [
      {
        model: modelInfo.name,
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        inputCost: (this.totalInputTokens / 1000) * modelInfo.inputCostPer1k,
        outputCost: (this.totalOutputTokens / 1000) * modelInfo.outputCostPer1k,
      },
    ];

    return {
      totalCost,
      currency: 'USD',
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      apiCalls: this.apiCallCount,
      breakdown,
      childSessions: this.childSessionCosts.length > 0 ? this.childSessionCosts : undefined,
    };
  }

  /**
   * Initialize VFS with agent files (public wrapper for loadAgentsIntoVFS)
   * Call this before using glob_pattern or read_file tools for agent discovery
   */
  async initializeVFS(): Promise<void> {
    await this.loadAgentsIntoVFS();
  }

  /**
   * Load all available agents into VFS for discovery
   * This enables agents like bmad-orchestrator to discover and list agents
   * using glob_pattern and read_file tools
   */
  private async loadAgentsIntoVFS(): Promise<void> {
    try {
      const agentFiles = await this.findAgentFiles();

      if (agentFiles.length === 0) {
        this.client.getLogger().warn('No agent files found for VFS loading');
        return;
      }

      const { readFile } = await import('fs/promises');
      const { basename } = await import('path');

      // Load each agent file into VFS
      const filesMap: Record<string, string> = {};

      for (const agentPath of agentFiles) {
        try {
          const content = await readFile(agentPath, 'utf-8');
          const fileName = basename(agentPath);
          const vfsPath = `/.bmad-core/agents/${fileName}`;
          filesMap[vfsPath] = content;
        } catch (error) {
          this.client.getLogger().warn('Failed to load agent file', {
            path: agentPath,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      // Initialize VFS with agent files
      this.toolExecutor.initializeFiles(filesMap);

      this.client.getLogger().debug('Loaded agents into VFS', {
        count: Object.keys(filesMap).length,
        paths: Object.keys(filesMap),
      });
    } catch (error) {
      // Non-fatal: Session can continue without agent discovery
      this.client.getLogger().warn('Failed to load agents into VFS', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Find all agent files from .bmad-core directories and expansion packs
   */
  private async findAgentFiles(): Promise<string[]> {
    const { resolve } = await import('path');
    const { glob } = await import('glob');

    const agentPaths: string[] = [];

    // Try bmad-export-author fallback FIRST (for development)
    try {
      const fallbackPattern = resolve(
        process.cwd(),
        '../bmad-export-author/.bmad-core/agents/*.md'
      );
      const fallbackFiles = await glob(fallbackPattern, { windowsPathsNoEscape: true });
      agentPaths.push(...fallbackFiles);
    } catch (error) {
      this.client.getLogger().debug('No bmad-export-author agents found');
    }

    // Load expansion pack agents
    await this.loadExpansionPackAgents(agentPaths);

    // Try local .bmad-core/agents/ LAST (overwrites fallback/expansion files with same name)
    try {
      const localPattern = resolve(process.cwd(), '.bmad-core/agents/*.md');
      const localFiles = await glob(localPattern, { windowsPathsNoEscape: true });
      agentPaths.push(...localFiles);
    } catch (error) {
      this.client.getLogger().debug('No local .bmad-core/agents found');
    }

    return agentPaths;
  }

  /**
   * Load agents from expansion packs
   */
  private async loadExpansionPackAgents(agentPaths: string[]): Promise<void> {
    const config = this.client.getConfig();
    const expansionPackPaths = config.expansionPackPaths || [];

    // Default: scan parent directory if no paths specified
    if (expansionPackPaths.length === 0) {
      const { resolve } = await import('path');
      expansionPackPaths.push(resolve(process.cwd(), '../'));
    }

    try {
      const expansionPacks = await this.agentLoader.loadExpansionPacks(expansionPackPaths);

      for (const pack of expansionPacks) {
        this.client
          .getLogger()
          .info(`Found expansion pack: ${pack.name} with ${pack.agentCount} agents`, {
            path: pack.path,
          });

        // Add expansion pack agent files to VFS loading list
        // We need the file paths, so we'll construct them
        const { resolve } = await import('path');
        const { glob } = await import('glob');

        const packAgentsPattern = resolve(pack.path, 'agents/*.md');
        const packAgentFiles = await glob(packAgentsPattern, { windowsPathsNoEscape: true });
        agentPaths.push(...packAgentFiles);
      }
    } catch (error) {
      this.client.getLogger().warn('Failed to load expansion packs', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Initialize cost tracker once provider is ready
   */
  private initializeCostTracker(): void {
    if (!this.provider) {
      throw new Error('Provider must be initialized before cost tracker');
    }

    this.costTracker = new CostTracker(this.provider, {
      costLimit: this.options.costLimit,
      warningThresholds: [0.5, 0.75, 0.9],
      currency: 'USD',
      logger: this.client.getLogger(),
    });

    // Forward cost events to session events
    this.costTracker.on('cost-warning', (data) => {
      this.emit('cost-warning', data.currentCost);
      this.client.getLogger().warn('Cost warning', {
        sessionId: this.id,
        currentCost: data.currentCost.toFixed(4),
        limit: data.limit.toFixed(2),
        percentage: `${(data.percentage * 100).toFixed(0)}%`,
      });
    });

    this.costTracker.on('cost-limit-exceeded', (data) => {
      this.client.getLogger().error('Cost limit exceeded', {
        sessionId: this.id,
        currentCost: data.currentCost.toFixed(4),
        limit: data.limit.toFixed(2),
      });
    });
  }

  /**
   * Auto-save session state to storage (if configured)
   * Called automatically after each API call if autoSave is enabled
   */
  private async autoSaveState(): Promise<void> {
    const storage = this.client.getStorage();
    if (!storage) {
      return; // No storage configured
    }

    try {
      const state = this.serialize();
      await storage.saveSessionState(state);

      this.client.getLogger().debug('Session state auto-saved', {
        sessionId: this.id,
        status: this.status,
        messageCount: this.messages.length,
      });
    } catch (error) {
      this.client.getLogger().warn('Auto-save failed', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Serialize session state for persistence
   *
   * Captures complete session state including:
   * - Conversation history (messages)
   * - VFS state (all files)
   * - Cost tracking data
   * - Pause/resume state
   *
   * @returns Serialized session state
   *
   * @example
   * ```typescript
   * const session = await client.startAgent('pm', 'create-prd');
   *
   * // During execution, pause and serialize
   * const state = session.serialize();
   *
   * // Save to storage
   * await storage.save(
   *   { path: `/sessions/${session.id}.json`, content: JSON.stringify(state) },
   *   { sessionId: session.id, agentId: 'pm', command: 'create-prd', timestamp: Date.now() }
   * );
   * ```
   */
  serialize(): import('./types.js').SessionState {
    // Get all VFS files
    const vfsFiles: Record<string, string> = {};
    const documents = this.toolExecutor.getDocuments();
    for (const doc of documents) {
      vfsFiles[doc.path] = doc.content;
    }

    // Calculate total cost (prefer costTracker if available, otherwise use legacy field)
    const totalCost = this.costTracker ? this.costTracker.getTotalCost() : this.totalCost;

    return {
      // Identity
      id: this.id,
      agentId: this.agentId,
      command: this.command,
      status: this.status,

      // Timestamps
      createdAt: this.startTime || Date.now(),
      startedAt: this.startTime,
      pausedAt: this.status === 'paused' ? Date.now() : undefined,
      completedAt: this.status === 'completed' ? Date.now() : undefined,

      // Conversation
      messages: this.messages,

      // VFS
      vfsFiles,

      // Cost tracking
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCost,
      apiCallCount: this.apiCallCount,
      childSessionCosts: this.childSessionCosts,

      // Pause/resume
      pendingQuestion: this.pendingQuestion
        ? {
            question: this.pendingQuestion.question,
            context: this.pendingQuestion.context,
          }
        : undefined,

      // Options
      options: this.options,

      // Provider info
      providerType: this.provider instanceof AnthropicProvider ? 'anthropic' : 'custom',
      modelName: this.provider?.getModelInfo().name,
    };
  }

  /**
   * Deserialize and restore session from saved state
   *
   * Creates a new session instance from serialized state, restoring:
   * - All conversation messages
   * - Complete VFS state
   * - Cost tracking data
   * - Pause/resume state
   *
   * @param client - BmadClient instance to use for restored session
   * @param state - Serialized session state
   * @returns Restored session instance
   *
   * @example
   * ```typescript
   * // Load state from storage
   * const stateDoc = await storage.load(`/sessions/${sessionId}.json`);
   * const state = JSON.parse(stateDoc.content);
   *
   * // Restore session
   * const session = BmadSession.deserialize(client, state);
   *
   * // Continue execution
   * if (session.getStatus() === 'paused' && state.pendingQuestion) {
   *   await session.answer('User response');
   * }
   *
   * const result = await session.execute();
   * ```
   */
  static async deserialize(
    client: BmadClient,
    state: import('./types.js').SessionState
  ): Promise<BmadSession> {
    // Create new session with same ID and options
    const session = new BmadSession(client, state.agentId, state.command, state.options);

    // Restore session ID (override generated one)
    // @ts-ignore - Accessing private field during deserialization
    session.id = state.id;

    // Restore status
    session.status = state.status;

    // Restore timestamps
    // @ts-ignore - Accessing private field during deserialization
    session.startTime = state.startedAt || state.createdAt;

    // Restore messages
    session.messages = state.messages;

    // Restore VFS
    session.toolExecutor.initializeFiles(state.vfsFiles);

    // Restore cost tracking
    session.totalInputTokens = state.totalInputTokens;
    session.totalOutputTokens = state.totalOutputTokens;
    session.totalCost = state.totalCost;
    session.apiCallCount = state.apiCallCount;
    session.childSessionCosts = state.childSessionCosts;

    // Restore pending question state
    if (state.pendingQuestion) {
      // Create promise for answer
      new Promise<string>((resolve, reject) => {
        // @ts-ignore - Accessing private field during deserialization
        session.pendingQuestion = {
          question: state.pendingQuestion!.question,
          context: state.pendingQuestion!.context,
          resolve,
          reject,
        };
      });
    }

    client.getLogger().info('Session restored from state', {
      sessionId: session.id,
      agentId: session.agentId,
      status: session.status,
      messageCount: session.messages.length,
      vfsFileCount: Object.keys(state.vfsFiles).length,
    });

    return session;
  }
}
