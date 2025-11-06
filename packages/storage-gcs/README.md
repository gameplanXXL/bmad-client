# @bmad/storage-gcs

Google Cloud Storage adapter for BMad Client Library.

## Installation

```bash
npm install @bmad/storage-gcs @bmad/client
```

## Quick Start

### Using Application Default Credentials (Recommended for Production)

```typescript
import { BmadClient } from '@bmad/client';
import { GoogleCloudStorageAdapter } from '@bmad/storage-gcs';

const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents'
});

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!
  },
  storage: { type: 'custom', adapter: storage }
});
```

### Using Service Account JSON

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents',
  credentials: {
    client_email: 'service@project.iam.gserviceaccount.com',
    private_key: process.env.GCS_PRIVATE_KEY!,
    project_id: 'my-project'
  }
});
```

### Using Key File

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents',
  keyFilename: '/path/to/service-account-key.json'
});
```

## Configuration Options

### GCSAdapterConfig

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `bucketName` | `string` | ✅ | GCS bucket name |
| `credentials` | `object` | ❌ | Service account credentials (client_email, private_key, project_id) |
| `keyFilename` | `string` | ❌ | Path to service account key file |
| `projectId` | `string` | ❌ | GCP project ID (inferred from credentials if not provided) |
| `basePath` | `string` | ❌ | Base path prefix for all documents (e.g., 'bmad-sessions/') |
| `apiEndpoint` | `string` | ❌ | Custom API endpoint (for emulator testing) |

## Authentication Methods

### 1. Application Default Credentials (ADC) - Recommended

Best for production deployments on GCP (Cloud Run, Cloud Functions, GKE).

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents'
});
```

**Setup:**
```bash
# For local development
gcloud auth application-default login

# For production (automatic on GCP services)
# Use workload identity or service account attached to the compute resource
```

### 2. Service Account JSON

Best for serverless platforms outside GCP (AWS Lambda, Vercel, etc.).

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents',
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL!,
    private_key: process.env.GCS_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    project_id: process.env.GCP_PROJECT_ID!
  }
});
```

**Setup:**
```bash
# Create service account
gcloud iam service-accounts create bmad-storage \
  --display-name="BMad Storage Service Account"

# Grant storage permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:bmad-storage@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create key (store securely!)
gcloud iam service-accounts keys create key.json \
  --iam-account=bmad-storage@PROJECT_ID.iam.gserviceaccount.com
```

### 3. Key File Path

Best for local development and testing.

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents',
  keyFilename: './service-account-key.json'
});
```

## Bucket Setup

### Create Bucket

```bash
# Create bucket
gsutil mb -p PROJECT_ID -c STANDARD -l us-central1 gs://my-bmad-documents

# Set lifecycle (optional - auto-delete old documents after 90 days)
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 90}
    }]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://my-bmad-documents
```

### Required Permissions

The service account needs these IAM roles:

- `roles/storage.objectCreator` - Create new documents
- `roles/storage.objectViewer` - Read documents
- `roles/storage.objectAdmin` - Full access (create, read, update, delete)

## Usage Examples

### Complete Session Workflow

```typescript
import { BmadClient } from '@bmad/client';
import { GoogleCloudStorageAdapter } from '@bmad/storage-gcs';

// Initialize storage
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'my-bmad-documents',
  basePath: 'sessions' // All docs stored under sessions/
});

// Initialize client
const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!
  },
  storage: { type: 'custom', adapter: storage }
});

// Run session - documents auto-saved to GCS
const session = await client.startAgent('pm', 'create-prd');
const result = await session.execute();

console.log(`Saved ${result.documents.length} documents to GCS`);
// Documents are now in: gs://my-bmad-documents/sessions/docs/prd.md
```

### Manual Document Operations

```typescript
// Save document manually
await storage.save(
  { path: '/docs/architecture.md', content: '# Architecture\n\n...' },
  {
    sessionId: 'sess_123',
    agentId: 'architect',
    command: 'create-architecture',
    timestamp: Date.now()
  }
);

// Load document
const doc = await storage.load('/docs/architecture.md');
console.log(doc.content);

// Check if exists
if (await storage.exists('/docs/prd.md')) {
  console.log('PRD exists!');
}

// Delete document
await storage.delete('/docs/old-doc.md');
```

### List Documents

```typescript
// List all documents
const result = await storage.list();
console.log(`Found ${result.documents.length} documents`);

// List by session ID
const sessionDocs = await storage.list({
  sessionId: 'sess_123'
});

// List by agent ID
const pmDocs = await storage.list({
  agentId: 'pm'
});

// Paginated listing
const page1 = await storage.list({ limit: 10 });
if (page1.hasMore) {
  const page2 = await storage.list({
    limit: 10,
    nextToken: page1.nextToken
  });
}
```

### Health Check

```typescript
const health = await storage.healthCheck();

if (health.status === 'ok') {
  console.log(`GCS connection OK (${health.latency}ms)`);
} else {
  console.error(`GCS error: ${health.message}`);
}
```

## Error Handling

```typescript
import { GCSStorageError } from '@bmad/storage-gcs';

try {
  await storage.load('/docs/missing.md');
} catch (error) {
  if (error instanceof GCSStorageError) {
    switch (error.code) {
      case 'NOT_FOUND':
        console.log('Document does not exist');
        break;
      case 'PERMISSION_DENIED':
        console.error('Insufficient permissions');
        break;
      default:
        console.error(`GCS error: ${error.message}`);
    }
  }
}
```

## Testing

### With GCS Emulator

```typescript
const storage = new GoogleCloudStorageAdapter({
  bucketName: 'test-bucket',
  apiEndpoint: 'http://localhost:4443',
  projectId: 'test-project'
});
```

**Start Emulator:**
```bash
# Using Docker
docker run -d -p 4443:4443 fsouza/fake-gcs-server \
  -scheme http \
  -port 4443

# Create test bucket
curl -X POST http://localhost:4443/storage/v1/b \
  -H "Content-Type: application/json" \
  -d '{"name":"test-bucket"}'
```

## Best Practices

1. **Use Base Paths**: Organize documents with `basePath` option
   ```typescript
   basePath: 'bmad-sessions' // gs://bucket/bmad-sessions/docs/prd.md
   ```

2. **Environment Variables**: Store credentials securely
   ```bash
   # .env
   GCS_BUCKET_NAME=my-bmad-documents
   GCS_CLIENT_EMAIL=service@project.iam.gserviceaccount.com
   GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
   GCP_PROJECT_ID=my-project
   ```

3. **Lifecycle Policies**: Auto-delete old documents to save costs
   ```bash
   gsutil lifecycle set lifecycle.json gs://my-bucket
   ```

4. **Health Checks**: Verify connectivity before critical operations
   ```typescript
   const health = await storage.healthCheck();
   if (health.status !== 'ok') {
     throw new Error('GCS not available');
   }
   ```

5. **Error Recovery**: Handle GCS errors gracefully
   ```typescript
   session.on('storage-error', (error) => {
     logger.error('Storage failed, documents remain in VFS', error);
     // Documents still accessible via session.getDocuments()
   });
   ```

## Pricing

GCS charges for:
- **Storage**: ~$0.020/GB/month (Standard storage, us-central1)
- **Operations**: $0.004 per 10,000 writes, $0.0004 per 10,000 reads
- **Network**: Egress charges may apply

**Example Cost** (1000 sessions/month, 5KB/doc, 2 docs/session):
- Storage: ~10GB = **$0.20/month**
- Operations: 2000 writes + 500 reads = **$0.80/month**
- **Total: ~$1/month**

## Troubleshooting

### "Bucket not found" Error

```bash
# Verify bucket exists
gsutil ls gs://my-bmad-documents

# Check permissions
gcloud storage buckets get-iam-policy gs://my-bmad-documents
```

### "Permission denied" Error

```bash
# Grant object admin role
gsutil iam ch \
  serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com:objectAdmin \
  gs://my-bmad-documents
```

### "Invalid credentials" Error

```typescript
// Ensure private key has proper newlines
const privateKey = process.env.GCS_PRIVATE_KEY!.replace(/\\n/g, '\n');
```

## License

MIT

## Support

- **Issues**: https://github.com/bmad/bmad-client/issues
- **Docs**: https://docs.bmad.dev/storage/gcs
- **GCS Docs**: https://cloud.google.com/storage/docs
