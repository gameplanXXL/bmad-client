/**
 * Supabase Storage Adapter for BMad Client Library
 *
 * Provides document persistence to Supabase Storage buckets with support for:
 * - Service Role Key authentication
 * - Public bucket access
 * - Row Level Security (RLS) integration
 * - Real-time file notifications (optional)
 *
 * @example
 * ```typescript
 * import { SupabaseStorageAdapter } from '@bmad/storage-supabase';
 *
 * const storage = new SupabaseStorageAdapter({
 *   supabaseUrl: 'https://your-project.supabase.co',
 *   supabaseKey: 'your-service-role-key',
 *   bucketName: 'bmad-documents'
 * });
 *
 * await storage.initialize();
 * ```
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  StorageAdapter,
  StorageMetadata,
  StorageResult,
  StorageQueryOptions,
  StorageListResult,
  SessionState,
  SessionListResult,
} from '@bmad/client/storage';
import type { Document } from '@bmad/client';

/**
 * Configuration options for Supabase Storage Adapter
 */
export interface SupabaseStorageAdapterConfig {
  /**
   * Supabase project URL (required)
   * Example: 'https://your-project.supabase.co'
   */
  supabaseUrl: string;

  /**
   * Supabase service role key or anon key (required)
   * - Use service role key for server-side operations (full access)
   * - Use anon key for client-side with RLS (user-level access)
   */
  supabaseKey: string;

  /**
   * Storage bucket name (required)
   * Example: 'bmad-documents'
   */
  bucketName: string;

  /**
   * Optional: Base path prefix for all documents
   * Example: 'sessions/' will store all docs under sessions/ in bucket
   * Default: '' (root of bucket)
   */
  basePath?: string;

  /**
   * Optional: Whether to create bucket if it doesn't exist
   * Default: false
   */
  autoCreateBucket?: boolean;

  /**
   * Optional: Bucket configuration if creating new bucket
   */
  bucketConfig?: {
    /**
     * Whether bucket is publicly accessible
     * Default: false
     */
    public?: boolean;

    /**
     * Allowed MIME types (e.g., ['text/markdown', 'application/json'])
     * Default: undefined (all types allowed)
     */
    allowedMimeTypes?: string[];

    /**
     * Maximum file size in bytes
     * Default: undefined (no limit)
     */
    fileSizeLimit?: number;
  };

  /**
   * Optional: Custom headers for Supabase client
   */
  headers?: Record<string, string>;
}

/**
 * Custom error for Supabase Storage operations
 */
export class SupabaseStorageError extends Error {
  public readonly code?: string;
  public override readonly cause?: unknown;

  constructor(message: string, code?: string, cause?: unknown) {
    super(message);
    this.name = 'SupabaseStorageError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Supabase Storage Adapter
 *
 * Implements the StorageAdapter interface for persisting BMad documents to Supabase Storage.
 *
 * Features:
 * - Automatic bucket creation (optional)
 * - Support for public and private buckets
 * - Row Level Security (RLS) compatible
 * - Signed URLs for temporary access
 * - Metadata storage via custom headers
 * - Session state persistence
 *
 * @example
 * ```typescript
 * // Server-side with service role key
 * const storage = new SupabaseStorageAdapter({
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   bucketName: 'bmad-docs',
 *   autoCreateBucket: true,
 *   bucketConfig: {
 *     public: false
 *   }
 * });
 *
 * // Client-side with RLS (anon key)
 * const storage = new SupabaseStorageAdapter({
 *   supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 *   bucketName: 'user-documents',
 *   basePath: 'user-123' // User-specific folder
 * });
 * ```
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient;
  private bucketName: string;
  private basePath: string;
  private config: SupabaseStorageAdapterConfig;

  constructor(config: SupabaseStorageAdapterConfig) {
    this.config = config;
    this.bucketName = config.bucketName;
    this.basePath = config.basePath?.replace(/^\/+|\/+$/g, '') || ''; // Remove leading/trailing slashes

    try {
      this.client = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: {
          persistSession: false, // Don't persist auth for server-side usage
          autoRefreshToken: false,
        },
        global: {
          headers: config.headers || {},
        },
      });
    } catch (error) {
      throw new SupabaseStorageError(
        `Failed to initialize Supabase client: ${(error as Error).message}`,
        'INIT_ERROR',
        error
      );
    }
  }

  /**
   * Get full storage path with base path prefix
   */
  private getFullPath(path: string): string {
    // Remove leading slash from path
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    // Combine base path and document path
    return this.basePath ? `${this.basePath}/${cleanPath}` : cleanPath;
  }

  /**
   * Remove base path from storage path to get original document path
   */
  private removeBasePath(fullPath: string): string {
    if (this.basePath && fullPath.startsWith(this.basePath + '/')) {
      return '/' + fullPath.slice(this.basePath.length + 1);
    }
    return fullPath.startsWith('/') ? fullPath : '/' + fullPath;
  }

  /**
   * Convert metadata to Supabase custom metadata format
   */
  private metadataToCustomMetadata(metadata: StorageMetadata): Record<string, string> {
    return {
      sessionId: metadata.sessionId,
      agentId: metadata.agentId,
      command: metadata.command,
      timestamp: metadata.timestamp.toString(),
      ...(metadata.mimeType && { mimeType: metadata.mimeType }),
      ...(metadata.size && { size: metadata.size.toString() }),
      ...(metadata.tags && { tags: JSON.stringify(metadata.tags) }),
    };
  }

  /**
   * Convert Supabase metadata to StorageMetadata format
   */
  private customMetadataToMetadata(customMetadata: Record<string, any>): StorageMetadata {
    return {
      sessionId: customMetadata.sessionId || 'unknown',
      agentId: customMetadata.agentId || 'unknown',
      command: customMetadata.command || 'unknown',
      timestamp: parseInt(customMetadata.timestamp || '0', 10),
      mimeType: customMetadata.mimeType,
      size: customMetadata.size ? parseInt(customMetadata.size, 10) : undefined,
      tags: customMetadata.tags ? JSON.parse(customMetadata.tags) : undefined,
    };
  }

  /**
   * Save document to Supabase Storage bucket
   */
  async save(document: Document, metadata: StorageMetadata): Promise<StorageResult> {
    const fullPath = this.getFullPath(document.path);

    try {
      // Convert content to Blob/Buffer
      const contentBlob = new Blob([document.content], { type: 'text/markdown' });

      // Upload file with metadata
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .upload(fullPath, contentBlob, {
          contentType: metadata.mimeType || 'text/markdown',
          upsert: true, // Overwrite if exists
          metadata: this.metadataToCustomMetadata(metadata),
        });

      if (error) {
        return {
          success: false,
          path: document.path,
          error: `Failed to save document: ${error.message}`,
          metadata,
        };
      }

      // Get public URL if bucket is public
      const { data: urlData } = this.client.storage
        .from(this.bucketName)
        .getPublicUrl(fullPath);

      return {
        success: true,
        path: document.path,
        url: urlData.publicUrl,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        path: document.path,
        error: `Failed to save document: ${(error as Error).message}`,
        metadata,
      };
    }
  }

  /**
   * Save multiple documents in batch
   */
  async saveBatch(documents: Document[], metadata: StorageMetadata): Promise<StorageResult[]> {
    // Supabase Storage doesn't have native batch upload, so we upload in parallel
    return Promise.all(documents.map((doc) => this.save(doc, metadata)));
  }

  /**
   * Load document from Supabase Storage bucket
   */
  async load(path: string): Promise<Document> {
    const fullPath = this.getFullPath(path);

    try {
      // Download file
      const { data, error } = await this.client.storage.from(this.bucketName).download(fullPath);

      if (error) {
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          throw new SupabaseStorageError(`Document not found: ${path}`, 'NOT_FOUND', error);
        }
        throw new SupabaseStorageError(
          `Failed to load document ${path}: ${error.message}`,
          'LOAD_ERROR',
          error
        );
      }

      if (!data) {
        throw new SupabaseStorageError(`Document not found: ${path}`, 'NOT_FOUND');
      }

      // Convert Blob to text
      const content = await data.text();

      return {
        path,
        content,
      };
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to load document ${path}: ${(error as Error).message}`,
        'LOAD_ERROR',
        error
      );
    }
  }

  /**
   * Check if document exists
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);

    try {
      // List files with prefix to check existence
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(fullPath.split('/').slice(0, -1).join('/') || '', {
          search: fullPath.split('/').pop(),
        });

      if (error) {
        return false;
      }

      return data ? data.length > 0 : false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete document from Supabase Storage bucket
   */
  async delete(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);

    try {
      const { error } = await this.client.storage.from(this.bucketName).remove([fullPath]);

      if (error) {
        // Supabase doesn't return error for non-existent files, so we check if it existed
        if (error.message.includes('not found')) {
          return false;
        }
        throw new SupabaseStorageError(
          `Failed to delete document ${path}: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }

      return true;
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to delete document ${path}: ${(error as Error).message}`,
        'DELETE_ERROR',
        error
      );
    }
  }

  /**
   * Get document metadata
   */
  async getMetadata(path: string): Promise<StorageMetadata> {
    const fullPath = this.getFullPath(path);

    try {
      // List files with prefix to get metadata
      const dirPath = fullPath.split('/').slice(0, -1).join('/') || '';
      const fileName = fullPath.split('/').pop() || '';

      const { data, error } = await this.client.storage.from(this.bucketName).list(dirPath, {
        search: fileName,
      });

      if (error || !data || data.length === 0) {
        throw new SupabaseStorageError(`Document not found in storage: ${path}`, 'NOT_FOUND');
      }

      const fileInfo = data[0];

      // Supabase doesn't return custom metadata in list(), so we need to download to get it
      // For now, return basic metadata
      return {
        sessionId: 'unknown',
        agentId: 'unknown',
        command: 'unknown',
        timestamp: new Date(fileInfo.created_at).getTime(),
        size: fileInfo.metadata?.size,
      };
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to get metadata for ${path}: ${(error as Error).message}`,
        'METADATA_ERROR',
        error
      );
    }
  }

  /**
   * List documents matching query criteria
   */
  async list(options?: StorageQueryOptions): Promise<StorageListResult> {
    try {
      const searchPath = this.basePath || '';

      // List all files in base path
      const { data, error } = await this.client.storage.from(this.bucketName).list(searchPath, {
        limit: options?.limit || 100,
        offset: options?.offset || 0,
      });

      if (error) {
        throw new SupabaseStorageError(
          `Failed to list documents: ${error.message}`,
          'LIST_ERROR',
          error
        );
      }

      if (!data) {
        return {
          documents: [],
          total: 0,
          hasMore: false,
        };
      }

      // Convert to StorageListResult format
      const documents = data
        .filter((file) => !file.name.endsWith('/')) // Filter out directories
        .map((file) => {
          const fullPath = searchPath ? `${searchPath}/${file.name}` : file.name;
          const path = this.removeBasePath(fullPath);

          return {
            path,
            metadata: {
              sessionId: 'unknown', // Supabase list() doesn't return custom metadata
              agentId: 'unknown',
              command: 'unknown',
              timestamp: new Date(file.created_at).getTime(),
              size: file.metadata?.size,
            },
          };
        });

      return {
        documents,
        total: documents.length,
        hasMore: data.length === (options?.limit || 100),
      };
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to list documents: ${(error as Error).message}`,
        'LIST_ERROR',
        error
      );
    }
  }

  /**
   * Get signed URL for temporary document access
   *
   * @param path - Document path
   * @param expiresIn - URL expiration in seconds (default: 3600 = 1 hour)
   * @returns Signed URL for document download
   */
  async getUrl(path: string, expiresIn: number = 3600): Promise<string | undefined> {
    const fullPath = this.getFullPath(path);

    try {
      // Check if file exists first
      const exists = await this.exists(path);
      if (!exists) {
        return undefined;
      }

      // Create signed URL
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .createSignedUrl(fullPath, expiresIn);

      if (error) {
        console.warn(`Failed to create signed URL for ${path}:`, error.message);
        return undefined;
      }

      return data?.signedUrl;
    } catch (error) {
      console.warn(`Failed to get URL for ${path}:`, (error as Error).message);
      return undefined;
    }
  }

  /**
   * Initialize storage (verify bucket exists and is accessible, optionally create it)
   */
  async initialize(): Promise<void> {
    try {
      // List buckets to check if our bucket exists
      const { data: buckets, error: listError } = await this.client.storage.listBuckets();

      if (listError) {
        throw new SupabaseStorageError(
          `Failed to list buckets: ${listError.message}`,
          'INIT_ERROR',
          listError
        );
      }

      const bucketExists = buckets?.some((bucket) => bucket.name === this.bucketName);

      if (!bucketExists) {
        if (this.config.autoCreateBucket) {
          // Create bucket
          const { error: createError } = await this.client.storage.createBucket(this.bucketName, {
            public: this.config.bucketConfig?.public ?? false,
            fileSizeLimit: this.config.bucketConfig?.fileSizeLimit,
            allowedMimeTypes: this.config.bucketConfig?.allowedMimeTypes,
          });

          if (createError) {
            throw new SupabaseStorageError(
              `Failed to create bucket ${this.bucketName}: ${createError.message}`,
              'BUCKET_CREATE_ERROR',
              createError
            );
          }

          console.log(`Created Supabase Storage bucket: ${this.bucketName}`);
        } else {
          throw new SupabaseStorageError(
            `Bucket ${this.bucketName} does not exist. Set autoCreateBucket: true to create it automatically.`,
            'BUCKET_NOT_FOUND'
          );
        }
      }
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to initialize Supabase storage: ${(error as Error).message}`,
        'INIT_ERROR',
        error
      );
    }
  }

  /**
   * Close storage connection and clean up resources
   */
  async close(): Promise<void> {
    // Supabase client doesn't require explicit cleanup
    // Connection pooling is handled automatically
  }

  /**
   * Save complete session state to storage
   *
   * Stores session state as JSON at: /sessions/{sessionId}/state.json
   */
  async saveSessionState(state: SessionState): Promise<StorageResult> {
    const sessionPath = `/sessions/${state.sessionId}/state.json`;
    const content = JSON.stringify(state, null, 2);

    const metadata: StorageMetadata = {
      sessionId: state.sessionId,
      agentId: state.agentId || 'unknown',
      command: state.command || 'unknown',
      timestamp: Date.now(),
      mimeType: 'application/json',
    };

    return this.save({ path: sessionPath, content }, metadata);
  }

  /**
   * Load session state from storage
   */
  async loadSessionState(sessionId: string): Promise<SessionState> {
    const sessionPath = `/sessions/${sessionId}/state.json`;

    try {
      const document = await this.load(sessionPath);
      return JSON.parse(document.content) as SessionState;
    } catch (error) {
      if (error instanceof SupabaseStorageError && error.code === 'NOT_FOUND') {
        throw new SupabaseStorageError(
          `Session state not found for session: ${sessionId}`,
          'SESSION_NOT_FOUND',
          error
        );
      }
      throw error;
    }
  }

  /**
   * List all saved sessions
   */
  async listSessions(options?: StorageQueryOptions): Promise<SessionListResult> {
    try {
      const sessionsPath = this.basePath ? `${this.basePath}/sessions` : 'sessions';

      // List all session directories
      const { data, error } = await this.client.storage.from(this.bucketName).list(sessionsPath, {
        limit: options?.limit || 100,
        offset: options?.offset || 0,
      });

      if (error) {
        throw new SupabaseStorageError(
          `Failed to list sessions: ${error.message}`,
          'LIST_ERROR',
          error
        );
      }

      if (!data || data.length === 0) {
        return {
          sessions: [],
          total: 0,
          hasMore: false,
        };
      }

      // Load state.json for each session
      const sessions = await Promise.all(
        data
          .filter((item) => item.name !== '.emptyFolderPlaceholder') // Filter out placeholders
          .map(async (item) => {
            try {
              const sessionId = item.name;
              const state = await this.loadSessionState(sessionId);

              return {
                sessionId: state.sessionId,
                agentId: state.agentId || 'unknown',
                command: state.command || 'unknown',
                status: state.status || 'unknown',
                createdAt: state.startedAt || Date.now(),
                completedAt: state.completedAt,
                documentCount: state.documents?.length || 0,
                totalCost: state.cost?.total || 0,
              };
            } catch (err) {
              // Skip sessions that don't have valid state.json
              return null;
            }
          })
      );

      // Filter out null entries (invalid sessions)
      const validSessions = sessions.filter((s) => s !== null) as SessionListResult['sessions'];

      return {
        sessions: validSessions,
        total: validSessions.length,
        hasMore: data.length === (options?.limit || 100),
      };
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to list sessions: ${(error as Error).message}`,
        'LIST_ERROR',
        error
      );
    }
  }

  /**
   * Delete session state and all associated documents
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionPath = this.getFullPath(`sessions/${sessionId}`);

      // List all files in session directory
      const { data, error: listError } = await this.client.storage
        .from(this.bucketName)
        .list(sessionPath);

      if (listError || !data) {
        return false; // Session doesn't exist or error listing
      }

      // Delete all files in session directory
      const filePaths = data.map((file) => `${sessionPath}/${file.name}`);

      if (filePaths.length > 0) {
        const { error: deleteError } = await this.client.storage
          .from(this.bucketName)
          .remove(filePaths);

        if (deleteError) {
          throw new SupabaseStorageError(
            `Failed to delete session ${sessionId}: ${deleteError.message}`,
            'DELETE_ERROR',
            deleteError
          );
        }
      }

      return true;
    } catch (error) {
      if (error instanceof SupabaseStorageError) {
        throw error;
      }
      throw new SupabaseStorageError(
        `Failed to delete session ${sessionId}: ${(error as Error).message}`,
        'DELETE_ERROR',
        error
      );
    }
  }

  /**
   * Health check - verify Supabase connection and bucket access
   */
  async healthCheck(): Promise<{
    status: 'ok' | 'error';
    message?: string;
    latency?: number;
  }> {
    const startTime = Date.now();

    try {
      // Try to list buckets
      const { data, error } = await this.client.storage.listBuckets();

      if (error) {
        return {
          status: 'error',
          message: `Supabase health check failed: ${error.message}`,
          latency: Date.now() - startTime,
        };
      }

      const bucketExists = data?.some((bucket) => bucket.name === this.bucketName);

      if (!bucketExists) {
        return {
          status: 'error',
          message: `Bucket ${this.bucketName} does not exist or is not accessible`,
          latency: Date.now() - startTime,
        };
      }

      return {
        status: 'ok',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Supabase health check failed: ${(error as Error).message}`,
        latency: Date.now() - startTime,
      };
    }
  }
}
