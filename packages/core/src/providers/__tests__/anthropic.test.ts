import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, AnthropicProviderError } from '../anthropic.js';
import type { Message, Tool } from '../../types.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    provider = new AnthropicProvider('test-api-key', 'claude-sonnet-4');

    // Get reference to mocked create method
    mockCreate = (provider as any).client.messages.create;
  });

  describe('constructor', () => {
    it('should initialize with API key and model', () => {
      expect(provider).toBeDefined();
      expect(provider.getModelInfo().name).toBe('claude-sonnet-4-20250514');
    });

    it('should accept short model names', () => {
      const p1 = new AnthropicProvider('key', 'claude-opus-4');
      expect(p1.getModelInfo().name).toBe('claude-opus-4-20250514');

      const p2 = new AnthropicProvider('key', 'claude-haiku-3-5');
      expect(p2.getModelInfo().name).toBe('claude-haiku-3-5-20241022');
    });

    it('should throw error for unknown model', () => {
      expect(() => new AnthropicProvider('key', 'invalid-model')).toThrow(
        AnthropicProviderError
      );
    });

    it('should default to claude-sonnet-4', () => {
      const p = new AnthropicProvider('key');
      expect(p.getModelInfo().name).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('sendMessage', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello!' },
    ];

    const tools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ];

    it('should send message with tools to Anthropic API', async () => {
      mockCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 20,
        },
      });

      const response = await provider.sendMessage(messages, tools);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: undefined,
        system: 'You are a helpful assistant',
        messages: [{ role: 'user', content: 'Hello!' }],
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            input_schema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        ],
      });

      expect(response.message.content).toBe('Hello! How can I help?');
      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(20);
      expect(response.stopReason).toBe('end_turn');
    });

    it('should handle tool use in response', async () => {
      mockCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me read that file.' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'read_file',
            input: { path: '/test.txt' },
          },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 150,
          output_tokens: 30,
        },
      });

      const response = await provider.sendMessage(messages, tools);

      expect(response.message.content).toBe('Let me read that file.');
      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0]).toEqual({
        id: 'tool_123',
        name: 'read_file',
        input: { path: '/test.txt' },
      });
      expect(response.stopReason).toBe('tool_use');
    });

    it('should support custom options', async () => {
      mockCreate.mockResolvedValue({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      await provider.sendMessage(messages, tools, {
        maxTokens: 2000,
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 2000,
          temperature: 0.7,
        })
      );
    });

    it('should handle messages without tools', async () => {
      mockCreate.mockResolvedValue({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      await provider.sendMessage(messages, []);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: undefined,
        })
      );
    });

    it('should throw AnthropicProviderError on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      await expect(provider.sendMessage(messages, tools)).rejects.toThrow(
        AnthropicProviderError
      );
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for Sonnet 4', () => {
      const provider = new AnthropicProvider('key', 'claude-sonnet-4');
      const cost = provider.calculateCost({
        inputTokens: 1000,
        outputTokens: 500,
      });

      // (1000/1000 * 0.003) + (500/1000 * 0.015) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should calculate cost for Opus 4', () => {
      const provider = new AnthropicProvider('key', 'claude-opus-4');
      const cost = provider.calculateCost({
        inputTokens: 1000,
        outputTokens: 500,
      });

      // (1000/1000 * 0.015) + (500/1000 * 0.075) = 0.015 + 0.0375 = 0.0525
      expect(cost).toBeCloseTo(0.0525, 4);
    });

    it('should calculate cost for Haiku 3.5', () => {
      const provider = new AnthropicProvider('key', 'claude-haiku-3-5');
      const cost = provider.calculateCost({
        inputTokens: 1000,
        outputTokens: 500,
      });

      // (1000/1000 * 0.00025) + (500/1000 * 0.00125) = 0.00025 + 0.000625 = 0.000875
      expect(cost).toBeCloseTo(0.000875, 6);
    });

    it('should handle zero tokens', () => {
      const cost = provider.calculateCost({
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(cost).toBe(0);
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', () => {
      const info = provider.getModelInfo();

      expect(info.name).toBe('claude-sonnet-4-20250514');
      expect(info.maxTokens).toBe(200000);
      expect(info.inputCostPer1k).toBe(0.003);
      expect(info.outputCostPer1k).toBe(0.015);
    });
  });
});
