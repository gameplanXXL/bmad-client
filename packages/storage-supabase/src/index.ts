/**
 * @bmad/storage-supabase
 *
 * Supabase Storage adapter for BMad Client Library
 *
 * @example
 * ```typescript
 * import { SupabaseStorageAdapter } from '@bmad/storage-supabase';
 *
 * const storage = new SupabaseStorageAdapter({
 *   supabaseUrl: 'https://your-project.supabase.co',
 *   supabaseKey: 'your-service-role-key',
 *   bucketName: 'bmad-documents',
 *   autoCreateBucket: true
 * });
 *
 * await storage.initialize();
 * ```
 */

export { SupabaseStorageAdapter, SupabaseStorageError } from './adapter.js';
export type { SupabaseStorageAdapterConfig } from './adapter.js';
