import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BmadClient } from '../client.js';
import { MockLLMProvider } from './mock-llm-provider.js';
import { InMemoryStorageAdapter } from '../storage/memory-adapter.js';

describe('Session Storage Integration', () => {
  let client: BmadClient;
  let mockProvider: MockLLMProvider;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    // Create storage adapter
    storage = new InMemoryStorageAdapter();

    // Create mock provider
    mockProvider = new MockLLMProvider({
      content: 'Test response with document created!',
      stopReason: 'end_turn',
      inputTokens: 1000,
      outputTokens: 200,
    });

    // Create client with storage
    client = new BmadClient({
      provider: mockProvider,
      storage: { type: 'memory' },
      logLevel: 'error',
    });

    await client.waitForInit();
  });

  describe('Automatic Document Saving', () => {
    it('should save documents to storage after session completes', async () => {
      // Mock tool calls to create a document
      mockProvider.addRules([
        {
          conversationLength: 2, // First response after system + user
          response: {
            content: 'Creating document...',
            stopReason: 'tool_use',
            toolCalls: [
              {
                id: 'call_1',
                name: 'write_file',
                input: {
                  file_path: '/docs/prd.md',
                  content: '# Product Requirements\n\nTest PRD content',
                },
              },
            ],
            inputTokens: 1000,
            outputTokens: 100,
          },
        },
        {
          conversationLength: 4, // After tool results
          response: {
            content: 'Document created successfully!',
            stopReason: 'end_turn',
            inputTokens: 500,
            outputTokens: 50,
          },
        },
      ]);

      const session = await client.startAgent('pm', 'create-prd');
      const result = await session.execute();

      // Verify documents were created
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].path).toBe('/docs/prd.md');

      // Verify documents were saved to storage
      const clientStorage = client.getStorage();
      expect(clientStorage).toBeDefined();

      const saved = await clientStorage!.load('/docs/prd.md');
      expect(saved.content).toContain('# Product Requirements');
      expect(saved.content).toContain('Test PRD content');
    });

    it('should not save if storage not configured', async () => {
      // Create client without storage
      const noStorageClient = new BmadClient({
        provider: mockProvider,
        logLevel: 'error',
      });

      mockProvider.setResponses([
        {
          content: 'Creating document...',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'write_file',
              input: {
                file_path: '/docs/test.md',
                content: 'Test content',
              },
            },
          ],
          inputTokens: 1000,
          outputTokens: 100,
        },
        {
          content: 'Done',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 50,
        },
      ]);

      const session = await noStorageClient.startAgent('pm', 'test');
      const result = await session.execute();

      // Documents created in VFS but not saved to storage
      expect(result.documents).toHaveLength(1);

      // Verify no storage is configured
      expect(noStorageClient.getStorage()).toBeUndefined();
    });

    it('should save multiple documents', async () => {
      mockProvider.setResponses([
        {
          content: 'Creating PRD...',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# PRD',
              },
            },
            {
              id: 'call_2',
              name: 'write_file',
              input: {
                file_path: '/docs/architecture.md',
                content: '# Architecture',
              },
            },
            {
              id: 'call_3',
              name: 'write_file',
              input: {
                file_path: '/docs/story-1.md',
                content: '# Story 1',
              },
            },
          ],
          inputTokens: 1500,
          outputTokens: 150,
        },
        {
          content: 'All documents created!',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 50,
        },
      ]);

      const session = await client.startAgent('pm', 'create-docs');
      const result = await session.execute();

      expect(result.documents).toHaveLength(3);

      // Verify all saved to storage
      const clientStorage = client.getStorage()!;
      expect(await clientStorage.exists('/docs/prd.md')).toBe(true);
      expect(await clientStorage.exists('/docs/architecture.md')).toBe(true);
      expect(await clientStorage.exists('/docs/story-1.md')).toBe(true);
    });

    it('should include session metadata in storage', async () => {
      mockProvider.setResponses([
        {
          content: 'Creating document...',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'write_file',
              input: {
                file_path: '/test.md',
                content: 'Test',
              },
            },
          ],
          inputTokens: 1000,
          outputTokens: 100,
        },
        {
          content: 'Done',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 50,
        },
      ]);

      const session = await client.startAgent('pm', 'create-prd');
      const result = await session.execute();

      // Get metadata from storage
      const clientStorage = client.getStorage()!;
      const metadata = await clientStorage.getMetadata('/test.md');

      expect(metadata.sessionId).toBe(session.id);
      expect(metadata.agentId).toBe('pm');
      expect(metadata.command).toBe('create-prd');
      expect(metadata.timestamp).toBeDefined();
    });
  });

  describe('Document Loading', () => {
    it('should load document from storage into VFS', async () => {
      // Pre-save a document
      const clientStorage = client.getStorage()!;
      await clientStorage.save(
        { path: '/docs/existing-prd.md', content: '# Existing PRD\n\nContent here' },
        {
          sessionId: 'sess_old',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: Date.now(),
        }
      );

      // Create session and load document
      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await client.startAgent('pm', 'review-prd');

      // Load document into session
      const loaded = await session.loadDocument('/docs/existing-prd.md');

      expect(loaded.path).toBe('/docs/existing-prd.md');
      expect(loaded.content).toContain('# Existing PRD');

      // Verify document is now in VFS (agent can access it)
      const toolExecutor = session.getToolExecutor();
      const vfsContent = toolExecutor.getFileContent('/docs/existing-prd.md');
      expect(vfsContent).toContain('# Existing PRD');
    });

    it('should load multiple documents', async () => {
      const clientStorage = client.getStorage()!;

      // Pre-save multiple documents
      await clientStorage.saveBatch(
        [
          { path: '/doc1.md', content: 'Doc 1' },
          { path: '/doc2.md', content: 'Doc 2' },
          { path: '/doc3.md', content: 'Doc 3' },
        ],
        {
          sessionId: 'sess_old',
          agentId: 'pm',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await client.startAgent('pm', 'test');

      // Load all documents
      const loaded = await session.loadDocuments(['/doc1.md', '/doc2.md', '/doc3.md']);

      expect(loaded).toHaveLength(3);
      expect(loaded[0].content).toBe('Doc 1');
      expect(loaded[1].content).toBe('Doc 2');
      expect(loaded[2].content).toBe('Doc 3');

      // All available in VFS
      const toolExecutor = session.getToolExecutor();
      expect(toolExecutor.getFileContent('/doc1.md')).toBe('Doc 1');
      expect(toolExecutor.getFileContent('/doc2.md')).toBe('Doc 2');
      expect(toolExecutor.getFileContent('/doc3.md')).toBe('Doc 3');
    });

    it('should load all documents from a session', async () => {
      const clientStorage = client.getStorage()!;

      // Save documents for session
      await clientStorage.saveBatch(
        [
          { path: '/prd.md', content: '# PRD' },
          { path: '/architecture.md', content: '# Architecture' },
        ],
        {
          sessionId: 'sess_original',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: Date.now(),
        }
      );

      // Save documents for another session
      await clientStorage.save(
        { path: '/other.md', content: 'Other session' },
        {
          sessionId: 'sess_other',
          agentId: 'pm',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await client.startAgent('pm', 'resume');

      // Load all documents from specific session
      const loaded = await session.loadSessionDocuments('sess_original');

      expect(loaded).toHaveLength(2);
      expect(loaded.some((d) => d.path === '/prd.md')).toBe(true);
      expect(loaded.some((d) => d.path === '/architecture.md')).toBe(true);
      expect(loaded.some((d) => d.path === '/other.md')).toBe(false);
    });

    it('should throw error if storage not configured', async () => {
      const noStorageClient = new BmadClient({
        provider: mockProvider,
        logLevel: 'error',
      });

      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await noStorageClient.startAgent('pm', 'test');

      await expect(session.loadDocument('/test.md')).rejects.toThrow(
        'Storage not configured - cannot load documents'
      );
    });

    it('should handle missing documents gracefully when loading batch', async () => {
      const clientStorage = client.getStorage()!;

      await clientStorage.save(
        { path: '/exists.md', content: 'Exists' },
        {
          sessionId: 'sess_test',
          agentId: 'pm',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await client.startAgent('pm', 'test');

      // Try to load one existing and one missing
      const loaded = await session.loadDocuments(['/exists.md', '/missing.md']);

      // Should load the one that exists
      expect(loaded).toHaveLength(1);
      expect(loaded[0].path).toBe('/exists.md');
    });

    it('should return empty array when session has no documents', async () => {
      mockProvider.setResponses([
        {
          content: 'Ready',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 10,
        },
      ]);

      const session = await client.startAgent('pm', 'test');

      const loaded = await session.loadSessionDocuments('nonexistent_session');

      expect(loaded).toHaveLength(0);
    });
  });

  describe('Storage Query Operations', () => {
    it('should list documents by session', async () => {
      const clientStorage = client.getStorage()!;

      // Save documents for different sessions
      await clientStorage.save(
        { path: '/sess1-doc1.md', content: 'S1D1' },
        {
          sessionId: 'sess_1',
          agentId: 'pm',
          command: 'cmd1',
          timestamp: Date.now(),
        }
      );

      await clientStorage.save(
        { path: '/sess1-doc2.md', content: 'S1D2' },
        {
          sessionId: 'sess_1',
          agentId: 'pm',
          command: 'cmd2',
          timestamp: Date.now(),
        }
      );

      await clientStorage.save(
        { path: '/sess2-doc1.md', content: 'S2D1' },
        {
          sessionId: 'sess_2',
          agentId: 'pm',
          command: 'cmd1',
          timestamp: Date.now(),
        }
      );

      // Query for sess_1 documents
      const result = await clientStorage.list({ sessionId: 'sess_1' });

      expect(result.documents).toHaveLength(2);
      expect(result.documents.every((d) => d.metadata.sessionId === 'sess_1')).toBe(true);
    });

    it('should list documents by agent', async () => {
      const clientStorage = client.getStorage()!;

      await clientStorage.saveBatch(
        [
          { path: '/pm-doc.md', content: 'PM Doc' },
          { path: '/architect-doc.md', content: 'Architect Doc' },
        ],
        {
          sessionId: 'sess_1',
          agentId: 'pm',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      await clientStorage.save(
        { path: '/architect-doc2.md', content: 'Architect Doc 2' },
        {
          sessionId: 'sess_1',
          agentId: 'architect',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      const result = await clientStorage.list({ agentId: 'architect' });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].metadata.agentId).toBe('architect');
    });
  });
});
