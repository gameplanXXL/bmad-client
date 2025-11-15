# BMad Express API Example

A complete Express.js REST API using the BMad Client SDK.

## Features

- ✅ RESTful API endpoints for agent sessions
- ✅ Session management (create, execute, list, delete)
- ✅ Health check and diagnostics
- ✅ Cost tracking
- ✅ Auto-save sessions
- ✅ CORS enabled
- ✅ TypeScript

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

### 3. Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

## API Endpoints

### Health & Diagnostics

#### GET /health

Check system health.

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "healthy": true,
  "provider": { "healthy": true },
  "storage": { "healthy": true },
  "templates": { "healthy": true, "count": 10 },
  "timestamp": 1704672000000,
  "issues": []
}
```

#### GET /diagnostics

Get system diagnostics.

```bash
curl http://localhost:3000/diagnostics
```

### Session Management

#### POST /sessions

Create a new agent session.

```bash
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "pm",
    "command": "create-prd",
    "autoSave": true
  }'
```

Response:

```json
{
  "sessionId": "sess_123_abc",
  "agentId": "pm",
  "command": "create-prd",
  "status": "pending",
  "message": "Session created. Use POST /sessions/:id/execute to run it."
}
```

#### POST /sessions/:id/execute

Execute a session.

```bash
curl -X POST http://localhost:3000/sessions/sess_123_abc/execute
```

Response:

```json
{
  "sessionId": "sess_123_abc",
  "status": "completed",
  "documents": [
    {
      "path": "/docs/prd.md",
      "length": 5432,
      "preview": "# Product Requirements Document\n\n## Overview..."
    }
  ],
  "costs": {
    "totalCost": 0.1234,
    "inputTokens": 1500,
    "outputTokens": 2500,
    "apiCalls": 3
  },
  "duration": 12345
}
```

#### GET /sessions

List all sessions.

```bash
# List all
curl http://localhost:3000/sessions

# Filter by agent
curl http://localhost:3000/sessions?agentId=pm

# Pagination
curl http://localhost:3000/sessions?limit=10&offset=0
```

Response:

```json
{
  "sessions": [
    {
      "sessionId": "sess_123_abc",
      "agentId": "pm",
      "command": "create-prd",
      "status": "completed",
      "createdAt": 1704672000000,
      "completedAt": 1704672123000,
      "documentCount": 1,
      "totalCost": 0.1234
    }
  ],
  "total": 1,
  "hasMore": false
}
```

#### GET /sessions/:id

Get session details.

```bash
curl http://localhost:3000/sessions/sess_123_abc
```

#### DELETE /sessions/:id

Delete a session.

```bash
curl -X DELETE http://localhost:3000/sessions/sess_123_abc
```

### Quick Execution

#### POST /agents/:agentId/run

Create and execute a session in one step.

```bash
curl -X POST http://localhost:3000/agents/pm/run \
  -H "Content-Type: application/json" \
  -d '{ "command": "create-prd" }'
```

Response includes full documents:

```json
{
  "sessionId": "sess_456_def",
  "status": "completed",
  "documents": [
    {
      "path": "/docs/prd.md",
      "content": "# Product Requirements Document\n\n..."
    }
  ],
  "costs": {
    "totalCost": 0.1234,
    "inputTokens": 1500,
    "outputTokens": 2500
  }
}
```

## Available Agents

- `pm` - Product Manager
- `architect` - System Architect
- `dev` - Developer
- `qa` - QA Engineer
- `ux-expert` - UX Expert
- `po` - Product Owner
- `sm` - Scrum Master
- `analyst` - Business Analyst

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message here"
}
```

Status codes:

- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found (session doesn't exist)
- `500` - Internal Server Error

## Production Deployment

### Use GCS Storage

Update `src/server.ts`:

```typescript
const bmadClient = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  storage: {
    type: 'gcs',
    projectId: process.env.GCP_PROJECT_ID!,
    bucketName: process.env.GCS_BUCKET_NAME!,
    keyFilename: process.env.GCS_KEY_FILE,
  },
});
```

### Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
GCP_PROJECT_ID=my-project
GCS_BUCKET_NAME=bmad-documents
GCS_KEY_FILE=./service-account.json
```

### Build for Production

```bash
npm run build
npm start
```

## Advanced Features

### WebSocket Support (TODO)

For interactive sessions with real-time question handling:

```typescript
import { Server } from 'socket.io';

const io = new Server(server);

io.on('connection', (socket) => {
  socket.on('start-session', async ({ agentId, command }) => {
    const session = await bmadClient.startAgent(agentId, command);

    session.on('question', ({ question }) => {
      socket.emit('question', { question });
    });

    socket.on('answer', (answer) => {
      session.answer(answer);
    });

    const result = await session.execute();
    socket.emit('result', result);
  });
});
```

### Rate Limiting

Use `express-rate-limit`:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use('/sessions', limiter);
```

### Authentication

Use JWT or API keys:

```typescript
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use(authenticateApiKey);
```

## Next Steps

- Add WebSocket support for interactive sessions
- Implement rate limiting
- Add authentication
- Set up monitoring (Datadog, New Relic, etc.)
- Deploy to cloud (Google Cloud Run, AWS Lambda, etc.)

## License

MIT
