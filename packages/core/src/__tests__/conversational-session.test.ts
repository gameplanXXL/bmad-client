import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationalSession } from '../conversational-session.js';
import { BmadClient } from '../client.js';
import type { BmadClientConfig } from '../types.js';

// Mock BmadClient
const createMockClient = (): BmadClient => {
  const mockConfig: BmadClientConfig = {
    provider: {
      type: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    },
    logLevel: 'error',
  };

  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  const client = new BmadClient(mockConfig);

  // Replace logger with mock
  vi.spyOn(client, 'getLogger').mockReturnValue(mockLogger);
  vi.spyOn(client, 'getConfig').mockReturnValue(mockConfig);

  return client;
};

describe('ConversationalSession', () => {
  let client: BmadClient;
  let conversation: ConversationalSession;

  beforeEach(() => {
    client = createMockClient();
    conversation = new ConversationalSession(client, 'pm');
  });

  describe('Constructor', () => {
    it('should create a conversation with unique ID', () => {
      const conv1 = new ConversationalSession(client, 'pm');
      const conv2 = new ConversationalSession(client, 'architect');

      expect(conv1.id).toMatch(/^conv_\d+_[a-z0-9]+$/);
      expect(conv2.id).toMatch(/^conv_\d+_[a-z0-9]+$/);
      expect(conv1.id).not.toBe(conv2.id);
    });

    it('should set agentId correctly', () => {
      const conv = new ConversationalSession(client, 'architect');
      expect(conv.agentId).toBe('architect');
    });

    it('should initialize with options', () => {
      const conv = new ConversationalSession(client, 'pm', {
        costLimit: 10.0,
        pauseTimeout: 600000,
      });

      expect(conv.id).toBeDefined();
      expect(conv.agentId).toBe('pm');
    });

    it('should initialize VFS with initial files if provided', () => {
      const conv = new ConversationalSession(client, 'pm', {
        context: {
          initialFiles: {
            '/docs/existing.md': '# Existing Document',
          },
        },
      });

      expect(conv).toBeDefined();
      // VFS initialization tested separately
    });
  });

  describe('Status Management', () => {
    it('should start in idle status', () => {
      expect(conversation.isIdle()).toBe(true);
    });

    it('should emit turn-started event when processing', async () => {
      const turnStartedSpy = vi.fn();
      conversation.on('turn-started', turnStartedSpy);

      // Mock agent loading and provider
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: {
          name: 'PM',
          id: 'pm',
          title: 'Product Manager',
          icon: '📋',
          whenToUse: 'For PRDs',
        },
        persona: {
          role: 'PM',
          style: 'Professional',
          identity: 'Product Manager',
          focus: 'Requirements',
          core_principles: ['User-focused'],
        },
        commands: ['*help'],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      // Mock provider to return end_turn immediately
      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          message: {
            role: 'assistant',
            content: 'Test response',
            toolCalls: [],
          },
          usage: { inputTokens: 100, outputTokens: 50 },
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4-20250514',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      });

      await conversation.send('Test message');
      await conversation.waitForCompletion();

      expect(turnStartedSpy).toHaveBeenCalled();
    });
  });

  describe('Turn Management', () => {
    it('should track conversation turns', () => {
      const history = conversation.getHistory();
      expect(history).toEqual([]);
    });

    it('should return turn after completion', async () => {
      // Mock agent and provider
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Response', toolCalls: [] },
          usage: { inputTokens: 100, outputTokens: 50 },
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      await conversation.send('Hello');
      const turn = await conversation.waitForCompletion();

      expect(turn).toBeDefined();
      expect(turn.userMessage).toBe('Hello');
      expect(turn.agentResponse).toContain('Response');
      expect(turn.cost).toBeGreaterThan(0);
      expect(turn.tokensUsed.input).toBe(100);
      expect(turn.tokensUsed.output).toBe(50);
    });

    it('should accumulate multiple turns', async () => {
      // Mock implementation
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi
          .fn()
          .mockResolvedValueOnce({
            message: { role: 'assistant', content: 'First response', toolCalls: [] },
            usage: { inputTokens: 100, outputTokens: 50 },
            stopReason: 'end_turn',
          })
          .mockResolvedValueOnce({
            message: { role: 'assistant', content: 'Second response', toolCalls: [] },
            usage: { inputTokens: 120, outputTokens: 60 },
            stopReason: 'end_turn',
          }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      // Turn 1
      await conversation.send('Message 1');
      await conversation.waitForCompletion();

      // Turn 2
      await conversation.send('Message 2');
      await conversation.waitForCompletion();

      const history = conversation.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.userMessage).toBe('Message 1');
      expect(history[1]?.userMessage).toBe('Message 2');
    });
  });

  describe('Cost Tracking', () => {
    it('should track costs across turns', () => {
      const costs = conversation.getCosts();

      expect(costs.totalCost).toBe(0);
      expect(costs.inputTokens).toBe(0);
      expect(costs.outputTokens).toBe(0);
      expect(costs.apiCalls).toBe(0);
    });

    it('should emit cost-warning when approaching limit', async () => {
      const costWarningSpy = vi.fn();
      conversation.on('cost-warning', costWarningSpy);

      // Create conversation with low cost limit
      const limitedConv = new ConversationalSession(client, 'pm', {
        costLimit: 0.1, // $0.10 limit
      });

      limitedConv.on('cost-warning', costWarningSpy);

      // Mock to simulate high cost
      vi.spyOn(limitedConv as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(limitedConv as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Response', toolCalls: [] },
          usage: { inputTokens: 9000, outputTokens: 4000 }, // Results in $0.087 (87% of limit)
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.087),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(limitedConv as any, 'provider', 'get').mockReturnValue(mockProvider);

      await limitedConv.send('Expensive message');
      await limitedConv.waitForCompletion();

      // Cost warning should be emitted
      expect(costWarningSpy).toHaveBeenCalled();
    });

    it('should throw error when exceeding cost limit', async () => {
      const limitedConv = new ConversationalSession(client, 'pm', {
        costLimit: 0.05,
      });

      vi.spyOn(limitedConv as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(limitedConv as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Response', toolCalls: [] },
          usage: { inputTokens: 20000, outputTokens: 10000 },
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.1), // Over limit
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(limitedConv as any, 'provider', 'get').mockReturnValue(mockProvider);

      await limitedConv.send('Expensive message');

      await expect(limitedConv.waitForCompletion()).rejects.toThrow('Cost limit exceeded');
    });
  });

  describe('Document Management', () => {
    it('should return documents from VFS', () => {
      const docs = conversation.getDocuments();
      expect(Array.isArray(docs)).toBe(true);
    });

    it('should accumulate documents across turns', async () => {
      // Mock agent and provider with tool calls
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      // Mock provider to write files
      const mockProvider = {
        sendMessage: vi
          .fn()
          .mockResolvedValueOnce({
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_1',
                  name: 'write_file',
                  input: { file_path: '/docs/doc1.md', content: 'Doc 1' },
                },
              ],
              toolCalls: [
                {
                  id: 'tool_1',
                  name: 'write_file',
                  input: { file_path: '/docs/doc1.md', content: 'Doc 1' },
                },
              ],
            },
            usage: { inputTokens: 100, outputTokens: 50 },
            stopReason: 'tool_use',
          })
          .mockResolvedValueOnce({
            message: { role: 'assistant', content: 'Done', toolCalls: [] },
            usage: { inputTokens: 50, outputTokens: 20 },
            stopReason: 'end_turn',
          }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      await conversation.send('Create document');
      await conversation.waitForCompletion();

      const docs = conversation.getDocuments();
      expect(docs.length).toBeGreaterThan(0);
    });
  });

  describe('Question Handling', () => {
    it('should emit question event when agent asks', async () => {
      const questionSpy = vi.fn();
      conversation.on('question', questionSpy);

      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'What is your target user?', toolCalls: [] },
          usage: { inputTokens: 100, outputTokens: 50 },
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      await conversation.send('Create PRD');

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(questionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          question: expect.stringContaining('?'),
        })
      );
    });

    it('should throw error when answering without pending question', async () => {
      await expect(conversation.answer('Some answer')).rejects.toThrow(
        'No pending question to answer'
      );
    });
  });

  describe('End Conversation', () => {
    it('should return complete result when ended', async () => {
      // Mock simple conversation
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Done', toolCalls: [] },
          usage: { inputTokens: 100, outputTokens: 50 },
          stopReason: 'end_turn',
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      await conversation.send('Hello');
      await conversation.waitForCompletion();

      const result = await conversation.end();

      expect(result.conversationId).toBe(conversation.id);
      expect(result.turns).toHaveLength(1);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.totalTokens.input).toBeGreaterThan(0);
      expect(result.totalTokens.output).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0); // Can be 0 in fast mocked tests
      expect(result.documents).toBeDefined();
    });

    it('should throw error when ending while processing', async () => {
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockImplementation(() => {
          // Slow response
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                message: { role: 'assistant', content: 'Response', toolCalls: [] },
                usage: { inputTokens: 100, outputTokens: 50 },
                stopReason: 'end_turn',
              });
            }, 5000);
          });
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      // Start processing
      await conversation.send('Hello');

      // Try to end immediately (while processing)
      await expect(conversation.end()).rejects.toThrow('Cannot end conversation while processing');
    });
  });

  describe('Error Handling', () => {
    it('should emit error event on processing failure', async () => {
      const errorSpy = vi.fn();
      conversation.on('error', errorSpy);

      vi.spyOn(conversation as any, 'loadAgent').mockRejectedValue(new Error('Agent not found'));

      await conversation.send('Test');

      // Wait for async error
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle provider errors gracefully', async () => {
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockRejectedValue(new Error('API Error')),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      const errorSpy = vi.fn();
      conversation.on('error', errorSpy);

      await conversation.send('Test');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout if completion takes too long', async () => {
      vi.spyOn(conversation as any, 'loadAgent').mockResolvedValue({
        agent: { name: 'PM', id: 'pm', title: 'PM', icon: '📋', whenToUse: 'PRDs' },
        persona: { role: 'PM', style: 'Pro', identity: 'PM', focus: 'Reqs', core_principles: [] },
        commands: [],
        dependencies: {},
      });

      vi.spyOn(conversation as any, 'loadTemplatesIntoVFS').mockResolvedValue(undefined);

      const mockProvider = {
        sendMessage: vi.fn().mockImplementation(() => {
          // Never resolves
          return new Promise(() => {});
        }),
        calculateCost: vi.fn().mockReturnValue(0.01),
        getModelInfo: vi.fn().mockReturnValue({
          name: 'claude-sonnet-4',
          maxTokens: 200000,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
        }),
      };

      vi.spyOn(conversation as any, 'provider', 'get').mockReturnValue(mockProvider);

      await conversation.send('Test');

      // Wait with short timeout
      await expect(conversation.waitForCompletion(100)).rejects.toThrow(
        'Timeout waiting for completion'
      );
    });
  });
});
