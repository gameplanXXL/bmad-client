/**
 * Tests for Session Recovery and Auto-Save
 *
 * Tests:
 * - Auto-save during execution
 * - Session recovery from storage
 * - Session browser (list/delete)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { MockLLMProvider } from './mock-llm-provider.js';
import { InMemoryStorageAdapter } from '../storage/memory-adapter.js';

describe('Session Recovery and Auto-Save', () => {
  let client: BmadClient;
  let mockProvider: MockLLMProvider;
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    storage = new InMemoryStorageAdapter();

    client = new BmadClient({
      provider: mockProvider,
      logLevel: 'error',
      storage: {
        type: 'custom',
        adapter: storage,
      },
    });
  });

  describe('Auto-Save', () => {
    it('should auto-save session state after each API call', async () => {
      const session = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      mockProvider.setResponses([
        {
          text: 'First response',
          toolCalls: [],
        },
        {
          text: 'Second response',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Verify session was saved to storage
      const savedState = await storage.loadSessionState(session.id);
      expect(savedState.id).toBe(session.id);
      expect(savedState.agentId).toBe('pm');
      expect(savedState.command).toBe('create-prd');
      expect(savedState.status).toBe('completed');
    });

    it('should not auto-save when autoSave is disabled', async () => {
      const session = await client.startAgent('pm', 'create-prd', {
        autoSave: false,
      });

      mockProvider.setResponses([
        {
          text: 'Response',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Verify session was NOT saved
      await expect(storage.loadSessionState(session.id)).rejects.toThrow();
    });

    it('should auto-save session with VFS files', async () => {
      const session = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      // Manually add files to VFS
      const toolExecutor = (session as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/doc1.md': 'Content 1',
        '/doc2.md': 'Content 2',
      });

      mockProvider.setResponses([
        {
          text: 'Done',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Verify VFS files were saved
      const savedState = await storage.loadSessionState(session.id);
      expect(savedState.vfsFiles).toEqual({
        '/doc1.md': 'Content 1',
        '/doc2.md': 'Content 2',
      });
    });
  });

  describe('Session Recovery', () => {
    it('should recover completed session', async () => {
      // Create and complete session
      const originalSession = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      mockProvider.setResponses([
        {
          text: 'Creating PRD',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      // Recover session
      const recoveredSession = await client.recoverSession(originalSession.id);

      expect(recoveredSession.id).toBe(originalSession.id);
      expect(recoveredSession.agentId).toBe('pm');
      expect(recoveredSession.command).toBe('create-prd');
      expect(recoveredSession.getStatus()).toBe('completed');
    });

    it('should recover session with conversation history', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      mockProvider.setResponses([
        {
          text: 'Response 1',
          toolCalls: [],
        },
        {
          text: 'Response 2',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      // Recover session
      const recoveredSession = await client.recoverSession(originalSession.id);

      // Verify messages were restored
      const recoveredState = recoveredSession.serialize();
      const originalState = originalSession.serialize();

      expect(recoveredState.messages).toEqual(originalState.messages);
      expect(recoveredState.messages.length).toBeGreaterThan(0);
    });

    it('should recover session with VFS files', async () => {
      const originalSession = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      // Add files to VFS
      const toolExecutor = (originalSession as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/prd.md': '# PRD Content',
        '/notes.md': 'Some notes',
      });

      mockProvider.setResponses([
        {
          text: 'Done',
          toolCalls: [],
        },
      ]);

      await originalSession.execute();

      // Recover session
      const recoveredSession = await client.recoverSession(originalSession.id);

      // Verify VFS files were restored
      const recoveredState = recoveredSession.serialize();
      expect(recoveredState.vfsFiles).toEqual({
        '/prd.md': '# PRD Content',
        '/notes.md': 'Some notes',
      });
    });

    it('should throw error when recovering non-existent session', async () => {
      await expect(client.recoverSession('non-existent-id')).rejects.toThrow();
    });

    it('should throw error when storage not configured', async () => {
      const clientWithoutStorage = new BmadClient({
        provider: mockProvider,
        logLevel: 'error',
      });

      await expect(clientWithoutStorage.recoverSession('sess-123')).rejects.toThrow(
        'Storage not configured'
      );
    });
  });

  describe('Session Browser', () => {
    beforeEach(async () => {
      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const session = await client.startAgent('pm', `command-${i}`, {
          autoSave: true,
        });

        mockProvider.setResponses([
          {
            text: `Response ${i}`,
            toolCalls: [],
          },
        ]);

        await session.execute();
      }
    });

    it('should list all sessions', async () => {
      const result = await client.listSessions();

      expect(result.sessions.length).toBe(5);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should filter sessions by agentId', async () => {
      // Create session with different agent
      const session = await client.startAgent('architect', 'design', {
        autoSave: true,
      });

      mockProvider.setResponses([
        {
          text: 'Design',
          toolCalls: [],
        },
      ]);

      await session.execute();

      // Filter by PM agent
      const pmSessions = await client.listSessions({ agentId: 'pm' });
      expect(pmSessions.sessions.every((s) => s.agentId === 'pm')).toBe(true);
      expect(pmSessions.total).toBe(5);

      // Filter by architect
      const archSessions = await client.listSessions({ agentId: 'architect' });
      expect(archSessions.sessions.every((s) => s.agentId === 'architect')).toBe(true);
      expect(archSessions.total).toBe(1);
    });

    it('should paginate session list', async () => {
      const page1 = await client.listSessions({ limit: 2, offset: 0 });
      expect(page1.sessions.length).toBe(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await client.listSessions({ limit: 2, offset: 2 });
      expect(page2.sessions.length).toBe(2);
      expect(page2.total).toBe(5);
      expect(page2.hasMore).toBe(true);

      const page3 = await client.listSessions({ limit: 2, offset: 4 });
      expect(page3.sessions.length).toBe(1);
      expect(page3.total).toBe(5);
      expect(page3.hasMore).toBe(false);
    });

    it('should delete session', async () => {
      const sessions = await client.listSessions();
      const sessionToDelete = sessions.sessions[0].sessionId;

      const deleted = await client.deleteSession(sessionToDelete);
      expect(deleted).toBe(true);

      // Verify session is gone
      await expect(client.recoverSession(sessionToDelete)).rejects.toThrow();

      // Verify total count decreased
      const remaining = await client.listSessions();
      expect(remaining.total).toBe(4);
    });

    it('should return false when deleting non-existent session', async () => {
      const deleted = await client.deleteSession('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should throw error when listing without storage', async () => {
      const clientWithoutStorage = new BmadClient({
        provider: mockProvider,
        logLevel: 'error',
      });

      await expect(clientWithoutStorage.listSessions()).rejects.toThrow('Storage not configured');
    });
  });

  describe('Session Metadata', () => {
    it('should include session metadata in list', async () => {
      const session = await client.startAgent('pm', 'create-prd', {
        autoSave: true,
      });

      // Add files to VFS
      const toolExecutor = (session as any).toolExecutor;
      toolExecutor.initializeFiles({
        '/file1.md': 'Content 1',
        '/file2.md': 'Content 2',
        '/file3.md': 'Content 3',
      });

      mockProvider.setResponses([
        {
          text: 'Done',
          toolCalls: [],
        },
      ]);

      await session.execute();

      const result = await client.listSessions();
      const savedSession = result.sessions.find((s) => s.sessionId === session.id);

      expect(savedSession).toBeDefined();
      expect(savedSession!.agentId).toBe('pm');
      expect(savedSession!.command).toBe('create-prd');
      expect(savedSession!.status).toBe('completed');
      expect(savedSession!.documentCount).toBe(3);
      expect(savedSession!.totalCost).toBeGreaterThanOrEqual(0);
      expect(savedSession!.createdAt).toBeDefined();
      expect(savedSession!.completedAt).toBeDefined();
    });
  });
});
