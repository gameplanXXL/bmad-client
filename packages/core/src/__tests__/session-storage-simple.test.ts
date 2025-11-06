import { describe, it, expect, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { InMemoryStorageAdapter } from '../storage/memory-adapter.js';

describe('Session Storage - Simple Integration', () => {
  let client: BmadClient;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();

    client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
      storage: { type: 'memory' },
      logLevel: 'error',
    });

    await client.waitForInit();
  });

  it('should have storage configured', () => {
    const clientStorage = client.getStorage();
    expect(clientStorage).toBeDefined();
    expect(clientStorage).toBeInstanceOf(InMemoryStorageAdapter);
  });

  it('should allow saving documents to storage', async () => {
    const clientStorage = client.getStorage()!;

    const result = await clientStorage.save(
      { path: '/test.md', content: '# Test' },
      {
        sessionId: 'sess_test',
        agentId: 'pm',
        command: 'test',
        timestamp: Date.now(),
      }
    );

    expect(result.success).toBe(true);
    expect(result.path).toBe('/test.md');

    // Verify it's saved
    const loaded = await clientStorage.load('/test.md');
    expect(loaded.content).toBe('# Test');
  });

  it('should allow querying documents by session', async () => {
    const clientStorage = client.getStorage()!;

    await clientStorage.saveBatch(
      [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
      ],
      {
        sessionId: 'sess_123',
        agentId: 'pm',
        command: 'test',
        timestamp: Date.now(),
      }
    );

    const result = await clientStorage.list({ sessionId: 'sess_123' });

    expect(result.documents).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
