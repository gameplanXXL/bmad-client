/**
 * Mock LLM Provider for deterministic testing without API costs
 *
 * Uses a predefined map of prompts -> responses to simulate LLM behavior
 */

import type { LLMProvider, Message, Tool, ProviderResponse, ProviderOptions, ModelInfo } from '../types.js';

interface MockResponse {
  content: string | any[];
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
  inputTokens?: number;
  outputTokens?: number;
}

interface MockRule {
  // Match criteria
  userMessageContains?: string;
  userMessageEquals?: string;
  toolResultContains?: string;
  conversationLength?: number;

  // Response
  response: MockResponse;

  // Optional: only match once
  once?: boolean;
}

export class MockLLMProvider implements LLMProvider {
  private rules: MockRule[] = [];
  private defaultResponse: MockResponse;
  private callCount = 0;
  private usedRules = new Set<number>();

  constructor(defaultResponse?: MockResponse) {
    this.defaultResponse = defaultResponse || {
      content: 'I am a mock LLM. No rules matched your input.',
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    };
  }

  /**
   * Add a response rule
   */
  addRule(rule: MockRule): void {
    this.rules.push(rule);
  }

  /**
   * Add multiple rules at once
   */
  addRules(rules: MockRule[]): void {
    this.rules.push(...rules);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
    this.usedRules.clear();
  }

  /**
   * Reset call count
   */
  reset(): void {
    this.callCount = 0;
    this.usedRules.clear();
  }

  /**
   * Get number of times provider was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Convenience method: Set a sequence of responses to be returned in order
   * Useful for simple linear test scenarios
   */
  setResponses(responses: MockResponse[]): void {
    this.clearRules();

    // Add each response as a rule that triggers once
    responses.forEach((response, index) => {
      this.addRule({
        conversationLength: (index + 1) * 2, // Assuming system + user, then assistant + user pattern
        response,
        once: true,
      });
    });
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[],
    options?: ProviderOptions
  ): Promise<ProviderResponse> {
    this.callCount++;

    // Find matching rule
    const matchedResponse = this.findMatchingRule(messages);
    const response = matchedResponse || this.defaultResponse;

    // Format response
    return {
      message: {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      },
      usage: {
        inputTokens: response.inputTokens || 100,
        outputTokens: response.outputTokens || 50,
      },
      stopReason: response.stopReason || 'end_turn',
    };
  }

  private findMatchingRule(messages: Message[]): MockResponse | null {
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];

      // Skip if rule was already used and is marked as 'once'
      if (rule.once && this.usedRules.has(i)) {
        continue;
      }

      // Check conversation length
      if (rule.conversationLength !== undefined && messages.length !== rule.conversationLength) {
        continue;
      }

      // Get last user message
      const lastUserMessage = this.getLastUserMessage(messages);

      // Check userMessageEquals
      if (rule.userMessageEquals && lastUserMessage !== rule.userMessageEquals) {
        continue;
      }

      // Check userMessageContains
      if (rule.userMessageContains && !lastUserMessage.includes(rule.userMessageContains)) {
        continue;
      }

      // Check toolResultContains
      if (rule.toolResultContains) {
        const hasToolResult = this.hasToolResultContaining(messages, rule.toolResultContains);
        if (!hasToolResult) {
          continue;
        }
      }

      // Rule matched!
      if (rule.once) {
        this.usedRules.add(i);
      }

      return rule.response;
    }

    return null;
  }

  private getLastUserMessage(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          return content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join(' ');
        }
      }
    }
    return '';
  }

  private hasToolResultContaining(messages: Message[], search: string): boolean {
    for (const message of messages) {
      if (message.role === 'user' && Array.isArray(message.content)) {
        for (const block of message.content) {
          if ((block as any).type === 'tool_result' && (block as any).content?.includes(search)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  calculateCost(usage: { inputTokens: number; outputTokens: number }): number {
    // Mock pricing: $0.003 per 1k input, $0.015 per 1k output
    return (usage.inputTokens / 1000) * 0.003 + (usage.outputTokens / 1000) * 0.015;
  }

  getModelInfo(): ModelInfo {
    return {
      name: 'mock-llm-v1',
      maxTokens: 200000,
      inputCostPer1k: 0.003,
      outputCostPer1k: 0.015,
    };
  }
}

/**
 * Preset mock scenarios for common testing patterns
 */
export const MockScenarios = {
  /**
   * Simple question-answer conversation
   */
  simpleConversation: (): MockLLMProvider => {
    const provider = new MockLLMProvider();

    provider.addRules([
      {
        userMessageContains: 'hello',
        response: {
          content: 'Hello! I am ready to help you.',
          stopReason: 'end_turn',
          inputTokens: 50,
          outputTokens: 20,
        },
      },
      {
        userMessageContains: 'create prd',
        response: {
          content: [
            { type: 'text', text: 'I will create a PRD for you.' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# Product Requirements Document\n\n## Overview\nThis is a test PRD.',
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# Product Requirements Document\n\n## Overview\nThis is a test PRD.',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 200,
          outputTokens: 100,
        },
      },
      {
        toolResultContains: 'File written',
        response: {
          content: 'PRD created successfully at /docs/prd.md',
          stopReason: 'end_turn',
          inputTokens: 150,
          outputTokens: 30,
        },
      },
    ]);

    return provider;
  },

  /**
   * Conversation with agent asking questions
   */
  withElicitation: (): MockLLMProvider => {
    const provider = new MockLLMProvider();

    provider.addRules([
      {
        userMessageContains: 'create prd',
        response: {
          content: 'What is your target user persona?',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 20,
        },
        once: true,
      },
      {
        userMessageContains: 'developers',
        response: {
          content: 'Great! Creating PRD for developers...',
          toolCalls: [
            {
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# PRD\n\nTarget Users: Developers',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 150,
          outputTokens: 80,
        },
      },
      {
        toolResultContains: 'File written',
        response: {
          content: 'PRD complete!',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      },
    ]);

    return provider;
  },

  /**
   * Multi-turn conversation with context
   */
  multiTurnWithContext: (): MockLLMProvider => {
    const provider = new MockLLMProvider();

    provider.addRules([
      {
        userMessageContains: 'create document',
        response: {
          content: [
            { type: 'text', text: 'Creating document...' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/docs/doc.md',
                content: '# Document\n\nVersion 1',
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/docs/doc.md',
                content: '# Document\n\nVersion 1',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      {
        toolResultContains: 'File written',
        userMessageContains: 'create',
        response: {
          content: 'Document created!',
          stopReason: 'end_turn',
          inputTokens: 80,
          outputTokens: 10,
        },
      },
      {
        userMessageContains: 'update',
        response: {
          content: [
            { type: 'text', text: 'Reading and updating document...' },
            { type: 'tool_use', id: 'tool_2', name: 'read_file', input: { file_path: '/docs/doc.md' } },
          ],
          toolCalls: [
            { id: 'tool_2', name: 'read_file', input: { file_path: '/docs/doc.md' } },
          ],
          stopReason: 'tool_use',
          inputTokens: 120,
          outputTokens: 60,
        },
      },
      {
        toolResultContains: 'Version 1',
        response: {
          content: [
            { type: 'text', text: 'Updating to version 2...' },
            {
              type: 'tool_use',
              id: 'tool_3',
              name: 'write_file',
              input: {
                file_path: '/docs/doc.md',
                content: '# Document\n\nVersion 2 - Updated!',
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool_3',
              name: 'write_file',
              input: {
                file_path: '/docs/doc.md',
                content: '# Document\n\nVersion 2 - Updated!',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 150,
          outputTokens: 70,
        },
      },
      {
        toolResultContains: 'File written',
        userMessageContains: 'update',
        response: {
          content: 'Document updated successfully!',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 15,
        },
      },
    ]);

    return provider;
  },

  /**
   * Conversation that hits cost limit
   */
  withCostLimit: (): MockLLMProvider => {
    const provider = new MockLLMProvider();

    provider.addRule({
      userMessageContains: 'expensive',
      response: {
        content: 'This is an expensive response.',
        stopReason: 'end_turn',
        inputTokens: 50000, // Very high token usage
        outputTokens: 25000,
      },
    });

    return provider;
  },
};
