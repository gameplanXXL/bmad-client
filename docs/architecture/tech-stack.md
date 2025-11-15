# Technology Stack

## Overview

This document provides a comprehensive overview of the technology stack used in the BMad Client Library. The stack is optimized for **TypeScript-first development**, **Node.js runtime environments**, and **production-grade reliability**.

---

## Core Technologies

### Runtime Environment

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18.0.0+ | JavaScript runtime (LTS and current versions supported) |
| **TypeScript** | 5.3+ | Type-safe development with strict mode enabled |
| **pnpm** | 8.0.0+ | Package manager for monorepo workspace management |

**Rationale:**
- Node.js 18+ provides native ES modules, performance improvements, and long-term support
- TypeScript 5.3+ offers improved type inference, better generics, and enhanced IDE support
- pnpm provides efficient disk space usage and faster installs via content-addressable storage

---

## Build & Development Tools

### Build System

| Tool | Version | Purpose |
|------|---------|---------|
| **tsup** | ^8.0.1 | Fast TypeScript bundler with dual ESM/CommonJS output |
| **esbuild** | (via tsup) | Lightning-fast JavaScript/TypeScript compiler |

**Build Configuration:**
```json
{
  "build": "tsup src/index.ts --format cjs,esm --dts --clean"
}
```

**Output:**
- ESM: `dist/index.js` (native ES modules)
- CommonJS: `dist/index.cjs` (legacy Node.js compatibility)
- Types: `dist/index.d.ts` (TypeScript declarations)

### Testing Framework

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | ^1.0.4 | Fast, TypeScript-native test runner with native ESM support |
| **@vitest/ui** | ^1.0.4 | Visual test UI for debugging |

**Features:**
- Native TypeScript support (no build step required)
- Watch mode for rapid iteration
- Coverage reporting (HTML + terminal)
- Node.js test environment (not browser/DOM)

### Code Quality Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | ^8.55.0 | JavaScript/TypeScript linter |
| **@typescript-eslint** | ^6.13.0 | TypeScript-specific ESLint rules |
| **Prettier** | ^3.1.0 | Code formatter with opinionated defaults |

**Linting Rules:**
- Strict TypeScript compiler flags enabled
- No unused variables, no `any` types without explicit opt-in
- Consistent code formatting across all packages

---

## Core Dependencies

### LLM Provider Integration

| Package | Version | Purpose |
|---------|---------|---------|
| **@anthropic-ai/sdk** | ^0.24.0 | Official Anthropic Claude API client |

**Supported Models:**
- `claude-sonnet-4-20250514` (default, balanced performance/cost)
- `claude-opus-4` (highest quality, highest cost)
- `claude-haiku-4` (fastest, lowest cost)

**Features Used:**
- Messages API for conversational interactions
- Tool Use (function calling) for agent actions
- Streaming responses (future enhancement)

### Event Handling

| Package | Version | Purpose |
|---------|---------|---------|
| **eventemitter3** | ^5.0.1 | Fast, TypeScript-friendly event emitter |

**Events Emitted:**
- Session lifecycle: `started`, `completed`, `failed`, `paused`, `resumed`
- User interaction: `question`, `answer-required`
- Cost monitoring: `cost-warning`, `cost-limit-exceeded`
- Storage: `document-saved`, `storage-error`

### Schema Validation

| Package | Version | Purpose |
|---------|---------|---------|
| **zod** | ^3.22.4 | Runtime type validation with TypeScript integration |

**Usage:**
- Agent definition schema validation
- Template YAML schema validation
- Configuration validation
- Session state validation

### YAML Processing

| Package | Version | Purpose |
|---------|---------|---------|
| **gray-matter** | ^4.0.3 | Extract YAML frontmatter from Markdown files |
| **js-yaml** | ^4.1.0 | YAML parser for template files |
| **yaml** | ^2.8.1 | Modern YAML 1.2 parser with better error messages |

**Usage:**
- Parsing agent definition Markdown files (gray-matter)
- Loading template YAML files (js-yaml, yaml)
- Configuration file support

### File Operations

| Package | Version | Purpose |
|---------|---------|---------|
| **glob** | ^11.0.3 | File pattern matching for discovery |
| **minimatch** | ^10.1.1 | Glob pattern matching for VFS |

**Usage:**
- Template discovery: `**/*.yaml`, `*.tmpl.yaml`
- Agent discovery: `.bmad-core/agents/*.md`
- Expansion pack scanning: `node_modules/@bmad-*/agents/`
- VFS glob tool implementation

---

## Storage Backends

### Google Cloud Storage

**Package:** `@google-cloud/storage` (in `@bmad/storage-gcs` package)

**Features:**
- Document persistence (PRDs, architecture docs, stories)
- Session state persistence for recovery
- Multi-region support
- Bucket-level access control

**Authentication Methods:**
- Service Account JSON
- JSON Key File Path
- Application Default Credentials (ADC)

### Supabase Storage

**Package:** `@supabase/supabase-js` (in `@bmad/storage-supabase` package)

**Features:**
- Alternative cloud storage backend
- Real-time subscriptions (future enhancement)
- PostgreSQL-backed object storage

### In-Memory Storage

**Built-in:** `InMemoryStorageAdapter`

**Features:**
- Fast in-memory Map-based storage
- Perfect for testing and demos
- No external dependencies
- Ephemeral (data lost on process restart)

---

## Deployment Environments

### Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **Node.js (Local)** | ✅ Full Support | Development and standalone scripts |
| **Docker/Kubernetes** | ✅ Full Support | Container-based deployment |
| **AWS Lambda** | ✅ Full Support | Serverless functions with state persistence |
| **Google Cloud Functions** | ✅ Full Support | Serverless with GCS integration |
| **Vercel Functions** | ✅ Full Support | Edge runtime compatibility |
| **Cloudflare Workers** | ⚠️ Limited | Requires state persistence adapter |

**Performance Characteristics:**
- Session initialization: <100ms
- Template loading: ~50ms (cached)
- VFS operations: <10ms per tool call
- LLM API latency: 2-10 seconds (dominant factor)

---

## Development Environment

### Required Tools

1. **Node.js 18+** - Install via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm)
   ```bash
   nvm install 18
   nvm use 18
   ```

2. **pnpm 8+** - Install globally
   ```bash
   npm install -g pnpm@latest
   ```

3. **Git** - Version control

### Recommended IDE

**Visual Studio Code** with extensions:
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)
- **TypeScript** (built-in)
- **Vitest** (vitest.explorer)

**Settings:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## Security Dependencies

### API Key Management

**No storage of credentials in SDK:**
- API keys managed by consuming application
- No logging of sensitive data
- Credentials passed via configuration only

### Dependency Auditing

**Regular audits via:**
```bash
pnpm audit
pnpm audit --fix
```

**Automated security scanning:**
- GitHub Dependabot (automated PRs for vulnerabilities)
- Scheduled weekly dependency updates

---

## Package Distribution

### NPM Packages

**Published Packages:**
- `@bmad/client` - Core SDK
- `@bmad/storage-gcs` - Google Cloud Storage adapter
- `@bmad/storage-supabase` - Supabase storage adapter

**Package Format:**
- Dual ESM/CommonJS bundles
- TypeScript declarations included
- Source maps for debugging
- Tree-shakeable exports

**Installation:**
```bash
npm install @bmad/client @bmad/storage-gcs
# or
pnpm add @bmad/client @bmad/storage-gcs
# or
yarn add @bmad/client @bmad/storage-gcs
```

---

## Performance & Monitoring

### Memory Usage

| Component | Memory Footprint |
|-----------|------------------|
| VFS (per session) | ~1-2MB |
| Session overhead | ~500KB |
| Template cache | ~2MB (shared) |
| **Total per session** | ~2-3MB |

**Recommendation:** 10 concurrent sessions per 2GB RAM

### Cost Tracking

**Real-time token tracking:**
- Input tokens: Prompt + conversation history
- Output tokens: LLM responses
- Cost calculation: Provider-specific pricing tables

**Cost enforcement:**
- Session-level limits
- 80% warning threshold
- Hard limit with `CostLimitExceededError`

---

## Version Compatibility

### Semantic Versioning

**Versioning Policy:**
- `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
- **MAJOR:** Breaking API changes
- **MINOR:** New features, backward-compatible
- **PATCH:** Bug fixes, backward-compatible

### Deprecation Policy

**Process:**
1. Feature deprecated in MINOR release (with warnings)
2. Deprecation notices in logs and documentation
3. Removal in next MAJOR release (minimum 1 minor version notice)

---

## Future Technology Additions

**Planned Enhancements:**

1. **Streaming Support:**
   - Real-time LLM response streaming
   - Progressive document generation
   - Server-Sent Events (SSE) for web clients

2. **Additional Providers:**
   - OpenAI GPT-4 support (if requested)
   - Custom provider interface for proprietary models

3. **Enhanced Storage:**
   - AWS S3 adapter
   - Azure Blob Storage adapter
   - Local filesystem adapter (for development)

4. **Observability:**
   - OpenTelemetry integration
   - Structured logging with correlation IDs
   - Performance metrics (APM)

---

## References

- **Anthropic API Documentation:** https://docs.anthropic.com
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Vitest Documentation:** https://vitest.dev
- **pnpm Workspace:** https://pnpm.io/workspaces

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Winston (Architect)
