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

describe('ConversationalSession - Unit Tests', () => {
  let client: BmadClient;
  let conversation: ConversationalSession;

  beforeEach(() => {
    client = createMockClient();
    conversation = new ConversationalSession(client, 'pm');
  });

  describe('Constructor and Initialization', () => {
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

    it('should accept options with cost limit', () => {
      const conv = new ConversationalSession(client, 'pm', {
        costLimit: 10.0,
        pauseTimeout: 600000,
      });

      expect(conv.id).toBeDefined();
      expect(conv.agentId).toBe('pm');
    });

    it('should accept initial context files', () => {
      const conv = new ConversationalSession(client, 'pm', {
        context: {
          initialFiles: {
            '/docs/existing.md': '# Existing Document',
          },
        },
      });

      expect(conv).toBeDefined();
      expect(conv.id).toMatch(/^conv_/);
    });

    it('should generate different IDs for concurrent conversations', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        const conv = new ConversationalSession(client, 'pm');
        ids.add(conv.id);
      }
      expect(ids.size).toBe(100); // All unique
    });
  });

  describe('Status Management', () => {
    it('should start in idle status', () => {
      expect(conversation.isIdle()).toBe(true);
    });

    it('should have correct agentId', () => {
      expect(conversation.agentId).toBe('pm');
    });

    it('should have unique conversation ID format', () => {
      expect(conversation.id).toMatch(/^conv_\d{13}_[a-z0-9]{10,}$/);
    });
  });

  describe('History Management', () => {
    it('should start with empty history', () => {
      const history = conversation.getHistory();
      expect(history).toEqual([]);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should not mutate original history', () => {
      const history1 = conversation.getHistory();
      const history2 = conversation.getHistory();

      expect(history1).not.toBe(history2); // Different array instances
      expect(history1).toEqual(history2); // But same content
    });
  });

  describe('Document Management', () => {
    it('should start with no documents', () => {
      const docs = conversation.getDocuments();
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBe(0);
    });

    it('should return array of documents', () => {
      const docs = conversation.getDocuments();
      expect(docs).toBeInstanceOf(Array);
    });
  });

  describe('Cost Tracking', () => {
    it('should start with zero costs', () => {
      const costs = conversation.getCosts();

      expect(costs.totalCost).toBe(0);
      expect(costs.inputTokens).toBe(0);
      expect(costs.outputTokens).toBe(0);
      expect(costs.apiCalls).toBe(0);
      expect(costs.currency).toBe('USD');
      expect(costs.breakdown).toBeInstanceOf(Array);
      expect(costs.breakdown.length).toBe(0);
    });

    it('should have proper cost report structure', () => {
      const costs = conversation.getCosts();

      expect(costs).toHaveProperty('totalCost');
      expect(costs).toHaveProperty('currency');
      expect(costs).toHaveProperty('inputTokens');
      expect(costs).toHaveProperty('outputTokens');
      expect(costs).toHaveProperty('apiCalls');
      expect(costs).toHaveProperty('breakdown');
    });
  });

  describe('Event Emitter', () => {
    it('should be an event emitter', () => {
      expect(conversation.on).toBeDefined();
      expect(conversation.emit).toBeDefined();
      expect(conversation.removeListener).toBeDefined();
    });

    it('should allow registering event listeners', () => {
      const listener = vi.fn();

      conversation.on('turn-started', listener);
      conversation.on('turn-completed', listener);
      conversation.on('question', listener);
      conversation.on('idle', listener);
      conversation.on('cost-warning', listener);
      conversation.on('error', listener);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should allow removing event listeners', () => {
      const listener = vi.fn();

      conversation.on('turn-started', listener);
      conversation.removeListener('turn-started', listener);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Error Conditions', () => {
    it('should throw error when answering without pending question', async () => {
      await expect(conversation.answer('Some answer')).rejects.toThrow(
        'No pending question to answer'
      );
    });

    it('should throw error when sending to ended conversation', async () => {
      // Manually set status to ended
      (conversation as any).status = 'ended';

      await expect(conversation.send('Test')).rejects.toThrow(
        'Cannot send message to ended conversation'
      );
    });

    it('should throw error when sending while processing', async () => {
      // Manually set status to processing
      (conversation as any).status = 'processing';

      await expect(conversation.send('Test')).rejects.toThrow(
        'Cannot send message while agent is still processing previous message'
      );
    });
  });

  describe('Options Handling', () => {
    it('should use default options when none provided', () => {
      const conv = new ConversationalSession(client, 'pm');
      expect(conv).toBeDefined();
    });

    it('should accept cost limit option', () => {
      const conv = new ConversationalSession(client, 'pm', {
        costLimit: 5.0,
      });
      expect(conv).toBeDefined();
    });

    it('should accept pause timeout option', () => {
      const conv = new ConversationalSession(client, 'pm', {
        pauseTimeout: 30000,
      });
      expect(conv).toBeDefined();
    });

    it('should accept autoSave option', () => {
      const conv = new ConversationalSession(client, 'pm', {
        autoSave: true,
      });
      expect(conv).toBeDefined();
    });

    it('should accept all options together', () => {
      const conv = new ConversationalSession(client, 'pm', {
        costLimit: 10.0,
        pauseTimeout: 60000,
        autoSave: true,
        context: {
          customData: 'test',
        },
      });
      expect(conv).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should have correct agentId type', () => {
      expect(typeof conversation.agentId).toBe('string');
    });

    it('should have correct id type', () => {
      expect(typeof conversation.id).toBe('string');
    });

    it('should have method types', () => {
      expect(typeof conversation.send).toBe('function');
      expect(typeof conversation.waitForCompletion).toBe('function');
      expect(typeof conversation.isIdle).toBe('function');
      expect(typeof conversation.answer).toBe('function');
      expect(typeof conversation.getHistory).toBe('function');
      expect(typeof conversation.getDocuments).toBe('function');
      expect(typeof conversation.getCosts).toBe('function');
      expect(typeof conversation.end).toBe('function');
    });
  });

  describe('Multiple Conversations', () => {
    it('should allow creating multiple conversations', () => {
      const conv1 = new ConversationalSession(client, 'pm');
      const conv2 = new ConversationalSession(client, 'architect');
      const conv3 = new ConversationalSession(client, 'dev');

      expect(conv1.agentId).toBe('pm');
      expect(conv2.agentId).toBe('architect');
      expect(conv3.agentId).toBe('dev');
    });

    it('should keep conversations independent', () => {
      const conv1 = new ConversationalSession(client, 'pm');
      const conv2 = new ConversationalSession(client, 'architect');

      expect(conv1.id).not.toBe(conv2.id);
      expect(conv1.agentId).not.toBe(conv2.agentId);
    });
  });
});
