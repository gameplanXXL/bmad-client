/**
 * Tests for Session State Persistence (Serialize/Deserialize)
 *
 * Epic 8: Session State Persistence
 * Tests session.serialize() and BmadSession.deserialize()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { BmadSession } from '../session.js';
import { MockLLMProvider } from './mock-llm-provider.js';

describe('Session State Persistence', () => {
  let client: BmadClient;
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    client = new BmadClient({
      provider: mockProvider,
      logLevel: 'error',
    });
  });

  describe('serialize()', () => {
    it('should capture complete session state', async () => {
      // Setup session with some state
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Creating PRD...',
          toolCalls: [
            {
              id: 'call-1',
              name: 'write_file',
              input: { path: '/prd.md', content: '# Product Requirements' },
            },
          ],
        },
        {
          content: 'PRD created successfully.',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Serialize state
      const state = session.serialize();

      // Verify state structure
      expect(state).toMatchObject({
        id: session.id,
        agentId: 'pm',
        command: 'create-prd',
        status: 'completed',
        createdAt: expect.any(Number),
        startedAt: expect.any(Number),
        completedAt: expect.any(Number),
        messages: expect.any(Array),
        vfsFiles: expect.any(Object),
        totalInputTokens: expect.any(Number),
        totalOutputTokens: expect.any(Number),
        totalCost: expect.any(Number),
        apiCallCount: expect.any(Number),
        childSessionCosts: [],
        providerType: 'custom',
      });
    });

    it('should capture all VFS files', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      // Manually add files to VFS using tool executor
      const toolExecutor = (session as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/file1.md': 'Content 1',
        '/file2.md': 'Content 2',
        '/subdir/file3.md': 'Content 3',
      });

      const state = session.serialize();

      // Verify all files captured
      expect(state.vfsFiles).toEqual({
        '/file1.md': 'Content 1',
        '/file2.md': 'Content 2',
        '/subdir/file3.md': 'Content 3',
      });
    });

    it.skip('should capture paused session with pending question', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'I need more information.',
          toolCalls: [
            {
              id: 'call-1',
              name: 'ask_user',
              input: {
                question: 'What is the target audience?',
                context: 'Need to understand user base',
              },
            },
          ],
        },
        {
          content: 'Thank you for the answer.',
          toolCalls: [],
        },
      ]);

      // Start session but don't answer - it will pause
      const runPromise = session.execute();

      // Wait for pause
      await new Promise((resolve) => {
        session.once('question', resolve);
      });

      // Serialize paused state
      const state = session.serialize();

      expect(state.status).toBe('paused');
      expect(state.pausedAt).toBeDefined();
      expect(state.pendingQuestion).toEqual({
        question: 'What is the target audience?',
        context: 'Need to understand user base',
      });

      // Cleanup
      session.answer('General users');
      await runPromise;
    }, 15000);

    it('should capture conversation messages', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Working on it...',
          toolCalls: [],
        },
      ]);

      await session.execute();

      const state = session.serialize();

      // Should have system prompt + assistant response
      expect(state.messages.length).toBeGreaterThanOrEqual(2);
      expect(state.messages[0]?.role).toBe('system');
      expect(state.messages.some((m) => m.role === 'assistant')).toBe(true);
    });

    it('should capture cost tracking data', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'First response',
          toolCalls: [],
        },
        {
          content: 'Second response',
          toolCalls: [],
        },
      ]);

      // Mock provider tracks tokens
      await session.execute();

      const state = session.serialize();

      expect(state.totalInputTokens).toBeGreaterThan(0);
      expect(state.totalOutputTokens).toBeGreaterThan(0);
      expect(state.apiCallCount).toBeGreaterThanOrEqual(1);
      // Cost might be 0 for mock provider, but should be defined
      expect(typeof state.totalCost).toBe('number');
    });

    it('should capture session options', async () => {
      const session = await client.startAgent('pm', 'create-prd', {
        costLimit: 5.0,
        pauseTimeout: 60000,
        context: { projectId: 'test-123' },
      });

      mockProvider.setResponses([
        {
          content: 'Done',
          toolCalls: [],
        },
      ]);

      await session.execute();

      const state = session.serialize();

      expect(state.options).toEqual({
        costLimit: 5.0,
        pauseTimeout: 60000,
        context: { projectId: 'test-123' },
      });
    });
  });

  describe('deserialize()', () => {
    it('should restore complete session state', async () => {
      // Create and run original session
      const originalSession = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Creating PRD...',
          toolCalls: [
            {
              id: 'call-1',
              name: 'write_file',
              input: { path: '/prd.md', content: '# PRD Content' },
            },
          ],
        },
        {
          content: 'Done',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      // Serialize
      const state = originalSession.serialize();

      // Deserialize into new session
      const restoredSession = await BmadSession.deserialize(client, state);

      // Verify session identity
      expect(restoredSession.id).toBe(originalSession.id);
      expect(restoredSession.agentId).toBe(originalSession.agentId);
      expect(restoredSession.command).toBe(originalSession.command);
      expect(restoredSession.getStatus()).toBe(originalSession.getStatus());
    });

    it('should restore VFS files', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      // Manually add files to VFS
      const toolExecutor = (originalSession as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/file1.md': 'Content 1',
        '/file2.md': 'Content 2',
      });

      const state = originalSession.serialize();
      const restoredSession = await BmadSession.deserialize(client, state);

      // Verify VFS restored by serializing again and checking vfsFiles
      const restoredState = restoredSession.serialize();
      expect(restoredState.vfsFiles).toEqual(state.vfsFiles);
      expect(Object.keys(restoredState.vfsFiles)).toHaveLength(2);
      expect(restoredState.vfsFiles['/file1.md']).toBe('Content 1');
      expect(restoredState.vfsFiles['/file2.md']).toBe('Content 2');
    });

    it.skip('should restore paused session with pending question', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Need info',
          toolCalls: [
            {
              id: 'call-1',
              name: 'ask_user',
              input: {
                question: 'What is the deadline?',
                context: 'For planning',
              },
            },
          ],
        },
        {
          content: 'Got it, continuing...',
          toolCalls: [],
        },
      ]);

      const runPromise = originalSession.execute();

      // Wait for pause
      await new Promise((resolve) => {
        originalSession.once('question', resolve);
      });

      // Serialize paused session
      const state = originalSession.serialize();

      // Deserialize
      const restoredSession = await BmadSession.deserialize(client, state);

      expect(restoredSession.getStatus()).toBe('paused');
      const restoredState = restoredSession.serialize();
      expect(restoredState.pendingQuestion).toEqual({
        question: 'What is the deadline?',
        context: 'For planning',
      });

      // Cleanup both sessions
      originalSession.answer('Next week');
      await runPromise;
    }, 15000);

    it('should restore cost tracking data', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Response',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      const state = originalSession.serialize();
      const restoredSession = await BmadSession.deserialize(client, state);

      // Verify cost data restored by comparing serialized states
      const originalState = originalSession.serialize();
      const restoredState = restoredSession.serialize();

      expect(restoredState.totalInputTokens).toBe(originalState.totalInputTokens);
      expect(restoredState.totalOutputTokens).toBe(originalState.totalOutputTokens);
      expect(restoredState.totalCost).toBe(originalState.totalCost);
      expect(restoredState.apiCallCount).toBe(originalState.apiCallCount);
    });

    it('should restore conversation messages', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'First message',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      const state = originalSession.serialize();
      const restoredSession = await BmadSession.deserialize(client, state);

      // Messages should be identical - using serialize to access
      const restoredState = restoredSession.serialize();
      expect(restoredState.messages).toEqual(state.messages);
    });

    it('should restore session options', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd', {
        costLimit: 10.0,
        pauseTimeout: 30000,
        context: { userId: 'user-456' },
      });

      mockProvider.setResponses([
        {
          content: 'Done',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      const state = originalSession.serialize();
      const restoredSession = await BmadSession.deserialize(client, state);

      expect((restoredSession as any).options).toEqual({
        costLimit: 10.0,
        pauseTimeout: 30000,
        context: { userId: 'user-456' },
      });
    });
  });

  describe('Round-trip Serialization', () => {
    it('should produce identical state after serialize → deserialize → serialize', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Creating documents...',
          toolCalls: [
            {
              id: 'call-1',
              name: 'write_file',
              input: { path: '/doc.md', content: '# Document' },
            },
          ],
        },
        {
          content: 'Complete',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      // First serialization
      const state1 = originalSession.serialize();

      // Deserialize
      const restoredSession = await BmadSession.deserialize(client, state1);

      // Second serialization
      const state2 = restoredSession.serialize();

      // States should be identical (except possibly timestamps)
      expect(state2.id).toBe(state1.id);
      expect(state2.agentId).toBe(state1.agentId);
      expect(state2.command).toBe(state1.command);
      expect(state2.status).toBe(state1.status);
      expect(state2.messages).toEqual(state1.messages);
      expect(state2.vfsFiles).toEqual(state1.vfsFiles);
      expect(state2.totalInputTokens).toBe(state1.totalInputTokens);
      expect(state2.totalOutputTokens).toBe(state1.totalOutputTokens);
      expect(state2.totalCost).toBe(state1.totalCost);
      expect(state2.apiCallCount).toBe(state1.apiCallCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle session with no VFS files', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Just thinking...',
          toolCalls: [],
        },
      ]);

      await session.execute();

      const state = session.serialize();
      expect(state.vfsFiles).toEqual({});

      const restored = await BmadSession.deserialize(client, state);
      const restoredState = restored.serialize();
      expect(restoredState.vfsFiles).toEqual({});
    });

    it('should handle session with no messages yet', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      // Serialize before running
      const state = session.serialize();
      expect(state.messages).toEqual([]);

      const restored = await BmadSession.deserialize(client, state);
      expect((restored as any).messages).toEqual([]);
    });

    it('should handle session with child session costs', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Done',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Manually add child session cost (simulating sub-agent invocation)
      const sessionAny = session as any;
      sessionAny.childSessionCosts.push({
        sessionId: 'child-sess-123',
        agent: 'architect',
        command: 'create-architecture',
        totalCost: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        apiCalls: 2,
      });

      const state = session.serialize();
      expect(state.childSessionCosts).toHaveLength(1);
      expect(state?.childSessionCosts[0]?.agent).toBe('architect');

      const restored = await BmadSession.deserialize(client, state);
      expect((restored as any).childSessionCosts).toEqual(state.childSessionCosts);
    });

    it('should preserve timestamps correctly', async () => {
      const session = await client.startAgent('pm', 'create-prd');

      mockProvider.setResponses([
        {
          content: 'Done',
          toolCalls: [],
        },
      ]);

      await session.execute();

      const state = session.serialize();

      expect(state.createdAt).toBeDefined();
      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeDefined();
      expect(state.completedAt! >= state.startedAt!).toBe(true);
      expect(state.startedAt! >= state.createdAt).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should properly restore completed session state', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd');

      // Manually set session state to completed and add files
      (originalSession as any).status = 'completed';
      const toolExecutor = (originalSession as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/prd.md': '# PRD',
      });

      const state = originalSession.serialize();
      const restoredSession = await BmadSession.deserialize(client, state);

      // Verify restored session has correct state
      expect(restoredSession.getStatus()).toBe('completed');
      const restoredState = restoredSession.serialize();
      expect(restoredState.status).toBe('completed');
      expect(Object.keys(restoredState.vfsFiles)).toContain('/prd.md');
      expect(restoredState.totalCost).toBeGreaterThanOrEqual(0);
    });
  });
});
