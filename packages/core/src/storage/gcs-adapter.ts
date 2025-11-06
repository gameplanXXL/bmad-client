import type { Document } from '../types.js';
import type {
  StorageAdapter,
  StorageMetadata,
  StorageResult,
  StorageQueryOptions,
  StorageListResult,
} from './types.js';
import { StorageNotFoundError, StorageError } from './types.js';

/**
 * Google Cloud Storage configuration
 */
export interface GCSConfig {
  projectId: string;
  bucketName: string;
  keyFilename?: string; // Path to service account key JSON
  credentials?: Record<string, unknown>; // Or provide credentials object
  prefix?: string; // Optional prefix for all paths (e.g., 'bmad/')
}

/**
 * GoogleCloudStorageAdapter - Production storage using Google Cloud Storage
 *
 * Features:
 * - Persistent document storage
 * - Signed URLs for secure access
 * - Metadata and tagging support
 * - Query and filtering
 *
 * @example
 * ```typescript
 * const storage = new GoogleCloudStorageAdapter({
 *   projectId: 'my-project',
 *   bucketName: 'bmad-documents',
 *   keyFilename: '/path/to/service-account.json',
 *   prefix: 'sessions/',
 * });
 *
 * await storage.initialize();
 *
 * await storage.save(document, {
 *   sessionId: 'sess_123',
 *   agentId: 'pm',
 *   command: 'create-prd',
 *   timestamp: Date.now(),
 * });
 * ```
 */
export class GoogleCloudStorageAdapter implements StorageAdapter {
  private config: GCSConfig;
  private bucket?: any; // @google-cloud/storage Bucket
  private storage?: any; // @google-cloud/storage Storage
  private initialized = false;

  constructor(config: GCSConfig) {
    this.config = config;
  }

  /**
   * Initialize GCS client and bucket
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import @google-cloud/storage
      // @ts-ignore - Optional peer dependency
      const { Storage } = await import('@google-cloud/storage');

      // Create storage client
      const storageOptions: any = {
        projectId: this.config.projectId,
      };

      if (this.config.keyFilename) {
        storageOptions.keyFilename = this.config.keyFilename;
      } else if (this.config.credentials) {
        storageOptions.credentials = this.config.credentials;
      }

      this.storage = new Storage(storageOptions);
      this.bucket = this.storage.bucket(this.config.bucketName);

      // Verify bucket exists
      const [exists] = await this.bucket.exists();
      if (!exists) {
        throw new StorageError(
          `Bucket does not exist: ${this.config.bucketName}`,
          'BUCKET_NOT_FOUND'
        );
      }

      this.initialized = true;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      throw new StorageError(
        'Failed to initialize Google Cloud Storage',
        'INIT_ERROR',
        error
      );
    }
  }

  /**
   * Save document to GCS
   */
  async save(document: Document, metadata: StorageMetadata): Promise<StorageResult> {
    this.ensureInitialized();

    try {
      const path = this.prefixPath(document.path);
      const file = this.bucket!.file(path);

      // Upload content
      await file.save(document.content, {
        metadata: {
          contentType: this.inferMimeType(document.path),
          metadata: {
            sessionId: metadata.sessionId,
            agentId: metadata.agentId,
            command: metadata.command,
            timestamp: metadata.timestamp.toString(),
            ...metadata.tags,
          },
        },
      });

      // Get public URL (if bucket is public)
      const url = `https://storage.googleapis.com/${this.config.bucketName}/${path}`;

      return {
        success: true,
        path: document.path,
        url,
        metadata: {
          ...metadata,
          size: document.content.length,
          mimeType: this.inferMimeType(document.path),
        },
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
    this.ensureInitialized();

    const results = await Promise.allSettled(
      documents.map((doc) => this.save(doc, metadata))
    );

    return results.map((result) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            success: false,
            path: '',
            error: result.reason?.message || 'Unknown error',
          }
    );
  }

  /**
   * Load document from GCS
   */
  async load(path: string): Promise<Document> {
    this.ensureInitialized();

    try {
      const gcsPath = this.prefixPath(path);
      const file = this.bucket!.file(gcsPath);

      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageNotFoundError(path);
      }

      const [content] = await file.download();

      return {
        path,
        content: content.toString('utf-8'),
      };
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        throw error;
      }

      throw new StorageError(
        `Failed to load document: ${path}`,
        'LOAD_ERROR',
        error
      );
    }
  }

  /**
   * Check if document exists in GCS
   */
  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const gcsPath = this.prefixPath(path);
      const file = this.bucket!.file(gcsPath);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete document from GCS
   */
  async delete(path: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const gcsPath = this.prefixPath(path);
      const file = this.bucket!.file(gcsPath);

      const [exists] = await file.exists();
      if (!exists) {
        return false;
      }

      await file.delete();
      return true;
    } catch (error) {
      throw new StorageError(
        `Failed to delete document: ${path}`,
        'DELETE_ERROR',
        error
      );
    }
  }

  /**
   * List documents matching query
   */
  async list(options?: StorageQueryOptions): Promise<StorageListResult> {
    this.ensureInitialized();

    try {
      const prefix = this.config.prefix || '';
      const [files] = await this.bucket!.getFiles({ prefix });

      let filteredFiles = files;

      // Filter by sessionId (stored in metadata)
      if (options?.sessionId) {
        const filtered = await Promise.all(
          files.map(async (file: any) => {
            const [metadata] = await file.getMetadata();
            return metadata.metadata?.sessionId === options.sessionId ? file : null;
          })
        );
        filteredFiles = filtered.filter((f) => f !== null);
      }

      // Apply pagination
      const offset = options?.offset || 0;
      const limit = options?.limit || 100;
      const paginatedFiles = filteredFiles.slice(offset, offset + limit);

      const documents = await Promise.all(
        paginatedFiles.map(async (file: any) => {
          const [metadata] = await file.getMetadata();
          return {
            path: this.unprefixPath(file.name),
            metadata: {
              sessionId: metadata.metadata?.sessionId || '',
              agentId: metadata.metadata?.agentId || '',
              command: metadata.metadata?.command || '',
              timestamp: parseInt(metadata.metadata?.timestamp || '0'),
              size: metadata.size,
              mimeType: metadata.contentType,
            },
            url: `https://storage.googleapis.com/${this.config.bucketName}/${file.name}`,
          };
        })
      );

      return {
        documents,
        total: filteredFiles.length,
        hasMore: offset + limit < filteredFiles.length,
      };
    } catch (error) {
      throw new StorageError('Failed to list documents', 'LIST_ERROR', error);
    }
  }

  /**
   * Get document metadata
   */
  async getMetadata(path: string): Promise<StorageMetadata> {
    this.ensureInitialized();

    try {
      const gcsPath = this.prefixPath(path);
      const file = this.bucket!.file(gcsPath);

      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageNotFoundError(path);
      }

      const [metadata] = await file.getMetadata();

      return {
        sessionId: metadata.metadata?.sessionId || '',
        agentId: metadata.metadata?.agentId || '',
        command: metadata.metadata?.command || '',
        timestamp: parseInt(metadata.metadata?.timestamp || '0'),
        size: metadata.size,
        mimeType: metadata.contentType,
        tags: metadata.metadata,
      };
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        throw error;
      }

      throw new StorageError(
        `Failed to get metadata: ${path}`,
        'METADATA_ERROR',
        error
      );
    }
  }

  /**
   * Get signed URL for document
   */
  async getUrl(path: string, expiresIn: number = 3600): Promise<string | undefined> {
    this.ensureInitialized();

    try {
      const gcsPath = this.prefixPath(path);
      const file = this.bucket!.file(gcsPath);

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });

      return url;
    } catch (error) {
      throw new StorageError(
        `Failed to generate signed URL: ${path}`,
        'URL_ERROR',
        error
      );
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    this.bucket = undefined;
    this.storage = undefined;
    this.initialized = false;
  }

  /**
   * Ensure adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StorageError(
        'Storage adapter not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Add prefix to path if configured
   */
  private prefixPath(path: string): string {
    if (!this.config.prefix) return path;
    return `${this.config.prefix}${path}`;
  }

  /**
   * Remove prefix from path
   */
  private unprefixPath(path: string): string {
    if (!this.config.prefix) return path;
    if (path.startsWith(this.config.prefix)) {
      return path.substring(this.config.prefix.length);
    }
    return path;
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
