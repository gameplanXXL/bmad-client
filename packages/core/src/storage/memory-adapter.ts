import type { Document, SessionState } from '../types.js';
import type {
  StorageAdapter,
  StorageMetadata,
  StorageResult,
  StorageQueryOptions,
  StorageListResult,
  SessionListResult,
} from './types.js';
import { StorageNotFoundError } from './types.js';

/**
 * In-memory document entry
 */
interface MemoryEntry {
  document: Document;
  metadata: StorageMetadata;
}

/**
 * InMemoryStorageAdapter - Storage adapter for testing and development
 *
 * Stores documents in memory (lost on restart). Useful for:
 * - Unit testing
 * - Development without cloud dependencies
 * - Temporary sessions
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorageAdapter();
 *
 * await storage.save(document, {
 *   sessionId: 'sess_123',
 *   agentId: 'pm',
 *   command: 'create-prd',
 *   timestamp: Date.now(),
 * });
 *
 * const doc = await storage.load('docs/prd.md');
 * console.log(doc.content);
 * ```
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private storage: Map<string, MemoryEntry> = new Map();
  private sessions: Map<string, SessionState> = new Map();

  /**
   * Initialize storage (no-op for memory)
   */
  async initialize(): Promise<void> {
    // No-op for in-memory storage
  }

  /**
   * Save document to memory
   */
  async save(document: Document, metadata: StorageMetadata): Promise<StorageResult> {
    try {
      const entry: MemoryEntry = {
        document: { ...document },
        metadata: {
          ...metadata,
          size: document.content.length,
          mimeType: this.inferMimeType(document.path),
        },
      };

      this.storage.set(document.path, entry);

      return {
        success: true,
        path: document.path,
        metadata: entry.metadata,
      };
    } catch (error) {
      return {
        success: false,
        path: document.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Save multiple documents in batch
   */
  async saveBatch(
    documents: Document[],
    metadata: StorageMetadata
  ): Promise<StorageResult[]> {
    const results: StorageResult[] = [];

    for (const document of documents) {
      const result = await this.save(document, metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Load document from memory
   */
  async load(path: string): Promise<Document> {
    const entry = this.storage.get(path);

    if (!entry) {
      throw new StorageNotFoundError(path);
    }

    return { ...entry.document };
  }

  /**
   * Check if document exists
   */
  async exists(path: string): Promise<boolean> {
    return this.storage.has(path);
  }

  /**
   * Delete document from memory
   */
  async delete(path: string): Promise<boolean> {
    return this.storage.delete(path);
  }

  /**
   * List documents matching query
   */
  async list(options?: StorageQueryOptions): Promise<StorageListResult> {
    let entries = Array.from(this.storage.entries());

    // Apply filters
    if (options?.sessionId) {
      entries = entries.filter(([_, entry]) => entry.metadata.sessionId === options.sessionId);
    }

    if (options?.agentId) {
      entries = entries.filter(([_, entry]) => entry.metadata.agentId === options.agentId);
    }

    if (options?.startDate) {
      const startTime = options.startDate.getTime();
      entries = entries.filter(([_, entry]) => entry.metadata.timestamp >= startTime);
    }

    if (options?.endDate) {
      const endTime = options.endDate.getTime();
      entries = entries.filter(([_, entry]) => entry.metadata.timestamp <= endTime);
    }

    if (options?.tags) {
      entries = entries.filter(([_, entry]) => {
        if (!entry.metadata.tags) return false;
        return Object.entries(options.tags!).every(
          ([key, value]) => entry.metadata.tags![key] === value
        );
      });
    }

    const total = entries.length;

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const paginatedEntries = entries.slice(offset, offset + limit);

    const documents = paginatedEntries.map(([path, entry]) => ({
      path,
      metadata: entry.metadata,
      url: undefined, // In-memory storage doesn't have URLs
    }));

    return {
      documents,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get document metadata
   */
  async getMetadata(path: string): Promise<StorageMetadata> {
    const entry = this.storage.get(path);

    if (!entry) {
      throw new StorageNotFoundError(path);
    }

    return { ...entry.metadata };
  }

  /**
   * Get URL (not supported for in-memory storage)
   */
  async getUrl(_path: string, _expiresIn?: number): Promise<string | undefined> {
    return undefined; // In-memory storage doesn't have URLs
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    this.storage.clear();
    this.sessions.clear();
  }

  /**
   * Save session state to memory
   */
  async saveSessionState(state: SessionState): Promise<StorageResult> {
    try {
      // Deep clone to avoid mutations
      this.sessions.set(state.id, JSON.parse(JSON.stringify(state)));

      return {
        success: true,
        path: `/sessions/${state.id}/state.json`,
        metadata: {
          sessionId: state.id,
          agentId: state.agentId,
          command: state.command,
          timestamp: state.createdAt,
          size: JSON.stringify(state).length,
          mimeType: 'application/json',
        },
      };
    } catch (error) {
      return {
        success: false,
        path: `/sessions/${state.id}/state.json`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load session state from memory
   */
  async loadSessionState(sessionId: string): Promise<SessionState> {
    const state = this.sessions.get(sessionId);

    if (!state) {
      throw new StorageNotFoundError(`/sessions/${sessionId}/state.json`);
    }

    // Deep clone to avoid mutations
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * List all saved sessions
   */
  async listSessions(options?: StorageQueryOptions): Promise<SessionListResult> {
    let states = Array.from(this.sessions.values());

    // Apply filters
    if (options?.agentId) {
      states = states.filter((state) => state.agentId === options.agentId);
    }

    if (options?.startDate) {
      const startTime = options.startDate.getTime();
      states = states.filter((state) => state.createdAt >= startTime);
    }

    if (options?.endDate) {
      const endTime = options.endDate.getTime();
      states = states.filter((state) => state.createdAt <= endTime);
    }

    const total = states.length;

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const paginatedStates = states.slice(offset, offset + limit);

    const sessions = paginatedStates.map((state) => ({
      sessionId: state.id,
      agentId: state.agentId,
      command: state.command,
      status: state.status,
      createdAt: state.createdAt,
      completedAt: state.completedAt,
      documentCount: Object.keys(state.vfsFiles).length,
      totalCost: state.totalCost,
    }));

    return {
      sessions,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Delete session state from memory
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all stored documents (useful for testing)
   */
  getAll(): Document[] {
    return Array.from(this.storage.values()).map((entry) => ({ ...entry.document }));
  }

  /**
   * Get storage size
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Infer MIME type from file extension
   */
  private inferMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      md: 'text/markdown',
      txt: 'text/plain',
      json: 'application/json',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      html: 'text/html',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}
