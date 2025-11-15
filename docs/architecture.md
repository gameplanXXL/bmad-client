# BMad Client Library - Architecture Document

## Introduction

This document defines the architecture for **BMad Client Library**, a Node.js/TypeScript SDK that enables developers to integrate BMad-Method workflows into web and desktop applications.

### Design Philosophy

**Claude Code Emulation:** BMad agents are designed to work within Claude Code's environment. This SDK replicates that environment through:

- System prompt generation that mimics Claude Code's instructions
- In-memory Virtual Filesystem (VFS) with Claude Code-style tools
- Pre-loading of BMAD templates and agent files into VFS
- Session isolation ensuring each agent execution has independent state

**Key Architectural Principles:**

- **Session Isolation:** Each session gets its own VFS instance
- **Tool-Use Protocol:** Anthropic's tool-use format for all tool calls
- **Event-Driven:** Sessions emit events for questions, completion, errors
- **Cost-Aware:** Real-time token tracking and cost enforcement
- **TypeScript-First:** Full type safety and IDE autocomplete

### Change Log

| Date       | Version | Description                                                                       | Author              |
| ---------- | ------- | --------------------------------------------------------------------------------- | ------------------- |
| 2025-10-31 | 1.0     | Initial architecture document                                                     | Winston (Architect) |
| 2025-11-05 | 2.0     | Removed MCP, focused on VFS-based tool execution                                  | Winston (Architect) |
| 2025-11-06 | 3.0     | Added Conversational Session Pattern for Claude Code-like multi-turn interactions | Winston (Architect) |

---

## High-Level Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│            (Express, Next.js, Lambda, etc.)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                      BMad Client                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Config: Provider, Cost Limit, Log Level               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Session Management                         │ │
│  │  • Create sessions for agent commands                  │ │
│  │  • Orchestrate conversation with LLM                   │ │
│  │  • Pause/Resume for user questions                     │ │
│  │  • Emit events (question, completed, failed)           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────┬─────────────────┬──────────────────────┐ │
│  │ Agent Loader │ System Prompt   │ Tool Executor (VFS)  │ │
│  │              │ Generator       │                      │ │
│  └──────────────┴─────────────────┴──────────────────────┘ │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│             Anthropic Claude API                             │
│         (claude-sonnet-4, claude-opus-4)                     │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Core:**

- TypeScript 5.3+
- Node.js 18+ (LTS)
- pnpm 8+ (monorepo)

**Dependencies:**

- `@anthropic-ai/sdk` - Claude API integration
- `zod` - Schema validation
- `eventemitter3` - Event handling
- `gray-matter` - YAML frontmatter parsing
- `minimatch` - Glob pattern matching

**Dev Dependencies:**

- Vitest - Testing
- tsup - Build tool
- TypeDoc - API documentation

---

## Core Components

### 1. BmadClient

**Entry point for the SDK.**

```typescript
interface BmadClientConfig {
  provider: {
    type: 'anthropic';
    apiKey: string;
    model?: string; // Default: 'claude-sonnet-4-20250514'
  };
  costLimit?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  logger?: Logger;
}

class BmadClient {
  constructor(config: BmadClientConfig);

  // One-shot execution (single command → result → done)
  async startAgent(
    agentId: string,
    command: string,
    options?: SessionOptions
  ): Promise<BmadSession>;

  // Multi-turn conversation (Claude Code-like REPL)
  async startConversation(
    agentId: string,
    options?: ConversationalOptions
  ): Promise<ConversationalSession>;
}
```

**Responsibilities:**

- Validate configuration
- Initialize provider (AnthropicProvider)
- Create sessions with isolated VFS instances

### 2. BmadSession

**Manages single agent execution lifecycle (one-shot execution).**

```typescript
interface SessionOptions {
  costLimit?: number;
  pauseTimeout?: number;
  context?: Record<string, unknown>;
}

class BmadSession extends EventEmitter {
  async execute(): Promise<SessionResult>;
  async answer(input: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;

  // Events
  on('question', (q: Question) => void);
  on('completed', (result: SessionResult) => void);
  on('failed', (error: Error) => void);
  on('cost-warning', (cost: number) => void);
}
```

**Execution Flow:**

1. Load agent definition from `.bmad-core/agents/{agentId}.md`
2. Initialize VFS with templates and agent files
3. Generate Claude Code-style system prompt
4. Start conversation loop:
   - Send message to LLM
   - If tool_use → execute tools via VFS
   - If LLM asks question → emit 'question' event, pause
   - User answers → resume conversation
   - Continue until completion or error
5. Extract documents from VFS
6. Return SessionResult with costs and documents

**Limitation:** `BmadSession` is designed for **one-shot execution** (one command → result → done). For multi-turn conversations (Claude Code-like REPL), use `ConversationalSession` instead.

### 2b. ConversationalSession

**Manages multi-turn conversational interactions (Claude Code-like REPL).**

```typescript
interface ConversationalOptions {
  costLimit?: number;
  pauseTimeout?: number;
  autoSave?: boolean; // Auto-save state after each turn
}

class ConversationalSession extends EventEmitter {
  readonly id: string;
  readonly agentId: string;

  // Send user message (non-blocking)
  async send(message: string): Promise<void>;

  // Wait for current processing to complete
  async waitForCompletion(timeoutMs?: number): Promise<ConversationTurn>;

  // Check if agent is idle (ready for next input)
  isIdle(): boolean;

  // Answer questions during execution
  async answer(input: string): Promise<void>;

  // Get conversation history
  getHistory(): ConversationTurn[];

  // Get accumulated documents so far
  getDocuments(): Document[];

  // Get current costs
  getCosts(): CostReport;

  // Explicitly end conversation
  async end(): Promise<ConversationResult>;

  // Events
  on('turn-started', () => void);
  on('turn-completed', (turn: ConversationTurn) => void);
  on('question', (q: Question) => void);
  on('idle', () => void);
  on('cost-warning', (cost: number) => void);
  on('error', (error: Error) => void);
}

interface ConversationTurn {
  id: string;
  userMessage: string;
  agentResponse: string;
  toolCalls: ToolCall[];
  tokensUsed: { input: number; output: number };
  cost: number;
  timestamp: number;
}

interface ConversationResult {
  conversationId: string;
  turns: ConversationTurn[];
  documents: Document[];
  totalCost: number;
  totalTokens: { input: number; output: number };
  duration: number;
}
```

**Key Differences from BmadSession:**

| Feature               | BmadSession                          | ConversationalSession                 |
| --------------------- | ------------------------------------ | ------------------------------------- |
| **Execution Model**   | One-shot (execute → complete → done) | Multi-turn (send → wait → send → ...) |
| **Context Retention** | Lost after execute()                 | Persistent across send() calls        |
| **VFS Lifetime**      | Destroyed after execute()            | Persistent for entire conversation    |
| **User Input**        | One command per session              | Multiple messages per conversation    |
| **Use Case**          | Single task execution                | Claude Code-like REPL                 |

**Execution Flow:**

```
1. Application calls client.startConversation('pm')
   ↓
2. ConversationalSession initialized:
   - Create persistent VFS instance
   - Load agent definition
   - Pre-load templates into VFS
   - Generate system prompt
   - Status: 'idle'
   ↓
3. First turn: conversation.send('Create a PRD for todo app')
   ↓
4. Status → 'processing'
   ↓
5. Internal conversation loop:
   - Add user message to messages[]
   - Send messages[] to LLM with tools
   - Execute tool calls via VFS (persistent)
   - Add responses to messages[]
   - Continue until LLM completes turn
   ↓
6. LLM asks question → emit 'question' event
   ↓
7. User answers → conversation.answer(input)
   ↓
8. Resume processing → add answer to messages[]
   ↓
9. Turn completes:
   - Emit 'turn-completed' event
   - Status → 'idle'
   - VFS remains intact
   - messages[] accumulated
   ↓
10. Second turn: conversation.send('Update target users section')
    ↓
11. Status → 'processing' again
    ↓
12. LLM has FULL CONTEXT:
    - All previous messages[]
    - All files in VFS (PRD from turn 1)
    - Can reference earlier work
    ↓
13. Process turn 2 (same loop as turn 1)
    ↓
14. Turn completes → Status → 'idle'
    ↓
15. Continue until: conversation.end()
    ↓
16. Return ConversationResult with:
    - All turns
    - All documents from VFS
    - Total costs
```

**Example Usage:**

```typescript
// Start conversation
const conversation = await client.startConversation('pm');

// First interaction
await conversation.send('Create a PRD for a todo app');

conversation.on('question', async ({ question }) => {
  // Handle elicitation
  await conversation.answer('Busy professionals needing task management');
});

await conversation.waitForCompletion();
console.log('Turn 1 complete');

// Second interaction - NATURAL CONTINUATION
await conversation.send('Add mobile app feature to UI goals');
await conversation.waitForCompletion();
console.log('Turn 2 complete - PRD updated');

// Third interaction - QUESTION
await conversation.send('What is the estimated timeline?');
const turn3 = await conversation.waitForCompletion();
console.log('Agent response:', turn3.agentResponse);

// Fourth interaction - AGENT SWITCH
await conversation.send('Now create architecture document');
await conversation.waitForCompletion();
console.log('Architecture created');

// End conversation
const result = await conversation.end();
console.log(`Total: ${result.turns.length} turns, ${result.documents.length} documents`);
console.log(`Cost: $${result.totalCost.toFixed(2)}`);
```

**HTTP Integration with Long-Running Conversations:**

```typescript
// Express API - Start conversation
app.post('/api/conversations', async (req, res) => {
  const conversation = await client.startConversation('pm');
  conversations.set(conversation.id, conversation);

  // Send first message in background
  conversation.send(req.body.message).catch((err) => console.error('Conversation error:', err));

  res.json({
    conversationId: conversation.id,
    status: 'processing',
  });
});

// Send additional messages
app.post('/api/conversations/:id/messages', async (req, res) => {
  const conversation = conversations.get(req.params.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (!conversation.isIdle()) {
    return res.status(409).json({ error: 'Agent is still processing previous message' });
  }

  conversation.send(req.body.message).catch((err) => console.error('Message error:', err));

  res.json({ status: 'processing' });
});

// Poll conversation status
app.get('/api/conversations/:id', async (req, res) => {
  const conversation = conversations.get(req.params.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  res.json({
    conversationId: conversation.id,
    isIdle: conversation.isIdle(),
    turns: conversation.getHistory(),
    documents: conversation.getDocuments(),
    costs: conversation.getCosts(),
  });
});

// Answer questions
app.post('/api/conversations/:id/answers', async (req, res) => {
  const conversation = conversations.get(req.params.id);
  await conversation.answer(req.body.answer);
  res.json({ status: 'answered' });
});

// End conversation
app.post('/api/conversations/:id/end', async (req, res) => {
  const conversation = conversations.get(req.params.id);
  const result = await conversation.end();
  conversations.delete(req.params.id);
  res.json(result);
});
```

### 3. Agent Loader

**Loads agent definitions from markdown files.**

```typescript
interface AgentDefinition {
  agent: {
    name: string;
    id: string;
    title: string;
    icon: string;
    whenToUse: string;
  };
  persona: {
    role: string;
    style: string;
    identity: string;
    focus: string;
    core_principles: string[];
  };
  commands: string[];
  dependencies: {
    tasks?: string[];
    templates?: string[];
    checklists?: string[];
    data?: string[];
  };
  activation_instructions?: string[];
}

class AgentLoader {
  async loadAgent(agentId: string): Promise<AgentDefinition>;
  async loadFromDirectory(path: string): Promise<AgentDefinition[]>;
}
```

**Discovery Paths:**

1. `.bmad-core/agents/` (built-in)
2. `node_modules/@bmad-*/agents/` (expansion packs)

### 4. System Prompt Generator

**Creates Claude Code-style system prompts.**

```typescript
class SystemPromptGenerator {
  generate(agent: AgentDefinition, tools: Tool[]): string;
}
```

**Generated Prompt Structure:**

```markdown
You are Claude, an AI assistant with specialized tools...

## Available Tools

### read_file

Read a text file from the virtual filesystem...
Parameters: { file_path: string }

### write_file

Write content to a text file...
Parameters: { file_path: string, content: string }

[... other tools ...]

## Tool Usage Rules

- ALWAYS use read_file before edit_file
- File paths must be absolute (starting with /)
- Use bash_command only for safe commands (mkdir, echo, etc.)

## Workflow Guidelines

1. Understand task from agent definition
2. Use tools to gather information
3. Execute task following agent instructions
4. Verify results and respond to user

## Agent Persona

Name: John
Role: Product Manager
[... persona details ...]

## Available Commands

- \*help - Show available commands
- \*create-prd - Create PRD using template
  [... agent commands ...]

Now, adopt this persona and await user commands.
```

### 5. Tool Executor (VFS)

**Executes all tool calls in isolated in-memory filesystem.**

```typescript
interface VirtualFile {
  content: string;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    size: number;
  };
}

class FallbackToolExecutor {
  private vfs: Map<string, VirtualFile> = new Map();

  getTools(): Tool[];
  async execute(toolCall: ToolCall): Promise<ToolResult>;

  // Initialization
  initializeFiles(files: Record<string, string>): void;

  // Extract documents after session
  getDocuments(): Document[];
}
```

**Supported Tools:**

1. **read_file** - Read file from VFS
2. **write_file** - Write file to VFS
3. **edit_file** - Replace text in file
4. **bash_command** - Safe commands only (mkdir, echo, pwd, ls)
5. **grep_search** - Regex search across VFS files
6. **glob_pattern** - File pattern matching (_.md, \*\*/_.yaml)

**VFS Pre-loading:**

```typescript
// At session start, VFS is populated with:
const vfsInitialState = {
  '/.bmad-core/agents/pm.md': agentContent,
  '/.bmad-core/templates/prd-tmpl.yaml': templateContent,
  '/.bmad-core/tasks/create-doc.md': taskContent,
  // ... all templates and tasks
};
```

### 6. Anthropic Provider

**Implements LLM provider interface for Claude.**

```typescript
interface LLMProvider {
  sendMessage(
    messages: Message[],
    tools: Tool[],
    options?: ProviderOptions
  ): Promise<ProviderResponse>;

  calculateCost(usage: Usage): number;
  getModelInfo(): ModelInfo;
}

class AnthropicProvider implements LLMProvider {
  // Uses @anthropic-ai/sdk
  // Supports: claude-sonnet-4, claude-opus-4, claude-haiku-4
  // Cost calculation based on current pricing
}
```

**Pricing (as of 2025-11):**

- Sonnet 4: $3/MTok input, $15/MTok output
- Opus 4: $15/MTok input, $75/MTok output
- Haiku 4: $0.25/MTok input, $1.25/MTok output

### 7. Cost Tracker

**Monitors token usage and enforces limits.**

```typescript
class CostTracker {
  private totalCost: number = 0;
  private limit: number;

  track(usage: Usage): void {
    const cost = this.provider.calculateCost(usage);
    this.totalCost += cost;

    if (this.totalCost > this.limit) {
      throw new CostLimitExceededError(this.totalCost, this.limit);
    }

    if (this.totalCost > this.limit * 0.8) {
      this.session.emit('cost-warning', this.totalCost);
    }
  }

  getReport(): CostReport;
}
```

---

## Data Flow

### Complete Session Execution

```
1. Application calls client.startAgent('pm', 'create-prd')
   ↓
2. BmadClient creates BmadSession with config
   ↓
3. Session initializes:
   - Create VFS instance
   - Load agent definition (AgentLoader)
   - Pre-load templates into VFS
   - Generate system prompt (SystemPromptGenerator)
   - Create tool definitions from VFS
   ↓
4. Session starts conversation loop:
   messages = [
     { role: 'system', content: systemPrompt },
     { role: 'user', content: 'create-prd' }
   ]
   ↓
5. Send to Anthropic Claude API with tools
   ↓
6. LLM Response:
   - stop_reason: 'tool_use'
   - tool_calls: [
       { id: '1', name: 'read_file', input: { file_path: '/.bmad-core/templates/prd-tmpl.yaml' }}
     ]
   ↓
7. Execute tool calls via FallbackToolExecutor:
   - Look up file in VFS
   - Return content
   ↓
8. Add tool results to conversation:
   messages.push({ role: 'assistant', content: [...tool_calls...] })
   messages.push({ role: 'user', content: [...tool_results...] })
   ↓
9. Continue conversation loop (back to step 5)
   ↓
10. LLM asks question:
    "What is the target user persona?"
    ↓
11. Session detects question → pause → emit 'question' event
    ↓
12. Application receives event → asks user → calls session.answer("Developers building web apps")
    ↓
13. Session resumes → add answer to messages → continue (back to step 5)
    ↓
14. LLM completes task:
    - stop_reason: 'end_turn'
    - Writes PRD to VFS via write_file tool
    ↓
15. Session completes:
    - Extract documents from VFS
    - Calculate total cost
    - Emit 'completed' event
    - Return SessionResult
```

---

## Testing Strategy

### Unit Tests

**Target: 80%+ coverage**

```typescript
// Agent Loader
describe('AgentLoader', () => {
  it('loads agent from markdown with YAML frontmatter');
  it('validates agent schema with Zod');
  it('discovers agents from directory');
});

// System Prompt Generator
describe('SystemPromptGenerator', () => {
  it('generates prompt with agent persona');
  it('includes all tool descriptions');
  it('adds activation instructions');
});

// Tool Executor
describe('FallbackToolExecutor', () => {
  it('reads file from VFS');
  it('writes file to VFS');
  it('edits file with string replacement');
  it('executes safe bash commands');
  it('searches with grep pattern');
  it('matches files with glob pattern');
});

// Cost Tracker
describe('CostTracker', () => {
  it('calculates cost from token usage');
  it('throws error when limit exceeded');
  it('emits warning at 80% of limit');
});
```

### Integration Tests

```typescript
describe('Complete Session Execution', () => {
  it('loads agent, executes tools, returns documents', async () => {
    const client = new BmadClient(config);
    const session = await client.startAgent('pm', 'create-prd');

    // Mock LLM responses
    mockAnthropicAPI([
      { tool_use: ['read_file'] },
      { tool_use: ['write_file'] },
      { end_turn: true },
    ]);

    const result = await session.execute();

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].path).toBe('/docs/prd.md');
    expect(result.costs.totalCost).toBeGreaterThan(0);
  });
});
```

### E2E Tests

```typescript
describe('Real Anthropic API', () => {
  it('executes PM agent with real Claude', async () => {
    // Uses real API key
    // Tests complete workflow
    // Validates actual PRD generation
  });
});
```

---

## Deployment & Distribution

### NPM Package

```json
{
  "name": "@bmad/client",
  "version": "1.0.0",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  }
}
```

**Build Output:**

- ESM: `dist/index.js`
- CommonJS: `dist/index.cjs`
- Types: `dist/index.d.ts`

### Integration Patterns

**Express API:**

```typescript
app.post('/api/agents/:agentId/:command', async (req, res) => {
  const session = await client.startAgent(req.params.agentId, req.params.command);

  session.on('question', (q) => {
    res.write(JSON.stringify({ type: 'question', data: q }));
  });

  const result = await session.execute();
  res.json(result);
});
```

**Next.js Route Handler:**

```typescript
export async function POST(request: Request) {
  const { agentId, command } = await request.json();
  const session = await client.startAgent(agentId, command);
  const result = await session.execute();
  return Response.json(result);
}
```

---

## Performance Considerations

**Session Initialization:** <100ms

- Agent loading: ~20ms
- VFS initialization: ~50ms
- System prompt generation: ~10ms

**Tool Execution:** <10ms per tool

- VFS operations are in-memory Map lookups
- No I/O overhead

**LLM Latency:** 2-10 seconds per API call

- Dominant factor in total session time
- Depends on response length

**Memory Usage:**

- VFS: ~1-2MB per session (templates + generated docs)
- Session overhead: ~500KB
- Recommended: 10 concurrent sessions per 2GB RAM

---

## Security Considerations

**API Key Management:**

- Never log API keys
- Support environment variables
- Validate key format on initialization

**Tool Execution Safety:**

- VFS is completely isolated (no real filesystem access)
- bash_command whitelist: mkdir, echo, pwd, ls only
- No arbitrary command execution

**Cost Protection:**

- Hard limits prevent runaway costs
- Warning at 80% of limit
- Detailed cost reporting

---

## Future Enhancements

**Phase 2:**

- Google Cloud Storage integration for document persistence
- Template & Task processing (YAML templates → Markdown documents)
- Expansion pack loading from NPM packages

**Phase 3:**

- Real filesystem access for brownfield projects (optional)
- External command execution (pandoc, pdflatex) with sandboxing
- Multi-agent orchestration workflows

**Phase 4:**

- Streaming LLM responses for real-time feedback
- Session state persistence for recovery
- Advanced cost optimization (model routing)

---

## Appendix

### Glossary

- **Agent:** Specialized AI persona (PM, Architect, Dev, etc.)
- **Session:** Single execution of an agent command
- **VFS:** Virtual Filesystem - in-memory file storage per session
- **Tool:** Function exposed to LLM (read_file, write_file, etc.)
- **Provider:** LLM API integration (Anthropic Claude)
- **Elicitation:** Process where agent asks user questions
- **Cost Tracking:** Real-time monitoring of LLM token usage

### References

- **Anthropic API Docs:** https://docs.anthropic.com
- **Tool Use Guide:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **BMad Method:** `.bmad-core/` directory structure

---

**Document Version:** 3.0
**Last Updated:** 2025-11-06
**Maintained By:** Winston (Architect)

**Version 3.0 Changes:**

- Added ConversationalSession for multi-turn interactions (Claude Code-like REPL)
- Documented key differences between BmadSession (one-shot) and ConversationalSession (multi-turn)
- Added HTTP integration patterns for long-running conversations (polling, SSE)
- Included complete API documentation for conversational workflows
- Added example usage patterns for production deployment
