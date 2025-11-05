# BMad Client Library

> SDK for executing BMad Method agents via LLM APIs

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚧 Work in Progress - Proof of Concept Phase

This project is currently in active development. See [docs/poc-plan.md](docs/poc-plan.md) for the roadmap.

## What is BMad Client?

BMad Client Library is a Node.js/TypeScript SDK that enables developers to integrate BMad-Method workflows into their applications using **Anthropic Claude**. It provides:

- **Agent Orchestration** - Execute specialized AI agents (PM, Architect, Dev, etc.) powered by Claude
- **Tool Execution** - Agents can read/write files, run commands via in-memory virtual filesystem
- **Session Management** - Pause/resume conversations, handle user questions
- **Cost Tracking** - Monitor Anthropic API costs in real-time with Claude's token pricing
- **Type-Safe** - Full TypeScript support with comprehensive types

## Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4' // or 'claude-opus-4', 'claude-haiku-3-5'
  }
});

const session = await client.startAgent('pm', '*help');

// Listen for events
session.on('started', () => {
  console.log('Agent execution started');
});

session.on('completed', (result) => {
  console.log('Documents created:', result.documents.length);
  console.log('Total cost:', result.costs.totalCost, 'USD');
});

// Execute the agent
const result = await session.execute();
console.log('Status:', result.status);
```

### Try the Example

```bash
# 1. Configure your API key (one-time setup)
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 2. Run the example
npm run example:simple
```

See [examples/README.md](examples/README.md) for more examples and documentation.

**Get your API key:** [console.anthropic.com](https://console.anthropic.com/)

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
- [x] First tests passing (9 tests)

✅ Phase 1.2: System Prompt Generator - **COMPLETE**
- [x] Base Claude Code prompt implementation
- [x] Tool descriptions formatter
- [x] Agent persona injection
- [x] Comprehensive unit tests (17 tests)

✅ Phase 1.3: Agent Loader - **COMPLETE**
- [x] Markdown file parsing with gray-matter
- [x] Zod schema validation
- [x] Directory loading support
- [x] Error handling (AgentLoadError, AgentParseError)
- [x] Unit tests (8 tests)

✅ Phase 1.4: Anthropic Provider - **COMPLETE**
- [x] Anthropic SDK integration (@anthropic-ai/sdk)
- [x] sendMessage() with tool support
- [x] Cost calculation for all Claude 4 models
- [x] Model validation and normalization
- [x] Response parsing (text + tool calls)
- [x] Comprehensive unit tests with mocked SDK (14 tests)

✅ Phase 1.5: Fallback Tool Executor - **COMPLETE**
- [x] In-memory VFS with Map-based storage
- [x] read_file, write_file, edit_file tools
- [x] Safe bash_command subset (mkdir, ls, pwd, echo)
- [x] list_files tool for directory listing
- [x] Path validation and error handling
- [x] Helper methods (getDocuments, initializeFiles, clear, getSize)
- [x] Comprehensive unit tests (32 tests)

✅ Phase 1.6: Session with Tool Call Loop - **COMPLETE**
- [x] Full component integration (SystemPromptGenerator, AgentLoader, AnthropicProvider, FallbackToolExecutor)
- [x] Complete tool call loop implementation
- [x] Real-time cost tracking and enforcement
- [x] Event-driven session lifecycle (started, completed, failed)
- [x] Agent loading with fallback paths
- [x] LLM message conversation handling
- [x] Tool execution and result formatting
- [x] Comprehensive error handling
- [x] End-to-end integration tests (4 tests)

✅ Phase 1.7: Examples & Documentation - **COMPLETE**
- [x] Example script (examples/simple-agent.ts)
- [x] Example documentation (examples/README.md)
- [x] Package build system working
- [x] Main README updated with examples
- [x] Ready for first real agent execution!

**Test Status:** 84 passing tests ✅
**Build Status:** ✅ All packages building successfully

🎯 **Phase 1 PoC - COMPLETE!** The SDK is fully functional and tested with real agents.

**First Agent Execution:** ✅ Successfully executed PM agent with Anthropic Claude API
- Session Duration: ~4s
- Cost: $0.0075 USD
- Input Tokens: 2,089
- Output Tokens: 84
- Status: completed

See [docs/poc-plan.md](docs/poc-plan.md) for complete roadmap.

## License

MIT

## Contributing

This project is currently in early development. Contribution guidelines will be added soon.

---

**Built with the BMad Method™**
