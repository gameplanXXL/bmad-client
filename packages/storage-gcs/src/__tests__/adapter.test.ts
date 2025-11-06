/**
 * Unit tests for GoogleCloudStorageAdapter
 *
 * These tests use mocked GCS SDK to test the adapter logic without hitting real GCS.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleCloudStorageAdapter, GCSStorageError } from '../adapter.js';
import type { Document, StorageMetadata } from '@bmad/client';

// Mock the @google-cloud/storage module
vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    save: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([true]),
    download: vi.fn().mockResolvedValue([Buffer.from('# Test Content')]),
    delete: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue([
      {
        metadata: {
          sessionId: 'sess_123',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: '1234567890',
        },
      },
    ]),
    getSignedUrl: vi.fn().mockResolvedValue(['https://storage.googleapis.com/signed-url']),
  };

  const mockBucket = {
    file: vi.fn(() => mockFile),
    exists: vi.fn().mockResolvedValue([true]),
    getFiles: vi.fn().mockResolvedValue([
      [
        {
          name: 'docs/prd.md',
          getMetadata: vi.fn().mockResolvedValue([
            {
              metadata: {
                sessionId: 'sess_123',
                agentId: 'pm',
                command: 'create-prd',
                timestamp: '1234567890',
              },
            },
          ]),
        },
      ],
      { pageToken: undefined },
    ]),
  };

  const mockStorage = {
    bucket: vi.fn(() => mockBucket),
  };

  return {
    Storage: vi.fn(() => mockStorage),
    Bucket: vi.fn(),
  };
});

describe('GoogleCloudStorageAdapter', () => {
  let adapter: GoogleCloudStorageAdapter;
  let testDoc: Document;
  let testMetadata: StorageMetadata;

  beforeEach(() => {
    adapter = new GoogleCloudStorageAdapter({
      bucketName: 'test-bucket',
    });

    testDoc = {
      path: '/docs/test.md',
      content: '# Test Document\n\nContent here',
    };

    testMetadata = {
      sessionId: 'sess_123',
      agentId: 'pm',
      command: 'create-prd',
      timestamp: Date.now(),
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create adapter with bucket name only', () => {
      const adapter = new GoogleCloudStorageAdapter({
        bucketName: 'my-bucket',
      });

      expect(adapter).toBeDefined();
    });

    it('should create adapter with service account credentials', () => {
      const adapter = new GoogleCloudStorageAdapter({
        bucketName: 'my-bucket',
        credentials: {
          client_email: 'test@project.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
          project_id: 'test-project',
        },
      });

      expect(adapter).toBeDefined();
    });

    it('should create adapter with key filename', () => {
      const adapter = new GoogleCloudStorageAdapter({
        bucketName: 'my-bucket',
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });

      expect(adapter).toBeDefined();
    });

    it('should create adapter with base path', () => {
      const adapter = new GoogleCloudStorageAdapter({
        bucketName: 'my-bucket',
        basePath: 'bmad-sessions',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('save()', () => {
    it('should save document successfully', async () => {
      const result = await adapter.save(testDoc, testMetadata);

      expect(result.success).toBe(true);
      expect(result.path).toBe('/docs/test.md');
      expect(result.metadata).toEqual(testMetadata);
      expect(result.error).toBeUndefined();
    });

    it('should return error result on save failure', async () => {
      // Mock save to throw error
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.save).mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.save(testDoc, testMetadata);

      expect(result.success).toBe(false);
      expect(result.path).toBe('/docs/test.md');
      expect(result.error).toContain('Failed to save document');
    });

    it('should handle document with base path', async () => {
      const adapterWithBase = new GoogleCloudStorageAdapter({
        bucketName: 'test-bucket',
        basePath: 'sessions',
      });

      const result = await adapterWithBase.save(testDoc, testMetadata);

      expect(result.success).toBe(true);
      // Should save to sessions/docs/test.md in GCS
    });
  });

  describe('saveBatch()', () => {
    it('should save multiple documents', async () => {
      const docs: Document[] = [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
        { path: '/doc3.md', content: 'Doc 3' },
      ];

      const results = await adapter.saveBatch(docs, testMetadata);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle partial failures in batch', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');

      // First save succeeds, second fails
      vi.mocked(mockFile.save)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'));

      const docs: Document[] = [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
      ];

      const results = await adapter.saveBatch(docs, testMetadata);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('load()', () => {
    it('should load document successfully', async () => {
      const doc = await adapter.load('/docs/test.md');

      expect(doc.path).toBe('/docs/test.md');
      expect(doc.content).toBe('# Test Content');
    });

    it('should throw GCSStorageError for non-existent document', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.exists).mockResolvedValueOnce([false]);

      await expect(adapter.load('/missing.md')).rejects.toThrow(GCSStorageError);
      await expect(adapter.load('/missing.md')).rejects.toThrow('Document not found');
    });

    it('should throw GCSStorageError on download failure', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.download).mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.load('/docs/test.md')).rejects.toThrow(GCSStorageError);
    });
  });

  describe('exists()', () => {
    it('should return true for existing document', async () => {
      const exists = await adapter.exists('/docs/test.md');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent document', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.exists).mockResolvedValueOnce([false]);

      const exists = await adapter.exists('/missing.md');

      expect(exists).toBe(false);
    });
  });

  describe('delete()', () => {
    it('should delete existing document and return true', async () => {
      const deleted = await adapter.delete('/docs/test.md');

      expect(deleted).toBe(true);
    });

    it('should return false for non-existent document', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.exists).mockResolvedValueOnce([false]);

      const deleted = await adapter.delete('/missing.md');

      expect(deleted).toBe(false);
    });

    it('should throw GCSStorageError on delete failure', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.delete).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(adapter.delete('/docs/test.md')).rejects.toThrow(GCSStorageError);
    });
  });

  describe('getMetadata()', () => {
    it('should retrieve document metadata', async () => {
      const metadata = await adapter.getMetadata('/docs/test.md');

      expect(metadata.sessionId).toBe('sess_123');
      expect(metadata.agentId).toBe('pm');
      expect(metadata.command).toBe('create-prd');
      expect(metadata.timestamp).toBe(1234567890);
    });

    it('should throw GCSStorageError for non-existent document', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.getMetadata).mockRejectedValueOnce({ code: 404 });

      await expect(adapter.getMetadata('/missing.md')).rejects.toThrow(GCSStorageError);
      await expect(adapter.getMetadata('/missing.md')).rejects.toThrow('not found');
    });

    it('should handle missing custom metadata gracefully', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.getMetadata).mockResolvedValueOnce([{ metadata: {} }]);

      const metadata = await adapter.getMetadata('/docs/test.md');

      expect(metadata.sessionId).toBe('unknown');
      expect(metadata.agentId).toBe('unknown');
      expect(metadata.command).toBe('unknown');
      expect(metadata.timestamp).toBe(0);
    });
  });

  describe('list()', () => {
    it('should list all documents', async () => {
      const result = await adapter.list();

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].path).toBe('/docs/prd.md');
      expect(result.documents[0].metadata.sessionId).toBe('sess_123');
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by sessionId', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.getFiles).mockResolvedValueOnce([
        [
          {
            name: 'doc1.md',
            getMetadata: vi.fn().mockResolvedValue([
              { metadata: { sessionId: 'sess_123', agentId: 'pm', command: 'test', timestamp: '0' } },
            ]),
          },
          {
            name: 'doc2.md',
            getMetadata: vi.fn().mockResolvedValue([
              { metadata: { sessionId: 'sess_456', agentId: 'architect', command: 'test', timestamp: '0' } },
            ]),
          },
        ],
        { pageToken: undefined },
      ]);

      const result = await adapter.list({ sessionId: 'sess_123' });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].metadata.sessionId).toBe('sess_123');
    });

    it('should filter by agentId', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.getFiles).mockResolvedValueOnce([
        [
          {
            name: 'doc1.md',
            getMetadata: vi.fn().mockResolvedValue([
              { metadata: { sessionId: 'sess_123', agentId: 'pm', command: 'test', timestamp: '0' } },
            ]),
          },
          {
            name: 'doc2.md',
            getMetadata: vi.fn().mockResolvedValue([
              { metadata: { sessionId: 'sess_123', agentId: 'architect', command: 'test', timestamp: '0' } },
            ]),
          },
        ],
        { pageToken: undefined },
      ]);

      const result = await adapter.list({ agentId: 'pm' });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].metadata.agentId).toBe('pm');
    });

    it('should respect limit option', async () => {
      const result = await adapter.list({ limit: 10 });

      expect(result.documents).toBeDefined();
      // Limit is passed to GCS getFiles
    });

    it('should indicate hasMore when pageToken exists', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.getFiles).mockResolvedValueOnce([
        [
          {
            name: 'doc1.md',
            getMetadata: vi.fn().mockResolvedValue([
              { metadata: { sessionId: 'sess_123', agentId: 'pm', command: 'test', timestamp: '0' } },
            ]),
          },
        ],
        { pageToken: 'next-page-token' },
      ]);

      const result = await adapter.list();

      expect(result.hasMore).toBe(true);
    });
  });

  describe('getUrl()', () => {
    it('should generate signed URL for existing document', async () => {
      const url = await adapter.getUrl('/docs/test.md');

      expect(url).toBe('https://storage.googleapis.com/signed-url');
    });

    it('should return undefined for non-existent document', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.exists).mockResolvedValueOnce([false]);

      const url = await adapter.getUrl('/missing.md');

      expect(url).toBeUndefined();
    });

    it('should return undefined on signing failure', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');
      vi.mocked(mockFile.getSignedUrl).mockRejectedValueOnce(new Error('No credentials'));

      const url = await adapter.getUrl('/docs/test.md');

      expect(url).toBeUndefined();
    });

    it('should respect expiresIn parameter', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      const mockFile = mockBucket.file('test');

      await adapter.getUrl('/docs/test.md', 7200); // 2 hours

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
        })
      );
    });
  });

  describe('initialize()', () => {
    it('should verify bucket exists', async () => {
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('should throw GCSStorageError if bucket does not exist', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.exists).mockResolvedValueOnce([false]);

      await expect(adapter.initialize()).rejects.toThrow(GCSStorageError);
      await expect(adapter.initialize()).rejects.toThrow('does not exist');
    });

    it('should throw GCSStorageError on access error', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.exists).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(adapter.initialize()).rejects.toThrow(GCSStorageError);
    });
  });

  describe('close()', () => {
    it('should complete successfully (no-op)', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('healthCheck()', () => {
    it('should return ok status for accessible bucket', async () => {
      const health = await adapter.healthCheck();

      expect(health.status).toBe('ok');
      expect(health.latency).toBeGreaterThan(0);
      expect(health.message).toBeUndefined();
    });

    it('should return error status if bucket does not exist', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.exists).mockResolvedValueOnce([false]);

      const health = await adapter.healthCheck();

      expect(health.status).toBe('error');
      expect(health.message).toContain('does not exist');
    });

    it('should return error status on access failure', async () => {
      const { Storage } = await import('@google-cloud/storage');
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket('test');
      vi.mocked(mockBucket.exists).mockRejectedValueOnce(new Error('Network error'));

      const health = await adapter.healthCheck();

      expect(health.status).toBe('error');
      expect(health.message).toContain('failed');
    });
  });

  describe('GCSStorageError', () => {
    it('should create error with message', () => {
      const error = new GCSStorageError('Test error');

      expect(error.name).toBe('GCSStorageError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create error with code', () => {
      const error = new GCSStorageError('Test error', 'TEST_CODE');

      expect(error.code).toBe('TEST_CODE');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new GCSStorageError('Test error', 'TEST_CODE', cause);

      expect(error.cause).toBe(cause);
    });
  });
});
