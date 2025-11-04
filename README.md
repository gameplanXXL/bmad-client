# BMad Client Library

> SDK for executing BMad Method agents via LLM APIs

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚧 Work in Progress - Proof of Concept Phase

This project is currently in active development. See [docs/poc-plan.md](docs/poc-plan.md) for the roadmap.

## What is BMad Client?

BMad Client Library is a Node.js/TypeScript SDK that enables developers to integrate BMad-Method workflows into their applications. It provides:

- **Agent Orchestration** - Execute specialized AI agents (PM, Architect, Dev, etc.)
- **Tool Execution** - Agents can read/write files, run commands, search code
- **Session Management** - Pause/resume conversations, handle user questions
- **Cost Tracking** - Monitor LLM API costs in real-time
- **Type-Safe** - Full TypeScript support with comprehensive types

## Quick Start

### Installation

```bash
pnpm install
```

### Basic Usage

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});

const session = await client.startAgent('pm', '*help');

session.on('question', (q) => {
  console.log('Agent asks:', q.question);
  // Handle user input
  session.answer('My answer');
});

session.on('completed', (result) => {
  console.log('Documents created:', result.documents.length);
  console.log('Total cost:', result.costs.totalCost, 'USD');
});

await session.execute();
```

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Build packages
pnpm build

# Type check
pnpm typecheck
```

### Project Structure

```
bmad-client/
├── packages/
│   └── core/              # @bmad/client (main SDK)
├── docs/                  # Documentation
│   ├── architecture.md    # Architecture document
│   ├── poc-plan.md        # PoC roadmap
│   └── prd.md            # Product requirements
├── examples/              # Example applications (coming soon)
└── CLAUDE.md             # Agent documentation
```

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test client.test.ts
```

## Documentation

- [Architecture](docs/architecture.md) - Complete system architecture
- [PoC Plan](docs/poc-plan.md) - Development roadmap and phases
- [PRD](docs/prd.md) - Product requirements document
- [CLAUDE.md](CLAUDE.md) - Guide for AI agents working on this project

## Current Status

✅ Phase 1.1: Project Setup - **COMPLETE**
- [x] pnpm workspace configured
- [x] TypeScript with strict mode
- [x] Vitest testing framework
- [x] ESLint + Prettier
- [x] Basic package structure
- [x] First tests passing

🚧 Phase 1.2-1.7: SDK Core - **IN PROGRESS**
- [ ] System Prompt Generator
- [ ] Agent Loader
- [ ] Anthropic Provider
- [ ] Fallback Tool Executor
- [ ] Session with Tool Call Loop

See [docs/poc-plan.md](docs/poc-plan.md) for complete roadmap.

## License

MIT

## Contributing

This project is currently in early development. Contribution guidelines will be added soon.

---

**Built with the BMad Method™**
