# BMad Client - Quickstart Guide

Get started with the BMad Client SDK in 5 minutes!

## Table of Contents

- [Installation](#installation)
- [First Steps](#first-steps)
- [Basic Agent Execution](#basic-agent-execution)
- [Handling User Questions](#handling-user-questions)
- [Document Storage](#document-storage)
- [Session Recovery](#session-recovery)
- [Cost Tracking](#cost-tracking)
- [Health Monitoring](#health-monitoring)
- [Next Steps](#next-steps)

## Installation

```bash
npm install @bmad/client
```

**Requirements:**
- Node.js 18+
- TypeScript 5.3+ (optional but recommended)
- Anthropic API Key

## First Steps

### 1. Set up your environment

Create a `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Initialize the Client

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4', // Optional, defaults to claude-sonnet-4
  },
  logLevel: 'info', // 'error' | 'warn' | 'info' | 'debug'
});

// Wait for initialization (loads templates)
await client.waitForInit();

console.log('BMad Client ready!');
```

## Basic Agent Execution

### Simple One-Shot Execution

```typescript
// Start a Product Manager agent to create a PRD
const session = await client.startAgent('pm', 'create-prd');

// Execute the agent workflow
const result = await session.execute();

// Check results
console.log(`Status: ${result.status}`);
console.log(`Documents generated: ${result.documents.length}`);
console.log(`Cost: $${result.costs.totalCost.toFixed(4)}`);

// Access generated documents
result.documents.forEach((doc) => {
  console.log(`\n${doc.path}:`);
  console.log(doc.content);
});
```

### Available Core Agents

- `pm` - Product Manager (create PRDs, requirements)
- `architect` - System Architect (design architecture)
- `dev` - Developer (implement features)
- `qa` - QA Engineer (test strategies)
- `ux-expert` - UX Expert (user experience design)
- `po` - Product Owner (user stories, sprint planning)
- `sm` - Scrum Master (agile processes)
- `analyst` - Business Analyst (requirements analysis)

## Handling User Questions

Agents may pause to ask questions. Handle them with events:

```typescript
const session = await client.startAgent('pm', 'create-prd');

// Listen for questions
session.on('question', ({ question, context }) => {
  console.log(`\nAgent asks: ${question}`);

  // Get answer from user (stdin, UI, etc.)
  const answer = await getUserInput();

  // Resume execution with answer
  session.answer(answer);
});

// Listen for progress
session.on('message', ({ role, content }) => {
  if (role === 'assistant') {
    console.log(`Agent: ${content}`);
  }
});

// Execute
const result = await session.execute();
```

## Document Storage

### In-Memory Storage (Development)

```typescript
const client = new BmadClient({
  provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
  storage: {
    type: 'memory', // Documents stored in memory
  },
});
```

### Google Cloud Storage (Production)

```typescript
const client = new BmadClient({
  provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
  storage: {
    type: 'gcs',
    projectId: 'my-project',
    bucketName: 'bmad-documents',
    keyFilename: './service-account.json', // Or use ADC
    prefix: 'sessions/', // Optional prefix for organization
  },
});
```

### Loading Previous Documents

```typescript
// Load documents from previous session
const session = await client.startAgent('architect', 'update-architecture');

// Option 1: Load specific document
await session.loadDocument('/docs/prd.md');

// Option 2: Load all documents from previous session
await session.loadSessionDocuments('sess_123_abc');

// Execute with loaded context
const result = await session.execute();
```

## Session Recovery

Resume crashed or interrupted sessions:

```typescript
// Auto-save session state after each API call
const session = await client.startAgent('pm', 'create-prd', {
  autoSave: true, // Enable auto-save
});

// ... execution happens ...
// (app crashes or user closes browser)

// Later: Recover the session
const recoveredSession = await client.recoverSession('sess_123_abc');

// Check status
console.log(`Session status: ${recoveredSession.getStatus()}`);

// If paused for question, answer it
if (recoveredSession.getStatus() === 'paused') {
  recoveredSession.answer('Continue with design A');
}

// Continue execution
const result = await recoveredSession.execute();
```

### Browse Saved Sessions

```typescript
// List all sessions
const result = await client.listSessions();

console.log(`Found ${result.total} sessions`);

result.sessions.forEach((session) => {
  console.log(`${session.sessionId}: ${session.agentId} - ${session.command}`);
  console.log(`  Status: ${session.status}`);
  console.log(`  Cost: $${session.totalCost.toFixed(4)}`);
  console.log(`  Documents: ${session.documentCount}`);
});

// Filter by agent
const pmSessions = await client.listSessions({
  agentId: 'pm',
  limit: 10,
});

// Filter by date range
const recentSessions = await client.listSessions({
  startDate: new Date('2025-01-01'),
  endDate: new Date(),
});
```

## Cost Tracking

### Set Cost Limits

```typescript
const client = new BmadClient({
  provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
  costLimit: 5.00, // Stop at $5.00
});
```

### Monitor Costs in Real-Time

```typescript
const session = await client.startAgent('pm', 'create-prd');

// Listen for cost updates
session.on('cost', (costs) => {
  console.log(`Tokens: ${costs.totalInputTokens} in, ${costs.totalOutputTokens} out`);
  console.log(`Cost: $${costs.totalCost.toFixed(4)}`);
  console.log(`API Calls: ${costs.apiCallCount}`);
});

// Warning when approaching limit
session.on('cost-warning', ({ current, limit, percentage }) => {
  console.warn(`⚠️ Cost warning: $${current.toFixed(4)} / $${limit.toFixed(2)} (${percentage}%)`);
});

const result = await session.execute();
```

### Get Cost Breakdown

```typescript
const result = await session.execute();

console.log('Cost Breakdown:');
console.log(`  Input tokens: ${result.costs.totalInputTokens}`);
console.log(`  Output tokens: ${result.costs.totalOutputTokens}`);
console.log(`  Total cost: $${result.costs.totalCost.toFixed(4)}`);
console.log(`  API calls: ${result.costs.apiCallCount}`);

// Child session costs (from invoke_agent tool)
if (result.costs.childSessionCosts.length > 0) {
  console.log('\nChild Sessions:');
  result.costs.childSessionCosts.forEach((child) => {
    console.log(`  ${child.agentId}: $${child.cost.toFixed(4)}`);
  });
}
```

## Health Monitoring

### Check System Health

```typescript
const health = await client.healthCheck();

if (!health.healthy) {
  console.error('Client unhealthy!');
  health.issues.forEach((issue) => console.error(`  - ${issue}`));
}

// Check individual components
console.log('Provider:', health.provider.healthy ? '✓' : '✗');
console.log('Storage:', health.storage.healthy ? '✓' : '✗');
console.log('Templates:', health.templates.healthy ? '✓' : '✗', `(${health.templates.count} loaded)`);
```

### Get Diagnostic Information

```typescript
const diagnostics = await client.getDiagnostics();

console.log('BMad Client Diagnostics');
console.log('======================');
console.log(`Version: ${diagnostics.version}`);
console.log(`Provider: ${diagnostics.config.provider}`);
console.log(`Storage: ${diagnostics.config.storage}`);
console.log(`Templates: ${diagnostics.templates.count} loaded`);

if (diagnostics.storage) {
  console.log(`Sessions: ${diagnostics.storage.sessionCount || 0} saved`);
}

console.log(`Node: ${diagnostics.system.nodeVersion}`);
console.log(`Memory: ${diagnostics.system.memory.used}MB / ${diagnostics.system.memory.total}MB`);
```

## Conversational Sessions (REPL Mode)

For interactive, multi-turn conversations:

```typescript
const session = client.createConversationalSession('pm', {
  systemPrompt: 'You are a helpful product manager.',
});

// Send messages
await session.sendMessage('Help me create a PRD for a chat app');

// Access conversation history
session.on('message', ({ role, content }) => {
  console.log(`${role}: ${content}`);
});

// Continue conversation
await session.sendMessage('Make it focus on real-time features');
await session.sendMessage('Add cost estimates');

// End session
await session.end();
```

## Next Steps

### Learn More

- [API Reference](./API.md) - Comprehensive API documentation
- [Feature Guides](./guides/) - Deep dives into specific features
  - [Session Management](./guides/sessions.md)
  - [Storage Adapters](./guides/storage.md)
  - [Cost Tracking](./guides/cost-tracking.md)
  - [Expansion Packs](./guides/expansion-packs.md)
- [Examples](../packages/examples/) - Complete example applications

### Example Applications

- [Express API](../packages/examples/express-api/) - RESTful API server
- [Next.js Route](../packages/examples/nextjs-route/) - Server-side route handler
- [Standalone Script](../packages/examples/standalone-script/) - Simple CLI script

### Advanced Topics

- **Custom Providers** - Integrate other LLM providers (OpenAI, etc.)
- **Custom Storage** - Implement your own storage adapter
- **Expansion Packs** - Load additional agents (Expert Author, Competency Assessor)
- **MCP Integration** - Use Model Context Protocol servers
- **Template Customization** - Create custom document templates

### Get Help

- GitHub Issues: [bmad-client/issues](https://github.com/bmad/bmad-client/issues)
- Documentation: [docs.bmad.dev](https://docs.bmad.dev)
- Community: [Discord](https://discord.gg/bmad)

---

**Ready to build with BMad?** Check out the [examples](../packages/examples/) for complete working code!
