import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageAdapter } from '../memory-adapter.js';
import { StorageNotFoundError } from '../types.js';
import type { Document } from '../../types.js';
import type { StorageMetadata } from '../types.js';

describe('InMemoryStorageAdapter', () => {
  let storage: InMemoryStorageAdapter;
  let mockDocument: Document;
  let mockMetadata: StorageMetadata;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    await storage.initialize();

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
    it('should initialize without errors', async () => {
      const newStorage = new InMemoryStorageAdapter();
      await expect(newStorage.initialize()).resolves.not.toThrow();
    });
  });

  describe('save', () => {
    it('should save document successfully', async () => {
      const result = await storage.save(mockDocument, mockMetadata);

      expect(result.success).toBe(true);
      expect(result.path).toBe(mockDocument.path);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.sessionId).toBe(mockMetadata.sessionId);
      expect(result.metadata?.size).toBe(mockDocument.content.length);
      expect(result.metadata?.mimeType).toBe('text/markdown');
    });

    it('should infer mime type from extension', async () => {
      const jsonDoc = { path: '/data/test.json', content: '{"test": true}' };
      const result = await storage.save(jsonDoc, mockMetadata);

      expect(result.metadata?.mimeType).toBe('application/json');
    });

    it('should overwrite existing document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const updatedDoc = { ...mockDocument, content: '# Updated' };
      const result = await storage.save(updatedDoc, mockMetadata);

      expect(result.success).toBe(true);

      const loaded = await storage.load(mockDocument.path);
      expect(loaded.content).toBe('# Updated');
    });

    it('should handle documents without extension', async () => {
      const noExtDoc = { path: '/README', content: 'Read me' };
      const result = await storage.save(noExtDoc, mockMetadata);

      expect(result.success).toBe(true);
      expect(result.metadata?.mimeType).toBe('application/octet-stream');
    });
  });

  describe('saveBatch', () => {
    it('should save multiple documents', async () => {
      const docs: Document[] = [
        { path: '/doc1.md', content: 'Doc 1' },
        { path: '/doc2.md', content: 'Doc 2' },
        { path: '/doc3.md', content: 'Doc 3' },
      ];

      const results = await storage.saveBatch(docs, mockMetadata);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(storage.size()).toBe(3);
    });

    it('should handle empty array', async () => {
      const results = await storage.saveBatch([], mockMetadata);

      expect(results).toHaveLength(0);
      expect(storage.size()).toBe(0);
    });
  });

  describe('load', () => {
    it('should load saved document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const loaded = await storage.load(mockDocument.path);

      expect(loaded).toEqual(mockDocument);
    });

    it('should throw StorageNotFoundError for non-existent document', async () => {
      await expect(storage.load('/does-not-exist.md')).rejects.toThrow(StorageNotFoundError);
      await expect(storage.load('/does-not-exist.md')).rejects.toThrow(
        'Document not found in storage: /does-not-exist.md'
      );
    });

    it('should return copy of document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const loaded1 = await storage.load(mockDocument.path);
      const loaded2 = await storage.load(mockDocument.path);

      loaded1.content = 'Modified';
      expect(loaded2.content).not.toBe('Modified');
    });
  });

  describe('exists', () => {
    it('should return true for existing document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const exists = await storage.exists(mockDocument.path);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent document', async () => {
      const exists = await storage.exists('/does-not-exist.md');

      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const deleted = await storage.delete(mockDocument.path);

      expect(deleted).toBe(true);
      expect(await storage.exists(mockDocument.path)).toBe(false);
    });

    it('should return false for non-existent document', async () => {
      const deleted = await storage.delete('/does-not-exist.md');

      expect(deleted).toBe(false);
    });

    it('should reduce size after delete', async () => {
      await storage.save(mockDocument, mockMetadata);
      expect(storage.size()).toBe(1);

      await storage.delete(mockDocument.path);
      expect(storage.size()).toBe(0);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Save multiple documents with different metadata
      await storage.save(
        { path: '/doc1.md', content: 'Doc 1' },
        {
          sessionId: 'sess_1',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: 1000,
        }
      );

      await storage.save(
        { path: '/doc2.md', content: 'Doc 2' },
        {
          sessionId: 'sess_1',
          agentId: 'architect',
          command: 'create-architecture',
          timestamp: 2000,
        }
      );

      await storage.save(
        { path: '/doc3.md', content: 'Doc 3' },
        {
          sessionId: 'sess_2',
          agentId: 'pm',
          command: 'create-prd',
          timestamp: 3000,
        }
      );
    });

    it('should list all documents without filter', async () => {
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

    it('should filter by agentId', async () => {
      const result = await storage.list({ agentId: 'pm' });

      expect(result.documents).toHaveLength(2);
      expect(result.documents.every((d) => d.metadata.agentId === 'pm')).toBe(true);
    });

    it('should filter by date range', async () => {
      const result = await storage.list({
        startDate: new Date(1500),
        endDate: new Date(2500),
      });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]!.path).toBe('/doc2.md');
    });

    it('should filter by tags', async () => {
      await storage.save(
        { path: '/tagged.md', content: 'Tagged' },
        {
          sessionId: 'sess_x',
          agentId: 'pm',
          command: 'test',
          timestamp: 1000,
          tags: { type: 'prd', version: 'v1' },
        }
      );

      const result = await storage.list({
        tags: { type: 'prd' },
      });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]!.path).toBe('/tagged.md');
    });

    it('should support pagination', async () => {
      const page1 = await storage.list({ limit: 2, offset: 0 });
      const page2 = await storage.list({ limit: 2, offset: 2 });

      expect(page1.documents).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page2.documents).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should return empty list when no matches', async () => {
      const result = await storage.list({ sessionId: 'nonexistent' });

      expect(result.documents).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should get metadata for existing document', async () => {
      await storage.save(mockDocument, mockMetadata);

      const metadata = await storage.getMetadata(mockDocument.path);

      expect(metadata.sessionId).toBe(mockMetadata.sessionId);
      expect(metadata.agentId).toBe(mockMetadata.agentId);
      expect(metadata.command).toBe(mockMetadata.command);
      expect(metadata.size).toBe(mockDocument.content.length);
      expect(metadata.mimeType).toBe('text/markdown');
    });

    it('should throw StorageNotFoundError for non-existent document', async () => {
      await expect(storage.getMetadata('/does-not-exist.md')).rejects.toThrow(StorageNotFoundError);
    });

    it('should return copy of metadata', async () => {
      await storage.save(mockDocument, mockMetadata);

      const meta1 = await storage.getMetadata(mockDocument.path);
      const meta2 = await storage.getMetadata(mockDocument.path);

      meta1.sessionId = 'modified';
      expect(meta2.sessionId).not.toBe('modified');
    });
  });

  describe('getUrl', () => {
    it('should return undefined for in-memory storage', async () => {
      await storage.save(mockDocument, mockMetadata);

      const url = await storage.getUrl(mockDocument.path);

      expect(url).toBeUndefined();
    });

    it('should accept optional expiresIn parameter', async () => {
      await storage.save(mockDocument, mockMetadata);

      const url = await storage.getUrl(mockDocument.path, 7200);

      expect(url).toBeUndefined();
    });
  });

  describe('close', () => {
    it('should clear all documents', async () => {
      await storage.save(mockDocument, mockMetadata);
      expect(storage.size()).toBe(1);

      await storage.close();

      expect(storage.size()).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should get all documents', async () => {
      await storage.save({ path: '/doc1.md', content: 'Doc 1' }, mockMetadata);
      await storage.save({ path: '/doc2.md', content: 'Doc 2' }, mockMetadata);

      const all = storage.getAll();

      expect(all).toHaveLength(2);
      expect(all.some((d) => d.path === '/doc1.md')).toBe(true);
      expect(all.some((d) => d.path === '/doc2.md')).toBe(true);
    });

    it('should get storage size', async () => {
      expect(storage.size()).toBe(0);

      await storage.save(mockDocument, mockMetadata);
      expect(storage.size()).toBe(1);

      await storage.save({ path: '/doc2.md', content: 'Doc 2' }, mockMetadata);
      expect(storage.size()).toBe(2);
    });

    it('should clear all documents', () => {
      storage.save(mockDocument, mockMetadata);
      storage.clear();

      expect(storage.size()).toBe(0);
    });
  });

  describe('mime type inference', () => {
    it('should recognize common file types', async () => {
      const tests = [
        { ext: 'md', expected: 'text/markdown' },
        { ext: 'txt', expected: 'text/plain' },
        { ext: 'json', expected: 'application/json' },
        { ext: 'yaml', expected: 'text/yaml' },
        { ext: 'yml', expected: 'text/yaml' },
        { ext: 'html', expected: 'text/html' },
        { ext: 'pdf', expected: 'application/pdf' },
        { ext: 'png', expected: 'image/png' },
        { ext: 'jpg', expected: 'image/jpeg' },
        { ext: 'jpeg', expected: 'image/jpeg' },
      ];

      for (const test of tests) {
        const doc = { path: `/test.${test.ext}`, content: 'Content' };
        const result = await storage.save(doc, mockMetadata);
        expect(result.metadata?.mimeType).toBe(test.expected);
      }
    });

    it('should default to octet-stream for unknown types', async () => {
      const doc = { path: '/test.xyz', content: 'Content' };
      const result = await storage.save(doc, mockMetadata);

      expect(result.metadata?.mimeType).toBe('application/octet-stream');
    });
  });
});
