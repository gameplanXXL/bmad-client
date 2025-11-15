# @bmad/storage-supabase

Supabase Storage adapter for BMad Client Library.

## Overview

This package provides a Supabase Storage implementation of the `StorageAdapter` interface from `@bmad/client`. It enables persistent document storage for BMad sessions using Supabase Storage buckets.

## Features

- ✅ **Full StorageAdapter Implementation** - Compatible with BMad Client Library
- ✅ **Automatic Bucket Creation** - Optionally create buckets on initialization
- ✅ **Public & Private Buckets** - Support for both access modes
- ✅ **Row Level Security (RLS)** - Compatible with Supabase RLS policies
- ✅ **Signed URLs** - Temporary access links for private documents
- ✅ **Session State Persistence** - Save and restore complete session states
- ✅ **Metadata Support** - Store custom metadata with documents
- ✅ **Batch Operations** - Upload multiple documents efficiently

## Installation

```bash
pnpm add @bmad/storage-supabase @supabase/supabase-js
```

## Quick Start

### Server-Side Usage (Service Role Key)

```typescript
import { BmadClient } from '@bmad/client';
import { SupabaseStorageAdapter } from '@bmad/storage-supabase';

// Create storage adapter
const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role for full access
  bucketName: 'bmad-documents',
  autoCreateBucket: true,
  bucketConfig: {
    public: false, // Private bucket
  },
});

// Initialize storage
await storage.initialize();

// Create BMad client with Supabase storage
const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  storage, // Use Supabase storage
});
```

### Client-Side Usage (Anon Key with RLS)

```typescript
import { SupabaseStorageAdapter } from '@bmad/storage-supabase';

// Create storage adapter with anon key
const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Anon key for RLS
  bucketName: 'user-documents',
  basePath: `users/${userId}`, // User-specific folder
});

await storage.initialize();
```

## Configuration

### SupabaseStorageAdapterConfig

| Option             | Type                     | Required | Description                                          |
| ------------------ | ------------------------ | -------- | ---------------------------------------------------- |
| `supabaseUrl`      | `string`                 | ✅       | Supabase project URL                                 |
| `supabaseKey`      | `string`                 | ✅       | Service role key or anon key                         |
| `bucketName`       | `string`                 | ✅       | Storage bucket name                                  |
| `basePath`         | `string`                 | ❌       | Base path prefix for all documents                   |
| `autoCreateBucket` | `boolean`                | ❌       | Create bucket if it doesn't exist (default: `false`) |
| `bucketConfig`     | `object`                 | ❌       | Bucket configuration (see below)                     |
| `headers`          | `Record<string, string>` | ❌       | Custom headers for Supabase client                   |

### Bucket Configuration

```typescript
{
  bucketConfig: {
    public: false,                           // Public or private bucket
    allowedMimeTypes: ['text/markdown'],     // Allowed file types
    fileSizeLimit: 10 * 1024 * 1024,        // 10MB max file size
  }
}
```

## Usage Examples

### Save Document

```typescript
import type { Document, StorageMetadata } from '@bmad/client';

const document: Document = {
  path: '/docs/prd.md',
  content: '# Product Requirements Document\n\n...',
};

const metadata: StorageMetadata = {
  sessionId: 'session-123',
  agentId: 'pm',
  command: 'create-prd',
  timestamp: Date.now(),
  mimeType: 'text/markdown',
};

const result = await storage.save(document, metadata);

if (result.success) {
  console.log('Document saved:', result.path);
  console.log('Public URL:', result.url);
}
```

### Load Document

```typescript
const document = await storage.load('/docs/prd.md');
console.log('Content:', document.content);
```

### List Documents

```typescript
const result = await storage.list({
  sessionId: 'session-123',
  limit: 50,
});

result.documents.forEach((doc) => {
  console.log(`${doc.path} - ${new Date(doc.metadata.timestamp).toISOString()}`);
});
```

### Get Signed URL (Temporary Access)

```typescript
// Get URL valid for 1 hour
const url = await storage.getUrl('/docs/prd.md', 3600);

if (url) {
  console.log('Download URL:', url);
}
```

### Save Session State

```typescript
import type { SessionState } from '@bmad/client';

const sessionState: SessionState = {
  sessionId: 'session-123',
  agentId: 'pm',
  command: 'create-prd',
  status: 'completed',
  // ... other session data
};

const result = await storage.saveSessionState(sessionState);
console.log('Session saved:', result.success);
```

### Load Session State

```typescript
const sessionState = await storage.loadSessionState('session-123');
console.log('Session status:', sessionState.status);
console.log('Documents:', sessionState.documents?.length);
```

### List All Sessions

```typescript
const result = await storage.listSessions({
  limit: 20,
});

result.sessions.forEach((session) => {
  console.log(`${session.sessionId} - ${session.agentId} - ${session.status}`);
  console.log(`  Cost: $${session.totalCost.toFixed(2)}`);
  console.log(`  Documents: ${session.documentCount}`);
});
```

### Delete Document

```typescript
const deleted = await storage.delete('/docs/old-document.md');
console.log('Deleted:', deleted);
```

### Delete Session

```typescript
const deleted = await storage.deleteSession('session-123');
console.log('Session deleted:', deleted);
```

### Health Check

```typescript
const health = await storage.healthCheck();

if (health.status === 'ok') {
  console.log(`Storage healthy (${health.latency}ms)`);
} else {
  console.error('Storage error:', health.message);
}
```

## Bucket Setup

### Create Bucket via Supabase Dashboard

1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Name: `bmad-documents`
4. Public: `false` (recommended for privacy)
5. Click **Create Bucket**

### Create Bucket Programmatically

```typescript
const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  bucketName: 'bmad-documents',
  autoCreateBucket: true, // ✅ Automatically create bucket
  bucketConfig: {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024, // 50MB
  },
});

await storage.initialize();
```

## Row Level Security (RLS)

For user-specific storage with RLS, create policies in Supabase:

```sql
-- Allow users to read their own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

Then use the adapter with user-specific base path:

```typescript
// In Next.js API Route
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const {
  data: { user },
} = await supabase.auth.getUser();

const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  bucketName: 'user-documents',
  basePath: user.id, // User-specific folder
});
```

## Environment Variables

### Server-Side (.env)

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Storage Configuration
STORAGE_BUCKET_NAME=bmad-documents
```

### Client-Side (.env.local)

```bash
# Public Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Error Handling

The adapter throws `SupabaseStorageError` for all storage operations:

```typescript
import { SupabaseStorageError } from '@bmad/storage-supabase';

try {
  const document = await storage.load('/docs/not-found.md');
} catch (error) {
  if (error instanceof SupabaseStorageError) {
    console.error('Storage error:', error.message);
    console.error('Error code:', error.code);

    if (error.code === 'NOT_FOUND') {
      console.log('Document does not exist');
    }
  }
}
```

### Error Codes

| Code                  | Description                  |
| --------------------- | ---------------------------- |
| `INIT_ERROR`          | Failed to initialize storage |
| `BUCKET_NOT_FOUND`    | Bucket does not exist        |
| `BUCKET_CREATE_ERROR` | Failed to create bucket      |
| `NOT_FOUND`           | Document not found           |
| `LOAD_ERROR`          | Failed to load document      |
| `DELETE_ERROR`        | Failed to delete document    |
| `METADATA_ERROR`      | Failed to get metadata       |
| `LIST_ERROR`          | Failed to list documents     |
| `SESSION_NOT_FOUND`   | Session state not found      |

## Comparison with Google Cloud Storage

| Feature             | Supabase Storage      | Google Cloud Storage         |
| ------------------- | --------------------- | ---------------------------- |
| **Setup**           | ✅ Simple (URL + Key) | ⚠️ Complex (Service Account) |
| **Pricing**         | ✅ Free tier: 1GB     | ⚠️ Pay-as-you-go             |
| **Authentication**  | ✅ Built-in Auth      | ❌ IAM setup required        |
| **RLS Support**     | ✅ Yes                | ❌ No                        |
| **CDN**             | ✅ Automatic          | ✅ Available                 |
| **Signed URLs**     | ✅ Yes                | ✅ Yes                       |
| **Batch Upload**    | ⚠️ Parallel only      | ✅ Native API                |
| **Custom Metadata** | ⚠️ Limited            | ✅ Full support              |

## Performance Considerations

- **Batch Operations**: The adapter uses parallel uploads for batch operations since Supabase doesn't have a native batch API
- **Metadata**: Supabase list() doesn't return custom metadata, so some operations may require additional API calls
- **RLS Overhead**: Using RLS adds query overhead compared to service role key access
- **Connection Pooling**: Supabase client handles connection pooling automatically

## Troubleshooting

### Bucket doesn't exist

```typescript
Error: Bucket bmad-documents does not exist.
```

**Solution**: Set `autoCreateBucket: true` or create bucket manually in Supabase Dashboard.

### Authentication error

```typescript
Error: Invalid API key
```

**Solution**: Verify `supabaseKey` is correct. Use service role key for server-side, anon key for client-side.

### RLS policy blocks access

```typescript
Error: new row violates row-level security policy
```

**Solution**: Check RLS policies allow the operation. Use service role key to bypass RLS for testing.

### File size limit exceeded

```typescript
Error: File size exceeds limit
```

**Solution**: Increase `fileSizeLimit` in bucket configuration or reduce file size.

## Best Practices

1. **Use Service Role Key Server-Side**: For full access without RLS overhead
2. **Use Anon Key Client-Side**: With RLS policies for user-specific access
3. **Set Bucket to Private**: Unless you need public access
4. **Use Base Path**: Organize documents by user or session
5. **Enable Auto-Create**: For development environments
6. **Set File Size Limits**: Prevent abuse and control costs
7. **Use Signed URLs**: For temporary access to private files
8. **Monitor Bucket Size**: Supabase free tier has 1GB limit

## Migration from GCS

If migrating from Google Cloud Storage:

```typescript
// Before (GCS)
import { GoogleCloudStorageAdapter } from '@bmad/storage-gcs';

const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bucket',
  keyFilename: '/path/to/key.json',
});

// After (Supabase)
import { SupabaseStorageAdapter } from '@bmad/storage-supabase';

const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  bucketName: 'my-bucket',
  autoCreateBucket: true,
});
```

Both adapters implement the same `StorageAdapter` interface, so no code changes needed!

## License

MIT

## Support

For issues and questions:

- [GitHub Issues](https://github.com/bmad/bmad-client/issues)
- [Supabase Documentation](https://supabase.com/docs/guides/storage)
