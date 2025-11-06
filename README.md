# BMad Client Library

> **Node.js/TypeScript SDK** for integrating BMad-Method AI agent workflows into web and desktop applications.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-319%20passing-brightgreen.svg)](#)

## Features

- 🤖 **Multi-Agent Orchestration** - Execute specialized AI agents (PM, Architect, Developer, QA, etc.)
- 📝 **Template Processing** - Generate structured documents from YAML templates  
- 💾 **Document Storage** - Persist and load documents with Google Cloud Storage or in-memory
- 💰 **Cost Tracking** - Real-time token usage and cost monitoring with limits
- 🔄 **Conversational Sessions** - Multi-turn Claude Code-style interactions
- 🛠️ **Virtual Filesystem** - Isolated VFS for each session with tool execution
- 🔌 **Expansion Packs** - Extend functionality with BMad Expansion Packs

## Quick Start

### Installation

\`\`\`bash
npm install @bmad/client
\`\`\`

### Basic Usage

\`\`\`typescript
import { BmadClient } from '@bmad/client';

// Initialize client
const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  storage: {
    type: 'memory', // or 'gcs' for production
  },
});

// Start an agent session
const session = await client.startAgent('pm', 'create-prd');

// Handle questions during execution
session.on('question', async ({ question }) => {
  const answer = await promptUser(question);
  session.answer(answer);
});

// Execute and get results
const result = await session.execute();

console.log(\`Generated \${result.documents.length} documents\`);
console.log(\`Cost: $\${result.costs.totalCost.toFixed(4)}\`);

// Access generated documents
result.documents.forEach((doc) => {
  console.log(\`\${doc.path}:\`);
  console.log(doc.content);
});
\`\`\`

## Core Concepts

### Agents

BMad agents are specialized AI personas that execute specific workflows:

- **PM** (Product Manager) - Create PRDs, define requirements
- **Architect** - Design system architecture  
- **Developer** - Implement features
- **QA** - Design test strategies
- **UX Expert** - Design user experiences

### Sessions

Sessions represent a single agent execution. Documents are automatically saved to storage.

### Document Storage

\`\`\`typescript
// Load previously saved documents
const session = await client.startAgent('architect', 'update-architecture');
await session.loadDocument('/docs/prd.md');
await session.loadSessionDocuments('sess_123_abc');

// Execute with loaded context
const result = await session.execute();
\`\`\`

### Cost Tracking

\`\`\`typescript
const client = new BmadClient({
  provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
  costLimit: 1.00, // $1.00 limit
});
\`\`\`

## License

MIT

---

**Built with the BMAD-METHOD™**
