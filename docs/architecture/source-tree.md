# Source Tree Structure

## Overview

This document provides a comprehensive guide to the BMad Client Library source code organization. The project uses a **monorepo structure** managed by pnpm workspaces, with multiple packages and clear separation of concerns.

---

## Root Directory Structure

```
bmad-client/
├── .bmad-core/                   # BMad Core Framework (templates, tasks, agents)
│   ├── agents/                   # Core agent definitions
│   ├── tasks/                    # Task workflows
│   ├── templates/                # Document templates (YAML)
│   ├── checklists/               # Quality checklists
│   └── data/                     # Reference data
├── docs/                         # Project documentation
│   ├── architecture/             # Architecture documentation
│   │   ├── coding-standards.md  # Coding standards and conventions
│   │   ├── tech-stack.md        # Technology stack overview
│   │   └── source-tree.md       # This file
│   ├── architecture.md           # Main architecture document
│   ├── prd.md                    # Product Requirements Document
│   └── brief.md                  # Project brief
├── packages/                     # Monorepo packages (core SDK and adapters)
│   ├── core/                     # @bmad/client - Core SDK
│   ├── storage-gcs/              # @bmad/storage-gcs - Google Cloud Storage adapter
│   ├── storage-supabase/         # @bmad/storage-supabase - Supabase adapter
│   └── examples/                 # Example applications and integration patterns
├── examples/                     # Standalone examples (workspace linked)
├── node_modules/                 # Dependencies (pnpm managed)
├── package.json                  # Root workspace configuration
├── pnpm-workspace.yaml           # Workspace definition
├── tsconfig.json                 # Shared TypeScript configuration
├── vitest.config.ts              # Vitest test configuration
├── .eslintrc.json                # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── .gitignore                    # Git ignore rules
├── LICENSE                       # MIT License
└── README.md                     # Project README
```

---

## Core Package (`packages/core/`)

**Package Name:** `@bmad/client`

**Purpose:** Main SDK providing agent orchestration, session management, template processing, and VFS-based tool execution.

### Directory Structure

```
packages/core/
├── .bmad-core/                   # Test fixtures for agent definitions
│   └── agents/
│       ├── pm.md                 # Test PM agent
│       └── test-agent.md         # Generic test agent
├── src/                          # Source code
│   ├── __tests__/                # Unit and integration tests
│   │   ├── fixtures/             # Test fixtures (agent definitions)
│   │   ├── agent-discovery.test.ts
│   │   ├── agent-loader.test.ts
│   │   ├── client.test.ts
│   │   ├── conversational-session.test.ts
│   │   ├── conversational-session-unit.test.ts
│   │   ├── expansion-pack-loading.test.ts
│   │   ├── expansion-packs.test.ts
│   │   ├── integration.test.ts
│   │   ├── mock-llm-provider.ts  # Mock provider for testing
│   │   ├── pause-resume.test.ts
│   │   ├── prompt-generator.test.ts
│   │   ├── session-persistence.test.ts
│   │   ├── session-recovery.test.ts
│   │   ├── session-storage.test.ts
│   │   ├── session-storage-simple.test.ts
│   │   ├── session.test.ts
│   │   └── test-helpers.ts       # Shared test utilities
│   ├── cost/                     # Cost tracking and estimation
│   │   ├── estimator.ts          # Cost estimation before execution
│   │   ├── tracker.ts            # Real-time cost tracking
│   │   └── index.ts              # Barrel export
│   ├── providers/                # LLM provider implementations
│   │   ├── __tests__/
│   │   │   └── anthropic.test.ts
│   │   └── anthropic.ts          # Anthropic Claude provider
│   ├── storage/                  # Storage adapters
│   │   ├── __tests__/
│   │   │   ├── gcs-adapter.test.ts
│   │   │   └── memory-adapter.test.ts
│   │   ├── gcs-adapter.ts        # Google Cloud Storage adapter
│   │   ├── memory-adapter.ts     # In-memory storage (testing)
│   │   ├── types.ts              # Storage interfaces and types
│   │   └── index.ts              # Barrel export
│   ├── tasks/                    # Task workflow execution
│   │   ├── __tests__/
│   │   │   └── executor.test.ts
│   │   ├── executor.ts           # Task executor
│   │   ├── loader.ts             # Task loader
│   │   ├── schema.ts             # Task schema validation
│   │   └── index.ts              # Barrel export
│   ├── templates/                # Template processing
│   │   ├── __tests__/
│   │   │   ├── generator.test.ts
│   │   │   ├── loader.test.ts
│   │   │   ├── parser.test.ts
│   │   │   ├── real-templates.test.ts
│   │   │   └── registry.test.ts
│   │   ├── generator.ts          # Document generation from templates
│   │   ├── loader.ts             # Template file loader
│   │   ├── parser.ts             # YAML template parser
│   │   ├── registry.ts           # Template registry
│   │   ├── schema.ts             # Template schema validation
│   │   └── index.ts              # Barrel export
│   ├── tools/                    # VFS tools and command execution
│   │   ├── __tests__/
│   │   │   ├── command-executor.test.ts
│   │   │   ├── fallback-executor.test.ts
│   │   │   ├── glob.test.ts
│   │   │   ├── invoke-agent.test.ts
│   │   │   └── invoke-agent.integration.test.ts
│   │   ├── command-executor.ts   # External command execution
│   │   └── fallback-executor.ts  # VFS-based tool executor
│   ├── agent-loader.ts           # Agent definition loader
│   ├── agent-schema.ts           # Agent schema validation (Zod)
│   ├── client.ts                 # BmadClient main class
│   ├── conversational-session.ts # Multi-turn conversational sessions
│   ├── prompt-generator.ts       # System prompt generation
│   ├── session.ts                # One-shot session execution
│   ├── types.ts                  # Shared type definitions
│   └── index.ts                  # Main package export
├── dist/                         # Build output (generated)
│   ├── index.js                  # ESM bundle
│   ├── index.cjs                 # CommonJS bundle
│   └── index.d.ts                # TypeScript declarations
├── package.json                  # Package configuration
├── tsconfig.json                 # TypeScript configuration
└── vitest.config.ts              # Vitest test configuration
```

### Key Files

| File | Purpose |
|------|---------|
| `src/client.ts` | Main SDK entry point (`BmadClient` class) |
| `src/session.ts` | One-shot session execution (`BmadSession` class) |
| `src/conversational-session.ts` | Multi-turn REPL-style sessions (`ConversationalSession`) |
| `src/agent-loader.ts` | Loads agent definitions from `.md` files |
| `src/agent-schema.ts` | Zod schemas for agent validation |
| `src/prompt-generator.ts` | Generates Claude Code-style system prompts |
| `src/types.ts` | Shared TypeScript interfaces and types |
| `src/tools/fallback-executor.ts` | VFS-based tool execution (read_file, write_file, etc.) |
| `src/providers/anthropic.ts` | Anthropic Claude API integration |
| `src/storage/gcs-adapter.ts` | Google Cloud Storage adapter |
| `src/storage/memory-adapter.ts` | In-memory storage for testing |
| `src/templates/generator.ts` | Document generation from YAML templates |
| `src/templates/parser.ts` | YAML template parser with schema validation |
| `src/cost/tracker.ts` | Real-time token usage and cost tracking |

---

## Storage Packages

### Google Cloud Storage (`packages/storage-gcs/`)

**Package Name:** `@bmad/storage-gcs`

**Purpose:** Google Cloud Storage adapter for document persistence.

```
packages/storage-gcs/
├── src/
│   ├── __tests__/
│   │   ├── adapter.test.ts           # Unit tests
│   │   └── adapter.integration.test.ts # Integration tests
│   ├── adapter.ts                    # GCS adapter implementation
│   └── index.ts                      # Package export
├── dist/                             # Build output
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Supabase Storage (`packages/storage-supabase/`)

**Package Name:** `@bmad/storage-supabase`

**Purpose:** Supabase storage adapter (alternative cloud storage).

```
packages/storage-supabase/
├── src/
│   ├── adapter.ts                    # Supabase adapter implementation
│   └── index.ts                      # Package export
├── dist/                             # Build output
├── package.json
├── tsconfig.json
└── README.md
```

---

## Examples Package (`packages/examples/`)

**Purpose:** Example applications and integration patterns demonstrating SDK usage.

```
packages/examples/
├── express-api/                      # Express.js REST API example
│   ├── src/
│   │   └── server.ts                 # Express server with BMad endpoints
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── standalone-script/                # Standalone Node.js script example
│   ├── src/
│   │   └── index.ts                  # Simple BMad script
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── standalone/                       # Additional standalone examples
│   └── simple-session.ts             # Basic session example
├── conversational-http-api.ts        # HTTP API for conversational sessions
├── conversational-session.ts         # Conversational session demo
├── expansion-pack-loading.ts         # Expansion pack loading example
├── list-agents.ts                    # Agent discovery example
└── README.md                         # Examples overview
```

---

## BMad Core Framework (`.bmad-core/`)

**Purpose:** Core BMad Method definitions (agents, templates, tasks, checklists).

```
.bmad-core/
├── agents/                           # Agent definitions
│   ├── pm.md                         # Product Manager agent
│   ├── architect.md                  # Architect agent
│   ├── dev.md                        # Developer agent
│   ├── qa.md                         # QA Engineer agent
│   ├── sm.md                         # Scrum Master agent
│   ├── po.md                         # Product Owner agent
│   ├── analyst.md                    # Business Analyst agent
│   ├── ux-expert.md                  # UX Expert agent
│   └── bmad-orchestrator.md          # Orchestrator agent
├── tasks/                            # Task workflows
│   ├── create-doc.md                 # Document creation task
│   ├── document-project.md           # Project documentation task
│   ├── execute-checklist.md          # Checklist execution task
│   ├── shard-doc.md                  # Document sharding task
│   └── ...                           # Additional tasks
├── templates/                        # YAML templates
│   ├── prd-tmpl.yaml                 # PRD template
│   ├── architecture-tmpl.yaml        # Architecture document template
│   ├── story-tmpl.yaml               # User story template
│   ├── project-brief-tmpl.yaml       # Project brief template
│   └── ...                           # Additional templates
├── checklists/                       # Quality checklists
│   ├── pm-checklist.md               # PM checklist
│   ├── architect-checklist.md        # Architect checklist
│   ├── story-dod-checklist.md        # Story DoD checklist
│   └── ...                           # Additional checklists
└── data/                             # Reference data
    ├── bmad-kb.md                    # BMad knowledge base
    ├── elicitation-methods.md        # Elicitation techniques
    ├── brainstorming-techniques.md   # Brainstorming methods
    └── technical-preferences.md      # Technical defaults
```

---

## Documentation Structure (`docs/`)

```
docs/
├── architecture/                     # Architecture documentation
│   ├── coding-standards.md           # Coding conventions and best practices
│   ├── tech-stack.md                 # Technology stack overview
│   └── source-tree.md                # This file
├── architecture.md                   # Main architecture document (v3.0)
├── prd.md                            # Product Requirements Document (v1.0)
└── brief.md                          # Project brief
```

---

## Build Artifacts

### Generated Directories (Not Committed)

```
packages/*/dist/                      # Build output (ESM + CJS + .d.ts)
packages/*/node_modules/              # Package dependencies
node_modules/                         # Root dependencies
coverage/                             # Test coverage reports
.vitest-cache/                        # Vitest cache
```

---

## Configuration Files

### Root Level

| File | Purpose |
|------|---------|
| `package.json` | Root workspace configuration, scripts, dev dependencies |
| `pnpm-workspace.yaml` | pnpm workspace definition |
| `tsconfig.json` | Shared TypeScript configuration (strict mode enabled) |
| `vitest.config.ts` | Vitest test runner configuration |
| `.eslintrc.json` | ESLint linting rules |
| `.prettierrc` | Prettier formatting rules |
| `.gitignore` | Git ignore patterns |
| `.bmad-core/core-config.yaml` | BMad Core configuration |

### Package Level

| File | Purpose |
|------|---------|
| `package.json` | Package metadata, dependencies, scripts |
| `tsconfig.json` | Package-specific TypeScript config (extends root) |
| `vitest.config.ts` | Package-specific test config |
| `README.md` | Package documentation |

---

## File Naming Conventions

### Source Files

| Pattern | Purpose | Example |
|---------|---------|---------|
| `*.ts` | TypeScript source files | `client.ts`, `session.ts` |
| `*.test.ts` | Unit tests | `client.test.ts` |
| `*.integration.test.ts` | Integration tests | `adapter.integration.test.ts` |
| `index.ts` | Barrel export files | `src/index.ts`, `src/storage/index.ts` |
| `types.ts` | Shared type definitions | `src/types.ts`, `src/storage/types.ts` |
| `schema.ts` | Zod schema definitions | `agent-schema.ts`, `template/schema.ts` |

### Agent & Template Files

| Pattern | Purpose | Example |
|---------|---------|---------|
| `*.md` | Agent definitions (Markdown + YAML frontmatter) | `pm.md`, `architect.md` |
| `*-tmpl.yaml` | YAML templates | `prd-tmpl.yaml`, `architecture-tmpl.yaml` |
| `*-checklist.md` | Quality checklists | `pm-checklist.md` |

---

## Import Paths

### Internal Package Imports (ESM)

**Always use `.js` extension (required for ESM):**
```typescript
import { BmadClient } from './client.js';
import { BmadSession } from './session.js';
import type { SessionOptions } from './types.js';
```

### Cross-Package Imports

```typescript
// From @bmad/client to storage adapter
import { GoogleCloudStorageAdapter } from '@bmad/storage-gcs';

// From application to @bmad/client
import { BmadClient, BmadSession } from '@bmad/client';
import type { BmadClientConfig } from '@bmad/client';
```

### Barrel Exports

**Use barrel exports for clean public APIs:**
```typescript
// src/storage/index.ts
export { StorageAdapter } from './types.js';
export { InMemoryStorageAdapter } from './memory-adapter.js';
export { GoogleCloudStorageAdapter } from './gcs-adapter.js';

// Application imports
import { GoogleCloudStorageAdapter } from '@bmad/client/storage';
```

---

## Testing Structure

### Test Organization

**Tests live in `__tests__/` directories:**
```
src/
├── client.ts
├── session.ts
└── __tests__/
    ├── client.test.ts
    ├── session.test.ts
    ├── integration.test.ts
    ├── fixtures/
    │   └── test-agent.md
    └── test-helpers.ts
```

**Submodule tests:**
```
src/
├── storage/
│   ├── gcs-adapter.ts
│   ├── memory-adapter.ts
│   └── __tests__/
│       ├── gcs-adapter.test.ts
│       └── memory-adapter.test.ts
```

### Test Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests in specific package
pnpm --filter @bmad/client test
```

---

## Build Commands

### Development

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @bmad/client build

# Watch mode (rebuild on change)
pnpm --filter @bmad/client dev

# Type checking
pnpm typecheck
```

### Linting & Formatting

```bash
# Lint all code
pnpm lint

# Format all code
pnpm format

# Fix linting issues
pnpm lint --fix
```

---

## Expansion Pack Integration

### Loading from Sibling Directory

**Default expansion pack location:** `../bmad-export-author/`

```
parent-directory/
├── bmad-client/                      # This repository
└── bmad-export-author/               # Expansion packs repository
    ├── .bmad-core/                   # Core framework (installed)
    ├── .bmad-expert-author/          # Expert Author expansion pack
    ├── .bmad-competency-assessor/    # Competency Assessor expansion pack
    └── expansion-packs/              # Source code
        ├── expert-author/            # Expert Author source (17 agents)
        └── competency-assessor/      # Competency Assessor source (7 agents)
```

### Agent Discovery Path

**Client scans:**
1. `.bmad-core/agents/` (built-in core agents)
2. `../bmad-export-author/.bmad-expert-author/agents/`
3. `../bmad-export-author/.bmad-competency-assessor/agents/`
4. Custom paths via `expansionPackPaths` config

---

## References

- **Main Architecture Document:** `/docs/architecture.md`
- **PRD:** `/docs/prd.md`
- **Coding Standards:** `/docs/architecture/coding-standards.md`
- **Tech Stack:** `/docs/architecture/tech-stack.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Winston (Architect)
