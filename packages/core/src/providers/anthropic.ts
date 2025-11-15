import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  Message,
  ContentBlock,
  Tool,
  ProviderResponse,
  ProviderOptions,
  Usage,
  ModelInfo,
  ToolCall,
} from '../types.js';

/**
 * Pricing per 1K tokens (as of 2025-01-01)
 */
const PRICING = {
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-sonnet-3-5-20241022': { input: 0.003, output: 0.015 },
  'claude-haiku-3-5-20241022': { input: 0.00025, output: 0.00125 },
} as const;

type ModelName = keyof typeof PRICING;

/**
 * AnthropicProvider - LLM provider implementation for Anthropic Claude
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: ModelName;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = this.validateModel(model);
  }

  /**
   * Send message to Claude API with tools
   */
  async sendMessage(
    messages: Message[],
    tools: Tool[],
    options?: ProviderOptions
  ): Promise<ProviderResponse> {
    try {
      // Extract system message (Anthropic uses separate system parameter)
      const systemMessage = messages.find((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      // Convert messages to Anthropic format
      const anthropicMessages = conversationMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : this.formatContent(msg.content),
      }));

      // Convert tools to Anthropic format
      const anthropicTools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      }));

      // Call Anthropic API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature,
        system: systemMessage ? String(systemMessage.content) : undefined,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      // Parse response
      return this.parseResponse(response);
    } catch (error) {
      throw new AnthropicProviderError(
        `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(usage: Usage): number {
    const pricing = PRICING[this.model];
    const inputCost = (usage.inputTokens / 1000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelInfo {
    const pricing = PRICING[this.model];
    return {
      name: this.model,
      maxTokens: 200000, // Claude 4 context window
      inputCostPer1k: pricing.input,
      outputCostPer1k: pricing.output,
    };
  }

  /**
   * Validate and normalize model name
   */
  private validateModel(model: string): ModelName {
    // Map short names to full model IDs
    const modelMap: Record<string, ModelName> = {
      'claude-opus-4': 'claude-opus-4-20250514',
      'claude-sonnet-4': 'claude-sonnet-4-20250514',
      'claude-sonnet-3-5': 'claude-sonnet-3-5-20241022',
      'claude-haiku-3-5': 'claude-haiku-3-5-20241022',
    };

    const normalized = modelMap[model] || model;

    if (!(normalized in PRICING)) {
      throw new AnthropicProviderError(
        `Unknown model: ${model}. Supported models: ${Object.keys(PRICING).join(', ')}`
      );
    }

    return normalized as ModelName;
  }

  /**
   * Format content blocks for Anthropic API
   */
  private formatContent(
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string;
    }>
  ): Array<Record<string, unknown>> {
    return content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
        };
      }
      return block as Record<string, unknown>;
    });
  }

  /**
   * Parse Anthropic API response to ProviderResponse
   */
  private parseResponse(response: Anthropic.Messages.Message): ProviderResponse {
    // Extract tool calls for convenience
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // Convert content blocks to our format
    const contentBlocks: ContentBlock[] = response.content.map((block) => {
      if (block.type === 'text') {
        return {
          type: 'text',
          text: block.text,
        };
      } else if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      // Fallback for unknown block types
      return block as ContentBlock;
    });

    return {
      message: {
        role: 'assistant',
        content: contentBlocks,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: this.mapStopReason(response.stop_reason),
    };
  }

  /**
   * Map Anthropic stop reason to our format
   */
  private mapStopReason(
    reason: string | null
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      case 'tool_use':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}

/**
 * Custom error for Anthropic provider failures
 */
export class AnthropicProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicProviderError';
  }
}
