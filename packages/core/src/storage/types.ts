import type { Document, SessionState } from '../types.js';

/**
 * Storage adapter configuration
 */
export interface StorageConfig {
  type: 'memory' | 'gcs' | 'custom';

  // GCS-specific config
  projectId?: string;
  bucketName?: string;
  keyFilename?: string;
  credentials?: Record<string, unknown>;

  // Custom adapter
  adapter?: StorageAdapter;
}

/**
 * Storage metadata for documents
 */
export interface StorageMetadata {
  sessionId: string;
  agentId: string;
  command: string;
  timestamp: number;
  mimeType?: string;
  size?: number;
  tags?: Record<string, string>;
}

/**
 * Storage operation result
 */
export interface StorageResult {
  success: boolean;
  path: string;
  url?: string; // Public URL if available
  metadata?: StorageMetadata;
  error?: string;
}

/**
 * Storage query options
 */
export interface StorageQueryOptions {
  sessionId?: string;
  agentId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: Record<string, string>;
  limit?: number;
  offset?: number;
}

/**
 * Storage listing result
 */
export interface StorageListResult {
  documents: Array<{
    path: string;
    metadata: StorageMetadata;
    url?: string;
  }>;
  total: number;
  hasMore: boolean;
}

/**
 * StorageAdapter - Abstract interface for document storage
 *
 * Implementations:
 * - InMemoryStorageAdapter - For testing and development
 * - GoogleCloudStorageAdapter - For production (Google Cloud Storage)
 * - Custom adapters via StorageConfig
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
 * ```
 */
export interface StorageAdapter {
  /**
   * Save a document to storage
   *
   * @param document - Document to save
   * @param metadata - Storage metadata
   * @returns Storage result with URL
   */
  save(document: Document, metadata: StorageMetadata): Promise<StorageResult>;

  /**
   * Save multiple documents in batch
   *
   * @param documents - Documents to save
   * @param metadata - Storage metadata (applied to all)
   * @returns Array of storage results
   */
  saveBatch(documents: Document[], metadata: StorageMetadata): Promise<StorageResult[]>;

  /**
   * Load a document from storage
   *
   * @param path - Document path
   * @returns Document with content
   * @throws StorageNotFoundError if document doesn't exist
   */
  load(path: string): Promise<Document>;

  /**
   * Check if document exists
   *
   * @param path - Document path
   * @returns true if document exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Delete a document from storage
   *
   * @param path - Document path
   * @returns true if deleted, false if not found
   */
  delete(path: string): Promise<boolean>;

  /**
   * List documents matching query
   *
   * @param options - Query options
   * @returns List of matching documents
   */
  list(options?: StorageQueryOptions): Promise<StorageListResult>;

  /**
   * Get document metadata
   *
   * @param path - Document path
   * @returns Storage metadata
   * @throws StorageNotFoundError if document doesn't exist
   */
  getMetadata(path: string): Promise<StorageMetadata>;

  /**
   * Get public URL for document (if supported)
   *
   * @param path - Document path
   * @param expiresIn - URL expiration in seconds (default: 3600)
   * @returns Signed URL or undefined if not supported
   */
  getUrl(path: string, expiresIn?: number): Promise<string | undefined>;

  /**
   * Initialize storage (create buckets, etc.)
   * Called automatically by BmadClient
   */
  initialize(): Promise<void>;

  /**
   * Clean up resources
   */
  close(): Promise<void>;

  /**
   * Save session state to storage
   *
   * Saves the complete session state as JSON for recovery and persistence.
   * State is stored at: /sessions/{sessionId}/state.json
   *
   * @param state - Session state to save
   * @returns Storage result with URL
   */
  saveSessionState(state: SessionState): Promise<StorageResult>;

  /**
   * Load session state from storage
   *
   * @param sessionId - Session ID to load
   * @returns Session state
   * @throws StorageNotFoundError if session state doesn't exist
   */
  loadSessionState(sessionId: string): Promise<SessionState>;

  /**
   * List all saved sessions
   *
   * @param options - Query options (filter by agentId, date range, etc.)
   * @returns List of session states with metadata
   */
  listSessions(options?: StorageQueryOptions): Promise<SessionListResult>;

  /**
   * Delete session state
   *
   * @param sessionId - Session ID to delete
   * @returns true if deleted, false if not found
   */
  deleteSession(sessionId: string): Promise<boolean>;
}

/**
 * Session listing result
 */
export interface SessionListResult {
  sessions: Array<{
    sessionId: string;
    agentId: string;
    command: string;
    status: string;
    createdAt: number;
    completedAt?: number;
    documentCount: number;
    totalCost: number;
  }>;
  total: number;
  hasMore: boolean;
}

/**
 * Custom error for storage not found
 */
export class StorageNotFoundError extends Error {
  constructor(path: string) {
    super(`Document not found in storage: ${path}`);
    this.name = 'StorageNotFoundError';
  }
}

/**
 * Custom error for storage operations
 */
export class StorageError extends Error {
  public readonly code?: string;
  public override readonly cause?: unknown;

  constructor(message: string, code?: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause;
  }
}
