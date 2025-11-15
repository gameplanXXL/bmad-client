# Coding Standards

## Overview

This document defines the coding standards, conventions, and best practices for the BMad Client Library. Following these standards ensures **consistency**, **maintainability**, and **high code quality** across the entire codebase.

---

## TypeScript Standards

### Strict Mode Configuration

**All packages MUST use TypeScript strict mode:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Annotations

**DO:**
```typescript
// ✅ Explicit return types for public APIs
export class BmadClient {
  async startAgent(agentId: string, command: string): Promise<BmadSession> {
    // ...
  }
}

// ✅ Explicit parameter types
function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.003) + (outputTokens * 0.015);
}

// ✅ Type inference for local variables (when obvious)
const session = new BmadSession(config); // Type inferred
```

**DON'T:**
```typescript
// ❌ Missing return type on public API
export class BmadClient {
  async startAgent(agentId: string, command: string) { // Missing Promise<BmadSession>
    // ...
  }
}

// ❌ Using 'any' without explicit opt-in
function processData(data: any) { // Should use 'unknown' or specific type
  // ...
}
```

### Type Definitions

**Prefer interfaces for public APIs:**
```typescript
// ✅ Interface for configuration objects
export interface BmadClientConfig {
  provider: ProviderConfig;
  storage?: StorageConfig;
  costLimit?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  logger?: Logger;
}
```

**Use type aliases for unions and complex types:**
```typescript
// ✅ Type alias for union types
export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

// ✅ Type alias for function signatures
export type QuestionHandler = (question: Question) => Promise<string>;
```

### Generics

**Use generics for reusable, type-safe components:**
```typescript
// ✅ Generic storage adapter
export interface StorageAdapter<TMetadata = Record<string, unknown>> {
  save(path: string, content: string, metadata?: TMetadata): Promise<void>;
  load(path: string): Promise<string>;
}

// ✅ Generic event emitter
export class BmadSession<TEvents extends EventMap = DefaultEvents> extends EventEmitter<TEvents> {
  // ...
}
```

---

## Code Organization

### File Structure

**One export per file (for classes):**
```
src/
├── client.ts          # BmadClient class
├── session.ts         # BmadSession class
├── types.ts           # Shared type definitions
├── agents/
│   ├── loader.ts      # AgentLoader class
│   ├── schema.ts      # Agent schemas
│   └── index.ts       # Barrel export
```

**Group related functionality:**
```
src/
├── providers/
│   ├── anthropic.ts   # AnthropicProvider implementation
│   ├── types.ts       # Provider interfaces
│   └── index.ts       # Barrel exports
```

### Barrel Exports

**Use `index.ts` for clean public APIs:**
```typescript
// src/storage/index.ts
export { StorageAdapter } from './types.js';
export { InMemoryStorageAdapter } from './memory-adapter.js';
export { GoogleCloudStorageAdapter } from './gcs-adapter.js';
export type { StorageConfig, StorageMetadata } from './types.js';
```

**Main package export:**
```typescript
// src/index.ts
export { BmadClient } from './client.js';
export { BmadSession } from './session.js';
export { ConversationalSession } from './conversational-session.js';

export type {
  BmadClientConfig,
  SessionOptions,
  SessionResult,
  ConversationalOptions,
} from './types.js';

// Re-export submodules
export * from './storage/index.js';
export * from './providers/index.js';
```

---

## Naming Conventions

### Classes

**PascalCase for class names:**
```typescript
// ✅ Class names
export class BmadClient { }
export class BmadSession { }
export class GoogleCloudStorageAdapter { }
```

### Interfaces & Types

**PascalCase for interfaces and type aliases:**
```typescript
// ✅ Interface names
export interface BmadClientConfig { }
export interface StorageAdapter { }

// ✅ Type alias names
export type SessionStatus = 'pending' | 'running';
export type QuestionHandler = (q: Question) => Promise<string>;
```

### Functions & Methods

**camelCase for functions and methods:**
```typescript
// ✅ Method names
class BmadClient {
  async startAgent(agentId: string): Promise<BmadSession> { }
  async waitForInit(): Promise<void> { }
  private async loadTemplates(): Promise<void> { }
}

// ✅ Function names
export function calculateCost(usage: Usage): number { }
export async function loadAgentDefinition(path: string): Promise<AgentDefinition> { }
```

### Variables & Constants

**camelCase for variables:**
```typescript
// ✅ Variable names
const sessionId = generateId();
let retryCount = 0;
```

**UPPER_SNAKE_CASE for true constants:**
```typescript
// ✅ Constants (immutable values)
const MAX_RETRIES = 3;
const DEFAULT_COST_LIMIT = 10.0;
const API_BASE_URL = 'https://api.anthropic.com/v1';
```

### Private Members

**Prefix private members with underscore (optional, but recommended):**
```typescript
class BmadSession {
  private _messages: Message[] = [];
  private _costTracker: CostTracker;

  // Or use private without prefix (also acceptable)
  private messages: Message[] = [];
  private costTracker: CostTracker;
}
```

---

## Error Handling

### Custom Error Classes

**Extend Error with specific error types:**
```typescript
// ✅ Base error class
export class BmadError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly isRetriable: boolean;

  constructor(message: string, code: string, isRetriable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.isRetriable = isRetriable;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ✅ Specific error types
export class CostLimitExceededError extends BmadError {
  constructor(currentCost: number, limit: number) {
    super(
      `Session cost $${currentCost.toFixed(2)} exceeds limit $${limit.toFixed(2)}`,
      'COST_LIMIT_EXCEEDED',
      false,
      { currentCost, limit }
    );
  }
}
```

### Error Messages

**Provide actionable error messages:**
```typescript
// ✅ Clear, actionable error messages
throw new ConfigurationError(
  'API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config.',
  'MISSING_API_KEY'
);

// ❌ Vague error messages
throw new Error('Invalid configuration'); // What's invalid? How to fix?
```

### Try-Catch Blocks

**Handle errors at appropriate levels:**
```typescript
// ✅ Catch specific errors, re-throw or wrap unknown errors
try {
  await provider.sendMessage(messages, tools);
} catch (error) {
  if (error instanceof RateLimitError) {
    this.logger.warn('Rate limit hit, retrying...', { retryAfter: error.retryAfter });
    await this.retry();
  } else if (error instanceof AuthenticationError) {
    throw error; // Don't retry auth errors
  } else {
    throw new ProviderError('LLM API call failed', { cause: error });
  }
}
```

---

## Async/Await

### Promise Handling

**Always use async/await (no raw Promises or callbacks):**
```typescript
// ✅ async/await
export class BmadSession {
  async execute(): Promise<SessionResult> {
    await this.initialize();
    const result = await this.runConversation();
    await this.saveDocuments();
    return result;
  }
}

// ❌ Raw promises
export class BmadSession {
  execute(): Promise<SessionResult> {
    return this.initialize()
      .then(() => this.runConversation())
      .then((result) => {
        return this.saveDocuments().then(() => result);
      });
  }
}
```

### Promise.all for Parallel Operations

**Use Promise.all for independent async operations:**
```typescript
// ✅ Parallel execution
async initialize(): Promise<void> {
  await Promise.all([
    this.loadTemplates(),
    this.initializeStorage(),
    this.loadAgents(),
  ]);
}

// ❌ Sequential when parallel is safe
async initialize(): Promise<void> {
  await this.loadTemplates();    // Wait unnecessarily
  await this.initializeStorage(); // Wait unnecessarily
  await this.loadAgents();       // Wait unnecessarily
}
```

---

## Logging

### Logger Interface

**Use structured logging:**
```typescript
interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

**Log with context:**
```typescript
// ✅ Structured logging with context
this.logger.info('Session started', {
  sessionId: this.id,
  agentId: this.agentId,
  command: this.command,
});

this.logger.error('Storage save failed', {
  sessionId: this.id,
  path: documentPath,
  error: error.message,
});

// ❌ Unstructured logging
console.log('Session started: ' + this.id);
console.error('Error:', error);
```

### Log Levels

**Use appropriate log levels:**

| Level | Usage |
|-------|-------|
| **error** | Unrecoverable errors, exceptions |
| **warn** | Recoverable issues, deprecation warnings, retry attempts |
| **info** | Important lifecycle events (session started, completed, document saved) |
| **debug** | Detailed execution flow, tool calls, API requests |

---

## Comments & Documentation

### JSDoc for Public APIs

**All public classes/methods MUST have JSDoc:**
```typescript
/**
 * BmadClient - Main entry point for the BMad SDK
 *
 * Manages agent sessions, template loading, and storage integration.
 *
 * @example
 * ```typescript
 * const client = new BmadClient({
 *   provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
 *   storage: { type: 'memory' },
 * });
 *
 * const session = await client.startAgent('pm', 'create-prd');
 * const result = await session.execute();
 * ```
 */
export class BmadClient {
  /**
   * Start a new agent session
   *
   * @param agentId - Agent identifier (e.g., 'pm', 'architect')
   * @param command - Command to execute (e.g., 'create-prd')
   * @param options - Session options (cost limit, timeout, etc.)
   * @returns Promise resolving to BmadSession instance
   * @throws {AgentNotFoundError} If agent ID is not found
   * @throws {ValidationError} If options are invalid
   */
  async startAgent(
    agentId: string,
    command: string,
    options?: SessionOptions
  ): Promise<BmadSession> {
    // ...
  }
}
```

### Inline Comments

**Use inline comments sparingly (code should be self-documenting):**
```typescript
// ✅ Comment explains WHY, not WHAT
// Retry with exponential backoff to handle transient network issues
await this.retryWithBackoff(operation);

// ❌ Comment restates obvious code
// Set status to 'running'
this.status = 'running';
```

### TODO Comments

**Format:**
```typescript
// TODO(username): Description of work needed
// Example:
// TODO(winston): Implement streaming response support for real-time feedback
```

---

## Testing Standards

### Test File Naming

**Convention:** `<module>.test.ts` or `<module>.integration.test.ts`

```
src/
├── client.ts
├── __tests__/
│   ├── client.test.ts              # Unit tests
│   ├── client.integration.test.ts  # Integration tests
│   └── test-helpers.ts             # Shared test utilities
```

### Test Structure

**Use descriptive test names:**
```typescript
// ✅ Descriptive test names
describe('BmadClient', () => {
  describe('startAgent', () => {
    it('should create a new session with valid agent ID', async () => {
      // Arrange
      const client = new BmadClient(config);

      // Act
      const session = await client.startAgent('pm', 'create-prd');

      // Assert
      expect(session).toBeInstanceOf(BmadSession);
      expect(session.agentId).toBe('pm');
    });

    it('should throw AgentNotFoundError for invalid agent ID', async () => {
      // Arrange
      const client = new BmadClient(config);

      // Act & Assert
      await expect(client.startAgent('invalid', 'test')).rejects.toThrow(AgentNotFoundError);
    });
  });
});
```

### Test Coverage

**Minimum coverage targets:**
- Overall: 90%
- Critical paths (session execution, cost tracking): 100%
- Error handling: 100%

**Run coverage:**
```bash
pnpm test:coverage
```

---

## ES Modules

### Import/Export Conventions

**Use explicit `.js` extension in imports (required for ESM):**
```typescript
// ✅ Explicit .js extension
import { BmadSession } from './session.js';
import type { SessionOptions } from './types.js';

// ❌ No extension (causes runtime errors in ESM)
import { BmadSession } from './session';
```

**Prefer named exports over default exports:**
```typescript
// ✅ Named exports
export class BmadClient { }
export interface BmadClientConfig { }

// ❌ Default exports (harder to refactor, worse IDE support)
export default class BmadClient { }
```

---

## Security Best Practices

### API Key Handling

**NEVER log or store API keys:**
```typescript
// ✅ Sanitize logs
this.logger.info('Client initialized', {
  provider: config.provider.type,
  model: config.provider.model,
  // apiKey: NEVER LOG THIS
});

// ✅ Validate without exposing
if (!config.provider.apiKey || config.provider.apiKey.length < 10) {
  throw new ConfigurationError('Invalid API key format');
}
```

### Input Validation

**Validate all user inputs:**
```typescript
// ✅ Validate parameters
async startAgent(agentId: string, command: string): Promise<BmadSession> {
  if (!agentId || typeof agentId !== 'string') {
    throw new ValidationError('Agent ID must be a non-empty string');
  }

  if (!command || typeof command !== 'string') {
    throw new ValidationError('Command must be a non-empty string');
  }

  // ...
}
```

---

## Performance Guidelines

### Avoid Blocking Operations

**Use async operations for I/O:**
```typescript
// ✅ Async file operations
import { readFile } from 'fs/promises';
const content = await readFile(path, 'utf-8');

// ❌ Blocking sync operations
import { readFileSync } from 'fs';
const content = readFileSync(path, 'utf-8'); // Blocks event loop!
```

### Optimize Loops

**Minimize work in loops:**
```typescript
// ✅ Hoist invariants out of loops
const templatePath = this.getTemplatePath();
for (const template of templates) {
  await this.loadTemplate(templatePath, template);
}

// ❌ Repeated invariant work
for (const template of templates) {
  const templatePath = this.getTemplatePath(); // Called every iteration!
  await this.loadTemplate(templatePath, template);
}
```

---

## Git Commit Standards

### Commit Message Format

**Convention:** `<type>: <subject>`

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no behavior change)
- `test:` - Adding or updating tests
- `chore:` - Build process, dependency updates

**Examples:**
```
feat: add streaming response support for real-time feedback
fix: correct cost calculation for Opus model
docs: update getting started guide with storage examples
refactor: simplify session state machine transitions
test: add integration tests for expansion pack loading
chore: update dependencies to latest versions
```

---

## References

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **ESLint Rules:** https://eslint.org/docs/rules/
- **Vitest Best Practices:** https://vitest.dev/guide/

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Winston (Architect)
