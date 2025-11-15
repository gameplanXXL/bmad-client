import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BmadClient } from '@bmad/client';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize BMad Client
const bmadClient = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env['ANTHROPIC_API_KEY']!,
  },
  storage: {
    type: 'memory', // Use 'gcs' in production
  },
  logLevel: 'info',
});

// Wait for client initialization
await bmadClient.waitForInit();
console.log('✓ BMad Client initialized');

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /health
 * Check API health
 */
app.get('/health', async (_req, res) => {
  try {
    const health = await bmadClient.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /diagnostics
 * Get system diagnostics
 */
app.get('/diagnostics', async (_req, res) => {
  try {
    const diagnostics = await bmadClient.getDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /sessions
 * Create a new agent session
 *
 * Body:
 * {
 *   "agentId": "pm",
 *   "command": "create-prd",
 *   "autoSave": true
 * }
 */
app.post('/sessions', async (req, res) => {
  try {
    const { agentId, command, autoSave = true } = req.body;

    if (!agentId || !command) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, command',
      });
    }

    const session = await bmadClient.startAgent(agentId, command, {
      autoSave,
    });

    res.json({
      sessionId: session.id,
      agentId: session.agentId,
      command: session.command,
      status: session.getStatus(),
      message: 'Session created. Use POST /sessions/:id/execute to run it.',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /sessions/:id/execute
 * Execute a session
 *
 * This is a simplified version that doesn't handle interactive questions.
 * For production, use WebSockets or Server-Sent Events for real-time interaction.
 */
app.post('/sessions/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;

    // Recover session
    const session = await bmadClient.recoverSession(id);

    // Execute (non-interactive)
    const result = await session.execute();

    res.json({
      status: result.status,
      documents: result.documents.map((doc) => ({
        path: doc.path,
        length: doc.content.length,
        preview: doc.content.substring(0, 200) + '...',
      })),
      costs: {
        totalCost: result.costs.totalCost,
        inputTokens: result.costs.inputTokens,
        outputTokens: result.costs.outputTokens,
        apiCalls: result.costs.apiCalls,
      },
      duration: result.duration,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /sessions
 * List all sessions
 */
app.get('/sessions', async (req, res) => {
  try {
    const { agentId, limit = 20, offset = 0 } = req.query;

    const result = await bmadClient.listSessions({
      agentId: agentId as string | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /sessions/:id
 * Get session details
 */
app.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await bmadClient.recoverSession(id);

    res.json({
      sessionId: session.id,
      agentId: session.agentId,
      command: session.command,
      status: session.getStatus(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: `Session not found: ${req.params.id}`,
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /sessions/:id
 * Delete a session
 */
app.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await bmadClient.deleteSession(id);

    if (!deleted) {
      return res.status(404).json({
        error: `Session not found: ${id}`,
      });
    }

    res.json({
      message: `Session ${id} deleted successfully`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /agents/:agentId/run
 * Quick execution - create and run session in one step
 *
 * Body:
 * {
 *   "command": "create-prd"
 * }
 */
app.post('/agents/:agentId/run', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        error: 'Missing required field: command',
      });
    }

    const session = await bmadClient.startAgent(agentId, command, {
      autoSave: true,
    });

    const result = await session.execute();

    res.json({
      status: result.status,
      documents: result.documents.map((doc) => ({
        path: doc.path,
        content: doc.content,
      })),
      costs: {
        totalCost: result.costs.totalCost,
        inputTokens: result.costs.inputTokens,
        outputTokens: result.costs.outputTokens,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(port, () => {
  console.log(`\n🚀 BMad API Server running on http://localhost:${port}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health             - Check system health`);
  console.log(`  GET  /diagnostics        - Get diagnostics`);
  console.log(`  POST /sessions           - Create new session`);
  console.log(`  GET  /sessions           - List all sessions`);
  console.log(`  GET  /sessions/:id       - Get session details`);
  console.log(`  POST /sessions/:id/execute - Execute session`);
  console.log(`  DELETE /sessions/:id     - Delete session`);
  console.log(`  POST /agents/:id/run     - Quick execution\n`);
});
