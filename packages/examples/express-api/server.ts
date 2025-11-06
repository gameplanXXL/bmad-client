/**
 * BMad Client - Express API Example
 *
 * This example demonstrates:
 * - Integration with Express.js
 * - RESTful API endpoints for agent sessions
 * - Session management with pause/resume
 * - Cost tracking and limits
 * - Document storage with GCS
 * - Error handling for production
 *
 * Endpoints:
 *   POST /api/sessions         - Create new agent session
 *   GET  /api/sessions/:id     - Get session status
 *   POST /api/sessions/:id/answer - Answer agent question
 *   GET  /api/sessions/:id/documents - Get generated documents
 *   GET  /api/sessions         - List all sessions
 *   DELETE /api/sessions/:id   - Delete session
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx server.ts
 *   curl -X POST http://localhost:3000/api/sessions \
 *     -H "Content-Type: application/json" \
 *     -d '{"agentId":"pm","command":"create-prd"}'
 */

import express, { Request, Response, NextFunction } from 'express';
import { BmadClient, BmadSession } from '@bmad/client';

// Configuration
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

// Initialize Express
const app = express();
app.use(express.json());

// Initialize BMad Client
const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: API_KEY,
    model: 'claude-sonnet-4-20250514',
  },
  costLimit: 5.0, // Max $5.00 per session
  logLevel: 'info',
  storage: {
    type: 'memory', // Use in-memory storage for this example
  },
});

// In-memory session storage (in production, use Redis or similar)
const activeSessions = new Map<string, BmadSession>();

// Wait for client initialization
let clientReady = false;
client.waitForInit().then(() => {
  clientReady = true;
  console.log('✅ BMad Client initialized');
});

// Middleware: Check client ready
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!clientReady) {
    res.status(503).json({ error: 'Service initializing, please wait' });
    return;
  }
  next();
});

/**
 * POST /api/sessions
 * Create a new agent session
 *
 * Body:
 *   {
 *     "agentId": "pm",
 *     "command": "create-prd",
 *     "costLimit": 1.0,
 *     "context": { "key": "value" }
 *   }
 */
app.post('/api/sessions', async (req: Request, res: Response) => {
  try {
    const { agentId, command, costLimit, context } = req.body;

    // Validation
    if (!agentId || !command) {
      res.status(400).json({
        error: 'Missing required fields: agentId, command',
      });
      return;
    }

    // Create session
    const session = await client.startAgent(agentId, command, {
      costLimit: costLimit || 1.0,
      context,
      autoSave: true, // Enable auto-save for production
    });

    // Store session
    activeSessions.set(session.id, session);

    // Set up event handlers
    session.on('question', (question) => {
      console.log(`Session ${session.id} paused for question:`, question.question);
    });

    session.on('completed', (result) => {
      console.log(`Session ${session.id} completed`);
      // Session can be cleaned up after some time
      setTimeout(() => {
        activeSessions.delete(session.id);
      }, 60000); // Keep for 1 minute after completion
    });

    session.on('failed', (error) => {
      console.error(`Session ${session.id} failed:`, error.message);
      activeSessions.delete(session.id);
    });

    // Start execution in background
    session.execute().catch((error) => {
      console.error(`Session ${session.id} execution error:`, error);
    });

    res.status(201).json({
      sessionId: session.id,
      agentId: session.agentId,
      command: session.command,
      status: session.getStatus(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sessions/:id
 * Get session status and details
 */
app.get('/api/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = activeSessions.get(id);

    if (!session) {
      // Try to recover from storage
      try {
        const recovered = await client.recoverSession(id);
        activeSessions.set(id, recovered);

        res.json({
          sessionId: recovered.id,
          agentId: recovered.agentId,
          command: recovered.command,
          status: recovered.getStatus(),
          recovered: true,
        });
        return;
      } catch (error) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
    }

    const state = session.serialize();
    const pendingQuestion = session.getPendingQuestion();

    res.json({
      sessionId: session.id,
      agentId: session.agentId,
      command: session.command,
      status: session.getStatus(),
      cost: {
        total: state.totalCost,
        inputTokens: state.totalInputTokens,
        outputTokens: state.totalOutputTokens,
        apiCalls: state.apiCallCount,
      },
      pendingQuestion: pendingQuestion
        ? {
            question: pendingQuestion.question,
            context: pendingQuestion.context,
          }
        : null,
      documentCount: Object.keys(state.vfsFiles).length,
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/sessions/:id/answer
 * Answer a pending question
 *
 * Body:
 *   {
 *     "answer": "User's answer text"
 *   }
 */
app.post('/api/sessions/:id/answer', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer) {
      res.status(400).json({ error: 'Missing required field: answer' });
      return;
    }

    const session = activeSessions.get(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const status = session.getStatus();
    if (status !== 'paused') {
      res.status(400).json({
        error: `Session is not paused (current status: ${status})`,
      });
      return;
    }

    // Answer the question
    session.answer(answer);

    res.json({
      sessionId: session.id,
      status: 'answered',
      message: 'Answer submitted, session resuming',
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      error: 'Failed to answer question',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sessions/:id/documents
 * Get all documents generated by session
 */
app.get('/api/sessions/:id/documents', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = activeSessions.get(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = session.serialize();

    const documents = Object.entries(state.vfsFiles).map(([path, content]) => ({
      path,
      size: content.length,
      preview: content.substring(0, 200),
    }));

    res.json({
      sessionId: session.id,
      documentCount: documents.length,
      documents,
    });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({
      error: 'Failed to get documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sessions/:id/documents/:path
 * Get full content of a specific document
 */
app.get('/api/sessions/:id/documents/*', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const docPath = '/' + req.params[0]; // Full path after /documents/

    const session = activeSessions.get(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const state = session.serialize();
    const content = state.vfsFiles[docPath];

    if (!content) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Determine content type from extension
    const ext = docPath.split('.').pop()?.toLowerCase();
    const contentType = ext === 'json' ? 'application/json' : 'text/plain';

    res.type(contentType).send(content);
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({
      error: 'Failed to get document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sessions
 * List all saved sessions
 */
app.get('/api/sessions', async (req: Request, res: Response) => {
  try {
    const { agentId, limit, offset } = req.query;

    const result = await client.listSessions({
      agentId: agentId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete a session
 */
app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Remove from active sessions
    activeSessions.delete(id);

    // Delete from storage
    const deleted = await client.deleteSession(id);

    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      sessionId: id,
      deleted: true,
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    clientReady,
    activeSessions: activeSessions.size,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 BMad API Server running on http://localhost:${PORT}`);
  console.log(`📝 API Endpoints:`);
  console.log(`   POST   /api/sessions - Create new session`);
  console.log(`   GET    /api/sessions - List all sessions`);
  console.log(`   GET    /api/sessions/:id - Get session status`);
  console.log(`   POST   /api/sessions/:id/answer - Answer question`);
  console.log(`   GET    /api/sessions/:id/documents - Get documents`);
  console.log(`   DELETE /api/sessions/:id - Delete session`);
  console.log(`   GET    /health - Health check`);
});
