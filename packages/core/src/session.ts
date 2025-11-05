import { EventEmitter } from 'eventemitter3';
import type { BmadClient } from './client.js';
import type {
  SessionOptions,
  SessionResult,
  SessionStatus,
  Message,
  AgentDefinition,
  CostReport,
  ModelCost,
} from './types.js';
import { SystemPromptGenerator } from './prompt-generator.js';
import { AgentLoader } from './agent-loader.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { FallbackToolExecutor } from './tools/fallback-executor.js';

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
  private provider?: AnthropicProvider;
  private toolExecutor: FallbackToolExecutor;

  // State
  private messages: Message[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private apiCallCount = 0;

  constructor(
    client: BmadClient,
    agentId: string,
    command: string,
    options?: SessionOptions
  ) {
    super();
    this.client = client;
    this.agentId = agentId;
    this.command = command;
    this.options = options || {};
    this.id = this.generateSessionId();

    // Initialize components
    this.promptGenerator = new SystemPromptGenerator();
    this.agentLoader = new AgentLoader();
    this.toolExecutor = new FallbackToolExecutor();

    // Initialize VFS if context has initial files
    if (this.options.context?.['initialFiles']) {
      this.toolExecutor.initializeFiles(this.options.context['initialFiles'] as Record<string, string>);
    }

    this.client.getLogger().debug('Session created', {
      sessionId: this.id,
      agentId,
      command,
    });
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

      // 3. Generate system prompt with tools
      const tools = this.toolExecutor.getTools();
      const systemPrompt = this.promptGenerator.generate(agent, tools);

      // 4. Initialize messages with system prompt and user command
      this.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.formatUserCommand(agent) },
      ];

      this.client.getLogger().debug('Starting tool call loop', {
        toolCount: tools.length,
      });

      // 5. Tool call loop
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

      // 6. Build result
      const documents = this.toolExecutor.getDocuments();
      const costs = this.buildCostReport();

      // Extract final assistant response
      const assistantMessages = this.messages.filter((m) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      const finalResponse =
        typeof lastAssistantMessage?.content === 'string'
          ? lastAssistantMessage.content
          : undefined;

      const result: SessionResult = {
        status: 'completed',
        documents,
        costs,
        duration: Date.now() - this.startTime,
        messages: this.messages,
        finalResponse,
      };

      this.status = 'completed';
      this.emit('completed', result);

      this.client.getLogger().info('Session completed', {
        sessionId: this.id,
        documentCount: documents.length,
        totalCost: costs.totalCost,
        apiCalls: this.apiCallCount,
      });

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

      this.emit('failed', error);
      return result;
    }
  }

  /**
   * Answer a question (for pause/resume) - TODO: Implement in Phase 2
   */
  async answer(input: string): Promise<void> {
    this.client.getLogger().debug('Answer received', { sessionId: this.id, input });
    // TODO: Implement pause/resume logic
    throw new Error('Pause/resume not yet implemented');
  }

  /**
   * Get current session status
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Load agent definition
   */
  private async loadAgent(): Promise<AgentDefinition> {
    // For PoC: Try to load from .bmad-core
    const { resolve } = await import('path');
    const agentPath = resolve(process.cwd(), `.bmad-core/agents/${this.agentId}.md`);

    try {
      return await this.agentLoader.loadAgent(agentPath);
    } catch (error) {
      // Fallback: Try bmad-export-author for testing
      const fallbackPath = resolve(process.cwd(), `../bmad-export-author/.bmad-core/agents/${this.agentId}.md`);
      try {
        return await this.agentLoader.loadAgent(fallbackPath);
      } catch {
        throw new Error(
          `Agent not found: ${this.agentId}. Tried ${agentPath} and ${fallbackPath}`
        );
      }
    }
  }

  /**
   * Initialize LLM provider
   */
  private initializeProvider(): void {
    const config = this.client.getConfig();

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
   * Calculate current cost
   */
  private calculateCurrentCost(): number {
    if (!this.provider) return 0;

    return this.provider.calculateCost({
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
    });
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
    };
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
