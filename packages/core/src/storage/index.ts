/**
 * Storage System - Document persistence and retrieval
 *
 * Provides abstract storage interface with multiple implementations:
 * - InMemoryStorageAdapter - For testing and development
 * - GoogleCloudStorageAdapter - For production (Google Cloud Storage)
 * - Custom adapters via StorageAdapter interface
 *
 * Features:
 * - Document persistence with metadata
 * - Query and filtering
 * - Signed URLs (GCS)
 * - Batch operations
 * - Session-based organization
 */

export {
  type StorageAdapter,
  type StorageConfig,
  type StorageMetadata,
  type StorageResult,
  type StorageQueryOptions,
  type StorageListResult,
  type SessionListResult,
  StorageNotFoundError,
  StorageError,
} from './types.js';

export { InMemoryStorageAdapter } from './memory-adapter.js';

export { GoogleCloudStorageAdapter, type GCSConfig } from './gcs-adapter.js';
