/**
 * Example: Conversational Session via HTTP API
 *
 * This example demonstrates how to integrate ConversationalSession with
 * an HTTP API (Express), solving the timeout problem for long-running
 * LLM operations.
 *
 * Architecture:
 * - POST /conversations - Start conversation, return conversation ID immediately
 * - POST /conversations/:id/messages - Send message, return immediately
 * - GET /conversations/:id - Poll status (returns immediately with current state)
 * - POST /conversations/:id/answers - Answer agent questions
 * - POST /conversations/:id/end - End conversation
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx packages/examples/conversational-http-api.ts
 *
 *   Then in another terminal:
 *   curl -X POST http://localhost:3000/conversations \
 *     -H "Content-Type: application/json" \
 *     -d '{"agentId": "pm", "message": "Create a PRD for todo app"}'
 */

import express from 'express';
import { BmadClient, ConversationalSession } from '../core/src/index.js';

const app = express();
app.use(express.json());

// In-memory conversation store (use Redis/DynamoDB in production)
const conversations = new Map<string, ConversationalSession>();

// Initialize BMad client
const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514',
  },
  logLevel: 'info',
});

/**
 * Start a new conversation
 * Returns immediately with conversation ID
 */
app.post('/conversations', async (req, res) => {
  try {
    const { agentId, message, costLimit } = req.body;

    if (!agentId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, message',
      });
    }

    // Create conversation
    const conversation = await client.startConversation(agentId, {
      costLimit: costLimit || 5.0,
    });

    // Store conversation
    conversations.set(conversation.id, conversation);

    // Setup event listeners
    conversation.on('error', (error) => {
      console.error(`[${conversation.id}] Error:`, error.message);
    });

    // Send first message in background (don't await!)
    conversation.send(message).catch((err) => {
      console.error(`[${conversation.id}] Send failed:`, err.message);
    });

    // Return immediately
    res.status(202).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      status: 'processing',
      message: 'Conversation started, agent is processing',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send a message to existing conversation
 * Returns immediately, processing happens in background
 */
app.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    // Check if agent is still processing
    if (!conversation.isIdle()) {
      return res.status(409).json({
        error: 'Agent is still processing previous message',
        status: 'processing',
      });
    }

    // Send message in background (don't await!)
    conversation.send(message).catch((err) => {
      console.error(`[${id}] Send failed:`, err.message);
    });

    res.status(202).json({
      conversationId: id,
      status: 'processing',
      message: 'Message received, agent is processing',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Poll conversation status
 * Returns immediately with current state
 */
app.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isIdle = conversation.isIdle();
    const history = conversation.getHistory();
    const documents = conversation.getDocuments();
    const costs = conversation.getCosts();

    res.json({
      conversationId: id,
      agentId: conversation.agentId,
      status: isIdle ? 'idle' : 'processing',
      isIdle,
      turns: history.length,
      latestTurn: history.length > 0 ? history[history.length - 1] : null,
      documents: documents.map((d) => ({
        path: d.path,
        size: d.content.length,
      })),
      costs: {
        total: costs.totalCost,
        currency: costs.currency,
        inputTokens: costs.inputTokens,
        outputTokens: costs.outputTokens,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get conversation history
 */
app.get('/conversations/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const history = conversation.getHistory();

    res.json({
      conversationId: id,
      turns: history,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get documents created in conversation
 */
app.get('/conversations/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const documents = conversation.getDocuments();

    res.json({
      conversationId: id,
      documents,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Answer agent question
 */
app.post('/conversations/:id/answers', async (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!answer) {
      return res.status(400).json({ error: 'Missing required field: answer' });
    }

    await conversation.answer(answer);

    res.json({
      conversationId: id,
      status: 'answered',
      message: 'Answer provided, agent resuming',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * End conversation
 */
app.post('/conversations/:id/end', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await conversation.end();

    // Remove from store
    conversations.delete(id);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all active conversations
 */
app.get('/conversations', (req, res) => {
  const conversationList = Array.from(conversations.entries()).map(([id, conv]) => ({
    conversationId: id,
    agentId: conv.agentId,
    isIdle: conv.isIdle(),
    turns: conv.getHistory().length,
  }));

  res.json({ conversations: conversationList });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    conversations: conversations.size,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 BMad Conversational API Server running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   /conversations                  - Start conversation`);
  console.log(`  POST   /conversations/:id/messages     - Send message`);
  console.log(`  GET    /conversations/:id              - Poll status`);
  console.log(`  GET    /conversations/:id/history      - Get history`);
  console.log(`  GET    /conversations/:id/documents    - Get documents`);
  console.log(`  POST   /conversations/:id/answers      - Answer question`);
  console.log(`  POST   /conversations/:id/end          - End conversation`);
  console.log(`  GET    /conversations                  - List conversations`);
  console.log(`\nExample curl commands:`);
  console.log(`  # Start conversation`);
  console.log(`  curl -X POST http://localhost:${PORT}/conversations \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"agentId": "pm", "message": "Create a PRD for todo app"}'`);
  console.log(`\n  # Poll status (repeat until status=idle)`);
  console.log(`  curl http://localhost:${PORT}/conversations/{id}`);
  console.log(`\n  # Send follow-up message`);
  console.log(`  curl -X POST http://localhost:${PORT}/conversations/{id}/messages \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"message": "Update target users section"}'`);
  console.log(`\n  # End conversation`);
  console.log(`  curl -X POST http://localhost:${PORT}/conversations/{id}/end`);
  console.log();
});
