import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleCloudStorageAdapter } from '../gcs-adapter.js';
import { StorageNotFoundError, StorageError } from '../types.js';
import type { Document } from '../../types.js';
import type { StorageMetadata } from '../types.js';

// Mock @google-cloud/storage
const mockFile = {
  save: vi.fn(),
  exists: vi.fn(),
  download: vi.fn(),
  delete: vi.fn(),
  getMetadata: vi.fn(),
  getSignedUrl: vi.fn(),
  name: '',
};

const mockBucket = {
  file: vi.fn(() => mockFile),
  exists: vi.fn(),
  getFiles: vi.fn(),
};

const mockStorage = vi.fn(() => ({
  bucket: vi.fn(() => mockBucket),
}));

// Mock the dynamic import
vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorage,
}));

describe('GoogleCloudStorageAdapter', () => {
  let storage: GoogleCloudStorageAdapter;
  let mockDocument: Document;
  let mockMetadata: StorageMetadata;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockBucket.exists.mockResolvedValue([true]);
    mockFile.save.mockResolvedValue(undefined);
    mockFile.exists.mockResolvedValue([true]);
    mockFile.download.mockResolvedValue([Buffer.from('# Test Document\n\nContent')]);
    mockFile.getMetadata.mockResolvedValue([
      {
        size: 100,
        contentType: 'text/markdown',
        metadata: {
          sessionId: 'sess_test_123',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: '1234567890',
        },
      },
    ]);

    storage = new GoogleCloudStorageAdapter({
      projectId: 'test-project',
      bucketName: 'test-bucket',
      credentials: { test: 'credentials' },
    });

    mockDocument = {
      path: '/docs/test.md',
      content: '# Test Document\n\nThis is a test.',
    };

    mockMetadata = {
      sessionId: 'sess_test_123',
      agentId: 'pm',
      command: 'create-prd',
      timestamp: Date.now(),
    };
  });

  describe('initialization', () => {
    it('should initialize with credentials object', async () => {
      await storage.initialize();

      expect(mockStorage).toHaveBeenCalledWith({
        projectId: 'test-project',
        credentials: { test: 'credentials' },
      });
    });

    it('should initialize with keyFilename', async () => {
      const storageWithKey = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        keyFilename: '/path/to/key.json',
      });

      await storageWithKey.initialize();

      expect(mockStorage).toHaveBeenCalledWith({
        projectId: 'test-project',
        keyFilename: '/path/to/key.json',
      });
    });

    it('should verify bucket exists', async () => {
      await storage.initialize();

      expect(mockBucket.exists).toHaveBeenCalled();
    });

    it('should throw error if bucket does not exist', async () => {
      const failStorage = new GoogleCloudStorageAdapter({
        projectId: 'test',
        bucketName: 'missing-bucket',
      });

      mockBucket.exists.mockResolvedValueOnce([false]);

      await expect(failStorage.initialize()).rejects.toThrow(StorageError);
    });

    it('should throw error if initialization fails', async () => {
      const failStorage = new GoogleCloudStorageAdapter({
        projectId: 'test',
        bucketName: 'test',
      });

      mockBucket.exists.mockRejectedValueOnce(new Error('Network error'));

      await expect(failStorage.initialize()).rejects.toThrow(StorageError);
    });

    it('should throw if operations called before initialization', async () => {
      const uninitStorage = new GoogleCloudStorageAdapter({
        projectId: 'test',
        bucketName: 'test',
      });

      await expect(uninitStorage.save(mockDocument, mockMetadata)).rejects.toThrow(
        'Storage adapter not initialized'
      );
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should save document successfully', async () => {
      const result = await storage.save(mockDocument, mockMetadata);

      expect(result.success).toBe(true);
      expect(result.path).toBe(mockDocument.path);
      expect(result.url).toBe('https://storage.googleapis.com/test-bucket//docs/test.md');
      expect(result.metadata?.sessionId).toBe(mockMetadata.sessionId);
      expect(result.metadata?.size).toBe(mockDocument.content.length);
      expect(result.metadata?.mimeType).toBe('text/markdown');
    });

    it('should call GCS file.save with correct parameters', async () => {
      await storage.save(mockDocument, mockMetadata);

      expect(mockBucket.file).toHaveBeenCalledWith('/docs/test.md');
      expect(mockFile.save).toHaveBeenCalledWith(mockDocument.content, {
        metadata: {
          contentType: 'text/markdown',
          metadata: {
            sessionId: mockMetadata.sessionId,
            agentId: mockMetadata.agentId,
            command: mockMetadata.command,
            timestamp: mockMetadata.timestamp.toString(),
          },
        },
      });
    });

    it('should handle prefix in path', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'bmad/',
      });

      await storageWithPrefix.initialize();
      await storageWithPrefix.save(mockDocument, mockMetadata);

      expect(mockBucket.file).toHaveBeenCalledWith('bmad//docs/test.md');
    });

    it('should infer correct MIME types', async () => {
      const testCases = [
        { path: '/test.json', expected: 'application/json' },
        { path: '/test.yaml', expected: 'text/yaml' },
        { path: '/test.txt', expected: 'text/plain' },
        { path: '/test.html', expected: 'text/html' },
        { path: '/test.pdf', expected: 'application/pdf' },
        { path: '/test.png', expected: 'image/png' },
        { path: '/test.jpg', expected: 'image/jpeg' },
        { path: '/test', expected: 'application/octet-stream' },
      ];

      for (const { path, expected } of testCases) {
        await storage.save({ path, content: 'test' }, mockMetadata);

        expect(mockFile.save).toHaveBeenCalledWith(
          'test',
          expect.objectContaining({
            metadata: expect.objectContaining({
              contentType: expected,
            }),
          })
        );
      }
    });

    it('should handle save errors gracefully', async () => {
      mockFile.save.mockRejectedValueOnce(new Error('Upload failed'));

      const result = await storage.save(mockDocument, mockMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed');
    });

    it('should include tags in metadata', async () => {
      const metadataWithTags = {
        ...mockMetadata,
        tags: { category: 'documentation', version: 'v1' },
      };

      await storage.save(mockDocument, metadataWithTags);

      expect(mockFile.save).toHaveBeenCalledWith(
        mockDocument.content,
        expect.objectContaining({
          metadata: expect.objectContaining({
            metadata: expect.objectContaining({
              category: 'documentation',
              version: 'v1',
            }),
          }),
        })
      );
    });
  });

  describe('saveBatch', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should save multiple documents', async () => {
      const docs: Document[] = [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
        { path: '/doc3.md', content: 'Doc 3' },
      ];

      const results = await storage.saveBatch(docs, mockMetadata);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockFile.save).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures', async () => {
      mockFile.save
        .mockResolvedValueOnce(undefined) // Success
        .mockRejectedValueOnce(new Error('Upload failed')) // Failure
        .mockResolvedValueOnce(undefined); // Success

      const docs: Document[] = [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
        { path: '/doc3.md', content: 'Doc 3' },
      ];

      const results = await storage.saveBatch(docs, mockMetadata);

      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
      expect(results[2]!.success).toBe(true);
    });

    it('should handle empty array', async () => {
      const results = await storage.saveBatch([], mockMetadata);

      expect(results).toHaveLength(0);
      expect(mockFile.save).not.toHaveBeenCalled();
    });
  });

  describe('load', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should load document successfully', async () => {
      const document = await storage.load('/docs/test.md');

      expect(document.path).toBe('/docs/test.md');
      expect(document.content).toBe('# Test Document\n\nContent');
      expect(mockBucket.file).toHaveBeenCalledWith('/docs/test.md');
      expect(mockFile.download).toHaveBeenCalled();
    });

    it('should throw StorageNotFoundError if file does not exist', async () => {
      mockFile.exists.mockResolvedValueOnce([false]);

      await expect(storage.load('/docs/missing.md')).rejects.toThrow(StorageNotFoundError);
    });

    it('should handle prefix in path', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'sessions/',
      });

      await storageWithPrefix.initialize();
      await storageWithPrefix.load('/docs/test.md');

      expect(mockBucket.file).toHaveBeenCalledWith('sessions//docs/test.md');
    });

    it('should throw StorageError on download failure', async () => {
      mockFile.exists.mockResolvedValueOnce([true]);
      mockFile.download.mockRejectedValueOnce(new Error('Download failed'));

      await expect(storage.load('/docs/test.md')).rejects.toThrow(StorageError);
    });

    it('should convert buffer to UTF-8 string', async () => {
      const content = 'Test with émojis 🚀 and spëcial chars';
      mockFile.download.mockResolvedValueOnce([Buffer.from(content, 'utf-8')]);

      const document = await storage.load('/test.md');

      expect(document.content).toBe(content);
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should return true if file exists', async () => {
      mockFile.exists.mockResolvedValueOnce([true]);

      const exists = await storage.exists('/docs/test.md');

      expect(exists).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      mockFile.exists.mockResolvedValueOnce([false]);

      const exists = await storage.exists('/docs/missing.md');

      expect(exists).toBe(false);
    });

    it('should return false on error', async () => {
      mockFile.exists.mockRejectedValueOnce(new Error('Network error'));

      const exists = await storage.exists('/docs/test.md');

      expect(exists).toBe(false);
    });

    it('should use prefix if configured', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'prefix/',
      });

      await storageWithPrefix.initialize();
      await storageWithPrefix.exists('/test.md');

      expect(mockBucket.file).toHaveBeenCalledWith('prefix//test.md');
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should delete file successfully', async () => {
      mockFile.exists.mockResolvedValueOnce([true]);
      mockFile.delete.mockResolvedValueOnce(undefined);

      const result = await storage.delete('/docs/test.md');

      expect(result).toBe(true);
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should return false if file does not exist', async () => {
      mockFile.exists.mockResolvedValueOnce([false]);

      const result = await storage.delete('/docs/missing.md');

      expect(result).toBe(false);
      expect(mockFile.delete).not.toHaveBeenCalled();
    });

    it('should throw StorageError on delete failure', async () => {
      mockFile.exists.mockResolvedValue([true]);
      mockFile.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(storage.delete('/docs/test.md')).rejects.toThrow(StorageError);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await storage.initialize();

      // Setup mock files
      const mockFiles = [
        {
          name: 'doc1.md',
          getMetadata: vi.fn().mockResolvedValue([
            {
              size: 100,
              contentType: 'text/markdown',
              metadata: {
                sessionId: 'sess_1',
                agentId: 'pm',
                command: 'create-prd',
                timestamp: '1000',
              },
            },
          ]),
        },
        {
          name: 'doc2.md',
          getMetadata: vi.fn().mockResolvedValue([
            {
              size: 200,
              contentType: 'text/markdown',
              metadata: {
                sessionId: 'sess_2',
                agentId: 'architect',
                command: 'design',
                timestamp: '2000',
              },
            },
          ]),
        },
        {
          name: 'doc3.md',
          getMetadata: vi.fn().mockResolvedValue([
            {
              size: 300,
              contentType: 'text/markdown',
              metadata: {
                sessionId: 'sess_1',
                agentId: 'dev',
                command: 'implement',
                timestamp: '3000',
              },
            },
          ]),
        },
      ];

      mockBucket.getFiles.mockResolvedValue([mockFiles]);
    });

    it('should list all files', async () => {
      const result = await storage.list();

      expect(result.documents).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by sessionId', async () => {
      const result = await storage.list({ sessionId: 'sess_1' });

      expect(result.documents).toHaveLength(2);
      expect(result.documents.every((d) => d.metadata.sessionId === 'sess_1')).toBe(true);
    });

    it('should apply pagination', async () => {
      const result = await storage.list({ offset: 1, limit: 1 });

      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should use default pagination values', async () => {
      const result = await storage.list();

      expect(result.documents).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should include document metadata', async () => {
      const result = await storage.list();

      const doc = result.documents[0]!;
      expect(doc.path).toBeDefined();
      expect(doc.metadata.sessionId).toBeDefined();
      expect(doc.metadata.agentId).toBeDefined();
      expect(doc.metadata.size).toBeGreaterThan(0);
      expect(doc.metadata.mimeType).toBeDefined();
      expect(doc.url).toContain('storage.googleapis.com');
    });

    it('should handle prefix in file listing', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'bmad/',
      });

      await storageWithPrefix.initialize();
      await storageWithPrefix.list();

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'bmad/' });
    });

    it('should throw StorageError on list failure', async () => {
      mockBucket.getFiles.mockRejectedValue(new Error('List failed'));

      await expect(storage.list()).rejects.toThrow(StorageError);
    });

    it('should handle empty results', async () => {
      mockBucket.getFiles.mockResolvedValueOnce([[]]);

      const result = await storage.list();

      expect(result.documents).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should remove prefix from document paths', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'sessions/',
      });

      const mockFiles = [
        {
          name: 'sessions/doc1.md',
          getMetadata: vi.fn().mockResolvedValue([
            {
              size: 100,
              contentType: 'text/markdown',
              metadata: {
                sessionId: 'sess_1',
                agentId: 'pm',
                command: 'test',
                timestamp: '1000',
              },
            },
          ]),
        },
      ];

      mockBucket.getFiles.mockResolvedValueOnce([mockFiles]);

      await storageWithPrefix.initialize();
      const result = await storageWithPrefix.list();

      expect(result.documents[0]!.path).toBe('doc1.md');
    });
  });

  describe('getMetadata', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should get document metadata', async () => {
      const metadata = await storage.getMetadata('/docs/test.md');

      expect(metadata.sessionId).toBe('sess_test_123');
      expect(metadata.agentId).toBe('pm');
      expect(metadata.command).toBe('create-prd');
      expect(metadata.timestamp).toBe(1234567890);
      expect(metadata.size).toBe(100);
      expect(metadata.mimeType).toBe('text/markdown');
    });

    it('should throw StorageNotFoundError if file does not exist', async () => {
      mockFile.exists.mockResolvedValueOnce([false]);

      await expect(storage.getMetadata('/missing.md')).rejects.toThrow(StorageNotFoundError);
    });

    it('should throw StorageError on metadata fetch failure', async () => {
      mockFile.exists.mockResolvedValue([true]);
      mockFile.getMetadata.mockRejectedValue(new Error('Metadata failed'));

      await expect(storage.getMetadata('/test.md')).rejects.toThrow(StorageError);
    });

    it('should handle missing metadata fields gracefully', async () => {
      mockFile.getMetadata.mockResolvedValueOnce([
        {
          size: 50,
          contentType: 'text/plain',
          metadata: {},
        },
      ]);

      const metadata = await storage.getMetadata('/test.md');

      expect(metadata.sessionId).toBe('');
      expect(metadata.agentId).toBe('');
      expect(metadata.command).toBe('');
      expect(metadata.timestamp).toBe(0);
      expect(metadata.size).toBe(50);
    });

    it('should include custom tags in metadata', async () => {
      mockFile.getMetadata.mockResolvedValueOnce([
        {
          size: 100,
          contentType: 'text/markdown',
          metadata: {
            sessionId: 'sess_1',
            agentId: 'pm',
            command: 'test',
            timestamp: '1000',
            customTag1: 'value1',
            customTag2: 'value2',
          },
        },
      ]);

      const metadata = await storage.getMetadata('/test.md');

      expect(metadata.tags).toBeDefined();
      expect(metadata.tags!['customTag1']).toBe('value1');
      expect(metadata.tags!['customTag2']).toBe('value2');
    });
  });

  describe('getUrl', () => {
    beforeEach(async () => {
      await storage.initialize();
      mockFile.getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-url']);
    });

    it('should generate signed URL with default expiration', async () => {
      const url = await storage.getUrl('/docs/test.md');

      expect(url).toBe('https://storage.googleapis.com/signed-url');
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
      });
    });

    it('should generate signed URL with custom expiration', async () => {
      await storage.getUrl('/docs/test.md', 7200);

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
      });
    });

    it('should throw StorageError on URL generation failure', async () => {
      mockFile.getSignedUrl.mockRejectedValue(new Error('URL failed'));

      await expect(storage.getUrl('/test.md')).rejects.toThrow(StorageError);
    });

    it('should use prefix in path', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: { test: 'creds' },
        prefix: 'files/',
      });

      await storageWithPrefix.initialize();
      await storageWithPrefix.getUrl('/test.md');

      expect(mockBucket.file).toHaveBeenCalledWith('files//test.md');
    });
  });

  describe('close', () => {
    it('should clean up resources', async () => {
      await storage.initialize();
      await storage.close();

      // Should throw since storage is no longer initialized
      await expect(storage.save(mockDocument, mockMetadata)).rejects.toThrow(
        'Storage adapter not initialized'
      );
    });

    it('should be safe to call multiple times', async () => {
      await storage.initialize();
      await storage.close();
      await storage.close();

      // No error expected
    });
  });

  describe('path prefix handling', () => {
    beforeEach(() => {
      // Reset mocks to clean state for prefix tests
      vi.clearAllMocks();
      mockBucket.exists.mockResolvedValue([true]);
      mockFile.save.mockResolvedValue(undefined);
      mockFile.exists.mockResolvedValue([true]);
      mockFile.download.mockResolvedValue([Buffer.from('test')]);
      mockFile.delete.mockResolvedValue(undefined);
    });

    it('should handle paths without prefix', async () => {
      await storage.initialize();
      await storage.save({ path: '/test.md', content: 'test' }, mockMetadata);

      expect(mockBucket.file).toHaveBeenCalledWith('/test.md');
    });

    it('should add prefix to all operations', async () => {
      const storageWithPrefix = new GoogleCloudStorageAdapter({
        projectId: 'test',
        bucketName: 'test',
        credentials: { test: 'creds' },
        prefix: 'bmad-sessions/',
      });

      await storageWithPrefix.initialize();

      // Save
      await storageWithPrefix.save({ path: '/doc.md', content: 'test' }, mockMetadata);
      expect(mockBucket.file).toHaveBeenCalledWith('bmad-sessions//doc.md');

      // Load
      await storageWithPrefix.load('/doc.md');
      expect(mockBucket.file).toHaveBeenCalledWith('bmad-sessions//doc.md');

      // Exists
      await storageWithPrefix.exists('/doc.md');
      expect(mockBucket.file).toHaveBeenCalledWith('bmad-sessions//doc.md');

      // Delete
      await storageWithPrefix.delete('/doc.md');
      expect(mockBucket.file).toHaveBeenCalledWith('bmad-sessions//doc.md');
    });
  });
});
