/**
 * Integration tests for GoogleCloudStorageAdapter
 *
 * These tests run against a real GCS bucket (or emulator).
 * By default, these tests are SKIPPED. To run them, set SKIP_GCS_INTEGRATION=false.
 *
 * Required environment variables:
 * - SKIP_GCS_INTEGRATION: Set to "false" to run integration tests (default: skip)
 * - GCS_TEST_BUCKET: Name of test bucket (default: bmad-test-bucket)
 * - GCS_PROJECT_ID (optional): GCP project ID
 * - GOOGLE_APPLICATION_CREDENTIALS (optional): Path to service account key
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GoogleCloudStorageAdapter, GCSStorageError } from '../adapter.js';
import type { Document, StorageMetadata } from '@bmad/client';

// Skip integration tests by default (set SKIP_GCS_INTEGRATION=false to run)
const SKIP_INTEGRATION = process.env.SKIP_GCS_INTEGRATION !== 'false';
const TEST_BUCKET = process.env.GCS_TEST_BUCKET || 'bmad-test-bucket';
const PROJECT_ID = process.env.GCS_PROJECT_ID;

describe.skipIf(SKIP_INTEGRATION)('GoogleCloudStorageAdapter Integration', () => {
  let adapter: GoogleCloudStorageAdapter;
  let testSessionId: string;

  beforeAll(async () => {
    // Create adapter with test bucket
    adapter = new GoogleCloudStorageAdapter({
      bucketName: TEST_BUCKET,
      projectId: PROJECT_ID,
      basePath: 'integration-tests',
    });

    // Initialize and verify bucket exists
    await adapter.initialize();
  });

  beforeEach(() => {
    // Generate unique session ID for each test
    testSessionId = `test-sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  });

  afterAll(async () => {
    // Cleanup: delete all test documents
    try {
      const result = await adapter.list();
      const testDocs = result.documents.filter((doc) => doc.path.includes('/integration-tests/'));

      if (testDocs.length > 0) {
        console.log(`Cleaning up ${testDocs.length} test documents...`);
        await Promise.all(testDocs.map((doc) => adapter.delete(doc.path).catch(() => {})));
      }

      await adapter.close();
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  describe('Document Lifecycle', () => {
    it('should save, load, and delete document', async () => {
      const doc: Document = {
        path: `/test-${testSessionId}.md`,
        content: '# Integration Test Document\n\nThis is a test.',
      };

      const metadata: StorageMetadata = {
        sessionId: testSessionId,
        agentId: 'test-agent',
        command: 'integration-test',
        timestamp: Date.now(),
      };

      // Save
      const saveResult = await adapter.save(doc, metadata);
      expect(saveResult.success).toBe(true);

      // Wait a bit for GCS consistency
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify exists
      const exists = await adapter.exists(doc.path);
      expect(exists).toBe(true);

      // Load
      const loaded = await adapter.load(doc.path);
      expect(loaded.path).toBe(doc.path);
      expect(loaded.content).toBe(doc.content);

      // Get metadata
      const loadedMetadata = await adapter.getMetadata(doc.path);
      expect(loadedMetadata.sessionId).toBe(testSessionId);
      expect(loadedMetadata.agentId).toBe('test-agent');
      expect(loadedMetadata.command).toBe('integration-test');

      // Delete
      const deleted = await adapter.delete(doc.path);
      expect(deleted).toBe(true);

      // Verify deleted
      const existsAfter = await adapter.exists(doc.path);
      expect(existsAfter).toBe(false);
    });

    it('should handle batch save and load', async () => {
      const docs: Document[] = [
        { path: `/batch-1-${testSessionId}.md`, content: 'Doc 1' },
        { path: `/batch-2-${testSessionId}.md`, content: 'Doc 2' },
        { path: `/batch-3-${testSessionId}.md`, content: 'Doc 3' },
      ];

      const metadata: StorageMetadata = {
        sessionId: testSessionId,
        agentId: 'test-agent',
        command: 'batch-test',
        timestamp: Date.now(),
      };

      // Save batch
      const results = await adapter.saveBatch(docs, metadata);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      // Wait for consistency
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify all exist
      const existsChecks = await Promise.all(docs.map((doc) => adapter.exists(doc.path)));
      expect(existsChecks.every((exists) => exists)).toBe(true);

      // Cleanup
      await Promise.all(docs.map((doc) => adapter.delete(doc.path)));
    });
  });

  describe('Listing and Filtering', () => {
    beforeEach(async () => {
      // Create test documents
      const docs: Document[] = [
        { path: `/list-pm-1-${testSessionId}.md`, content: 'PM Doc 1' },
        { path: `/list-pm-2-${testSessionId}.md`, content: 'PM Doc 2' },
        { path: `/list-arch-1-${testSessionId}.md`, content: 'Arch Doc 1' },
      ];

      await adapter.saveBatch(docs, {
        sessionId: testSessionId,
        agentId: 'pm',
        command: 'create-prd',
        timestamp: Date.now(),
      });

      // Create one with different sessionId
      await adapter.save(
        { path: `/list-other-${testSessionId}.md`, content: 'Other' },
        {
          sessionId: 'other-session',
          agentId: 'architect',
          command: 'test',
          timestamp: Date.now(),
        }
      );

      // Wait for consistency
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    afterEach(async () => {
      // Cleanup
      const result = await adapter.list();
      const testDocs = result.documents.filter(
        (doc) =>
          doc.metadata.sessionId === testSessionId || doc.metadata.sessionId === 'other-session'
      );
      await Promise.all(testDocs.map((doc) => adapter.delete(doc.path)));
    });

    it('should list all documents', async () => {
      const result = await adapter.list();

      expect(result.documents.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.documents.length);
    });

    it('should filter by sessionId', async () => {
      const result = await adapter.list({ sessionId: testSessionId });

      expect(result.documents.every((doc) => doc.metadata.sessionId === testSessionId)).toBe(true);
      expect(result.documents.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by agentId', async () => {
      const result = await adapter.list({ agentId: 'pm' });

      const pmDocs = result.documents.filter((doc) => doc.metadata.agentId === 'pm');
      expect(pmDocs.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit option', async () => {
      const result = await adapter.list({ limit: 2 });

      expect(result.documents.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Signed URLs', () => {
    it('should generate valid signed URL', async () => {
      const doc: Document = {
        path: `/url-test-${testSessionId}.md`,
        content: '# URL Test',
      };

      await adapter.save(doc, {
        sessionId: testSessionId,
        agentId: 'test',
        command: 'test',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const url = await adapter.getUrl(doc.path, 3600);

      expect(url).toBeDefined();
      expect(url).toContain('storage.googleapis.com');
      expect(url).toContain(TEST_BUCKET);

      // Cleanup
      await adapter.delete(doc.path);
    });

    it('should return undefined for non-existent document', async () => {
      const url = await adapter.getUrl('/does-not-exist.md');

      expect(url).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw GCSStorageError for non-existent document load', async () => {
      await expect(adapter.load('/missing-file.md')).rejects.toThrow(GCSStorageError);
    });

    it('should return false when deleting non-existent document', async () => {
      const deleted = await adapter.delete('/missing-file.md');

      expect(deleted).toBe(false);
    });

    it('should throw GCSStorageError when getting metadata of non-existent doc', async () => {
      await expect(adapter.getMetadata('/missing-file.md')).rejects.toThrow(GCSStorageError);
    });
  });

  describe('Health Check', () => {
    it('should pass health check for accessible bucket', async () => {
      const health = await adapter.healthCheck();

      expect(health.status).toBe('ok');
      expect(health.latency).toBeGreaterThan(0);
      expect(health.latency).toBeLessThan(5000); // Should be fast
    });
  });

  describe('Base Path', () => {
    it('should organize documents under base path', async () => {
      // Adapter is configured with basePath: 'integration-tests'
      const doc: Document = {
        path: `/basepath-test-${testSessionId}.md`,
        content: 'Base path test',
      };

      await adapter.save(doc, {
        sessionId: testSessionId,
        agentId: 'test',
        command: 'test',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should be able to load with original path
      const loaded = await adapter.load(doc.path);
      expect(loaded.content).toBe(doc.content);

      // Cleanup
      await adapter.delete(doc.path);
    });
  });
});
