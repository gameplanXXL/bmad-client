/**
 * Google Cloud Storage Adapter for BMad Client Library
 *
 * Provides document persistence to GCS buckets with support for:
 * - Application Default Credentials (ADC)
 * - Service Account JSON
 * - Key File Path
 */

import { Storage, Bucket, File } from '@google-cloud/storage';
import type { StorageAdapter, Document, StorageMetadata, StorageListOptions } from '@bmad/client';

export interface GCSAdapterConfig {
  /**
   * GCS bucket name (required)
   */
  bucketName: string;

  /**
   * Optional: Service account credentials as JSON object
   */
  credentials?: {
    client_email: string;
    private_key: string;
    project_id?: string;
  };

  /**
   * Optional: Path to service account key file
   */
  keyFilename?: string;

  /**
   * Optional: GCP project ID
   * If not provided, will be inferred from credentials or ADC
   */
  projectId?: string;

  /**
   * Optional: Base path prefix for all documents
   * Example: 'bmad-sessions/' will store all docs under bmad-sessions/ in bucket
   */
  basePath?: string;

  /**
   * Optional: Custom storage endpoint (for testing with emulator)
   */
  apiEndpoint?: string;
}

/**
 * Custom error for GCS-specific failures
 */
export class GCSStorageError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GCSStorageError';
  }
}

/**
 * Google Cloud Storage Adapter
 *
 * Implements the StorageAdapter interface for persisting BMad documents to GCS.
 *
 * @example
 * ```typescript
 * // Using Application Default Credentials
 * const storage = new GoogleCloudStorageAdapter({
 *   bucketName: 'my-bmad-docs'
 * });
 *
 * // Using Service Account JSON
 * const storage = new GoogleCloudStorageAdapter({
 *   bucketName: 'my-bmad-docs',
 *   credentials: {
 *     client_email: 'service@project.iam.gserviceaccount.com',
 *     private_key: '-----BEGIN PRIVATE KEY-----...',
 *     project_id: 'my-project'
 *   }
 * });
 *
 * // Using Key File
 * const storage = new GoogleCloudStorageAdapter({
 *   bucketName: 'my-bmad-docs',
 *   keyFilename: '/path/to/service-account-key.json'
 * });
 * ```
 */
export class GoogleCloudStorageAdapter implements StorageAdapter {
  private storage: Storage;
  private bucket: Bucket;
  private basePath: string;

  constructor(config: GCSAdapterConfig) {
    // Build Storage client config
    const storageConfig: any = {};

    if (config.credentials) {
      storageConfig.credentials = config.credentials;
      storageConfig.projectId = config.credentials.project_id || config.projectId;
    } else if (config.keyFilename) {
      storageConfig.keyFilename = config.keyFilename;
      storageConfig.projectId = config.projectId;
    } else if (config.projectId) {
      storageConfig.projectId = config.projectId;
    }
    // If none provided, GCS SDK will use Application Default Credentials

    if (config.apiEndpoint) {
      storageConfig.apiEndpoint = config.apiEndpoint;
    }

    try {
      this.storage = new Storage(storageConfig);
      this.bucket = this.storage.bucket(config.bucketName);
      this.basePath = config.basePath?.replace(/\/$/, '') || ''; // Remove trailing slash
    } catch (error) {
      throw new GCSStorageError(
        `Failed to initialize GCS adapter: ${(error as Error).message}`,
        'INIT_ERROR',
        error as Error
      );
    }
  }

  /**
   * Get full GCS path with base path prefix
   */
  private getFullPath(path: string): string {
    // Remove leading slash from path
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    // Combine base path and document path
    return this.basePath ? `${this.basePath}/${cleanPath}` : cleanPath;
  }

  /**
   * Save document to GCS bucket
   */
  async save(document: Document, metadata: StorageMetadata): Promise<void> {
    const fullPath = this.getFullPath(document.path);
    const file = this.bucket.file(fullPath);

    try {
      // Create file content with metadata
      const content = document.content;

      // Upload file
      await file.save(content, {
        contentType: 'text/markdown',
        metadata: {
          metadata: {
            sessionId: metadata.sessionId,
            agentId: metadata.agentId,
            command: metadata.command,
            timestamp: metadata.timestamp.toString(),
            originalPath: document.path,
          },
        },
      });
    } catch (error) {
      throw new GCSStorageError(
        `Failed to save document ${document.path}: ${(error as Error).message}`,
        'SAVE_ERROR',
        error as Error
      );
    }
  }

  /**
   * Save multiple documents in batch
   */
  async saveBatch(documents: Document[], metadata: StorageMetadata): Promise<void> {
    // GCS doesn't have a native batch API, so we'll save in parallel
    await Promise.all(documents.map((doc) => this.save(doc, metadata)));
  }

  /**
   * Load document from GCS bucket
   */
  async load(path: string): Promise<Document> {
    const fullPath = this.getFullPath(path);
    const file = this.bucket.file(fullPath);

    try {
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new GCSStorageError(`Document not found: ${path}`, 'NOT_FOUND');
      }

      // Download file content
      const [content] = await file.download();

      return {
        path,
        content: content.toString('utf-8'),
      };
    } catch (error) {
      if ((error as any).code === 'NOT_FOUND' || error instanceof GCSStorageError) {
        throw error;
      }
      throw new GCSStorageError(
        `Failed to load document ${path}: ${(error as Error).message}`,
        'LOAD_ERROR',
        error as Error
      );
    }
  }

  /**
   * Load multiple documents in batch
   */
  async loadBatch(paths: string[]): Promise<Document[]> {
    // Load in parallel
    return Promise.all(paths.map((path) => this.load(path)));
  }

  /**
   * Check if document exists
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);
    const file = this.bucket.file(fullPath);

    try {
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      throw new GCSStorageError(
        `Failed to check existence of ${path}: ${(error as Error).message}`,
        'EXISTS_ERROR',
        error as Error
      );
    }
  }

  /**
   * Delete document from GCS bucket
   */
  async delete(path: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    const file = this.bucket.file(fullPath);

    try {
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      throw new GCSStorageError(
        `Failed to delete document ${path}: ${(error as Error).message}`,
        'DELETE_ERROR',
        error as Error
      );
    }
  }

  /**
   * Delete multiple documents in batch
   */
  async deleteBatch(paths: string[]): Promise<void> {
    await Promise.all(paths.map((path) => this.delete(path)));
  }

  /**
   * Get document metadata
   */
  async getMetadata(path: string): Promise<StorageMetadata> {
    const fullPath = this.getFullPath(path);
    const file = this.bucket.file(fullPath);

    try {
      const [metadata] = await file.getMetadata();
      const customMetadata = metadata.metadata || {};

      return {
        sessionId: customMetadata.sessionId || 'unknown',
        agentId: customMetadata.agentId || 'unknown',
        command: customMetadata.command || 'unknown',
        timestamp: parseInt(customMetadata.timestamp || '0', 10),
      };
    } catch (error) {
      if ((error as any).code === 404) {
        throw new GCSStorageError(`Document not found in storage: ${path}`, 'NOT_FOUND');
      }
      throw new GCSStorageError(
        `Failed to get metadata for ${path}: ${(error as Error).message}`,
        'METADATA_ERROR',
        error as Error
      );
    }
  }

  /**
   * List documents matching criteria
   */
  async list(options?: StorageListOptions): Promise<{
    documents: Array<{ path: string; content: string; metadata: StorageMetadata }>;
    hasMore: boolean;
    nextToken?: string;
  }> {
    try {
      // Build query options
      const queryOptions: any = {
        prefix: this.basePath ? `${this.basePath}/` : undefined,
      };

      if (options?.limit) {
        queryOptions.maxResults = options.limit;
      }

      if (options?.nextToken) {
        queryOptions.pageToken = options.nextToken;
      }

      // List files
      const [files, , response] = await this.bucket.getFiles(queryOptions);

      // Load content and metadata for each file
      const documents = await Promise.all(
        files.map(async (file) => {
          const [content] = await file.download();
          const [metadata] = await file.getMetadata();
          const customMetadata = metadata.metadata || {};

          // Remove base path from returned path
          let path = file.name;
          if (this.basePath && path.startsWith(this.basePath)) {
            path = path.slice(this.basePath.length);
          }
          if (!path.startsWith('/')) {
            path = '/' + path;
          }

          return {
            path,
            content: content.toString('utf-8'),
            metadata: {
              sessionId: customMetadata.sessionId || 'unknown',
              agentId: customMetadata.agentId || 'unknown',
              command: customMetadata.command || 'unknown',
              timestamp: parseInt(customMetadata.timestamp || '0', 10),
            },
          };
        })
      );

      // Filter by sessionId or agentId if provided
      let filteredDocs = documents;
      if (options?.sessionId) {
        filteredDocs = filteredDocs.filter((doc) => doc.metadata.sessionId === options.sessionId);
      }
      if (options?.agentId) {
        filteredDocs = filteredDocs.filter((doc) => doc.metadata.agentId === options.agentId);
      }

      return {
        documents: filteredDocs,
        hasMore: !!response?.nextPageToken,
        nextToken: response?.nextPageToken,
      };
    } catch (error) {
      throw new GCSStorageError(
        `Failed to list documents: ${(error as Error).message}`,
        'LIST_ERROR',
        error as Error
      );
    }
  }

  /**
   * Health check - verify GCS connection and bucket access
   */
  async healthCheck(): Promise<{
    status: 'ok' | 'error';
    message?: string;
    latency?: number;
  }> {
    const startTime = Date.now();

    try {
      // Check if bucket exists and is accessible
      const [exists] = await this.bucket.exists();

      if (!exists) {
        return {
          status: 'error',
          message: `Bucket ${this.bucket.name} does not exist or is not accessible`,
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
        message: `GCS health check failed: ${(error as Error).message}`,
        latency: Date.now() - startTime,
      };
    }
  }
}
