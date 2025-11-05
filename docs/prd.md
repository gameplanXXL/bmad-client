# BMad Client Library Product Requirements Document (PRD)

## Goals and Background Context

### Goals

- Enable backend developers to integrate BMad-Method workflows into web and desktop applications via a production-ready Node.js SDK
- Support content-creation expansion packs (educational authoring, creative writing, storytelling) alongside software development workflows
- Provide complete session management with pause/resume capabilities for LLM interactions requiring user input
- Implement comprehensive cost tracking and enforcement to prevent runaway API expenses in production environments
- Support flexible agent plugin system allowing core agents and expansion packs to be loaded dynamically
- Deliver headless, framework-agnostic API that works across Express, Fastify, Next.js, serverless platforms, and standalone scripts
- Achieve <30 minute time-to-first-integration for developers with clear documentation and TypeScript support
- Create foundation for BMad-Method ecosystem growth through expansion packs and community contributions

### Background Context

The BMad-Method has proven its value as a structured approach to AI-powered workflows through Claude Code CLI, supporting both software development (PRD creation, architecture design, story generation) and content creation (educational book authoring, creative writing, design thinking facilitation). However, the CLI-only nature creates a significant barrier: developers building web applications cannot embed BMad workflows into their products. This PRD addresses that gap by defining a backend SDK that brings BMad-Method capabilities to any Node.js application.

The primary insight from the Project Brief is that developers need more than just LLM API access—they need a complete runtime that handles session orchestration, cost management, document persistence, agent lifecycle, and tool execution. The SDK provides an **in-memory Virtual Filesystem (VFS)** that emulates Claude Code's environment, giving agents isolated file spaces for templates, tasks, and generated documents. This PRD defines those capabilities as a cohesive product that enables a new class of AI-powered tools built on BMad-Method foundations, supporting both software development and content-creation use cases.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-10-31 | 1.0 | Initial PRD creation | John (PM) |
| 2025-10-31 | 1.1 | Added content-creation focus and CommandExecutor tool requirements | Winston (Architect) |
| 2025-10-31 | 2.0 | Major revision: Implemented in-memory VFS for tool execution and session isolation | Winston (Architect) |

---

## Requirements

### Functional Requirements

**FR1:** The SDK shall provide a `BmadClient` class that accepts configuration for LLM provider (Anthropic Claude), API credentials, storage backend, and optional cost limits

**FR2:** The SDK shall support creating agent sessions programmatically by specifying agent type (pm, architect, dev, qa, analyst, sm, po, ux-expert) and command/task to execute

**FR3:** Sessions shall pause execution when the LLM needs user input and emit a `question` event containing the question text and context

**FR4:** Sessions shall resume execution after receiving user answers via a `session.answer()` method, maintaining full conversation context

**FR5:** The SDK shall persist session state to enable pause/resume across application restarts or server failures

**FR6:** All agent definitions (markdown files with YAML frontmatter) shall be loaded dynamically from `.bmad-core/agents/` directories

**FR7:** The SDK shall support loading agents from external NPM packages (expansion packs) by scanning their `.bmad-core/agents/` directories

**FR8:** The SDK shall load and process YAML templates from `.bmad-core/templates/` for document generation (PRD, architecture, stories, etc.)

**FR9:** The SDK shall execute task workflows defined in `.bmad-core/tasks/` markdown files following their elicitation and processing logic

**FR10:** The SDK shall provide Claude Code-style tools (read_file, write_file, edit_file, bash_command, grep_search, glob_pattern) via an in-memory virtual filesystem for session isolation

**FR11:** The SDK shall persist generated documents (PRDs, architecture docs, stories, etc.) to Google Cloud Storage buckets with configurable bucket names and paths

**FR12:** The SDK shall retrieve previously saved documents from GCS for reference during agent execution

**FR13:** The SDK shall track token usage (input tokens, output tokens) for every LLM API call during a session

**FR14:** The SDK shall calculate session cost in the provider's billing currency (EUR, USD, etc.) based on current pricing for the selected model

**FR15:** The SDK shall enforce cost limits by throwing a `CostLimitExceededError` when session costs exceed the configured `costLimit` parameter

**FR16:** The SDK shall return a final cost report at session completion including total cost, token counts, API call count, and per-model breakdown

**FR17:** The SDK shall provide a provider interface for Anthropic Claude with extensibility for future custom providers if needed

**FR18:** The Anthropic provider implementation shall use the official `@anthropic-ai/sdk` package and support Claude Sonnet, Opus, and Haiku models

**FR19:** The SDK shall provide comprehensive TypeScript type definitions for all public APIs, configuration objects, and event handlers

**FR20:** The SDK shall emit lifecycle events (`session-started`, `session-paused`, `session-resumed`, `session-completed`, `session-failed`, `cost-warning`) for application integration

**FR21:** The SDK shall handle LLM API errors gracefully with specific error types (`APIError`, `RateLimitError`, `AuthenticationError`) and retry logic for transient failures

**FR22:** The SDK shall validate all user-provided configuration and input data, throwing descriptive errors for invalid parameters

**FR23:** The SDK shall support both ESM (`import`) and CommonJS (`require`) module formats for maximum Node.js compatibility

**FR24:** The SDK shall provide detailed logging (configurable levels: error, warn, info, debug) for troubleshooting session execution and API calls

**FR25:** The SDK shall include example applications demonstrating integration patterns (Express API, Next.js route handler, standalone script, serverless function)

**FR26:** The SDK shall provide a CommandExecutor tool for running whitelisted system commands (e.g., `make`, `pandoc`, `pdflatex`, `wkhtmltopdf`) required by content-creation and asset-generation workflows

**FR27:** CommandExecutor shall validate all commands against a configurable whitelist before execution, throwing `CommandNotAllowedError` for unauthorized commands

**FR28:** CommandExecutor shall support asynchronous command execution with configurable timeout limits (default: 5 minutes) and resource constraints

**FR29:** CommandExecutor shall capture stdout, stderr, and exit codes, returning structured results to agents via tool response format

**FR30:** CommandExecutor shall support working directory specification and environment variable injection for command execution context

**FR31:** The SDK shall implement a `FallbackToolExecutor` that provides all tool execution via an in-memory virtual filesystem (VFS)

**FR32:** Each session shall have its own isolated VFS instance to prevent cross-session data contamination

**FR33:** The VFS shall be pre-loaded with BMAD templates and agent files at session initialization

**FR34:** Tool calls from the LLM shall be executed against the session's VFS and results returned to the LLM

**FR35:** The `FallbackToolExecutor` shall support safe bash commands (mkdir, echo, etc.) without executing arbitrary code

**FR36:** Documents created in the VFS shall be retrievable via `session.getDocuments()` after session completion

**FR37:** The VFS shall support glob patterns for file discovery (e.g., `*.md`, `**/*.yaml`)

**FR38:** The VFS shall support grep-style search across virtual files with regex patterns

### Non-Functional Requirements

**NFR1:** Session initialization (creating `BmadClient` and starting an agent session) shall complete in <500ms under normal network conditions

**NFR2:** Document save operations to Google Cloud Storage shall complete in <2 seconds for documents up to 500KB

**NFR3:** The SDK shall support at least 10 concurrent agent sessions per Node.js process without performance degradation

**NFR4:** Cost tracking accuracy shall be within 5% of actual LLM provider billing amounts

**NFR5:** The SDK package size (minified + gzipped) shall not exceed 200KB to minimize installation and cold-start times

**NFR6:** All public APIs shall have JSDoc comments with examples for IDE autocomplete and inline documentation

**NFR7:** The SDK shall maintain 90%+ test coverage (unit and integration tests) to ensure reliability

**NFR8:** The SDK shall follow semantic versioning (semver) for releases with clear deprecation notices for breaking changes

**NFR9:** The SDK shall be compatible with Node.js 18+ (LTS and current versions)

**NFR10:** The SDK shall work in serverless environments (AWS Lambda, Google Cloud Functions, Vercel Functions) with stateless session persistence

**NFR11:** The SDK shall not bundle unnecessary dependencies—all dependencies should be production-relevant and tree-shakeable where possible

**NFR12:** API response times for session state queries (`session.getStatus()`, `session.getCosts()`) shall be <50ms

**NFR13:** The SDK shall handle network interruptions gracefully with automatic reconnection for LLM API calls (up to 3 retries with exponential backoff)

**NFR14:** Security: The SDK shall never log or store API keys in plain text; credentials must be managed by the consuming application

**NFR15:** The SDK shall support GDPR compliance by providing methods to delete all user-generated documents from storage

---

## User Interface Design Goals

**Note:** This SDK is headless (no UI components). However, we define UX goals for the developer experience (DX) when integrating the library.

### Overall UX Vision

The BMad Client Library should feel intuitive and "just work" for backend developers familiar with modern Node.js SDKs. The developer experience should mirror patterns from popular libraries like Stripe SDK, Twilio SDK, or Vercel AI SDK—clear initialization, event-driven session handling, and excellent TypeScript IntelliSense.

Developers should be able to integrate BMad-Method workflows with minimal code (5-10 lines for basic usage) while having full control over advanced features (cost limits, custom storage, provider switching) when needed.

### Key Interaction Paradigms

**1. Configuration-first initialization:** Developers configure the `BmadClient` once with provider settings, storage backend, and global options, then reuse the client for multiple sessions.

**2. Event-driven session management:** Sessions emit events (`question`, `progress`, `completed`) that applications handle asynchronously, matching Node.js event-emitter patterns.

**3. Promise-based async/await:** All async operations return Promises for clean async/await usage in modern Node.js code.

**4. Builder pattern for complex configurations:** Optional builder pattern for configuring advanced session options (e.g., `session.withCostLimit(5.0).withStorage(customAdapter).start()`).

### Core Screens and Views

**For Developer Documentation (docs site):**

- **Getting Started Guide:** Quick 5-minute tutorial showing installation, basic configuration, and first agent execution
- **API Reference:** Auto-generated from TypeScript definitions with JSDoc comments
- **Configuration Guide:** Detailed explanation of all configuration options with examples
- **Session Management Guide:** Deep dive into pause/resume, state persistence, error handling
- **Cost Management Guide:** How to track costs, set limits, interpret cost reports
- **Storage Guide:** Configuring GCS, implementing custom storage adapters
- **Agent Plugin Guide:** How to load expansion packs and create custom agents
- **Examples Library:** Copy-paste ready code for common integration patterns

### Accessibility

**N/A** (Backend library, no visual UI)

### Branding

The library should feel professional and production-ready, aligned with BMad-Method's structured, methodical approach. Documentation should use clear technical language without unnecessary jargon, emphasizing reliability and developer productivity.

Code examples should be concise and practical, avoiding overly complex demonstrations that obscure the core API.

### Target Device and Platforms

**Backend environments only:**
- Node.js 18+ on Linux, macOS, Windows
- Serverless platforms: AWS Lambda, Google Cloud Functions, Vercel Functions, Cloudflare Workers (with state persistence)
- Container environments: Docker, Kubernetes
- Local development environments

**No browser/client-side support:** The SDK requires server-side execution due to API key security and LLM provider access.

---

## Technical Assumptions

### Repository Structure: Monorepo

The project will use a **monorepo structure** to manage the core SDK and related packages:

```
bmad-client/
├── packages/
│   ├── core/              # @bmad/client - main SDK
│   ├── provider-anthropic/ # @bmad/provider-anthropic
│   ├── storage-gcs/        # @bmad/storage-gcs (future)
│   └── examples/           # Example applications
├── .bmad-core/             # Core agent definitions, templates, tasks
└── docs/                   # Documentation site
```

**Rationale:** Monorepo allows us to version the core and providers independently while maintaining shared tooling and testing infrastructure. This becomes critical when adding expansion pack support, as we can test compatibility across multiple packages.

### Service Architecture

**Library architecture (not microservices)**

The SDK is a client library, not a service. Applications import it as a dependency and run agent sessions in-process. Key architectural layers:

1. **Client Layer:** `BmadClient` class, session management, public API
2. **Provider Layer:** Anthropic Claude integration (extensible interface for future providers)
3. **Agent Layer:** Dynamic agent loading, task execution, template processing
4. **Tool Layer:** Virtual filesystem, document operations (Read, Write, Edit, Grep, Glob)
5. **Storage Layer:** Abstraction for document persistence (GCS planned, future: S3, Azure, local)
6. **Cost Layer:** Token tracking, cost calculation, limit enforcement

**Rationale:** In-process execution keeps latency low and simplifies deployment. Applications can wrap the SDK in their own APIs (REST, GraphQL) if needed.

### Testing Requirements

**Full testing pyramid:**

- **Unit Tests (70%):** Test individual classes and functions in isolation (mocked dependencies)
- **Integration Tests (25%):** Test component interactions (e.g., session management + provider + storage with test doubles)
- **E2E Tests (5%):** Test full agent workflows against real LLM APIs (using test API keys with low-cost models)

**Testing frameworks:**
- **Vitest:** Fast, TypeScript-native test runner
- **Nock or MSW:** HTTP mocking for LLM API calls in unit/integration tests
- **In-memory storage adapter:** For testing without real GCS dependencies

**CI/CD requirements:**
- All tests must pass before merge to `main`
- E2E tests run nightly (to avoid excessive API costs)
- Code coverage reports published to README badge

**Rationale:** High test coverage is critical for an SDK—developers depend on it not breaking. Integration tests catch real-world issues that unit tests miss. E2E tests validate against actual LLM behavior.

### Additional Technical Assumptions and Requests

- **Build System:** Use `tsup` for fast TypeScript bundling with dual ESM/CommonJS output
- **Package Manager:** NPM for publishing; support pnpm and yarn for development
- **Linting:** ESLint + Prettier with strict TypeScript rules
- **Versioning:** Semantic versioning (semver) with Changesets for automated release notes
- **Documentation Site:** VitePress or Docusaurus for developer docs
- **API Design Philosophy:** Prefer explicitness over magic—developers should understand what's happening without reading source code
- **Error Messages:** All errors should include actionable guidance (e.g., "CostLimitExceeded: Session cost $5.23 exceeds limit $5.00. Consider increasing costLimit or optimizing agent prompts.")
- **Performance Monitoring:** Include optional telemetry hooks for applications to monitor session performance metrics
- **Dependency Management:** Minimize dependencies; audit all deps for security vulnerabilities
- **TypeScript Strict Mode:** Enable all strict compiler flags for maximum type safety
- **Backwards Compatibility:** Maintain compatibility within major versions; deprecate features with at least one minor version warning

---

## Epic List

### Epic 1: Foundation & SDK Core Infrastructure

**Goal:** Establish the foundational SDK architecture, build system, testing framework, and basic `BmadClient` initialization. Deliver a minimal working SDK that can be installed, configured, and initialized successfully, with a simple health-check demonstrating the provider connection works.

### Epic 2: LLM Provider Integration & Session Management

**Goal:** Implement the provider abstraction layer with Anthropic Claude integration, and build the core session management system supporting conversation orchestration, message history, and basic agent execution without advanced features (pause/resume comes later).

### Epic 3: Agent Plugin System & Dynamic Loading

**Goal:** Enable dynamic loading of BMad agents from `.bmad-core/agents/` directories, parsing agent definitions (markdown with YAML frontmatter), and executing agent commands. Support loading agents from external expansion pack NPM packages.

### Epic 4: Virtual File System & Tool Execution

**Goal:** Implement the virtual file system abstraction and core tools (Read, Write, Edit, Grep, Glob) required for agent operations. Agents should be able to manipulate documents in memory as if working with a real filesystem.

### Epic 5: Template & Task Processing

**Goal:** Load and process YAML templates for document generation (PRD, architecture, stories) and execute task workflows from markdown files, including elicitation logic for interactive document creation.

### Epic 6: Document Storage & Google Cloud Integration

**Goal:** Integrate Google Cloud Storage for persisting generated documents. Implement the storage abstraction layer to support future adapters (S3, Azure, local filesystem).

### Epic 7: Cost Tracking, Limits & Reporting

**Goal:** Implement comprehensive cost tracking for LLM API usage, enforce session-level cost limits, and provide detailed cost reports at session completion. Ensure accuracy within 5% of actual provider billing.

### Epic 8: Pause/Resume & Advanced Session Features

**Goal:** Build the pause/resume mechanism for handling LLM questions, including session state persistence, question event emission, answer handling, and resumption of agent execution with full context.

### Epic 9: Error Handling, Logging & Production Readiness

**Goal:** Implement robust error handling for all failure modes (API errors, rate limits, cost exceeded, storage failures), add structured logging, and ensure the SDK is production-ready with retries and graceful degradation.

### Epic 10: TypeScript Support, Documentation & Examples

**Goal:** Finalize comprehensive TypeScript type definitions, generate API documentation, create developer guides (getting started, configuration, session management, cost tracking), and build example applications for common integration patterns.

---

## Epic 1: Foundation & SDK Core Infrastructure

**Expanded Goal:** Set up the monorepo project structure, configure TypeScript build tooling (tsup), establish testing framework (Vitest), and create the basic `BmadClient` class with configuration handling. The epic delivers a publishable NPM package that developers can install and initialize, with a simple "hello world" demonstrating successful SDK instantiation.

### Story 1.1: Project Scaffolding & Monorepo Setup

As a **developer**,
I want **a monorepo project structure with proper tooling configuration**,
so that **I can develop, test, and publish the SDK packages with a professional workflow**.

#### Acceptance Criteria

1. Monorepo is initialized using pnpm workspaces with `packages/core/`, `packages/storage-gcs/`, `packages/provider-anthropic/`, and `packages/examples/` directories
2. Root-level `package.json` configures workspace dependencies and shared dev dependencies (TypeScript, Vitest, ESLint, Prettier)
3. Each package has its own `package.json` with appropriate `name`, `version`, `main`, `module`, `types`, and `exports` fields
4. TypeScript is configured with strict mode enabled and shared `tsconfig.base.json` extended by package-level configs
5. ESLint and Prettier are configured with consistent formatting rules across all packages
6. Git repository is initialized with `.gitignore` excluding `node_modules/`, `dist/`, `.env`, and build artifacts
7. README.md exists at root with project description and basic contribution guidelines
8. License file (MIT or Apache 2.0) is included

### Story 1.2: Build System Configuration with tsup

As a **developer**,
I want **a fast, reliable build system that outputs ESM and CommonJS bundles**,
so that **the SDK works in all Node.js environments and has minimal build times**.

#### Acceptance Criteria

1. `tsup` is configured in `packages/core/package.json` with dual format output (ESM + CommonJS)
2. Build command `pnpm build` successfully compiles TypeScript to JavaScript in `dist/` directory
3. Type declaration files (`.d.ts`) are generated for all public APIs
4. Source maps are generated for debugging
5. Build output is tree-shakeable for optimal bundle sizes
6. Build command completes in <10 seconds for core package
7. `clean` script exists to remove build artifacts
8. Package entry points (`main`, `module`, `types`) correctly reference built files

### Story 1.3: Testing Framework Setup with Vitest

As a **developer**,
I want **a fast, TypeScript-native testing framework with coverage reporting**,
so that **I can write and run tests efficiently during development**.

#### Acceptance Criteria

1. Vitest is installed and configured in root `vitest.config.ts`
2. Test command `pnpm test` runs all tests in `*.test.ts` files
3. Coverage command `pnpm test:coverage` generates HTML and terminal coverage reports
4. Tests can import TypeScript source files without build step (via Vitest's built-in TS support)
5. Example test file `packages/core/src/client.test.ts` exists with a passing placeholder test
6. Watch mode (`pnpm test:watch`) works for rapid test iteration
7. Test environment is configured for Node.js (not browser/DOM)
8. Coverage threshold is set to 80% (will increase to 90% in later epics)

### Story 1.4: BmadClient Class Initialization & Configuration

As a **backend developer**,
I want **to create a BmadClient instance with my LLM provider credentials**,
so that **I can begin using the SDK to orchestrate BMad agents**.

#### Acceptance Criteria

1. `BmadClient` class exists in `packages/core/src/client.ts` with a constructor accepting configuration options
2. Configuration interface `BmadClientConfig` includes fields: `provider` (string), `apiKey` (string), `storage` (optional), `costLimit` (optional number)
3. Constructor validates required fields (`provider`, `apiKey`) and throws `ConfigurationError` if missing
4. Constructor stores configuration in private instance variables
5. Basic getter method `client.getConfig()` returns non-sensitive config (excludes `apiKey`)
6. Unit tests verify successful initialization with valid config
7. Unit tests verify `ConfigurationError` is thrown for invalid config (missing apiKey, invalid provider)
8. TypeScript types ensure `apiKey` is a string and `costLimit` is a positive number or undefined

### Story 1.5: Health Check & Provider Connection Validation

As a **backend developer**,
I want **to validate my BmadClient configuration connects to the LLM provider**,
so that **I catch configuration errors early before running expensive agent sessions**.

#### Acceptance Criteria

1. `BmadClient` has an async method `client.healthCheck()` that verifies provider connectivity
2. Health check sends a minimal test request to the LLM provider (e.g., "ping" or single-token generation)
3. Health check returns `{ status: 'ok', provider: 'anthropic', model: 'claude-sonnet-4' }` on success
4. Health check throws `ProviderConnectionError` with descriptive message on failure (invalid API key, network error, etc.)
5. Unit tests mock provider API call and verify success/failure paths
6. Example script `packages/examples/health-check.ts` demonstrates usage
7. Health check completes in <2 seconds under normal network conditions
8. Documentation includes troubleshooting guide for common health check failures

### Story 1.6: Package Publishing Configuration & NPM Metadata

As a **SDK maintainer**,
I want **proper NPM package metadata and publishing configuration**,
so that **developers can discover and install the SDK from NPM**.

#### Acceptance Criteria

1. `packages/core/package.json` has complete metadata: `name` (`@bmad/client`), `description`, `keywords`, `repository`, `author`, `license`
2. `files` field in `package.json` includes only necessary files (`dist/`, `README.md`, `LICENSE`)
3. `.npmignore` or `files` whitelist excludes source files, tests, and dev configs
4. `publishConfig` is set to public access for scoped package
5. `engines` field specifies Node.js >= 18.0.0
6. README includes installation instructions, basic usage example, and link to documentation
7. Dry-run publish command (`npm publish --dry-run`) succeeds without errors
8. Package size is under 50KB (verified with `npm pack` and inspecting tarball)

---

## Epic 2: LLM Provider Integration & Session Management

**Expanded Goal:** Build the provider abstraction layer supporting multiple LLM backends, implement the Anthropic Claude provider using the official SDK, and create the core session management system for orchestrating conversations between the application and the LLM. Sessions should handle message history, agent command execution, and basic conversation flow.

### Story 2.1: Provider Abstraction Interface

As a **SDK developer**,
I want **a clean provider interface for Anthropic Claude**,
so that **the SDK is focused and optimized for Claude's capabilities**.

#### Acceptance Criteria

1. TypeScript interface `LLMProvider` is defined in `packages/core/src/providers/provider.ts`
2. Interface includes methods: `sendMessage(messages, tools): Promise<ProviderResponse>`, `calculateCost(usage): number`, `getModelInfo(): ModelInfo`
3. `ProviderResponse` type includes fields: `message` (content), `usage` (tokens), `stopReason`, `toolCalls` (optional)
4. `Usage` type includes: `inputTokens`, `outputTokens`, `totalTokens`
5. Abstract base class `BaseProvider` implements common logic (cost calculation, error handling)
6. Unit tests verify interface contract with mock provider implementation
7. Documentation describes provider interface for custom provider authors
8. Code includes JSDoc comments explaining each method's purpose and parameters

### Story 2.2: Anthropic Claude Provider Implementation

As a **backend developer**,
I want **to use Anthropic Claude models (Sonnet, Opus, Haiku) as the LLM provider**,
so that **I can leverage state-of-the-art language models for BMad agents**.

#### Acceptance Criteria

1. `AnthropicProvider` class is implemented in `packages/provider-anthropic/src/provider.ts` implementing `LLMProvider` interface
2. Constructor accepts `apiKey` and optional `model` (defaults to `claude-sonnet-4`)
3. `sendMessage()` method uses `@anthropic-ai/sdk` to send messages to Claude API
4. Provider correctly formats messages array for Anthropic API format (system, user, assistant roles)
5. Provider correctly handles tool definitions for Claude's tool-use feature
6. Provider parses API response and returns `ProviderResponse` with usage data
7. `calculateCost()` method uses current Anthropic pricing (input: $0.003/1K tokens, output: $0.015/1K tokens for Sonnet 4)
8. Unit tests mock Anthropic SDK calls using test fixtures
9. Integration test (in `*.integration.test.ts`) calls real Anthropic API with test API key
10. Provider handles API errors (rate limits, auth errors, network failures) and throws specific error types
11. Package `@bmad/provider-anthropic` is created with proper dependencies on `@anthropic-ai/sdk`

### Story 2.3: Session Creation & Lifecycle Management

As a **backend developer**,
I want **to create agent sessions that manage conversation state and lifecycle**,
so that **I can orchestrate multi-turn interactions with BMad agents**.

#### Acceptance Criteria

1. `BmadSession` class is defined in `packages/core/src/session.ts`
2. `BmadClient.startAgent(agentId, command, options)` method creates and returns a `BmadSession` instance
3. Session stores: session ID (UUID), agent ID, command, start time, status (`pending`, `running`, `paused`, `completed`, `failed`)
4. Session has method `session.getStatus()` returning current status and metadata
5. Session emits lifecycle events via EventEmitter: `started`, `completed`, `failed`
6. Session has `session.execute()` method that initiates agent workflow (placeholder implementation for now)
7. Session validates agent ID exists before starting (throws `AgentNotFoundError`)
8. Session validates cost limit is positive number if provided (throws `ValidationError`)
9. Unit tests verify session creation, status tracking, and event emission
10. Session ID is unique and logged for traceability

### Story 2.4: Conversation History Management

As a **SDK developer**,
I want **sessions to maintain complete conversation history between user and LLM**,
so that **agents have full context for multi-turn interactions**.

#### Acceptance Criteria

1. `BmadSession` has private `messages` array storing conversation history
2. Message format follows Anthropic structure: `{ role: 'user' | 'assistant', content: string }`
3. Session method `session.addUserMessage(content)` appends user message to history
4. Session method `session.addAssistantMessage(content)` appends assistant message to history
5. Session method `session.getHistory()` returns read-only copy of message array
6. Session includes system message at start of conversation with agent persona/instructions
7. History is included in all LLM API calls for context continuity
8. Unit tests verify message appending and history retrieval
9. History is limited to last 100 messages to prevent context overflow (configurable via `maxHistoryLength`)
10. When history exceeds limit, oldest non-system messages are removed (FIFO)

### Story 2.5: Basic Agent Command Execution Flow

As a **backend developer**,
I want **sessions to execute agent commands by orchestrating LLM interactions**,
so that **agents can perform their defined tasks (e.g., PM creating PRD)**.

#### Acceptance Criteria

1. `session.execute()` method sends initial user message to LLM via provider
2. Initial message includes agent command (e.g., "*create-prd") and any user-provided context
3. Session includes agent's system prompt (persona, instructions) from agent definition
4. LLM response is added to conversation history
5. If LLM response is complete (no tool calls), session status changes to `completed`
6. Session emits `completed` event with final message content
7. If LLM response includes tool calls (future feature), session processes them (placeholder for now)
8. Integration test executes a simple agent command against real Anthropic API
9. Execution flow handles errors from provider (API failures, rate limits) and sets session status to `failed`
10. Session tracks execution duration (`startedAt`, `completedAt` timestamps)

### Story 2.6: Session Error Handling & Retry Logic

As a **backend developer**,
I want **sessions to handle LLM API failures gracefully with retries**,
so that **transient network issues don't cause complete session failures**.

#### Acceptance Criteria

1. Session wraps provider calls in try-catch blocks
2. Transient errors (network timeouts, rate limits) trigger automatic retry with exponential backoff
3. Retry logic attempts up to 3 times with delays: 1s, 2s, 4s
4. Non-retriable errors (authentication failure, invalid request) immediately fail session
5. Session emits `error` event with error details before failing
6. Session status is set to `failed` after exhausting retries
7. Error messages include actionable guidance (e.g., "Rate limit exceeded. Retry in 60 seconds.")
8. Unit tests verify retry logic using mock provider that fails N times before succeeding
9. Unit tests verify non-retriable errors fail immediately without retries
10. Session logs all retry attempts at debug level

---

## Epic 3: Agent Plugin System & Dynamic Loading

**Expanded Goal:** Implement the dynamic agent loading system that scans `.bmad-core/agents/` directories, parses agent markdown definitions with YAML frontmatter, validates agent schemas, and registers agents for execution. Support loading agents from both the core package and external expansion pack NPM packages.

### Story 3.1: Agent Definition Schema & Validation

As a **SDK developer**,
I want **to parse and validate agent definition files with strict schema checking**,
so that **only well-formed agents can be loaded and executed**.

#### Acceptance Criteria

1. Agent definition schema is defined using Zod or similar validation library in `packages/core/src/agents/schema.ts`
2. Schema validates: `agent` (name, id, title, icon), `persona` (role, style, identity, focus), `commands`, `dependencies`
3. Parser function `parseAgentDefinition(markdownContent)` extracts YAML frontmatter and validates against schema
4. Parser throws `AgentValidationError` with specific field errors if schema validation fails
5. Unit tests verify parsing of valid agent definitions (using fixtures from actual `.bmad-core/agents/*.md` files)
6. Unit tests verify validation errors for invalid agents (missing required fields, wrong types, etc.)
7. Parsed agent object is typed with TypeScript interface `AgentDefinition`
8. Documentation describes agent definition format for expansion pack authors

### Story 3.2: Agent Discovery via VFS & Glob Tool

As a **SDK developer**,
I want **agents to be discoverable via glob patterns in the virtual filesystem**,
so that **orchestrator agents can dynamically list and inspect available agents using standard tools**.

#### Acceptance Criteria

1. `glob_pattern` tool is implemented in FallbackToolExecutor for pattern-based file discovery
2. Tool supports wildcards (`*`, `**`) and standard glob patterns via `minimatch` library
3. Session automatically loads all agent files into VFS at `/.bmad-core/agents/*.md` on startup
4. `loadAgentsIntoVFS()` method scans local `.bmad-core/agents/` and fallback `../bmad-export-author/`
5. Agents can use `glob_pattern("/.bmad-core/agents/*.md")` to discover available agents
6. Agents can use `read_file("/.bmad-core/agents/pm.md")` to inspect agent definitions
7. Unit tests verify glob pattern matching with various patterns (17+ test cases)
8. Integration test demonstrates orchestrator discovering agents via glob + read
9. VFS-based discovery eliminates need for separate Registry class (simpler architecture)

### Story 3.3: Agent Definition Loading & Parsing

As a **backend developer**,
I want **the SDK to load and parse individual agent markdown files**,
so that **sessions can execute agents with their defined personas and commands**.

#### Acceptance Criteria

1. `AgentLoader` class is implemented in `packages/core/src/agent-loader.ts`
2. Loader has method `loadAgent(filePath)` that reads markdown file and parses YAML frontmatter
3. Loader uses `gray-matter` to extract YAML frontmatter from markdown files
4. Loader validates agent definition against Zod schema (from Story 3.1)
5. Session's `loadAgent()` method uses AgentLoader to load specific agent by ID
6. Loading errors (file not found, invalid YAML, schema violations) throw descriptive errors
7. Unit tests verify loading valid agents and handling various error conditions (8 test cases)
8. Loader supports fallback paths (local `.bmad-core/` and `../bmad-export-author/`)
9. All core agents (pm, po, architect, dev, qa, sm, analyst, ux-expert, bmad-orchestrator) load successfully

### Story 3.4: Expansion Pack Agent Loading from NPM Packages

As a **backend developer**,
I want **to load agents from external NPM packages (expansion packs)**,
so that **I can extend BMad with community-contributed agents for specialized domains**.

#### Acceptance Criteria

1. `BmadClient` config accepts optional `expansionPacks: string[]` array of NPM package names
2. Loader resolves each expansion pack module using Node.js `require.resolve()`
3. Loader scans expansion pack's `.bmad-core/agents/` directory for agent definitions
4. Expansion pack agents are registered with namespace prefix (e.g., `gamedev:designer`)
5. Loading errors for expansion packs are logged and don't prevent core agent loading
6. Unit tests mock NPM package structure and verify expansion pack loading
7. Example expansion pack `packages/examples/example-expansion/` demonstrates structure
8. Documentation explains how to create and publish expansion packs
9. Loader supports both ESM and CommonJS expansion pack formats
10. Client method `client.loadExpansionPack(packageName)` allows dynamic loading after initialization

### Story 3.5: Agent Metadata Inspection via Tools

As a **backend developer**,
I want **to inspect available agents using standard VFS tools**,
so that **my application can present users with agent options dynamically**.

#### Acceptance Criteria

1. Applications use `glob_pattern("/.bmad-core/agents/*.md")` to discover agent files in VFS
2. Applications use `read_file(agentPath)` to load agent markdown content
3. Applications parse YAML frontmatter using `gray-matter` to extract metadata
4. Metadata includes: id, title, icon, whenToUse, commands, persona
5. Unit tests verify VFS-based agent discovery and metadata extraction
6. Example script `packages/examples/list-agents.ts` demonstrates tool-based inspection
7. Documentation explains VFS-based approach vs traditional Registry pattern
8. Orchestrator agent demonstrates dynamic agent listing in `*help` command

### Story 3.6: Agent Persona & System Prompt Generation

As a **SDK developer**,
I want **to generate LLM system prompts from agent persona definitions**,
so that **agents behave according to their defined roles and principles**.

#### Acceptance Criteria

1. Function `generateSystemPrompt(agentDefinition)` creates system message from agent persona
2. System prompt includes: agent name, role, style, identity, focus, core principles
3. System prompt includes list of available commands with descriptions
4. System prompt instructs LLM to stay in character and follow agent principles
5. Generated prompt is validated to be under 4000 tokens (to fit in context window)
6. Unit tests verify prompt generation for each core agent
7. Generated prompts are human-readable for debugging purposes
8. Session includes agent system prompt in first message to LLM

---

## Epic 4: Template & Task Processing

**Expanded Goal:** Load YAML templates for structured document generation, parse template metadata and sections, execute task workflows from markdown files, implement elicitation logic for interactive document creation, and integrate templates/tasks with agent execution.

### Story 5.1: YAML Template Schema & Parsing

As a **SDK developer**,
I want **to parse YAML template files with schema validation**,
so that **agents can generate structured documents (PRDs, architecture, stories)**.

#### Acceptance Criteria

1. Template schema is defined using Zod in `packages/core/src/templates/schema.ts`
2. Schema validates: `template` (id, name, version, output), `workflow`, `sections` (nested structure)
3. Parser function `parseTemplate(yamlContent)` validates and returns typed `TemplateDefinition`
4. Parser throws `TemplateValidationError` with specific field errors if invalid
5. Unit tests verify parsing of core templates (prd-tmpl.yaml, architecture-tmpl.yaml, story-tmpl.yaml)
6. Parser supports nested sections with repeatable sections (e.g., epic details, stories)
7. Parser validates section instructions, elicitation flags, and conditional logic
8. Parsed template object includes all metadata needed for document generation

### Story 5.2: Template Registry & Loading

As a **SDK developer**,
I want **a central template registry that loads templates from .bmad-core/templates/**,
so that **agents can reference templates by ID during execution**.

#### Acceptance Criteria

1. `TemplateRegistry` class is implemented in `packages/core/src/templates/registry.ts`
2. Registry has methods: `register(template)`, `get(templateId)`, `list()`
3. `TemplateLoader` scans `.bmad-core/templates/` directory and loads all `*.yaml` files
4. Templates are registered during `BmadClient` initialization
5. Registry throws `TemplateNotFoundError` if unknown ID requested
6. Unit tests verify loading core templates
7. Client exposes `client.templates` for accessing registry
8. Loader supports loading templates from expansion packs

### Story 5.3: Document Generation Engine

As a **BMad agent (PM, Architect)**,
I want **to generate structured documents from templates**,
so that **I can create PRDs, architecture docs following consistent formats**.

#### Acceptance Criteria

1. `DocumentGenerator` class is implemented in `packages/core/src/templates/generator.ts`
2. Generator processes template sections sequentially, executing section instructions
3. Generator maintains document state (accumulated content, variables, context)
4. Generator supports conditional sections (skip if condition not met)
5. Generator supports repeatable sections (e.g., multiple epics, stories)
6. Generator renders final document as markdown with template-defined structure
7. Unit tests verify document generation from test template fixtures
8. Generated documents match expected format and structure
9. Generator integrates with session—agent commands like "*create-prd" trigger document generation

### Story 5.4: Task Workflow Parsing & Execution

As a **SDK developer**,
I want **to parse and execute task workflows from markdown files**,
so that **agents can follow complex multi-step processes defined in .bmad-core/tasks/**.

#### Acceptance Criteria

1. Task parser extracts markdown content and optional YAML frontmatter from `*.md` files in `.bmad-core/tasks/`
2. `TaskExecutor` class processes task instructions step-by-step
3. Task execution supports instructions like "load template X", "elicit user input", "write to file"
4. Task executor maintains execution state and can pause for user input
5. Unit tests verify parsing and execution of simple task workflows
6. Task executor integrates with agent execution flow
7. Tasks can reference templates, call other tasks, and use tools
8. Task execution errors are captured and logged

### Story 5.5: Elicitation Logic for Interactive Document Creation

As a **BMad agent (PM)**,
I want **to pause document generation and ask user questions when elicit: true sections are encountered**,
so that **I can gather user input for PRD requirements, UI goals, technical assumptions**.

#### Acceptance Criteria

1. Document generator detects `elicit: true` in template sections
2. Generator emits `question` event with section content, rationale, and numbered elicitation options (1-9)
3. Session pauses until user responds via `session.answer(input)`
4. Generator processes user feedback and updates section content accordingly
5. Generator supports numbered elicitation methods loaded from `data/elicitation-methods.md`
6. Unit tests verify elicitation flow with mock user responses
7. Integration test demonstrates creating PRD with user elicitation
8. Elicitation options are formatted exactly as specified in task workflow documentation (1-9 format)

### Story 5.6: Template Variable Substitution & Context Management

As a **SDK developer**,
I want **templates to support variable substitution (e.g., {{project_name}})**,
so that **generated documents are personalized and context-aware**.

#### Acceptance Criteria

1. Document generator maintains context object with variables (project_name, epic_number, etc.)
2. Generator performs variable substitution using template syntax `{{variable_name}}`
3. Variables can be set from user input, agent responses, or predefined values
4. Generator supports default values for missing variables (`{{variable|default}}`)
5. Unit tests verify variable substitution in various template sections
6. Nested variable references are resolved correctly
7. Generator throws descriptive error if required variable is missing without default
8. Context can be serialized/deserialized for session persistence

---

## Epic 5: Document Storage & Google Cloud Integration

**Expanded Goal:** Implement the storage abstraction layer, integrate Google Cloud Storage SDK for persisting generated documents, support saving/loading documents by path, and provide storage configuration options for bucket names and authentication.

### Story 6.1: Storage Abstraction Interface

As a **SDK developer**,
I want **a storage abstraction supporting multiple backends (GCS, S3, local, etc.)**,
so that **the SDK is not locked to a single cloud provider**.

#### Acceptance Criteria

1. TypeScript interface `StorageAdapter` is defined in `packages/core/src/storage/adapter.ts`
2. Interface includes methods: `save(path, content, metadata?): Promise<void>`, `load(path): Promise<string>`, `exists(path): Promise<boolean>`, `delete(path): Promise<void>`, `list(prefix): Promise<string[]>`
3. Metadata type supports: contentType, createdAt, updatedAt, custom key-value pairs
4. All methods return Promises for async operations
5. Interface documentation describes contract for adapter implementations
6. Mock adapter `InMemoryStorageAdapter` is created for testing
7. Unit tests verify adapter interface contract using mock implementation

### Story 6.2: Google Cloud Storage Adapter Implementation

As a **backend developer**,
I want **to persist generated documents to Google Cloud Storage buckets**,
so that **documents are durably stored and accessible across sessions**.

#### Acceptance Criteria

1. `GoogleCloudStorageAdapter` class is implemented in `packages/storage-gcs/src/adapter.ts`
2. Adapter uses `@google-cloud/storage` SDK to interact with GCS
3. Constructor accepts `bucketName` (required) and optional `credentials` or `keyFilename` for authentication
4. `save()` method uploads content to GCS bucket at specified path
5. `load()` method downloads content from GCS bucket
6. `exists()` method checks if file exists without downloading
7. `delete()` method removes file from bucket
8. `list()` method lists files matching prefix using GCS prefix filtering
9. Unit tests mock GCS SDK calls and verify adapter behavior
10. Integration test uploads/downloads real file to test GCS bucket
11. Adapter handles GCS errors gracefully (auth failures, network errors, bucket not found)
12. Package `@bmad/storage-gcs` is created with proper dependencies

### Story 6.3: Storage Integration with Sessions

As a **backend developer**,
I want **agent sessions to automatically save generated documents to configured storage**,
so that **PRDs, architecture docs, and stories persist after session completion**.

#### Acceptance Criteria

1. `BmadClient` config accepts optional `storage: StorageAdapter` parameter
2. When storage is configured, session saves documents after successful generation
3. Session calls `storage.save()` with document path (from template output.filename) and content
4. Session emits `document-saved` event with file path and metadata
5. If storage is not configured, documents remain only in virtual filesystem (warning logged)
6. Save failures are logged but don't fail the entire session (documents remain in VFS)
7. Unit tests verify document saving with mock storage adapter
8. Integration test generates PRD and verifies it's saved to GCS

### Story 6.4: Document Loading & Reference During Sessions

As a **BMad agent (Architect, SM)**,
I want **to load previously generated documents from storage**,
so that **I can reference the PRD when creating architecture or stories**.

#### Acceptance Criteria

1. Session method `session.loadDocument(path)` retrieves document from storage and adds to VFS
2. Agents can use Read tool to access loaded documents
3. Session pre-loads referenced documents based on agent dependencies (e.g., Architect loads PRD)
4. Loading failures are logged with specific error messages (file not found, network error)
5. Unit tests verify document loading with mock storage
6. Integration test demonstrates Architect agent loading PRD from GCS
7. Loaded documents are cached in VFS to avoid repeated storage calls
8. Session option `autoLoadDependencies: boolean` controls automatic document loading

### Story 6.5: Storage Configuration & Authentication

As a **backend developer**,
I want **flexible GCS authentication options (service account, ADC, key file)**,
so that **I can configure storage for development, testing, and production environments**.

#### Acceptance Criteria

1. GCS adapter supports authentication via: service account JSON, key file path, Application Default Credentials (ADC)
2. Constructor parameter `credentials` accepts service account JSON object
3. Constructor parameter `keyFilename` accepts path to JSON key file
4. If neither provided, adapter uses Application Default Credentials
5. Adapter validates authentication on initialization (throws `AuthenticationError` if invalid)
6. Documentation includes setup guides for each authentication method
7. Example configurations for local development (key file) and production (ADC)
8. Unit tests verify authentication options with mocked credentials
9. Adapter logs authentication method used at debug level

### Story 6.6: In-Memory Storage Adapter for Testing

As a **backend developer**,
I want **an in-memory storage adapter for testing and demos**,
so that **I can use the SDK without configuring GCS during development**.

#### Acceptance Criteria

1. `InMemoryStorageAdapter` class is implemented in `packages/core/src/storage/memory-adapter.ts`
2. Adapter stores documents in a Map (path → content)
3. Adapter implements full `StorageAdapter` interface
4. All operations are synchronous but wrapped in Promises for consistency
5. Adapter supports `clear()` method for resetting state between tests
6. Unit tests verify all adapter operations
7. Documentation recommends in-memory adapter for testing, warns against production use
8. Example scripts demonstrate using in-memory adapter

---

## Epic 6: Cost Tracking, Limits & Reporting

**Expanded Goal:** Implement comprehensive token usage tracking for all LLM API calls, calculate session costs based on provider pricing, enforce cost limits with clear errors, and provide detailed cost reports including per-model breakdowns at session completion.

### Story 7.1: Token Usage Tracking Infrastructure

As a **SDK developer**,
I want **to track input/output tokens for every LLM API call**,
so that **I can calculate accurate session costs**.

#### Acceptance Criteria

1. `CostTracker` class is implemented in `packages/core/src/cost/tracker.ts`
2. Tracker maintains: `totalInputTokens`, `totalOutputTokens`, `apiCallCount`, `perModelUsage` (breakdown by model)
3. Tracker method `tracker.recordUsage(usage: Usage, model: string)` adds to totals
4. Tracker method `tracker.getUsage()` returns current totals
5. Session integrates tracker and records usage after each provider call
6. Unit tests verify usage accumulation across multiple API calls
7. Tracker is serializable for session persistence
8. Tracker logs usage at debug level after each API call

### Story 7.2: Cost Calculation by Provider & Model

As a **SDK developer**,
I want **to calculate costs based on provider pricing tables**,
so that **sessions report accurate cost estimates in the provider's currency**.

#### Acceptance Criteria

1. `PricingTable` defines cost per 1K tokens (input and output) for each model
2. Pricing tables exist for Anthropic (Sonnet 4, Opus 4, Haiku 4) with current rates
3. `CostCalculator` class computes cost using formula: `(inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice`
4. Calculator method `calculator.calculateCost(usage, model)` returns cost as number
5. Calculator supports currency specification (EUR, USD) from provider metadata
6. Unit tests verify cost calculation for various usage scenarios
7. Calculator includes `estimateCost(inputTokenCount, outputTokenCount, model)` for pre-execution estimates
8. Pricing tables are documented and include "last updated" dates for transparency

### Story 7.3: Session-Level Cost Limits

As a **backend developer**,
I want **to set cost limits per session to prevent runaway expenses**,
so that **agents stop execution if costs exceed my budget**.

#### Acceptance Criteria

1. `BmadClient.startAgent()` accepts optional `costLimit: number` parameter
2. Session checks total cost against limit after each LLM API call
3. When cost exceeds limit, session throws `CostLimitExceededError` with current cost and limit
4. Error message includes actionable guidance (suggest increasing limit or optimizing prompts)
5. Session status is set to `failed` when cost limit exceeded
6. Session emits `cost-limit-exceeded` event before throwing error
7. Unit tests verify limit enforcement at various thresholds
8. Integration test demonstrates session stopping when limit exceeded
9. Cost limit check includes small buffer (1%) to account for rounding errors

### Story 7.4: Cost Reporting & Final Session Summary

As a **backend developer**,
I want **detailed cost reports at session completion**,
so that **I can monitor and optimize LLM API spending**.

#### Acceptance Criteria

1. `SessionResult` type includes `costs: CostReport` field
2. `CostReport` type includes: `totalCost`, `currency`, `inputTokens`, `outputTokens`, `apiCalls`, `breakdown: ModelCost[]`
3. `ModelCost` type includes: `model`, `inputTokens`, `outputTokens`, `inputCost`, `outputCost`
4. `session.execute()` returns `SessionResult` with complete cost report
5. Cost report is logged at info level after session completion
6. Unit tests verify cost report structure and accuracy
7. Example output demonstrates cost report format
8. Cost report includes link to provider pricing page for verification

### Story 7.5: Cost Warning Events & Thresholds

As a **backend developer**,
I want **to receive warnings when approaching cost limits**,
so that **I can decide whether to continue or abort expensive operations**.

#### Acceptance Criteria

1. Session emits `cost-warning` event at 50%, 75%, and 90% of cost limit
2. Warning event includes current cost, limit, and percentage used
3. Session option `costWarningThresholds: number[]` allows custom warning levels
4. Unit tests verify warnings are emitted at correct thresholds
5. Documentation includes example of handling cost warnings
6. Example application demonstrates asking user to continue when warning triggered
7. Warnings are logged at warn level

### Story 7.6: Cost Estimation Before Execution

As a **backend developer**,
I want **to estimate session costs before starting execution**,
so that **I can validate budgets and inform users of expected expenses**.

#### Acceptance Criteria

1. `BmadClient` has method `client.estimateCost(agentId, command, options)` returning cost estimate
2. Estimate is based on historical data for similar agent/command combinations
3. Estimate returns range: `{ min: number, max: number, currency: string }`
4. If no historical data exists, estimate uses conservative assumptions (e.g., 10K tokens)
5. Estimate considers document size if provided in options
6. Unit tests verify estimation logic
7. Documentation explains estimation methodology and accuracy limitations
8. Example demonstrates using estimate to set cost limits dynamically

---

## Epic 7: Pause/Resume & Advanced Session Features

**Expanded Goal:** Build the pause/resume mechanism enabling sessions to pause when LLMs ask questions, emit question events to the application layer, accept user answers, persist session state for resumption, and maintain full conversation context across pause/resume cycles.

### Story 8.1: Question Detection & Session Pause

As a **SDK developer**,
I want **sessions to detect when the LLM asks a question and pause automatically**,
so that **applications can gather user input before continuing**.

#### Acceptance Criteria

1. Session analyzes LLM responses for question patterns (ends with "?", elicitation format, specific markers)
2. When question detected, session status changes to `paused`
3. Session emits `question` event with: `question` (text), `context` (conversation history excerpt), `options` (if numbered format)
4. Session execution pauses (does not continue sending messages to LLM)
5. Unit tests verify question detection for various formats
6. Integration test demonstrates session pausing on LLM question
7. Question detection handles multi-line questions and elicitation formats
8. Session logs question event at info level

### Story 8.2: Answer Handling & Session Resumption

As a **backend developer**,
I want **to provide answers to paused sessions and resume execution**,
so that **agents can continue their tasks with user input**.

#### Acceptance Criteria

1. Paused session has method `session.answer(input: string)` to provide user response
2. `answer()` method adds user input to conversation history
3. `answer()` method changes session status from `paused` to `running`
4. Session resumes execution by sending user answer to LLM and continuing workflow
5. Session emits `resumed` event when resumption begins
6. Unit tests verify answer handling and status transitions
7. Integration test demonstrates full pause-answer-resume cycle
8. Calling `answer()` on non-paused session throws `InvalidStateError`

### Story 8.3: Session State Persistence & Serialization

As a **backend developer**,
I want **to persist session state to storage**,
so that **sessions can resume after application restarts or server failures**.

#### Acceptance Criteria

1. Session has method `session.serialize()` returning JSON-serializable state object
2. Serialized state includes: session ID, agent ID, command, status, conversation history, VFS state, cost tracker state, context variables
3. `BmadSession.deserialize(state, client)` static method reconstructs session from serialized state
4. Session automatically persists state to storage after status changes (if storage configured)
5. Persisted state is saved to path like `.bmad-sessions/{sessionId}.json`
6. Unit tests verify serialization and deserialization roundtrip
7. Integration test persists session, restarts client, and resumes session
8. Deserialization validates state integrity (throws `CorruptedStateError` if invalid)

### Story 8.4: Multi-Turn Question/Answer Workflows

As a **BMad agent (PM)**,
I want **to ask multiple questions in sequence during document creation**,
so that **I can gather comprehensive user input for PRD sections**.

#### Acceptance Criteria

1. Session supports multiple pause-answer cycles during a single execution
2. Each question is associated with specific context (which section, why asking)
3. Session tracks question history (questions asked, answers provided)
4. Session method `session.getQuestionHistory()` returns array of Q&A pairs
5. Unit tests verify multi-turn workflows with several pause-answer cycles
6. Integration test creates PRD requiring 5+ questions and answers
7. Session does not lose context across multiple pauses
8. Question context helps users understand what information is needed and why

### Story 8.5: Timeout Handling for Paused Sessions

As a **SDK developer**,
I want **paused sessions to timeout if no answer is provided within a configured duration**,
so that **abandoned sessions don't consume resources indefinitely**.

#### Acceptance Criteria

1. Session accepts optional `pauseTimeout` parameter (default: 30 minutes)
2. When paused, session starts timeout timer
3. If timeout expires before answer provided, session status changes to `timeout`
4. Session emits `timeout` event with session ID and elapsed time
5. Timeout can be extended by calling `session.extendTimeout(additionalMinutes)`
6. Unit tests verify timeout behavior with fast timers
7. Timed-out sessions cannot be answered (throws `TimeoutError`)
8. Timeout is configurable globally via `BmadClient` config

### Story 8.6: Session Resumption API for Crashed Applications

As a **backend developer**,
I want **to resume sessions by ID after my application restarts**,
so that **users can continue interrupted workflows**.

#### Acceptance Criteria

1. `BmadClient` has method `client.resumeSession(sessionId): Promise<BmadSession>` to load and resume session
2. Method loads serialized state from storage, deserializes, and returns active session
3. Resumed session maintains all history, costs, and context from before interruption
4. Method throws `SessionNotFoundError` if session ID doesn't exist in storage
5. Unit tests verify resumption from stored state
6. Integration test simulates application crash, restart, and session resumption
7. Documentation includes example of resuming sessions in failure recovery scenarios
8. Client maintains active session registry to prevent duplicate resumption

---

## Epic 8: Error Handling, Logging & Production Readiness

**Expanded Goal:** Implement comprehensive error handling for all failure modes (API errors, rate limits, authentication failures, storage errors), add structured logging with configurable levels, provide retry logic with exponential backoff, and ensure the SDK is production-ready with graceful degradation.

### Story 9.1: Error Type Hierarchy & Custom Errors

As a **SDK developer**,
I want **specific error types for different failure modes**,
so that **applications can handle errors appropriately based on error type**.

#### Acceptance Criteria

1. Base error class `BmadError` extends `Error` with additional fields: `code`, `details`, `isRetriable`
2. Specific error types: `ConfigurationError`, `AuthenticationError`, `ProviderError`, `RateLimitError`, `CostLimitExceededError`, `StorageError`, `AgentNotFoundError`, `TemplateNotFoundError`, `ValidationError`, `TimeoutError`, `SessionNotFoundError`
3. Each error type has unique error code (e.g., `RATE_LIMIT_EXCEEDED`)
4. Error messages include actionable guidance where possible
5. `isRetriable` flag indicates if operation should be retried
6. Unit tests verify error construction and properties
7. Errors are exported from main package for application imports
8. Documentation lists all error types with descriptions and handling recommendations

### Story 9.2: Retry Logic with Exponential Backoff

As a **SDK developer**,
I want **automatic retries for transient failures with exponential backoff**,
so that **temporary issues don't cause session failures**.

#### Acceptance Criteria

1. `RetryPolicy` class defines retry behavior: max attempts, initial delay, backoff multiplier
2. Default policy: 3 attempts, 1s initial delay, 2x backoff (1s, 2s, 4s)
3. Retry wrapper function `withRetry(operation, policy)` executes operation with retry logic
4. Only retriable errors trigger retries (rate limits, network errors); others fail immediately
5. Retry attempts are logged at warn level with attempt number and delay
6. Unit tests verify retry logic with mock operations that fail N times
7. Retry policy is configurable via `BmadClient` config
8. Provider calls use retry wrapper for resilience

### Story 9.3: Structured Logging Infrastructure

As a **SDK developer**,
I want **structured logging with configurable levels and formats**,
so that **applications can integrate SDK logs into their logging systems**.

#### Acceptance Criteria

1. Logger abstraction supports levels: `error`, `warn`, `info`, `debug`
2. Default logger uses `console` methods with timestamp and level prefixes
3. Logger accepts custom implementation via `BmadClient` config (`logger: Logger` interface)
4. Logger supports structured data (JSON) for machine-readable logs
5. All SDK components use logger instead of direct console calls
6. Log level is configurable via `logLevel` config parameter
7. Unit tests verify logging output at different levels
8. Documentation explains custom logger integration (e.g., Winston, Pino)

### Story 9.4: LLM API Error Handling

As a **backend developer**,
I want **graceful handling of LLM API errors with clear error messages**,
so that **I can troubleshoot issues quickly**.

#### Acceptance Criteria

1. Provider catches all API errors from Anthropic SDK
2. API errors are classified into specific error types based on status codes
3. `AuthenticationError` for 401 (invalid API key)
4. `RateLimitError` for 429 (rate limit exceeded)
5. `ProviderError` for 5xx (server errors)
6. Error messages include provider error details (error message, request ID, status code)
7. Rate limit errors include retry-after information if available
8. Unit tests verify error handling for each error type
9. Integration test demonstrates handling real API error (invalid key)

### Story 9.5: Storage Error Handling & Fallbacks

As a **backend developer**,
I want **storage operations to fail gracefully without crashing sessions**,
so that **document save failures don't lose session results**.

#### Acceptance Criteria

1. Storage adapter methods catch and wrap exceptions in `StorageError`
2. Session save operations are wrapped in try-catch blocks
3. If storage save fails, session logs error but continues (documents remain in VFS)
4. Session emits `storage-error` event with error details
5. Applications can listen to storage errors and implement custom fallback logic
6. Unit tests verify storage failure handling
7. Integration test simulates GCS failure and verifies session completion
8. Error messages suggest checking GCS credentials, network, bucket permissions

### Story 9.6: Health Monitoring & Diagnostics

As a **backend developer**,
I want **diagnostic methods to check SDK health and troubleshoot issues**,
so that **I can validate configuration and monitor production deployments**.

#### Acceptance Criteria

1. `BmadClient.healthCheck()` verifies provider connectivity, storage access, agent loading
2. Health check returns detailed report: `{ provider: 'ok' | 'error', storage: 'ok' | 'error', agents: number }`
3. Health check includes response times for provider and storage operations
4. Client has method `client.getDiagnostics()` returning: SDK version, Node version, active sessions, total sessions, cost totals
5. Unit tests verify health check reporting
6. Integration test demonstrates health check against real provider and storage
7. Documentation includes troubleshooting guide using health check
8. Health check can be exposed via REST endpoint for monitoring

---

## Epic 9: TypeScript Support, Documentation & Examples

**Expanded Goal:** Finalize comprehensive TypeScript type definitions for all public APIs, generate API reference documentation from JSDoc comments, create developer guides covering all major features, build example applications demonstrating integration patterns, and ensure excellent developer experience.

### Story 10.1: Comprehensive TypeScript Type Definitions

As a **backend developer**,
I want **complete TypeScript types for all SDK APIs**,
so that **I get IDE autocomplete and compile-time type safety**.

#### Acceptance Criteria

1. All public classes, methods, and types have TypeScript definitions
2. Type definitions are exported from main package entry point
3. Generic types are used where appropriate (e.g., `StorageAdapter<T>`)
4. All function parameters and return types are explicitly typed
5. Complex types include JSDoc comments explaining usage
6. Type tests verify type correctness and inference
7. `tsc --noEmit` passes without errors for all code
8. Published package includes `.d.ts` files for all modules

### Story 10.2: JSDoc Comments & Inline Documentation

As a **backend developer**,
I want **detailed JSDoc comments on all public APIs**,
so that **I get documentation in my IDE without leaving my editor**.

#### Acceptance Criteria

1. All public classes have class-level JSDoc with description, example usage
2. All public methods have JSDoc including: description, parameter descriptions, return value description, example, throws documentation
3. JSDoc uses TypeScript types (e.g., `@param {string} name`)
4. Complex types have JSDoc describing each field
5. Examples in JSDoc are executable code snippets
6. JSDoc includes links to related methods and concepts
7. VSCode IntelliSense displays full documentation on hover
8. 100% of public API surface has JSDoc coverage

### Story 10.3: Getting Started Guide & Tutorials

As a **backend developer new to BMad**,
I want **a comprehensive getting started guide**,
so that **I can integrate the SDK in under 30 minutes**.

#### Acceptance Criteria

1. Getting started guide is written in `docs/getting-started.md`
2. Guide includes: installation, basic configuration, first agent execution, handling questions, cost limits
3. Guide uses real code examples that developers can copy-paste
4. Guide explains key concepts: agents, sessions, templates, tools, storage
5. Guide includes troubleshooting section for common issues
6. Guide has "Next Steps" section pointing to advanced guides
7. Guide is tested by following steps exactly and verifying they work
8. Guide is accessible from README and documentation site

### Story 10.4: API Reference Documentation

As a **backend developer**,
I want **auto-generated API reference documentation**,
so that **I can look up methods, parameters, and types easily**.

#### Acceptance Criteria

1. API reference is generated from TypeScript types and JSDoc using TypeDoc or similar tool
2. Reference includes all classes, interfaces, types, and enums
3. Each API item includes: description, parameters, return values, examples, related items
4. Reference is organized by module (client, session, providers, storage, agents, tools)
5. Reference is published as static HTML site
6. Reference is searchable
7. Reference includes source code links to GitHub
8. Reference is versioned (matches SDK version)

### Story 10.5: Feature Guides (Session Management, Cost Tracking, Storage)

As a **backend developer**,
I want **in-depth guides for major SDK features**,
so that **I can use advanced capabilities effectively**.

#### Acceptance Criteria

1. Session Management Guide covers: creating sessions, pause/resume, state persistence, multi-turn workflows
2. Cost Tracking Guide covers: setting limits, understanding reports, estimating costs, optimizing expenses
3. Storage Guide covers: configuring GCS, implementing custom adapters, handling storage failures
4. Agent Plugin Guide covers: loading expansion packs, creating custom agents, agent lifecycle
5. Each guide includes: overview, configuration examples, code examples, best practices, troubleshooting
6. Guides are written in markdown and published to documentation site
7. Guides link to API reference for detailed method documentation
8. Guides include real-world use case examples

### Story 10.6: Example Applications & Integration Patterns

As a **backend developer**,
I want **ready-to-run example applications**,
so that **I can see the SDK in action and adapt examples to my needs**.

#### Acceptance Criteria

1. Example: Express API server exposing BMad agents as REST endpoints
2. Example: Next.js API route handler for serverless deployment
3. Example: Standalone script creating PRD with user prompts
4. Example: AWS Lambda function running BMad agent on event trigger
5. Example: Custom storage adapter implementation (local filesystem)
7. Each example includes: README with setup instructions, complete working code, demonstration of key features
8. Examples are tested in CI/CD to ensure they work
9. Examples are published in `packages/examples/` and on documentation site

### Story 10.7: Migration & Upgrade Guides

As a **backend developer using older SDK versions**,
I want **migration guides for upgrading between major versions**,
so that **I can adopt new features without breaking my application**.

#### Acceptance Criteria

1. Migration guide documents breaking changes between major versions
2. Guide includes step-by-step upgrade instructions
3. Guide highlights deprecated features and their replacements
4. Guide includes code examples showing before/after
5. Guide estimates effort required for migration
6. Guide is published before major version release
7. Deprecated features log warnings with migration instructions
8. Guide is accessible from changelog and documentation site

---

## Checklist Results Report

**Note:** This section will be populated after running the `pm-checklist.md` to validate the PRD completeness and quality.

_(To be completed: Execute checklist and document results here)_

---

## Next Steps

### UX Expert Prompt

Sally, please review this PRD focusing on the developer experience aspects. Evaluate:

1. **Developer Journey:** Is the getting started guide clear and achievable in <30 minutes?
2. **API Usability:** Do the TypeScript types and examples make the SDK intuitive?
3. **Error Experience:** Are error messages actionable and helpful?
4. **Documentation Flow:** Can developers discover features naturally through docs?

Create a front-end specification document if UI components are needed for documentation site, example dashboards, or developer tools.

### Architect Prompt

Winston, please review this PRD and create a comprehensive architecture document. Focus on:

1. **System Design:** Define the module structure, class hierarchy, and dependency graph for the monorepo
2. **Provider Implementation:** Design the Anthropic provider with a clean interface that allows future extensibility if needed
3. **Session State Machine:** Define the state transitions, persistence format, and recovery mechanisms
4. **Virtual File System:** Specify the VFS implementation, tool integration, and performance characteristics
5. **Cost Tracking:** Design the cost calculation engine, pricing table management, and reporting architecture
6. **Storage Layer:** Define the storage abstraction, GCS integration, and future adapter patterns
7. **Scalability:** Address concurrent sessions, serverless compatibility, and performance optimization
8. **Security:** Document API key management, input validation, and secure storage practices

Use the technical assumptions section as constraints and deliver a fullstack architecture covering all layers of the SDK.

---

**Document Version:** 1.0
**Created:** 2025-10-31
**Author:** John (PM)
**Based on Project Brief by:** Mary (Business Analyst)
