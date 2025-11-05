# BMad Client Library Fullstack Architecture Document

## Introduction

This document outlines the complete architecture for **BMad Client Library**, a Node.js backend SDK that enables developers to integrate BMad-Method workflows into web and desktop applications. It serves as the single source of truth for implementation, ensuring consistency across all architectural layers: LLM provider integration, session management, agent orchestration, MCP (Model Context Protocol) integration, storage, cost tracking, and tool execution.

This architecture supports **content-creation workflows** (educational book authoring, creative writing, design thinking facilitation) through a unified, extensible design that leverages the Model Context Protocol for tool execution, enabling agents to access filesystems, databases, APIs, and other resources through standardized MCP servers.

### Starter Template or Existing Project

**N/A - Greenfield project**

This is a new SDK built from scratch. No existing starter templates are used. The architecture is designed for maximum flexibility to support diverse deployment environments (Express, Fastify, Next.js API routes, AWS Lambda, Google Cloud Functions, Vercel Functions) and use cases (software development, content creation, custom workflows).

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-10-31 | 1.0 | Initial architecture document | Winston (Architect) |
| 2025-10-31 | 2.0 | Major update: MCP integration, removed custom VFS/tools | Winston (Architect) |
| 2025-11-04 | 3.0 | Added Claude Code Emulation Layer, PoC strategy, testing architecture | Winston (Architect) |

---

## High Level Architecture

### Technical Summary

BMad Client Library is a **headless Node.js/TypeScript SDK** architected as a modular library (not a service) that applications import and run in-process. The core architecture follows a **layered design** with clean separation between client API, session orchestration, provider abstraction, agent system, MCP integration, storage, and cost tracking.

The system uses **event-driven session management** to handle asynchronous LLM interactions with pause/resume capabilities, enabling multi-turn conversations where the LLM can ask questions and wait for user responses. The SDK is **focused exclusively on Anthropic Claude** for optimal integration with Claude's tool-use capabilities and the BMad Method's requirements.

**Model Context Protocol (MCP) integration** is the cornerstone of tool execution. Rather than implementing custom tools, the SDK acts as an **MCP client** that connects to MCP servers (filesystem, database, API servers, etc.) and dynamically discovers their capabilities. Tool calls from LLMs are routed to the appropriate MCP server via JSON-RPC 2.0 over stdio or SSE transports. This approach provides:
- **75% less SDK code** - No custom tool implementations needed
- **Standardized interface** - MCP is Anthropic's official protocol
- **Real filesystems** - Agents work on actual project directories, not in-memory copies
- **Extensibility** - Add new capabilities by configuring additional MCP servers
- **Community ecosystem** - Leverage existing MCP servers (GitHub, PostgreSQL, Slack, etc.)

A **fallback virtual filesystem** is provided when no MCP servers are configured, ensuring backward compatibility and enabling testing without external dependencies.

Document persistence uses **Google Cloud Storage** (with abstraction for future adapters). **Cost tracking** monitors token usage in real-time and enforces per-session limits. The **agent plugin system** dynamically loads agents from `.bmad-core/` directories in both the core package and external NPM expansion packs.

This architecture achieves PRD goals by providing a production-ready, framework-agnostic SDK with comprehensive developer experience (TypeScript-first, excellent docs, <30min integration), while remaining flexible enough to support content-creation workflows through the same unified API.

### Platform and Infrastructure Choice

**Platform:** Node.js 18+ (Backend Library - No Platform Hosting)

**Key Services:**
- **Runtime:** Node.js 18+ with dual ESM/CommonJS support
- **LLM Provider:** Anthropic Claude API (exclusive)
- **Storage:** Google Cloud Storage (adapter interface for future extensions: AWS S3, Azure Blob, local filesystem)
- **Package Registry:** NPM for distribution (`@bmad/client`)
- **Build Tools:** TypeScript compiler + tsup for bundling

**Deployment Host and Regions:**

The SDK itself is **platform-agnostic** and runs wherever Node.js runs. Applications integrating the SDK deploy to:
- **Cloud Functions:** AWS Lambda, Google Cloud Functions, Vercel Serverless Functions
- **Traditional Servers:** Express, Fastify, Koa on VMs or containers
- **Edge Runtime:** Cloudflare Workers (with limitations on CommandExecutor)
- **Desktop:** Electron apps, local Node.js scripts

**Regions:** Determined by integrating application's deployment. SDK has no regional dependencies except:
- LLM API latency (Anthropic US/EU regions)
- GCS bucket location (configurable by user)

### Repository Structure

**Monorepo** using **pnpm workspaces** for managing multiple packages with shared tooling.

```
bmad-client/
├── packages/
│   ├── core/                    # @bmad/client (main SDK)
│   │   ├── src/
│   │   │   ├── client.ts        # BmadClient class
│   │   │   ├── session.ts       # BmadSession class
│   │   │   ├── agents/          # Agent registry, loader, schema
│   │   │   ├── providers/       # Anthropic provider implementation
│   │   │   ├── storage/         # Storage abstraction + in-memory
│   │   │   ├── mcp/             # MCP client, connection manager, tool router (future)
│   │   │   ├── templates/       # Template parser, generator (future)
│   │   │   ├── tasks/           # Task executor (future)
│   │   │   ├── tools/           # Fallback tool executor (VFS)
│   │   │   ├── cost/            # Cost tracker, calculator (future)
│   │   │   ├── errors/          # Custom error types (future)
│   │   │   └── utils/           # Logging, retry, validation (future)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── storage-gcs/             # @bmad/storage-gcs (future)
│   │   ├── src/
│   │   │   └── adapter.ts       # GoogleCloudStorageAdapter
│   │   └── package.json
│   └── examples/                # Example integrations (not published)
│       ├── express-api/
│       ├── nextjs-route/
│       ├── standalone-script/
│       └── aws-lambda/
├── .bmad-core/                  # Core BMad agents, templates, tasks
│   ├── agents/
│   ├── templates/
│   ├── tasks/
│   └── data/
├── docs/                        # Documentation site (VitePress)
├── package.json                 # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json           # Shared TS config
└── vitest.config.ts             # Shared test config
```

**Rationale:**
- **Monorepo:** Simplifies development, testing, and versioning of related packages
- **pnpm:** Faster installs, efficient disk usage, strict dependency management
- **Separate packages:** Allows users to install only what they need (core + specific provider/storage)
- **Shared tooling:** Single config for TypeScript, testing, linting across all packages

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (Express API, Next.js Route, Serverless Function, etc.)    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   BmadClient (SDK Entry Point)              │
│  - Provider config                                           │
│  - Storage config                                            │
│  - MCP server config                                         │
│  - Agent loading                                             │
│  - Session factory                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    BmadSession (Orchestrator)               │
│  - Conversation state                                        │
│  - Event emission (question, completed, error)               │
│  - Pause/Resume logic                                        │
│  - Tool call routing                                         │
└───┬─────────┬─────────┬──────────┬──────────┬──────────────┘
    │         │         │          │          │
    ▼         ▼         ▼          ▼          ▼
┌────────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────────┐
│Provider│ │Agent │ │  MCP   │ │Storage│ │Cost      │
│Layer   │ │System│ │ Client │ │Layer  │ │Tracker   │
└────────┘ └──────┘ └────────┘ └───────┘ └──────────┘
    │         │         │          │          │
    ▼         ▼         ▼          ▼          ▼
┌────────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────────┐
│Anthropic│ │Agents│ │Tools:  │ │ GCS   │ │Pricing   │
│  SDK   │ │from  │ │Fallback│ │(future│ │Tables    │
│        │ │.bmad │ │VFS with│ │)      │ │Token     │
│        │ │-core │ │5 tools │ │       │ │Counter   │
│        │ │Expans│ │        │ │       │ │          │
│        │ │Packs │ │MCP     │ │       │ │          │
│        │ │      │ │(future)│ │       │ │          │
│        │ │      │ │        │ │       │ │          │
└────────┘ └──────┘ └────────┘ └───────┘ └──────────┘
              │         │
              │         ▼
              │    ┌────────────────────────────────┐
              │    │   External MCP Server Processes │
              │    │   (stdio/SSE JSON-RPC 2.0)     │
              │    │   - @modelcontextprotocol/     │
              │    │     server-filesystem          │
              │    │   - @modelcontextprotocol/     │
              │    │     server-github              │
              │    │   - @modelcontextprotocol/     │
              │    │     server-postgres            │
              │    │   - Custom MCP servers         │
              │    └────────────────────────────────┘
              │
              ▼
      ┌──────────────────┐
      │  Agent Templates │
      │  & Task Workflows│
      └──────────────────┘
```

**Data Flow:**

1. **Application** creates `BmadClient` with config (including MCP server configs)
2. **Client** loads agents, initializes provider, storage, and spawns MCP server processes
3. **Client** performs MCP handshake: `initialize` → capability negotiation → `initialized`
4. **Client** discovers tools via `tools/list` JSON-RPC call to each MCP server
5. **Application** calls `client.startAgent('pm', 'create-prd', { costLimit: 5.0 })`
6. **Client** creates `BmadSession` instance
7. **Session** loads agent definition, generates system prompt with discovered MCP tools
8. **Session** sends initial message to **Provider** (LLM API) with MCP tools available
9. **Provider** returns response with tool calls (e.g., `read_file` from filesystem MCP server)
10. **Session** routes tool call to appropriate **MCP Server** via JSON-RPC `tools/call`
11. **MCP Server** executes tool, returns result
12. **Session** sends tool result back to **Provider**
13. **Provider** returns next response (possibly question for user)
14. **Session** detects question, pauses, emits `question` event
15. **Application** handles question, user provides answer
16. **Application** calls `session.answer(userInput)`
17. **Session** resumes, sends answer to **Provider**
18. Loop continues until completion
19. **Session** saves generated document to **Storage** (GCS)
20. **Session** emits `completed` event with **Cost Report**
21. **Session** cleanup: sends `notifications/cancelled` to MCP servers if needed

---

## Critical Component: Claude Code Emulation Layer

### Why This Is Essential

**BMAD agent definitions are NOT standalone.** They are specifically designed to work within Claude Code's environment, which provides:
1. A specialized system prompt explaining tools and workflows
2. Built-in tools (Read, Write, Edit, Bash, Grep, Glob)
3. Tool execution infrastructure
4. Conversation management with tool-call loops

**Without replicating this environment, BMAD agents will not function.**

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    BmadClient                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │      Claude Code Emulation Layer                   │ │
│  │                                                      │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  System Prompt Generator                     │  │ │
│  │  │  - Base Claude Code prompt                   │  │ │
│  │  │  - Tool descriptions (Read, Write, Bash...)  │  │ │
│  │  │  - Workflow rules                             │  │ │
│  │  │  + Agent persona injection                    │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │                                                      │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  Tool Suite                                   │  │ │
│  │  │  - read_file                                  │  │ │
│  │  │  - write_file                                 │  │ │
│  │  │  - edit_file                                  │  │ │
│  │  │  - bash_command                               │  │ │
│  │  │  - grep_search                                │  │ │
│  │  │  - glob_pattern                               │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │                                                      │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  Tool Executor                                │  │ │
│  │  │  - Routes to MCP servers (if configured)     │  │ │
│  │  │  - Fallback to VFS (in-memory)               │  │ │
│  │  │  - Formats results for LLM                    │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### System Prompt Generation

```typescript
class SystemPromptGenerator {
  generate(agent: AgentDefinition, tools: Tool[]): string {
    return `
${this.getClaudeCodeBasePrompt()}

## Available Tools

${this.formatToolDescriptions(tools)}

## Tool Usage Rules

- ALWAYS use Read tool before Edit/Write on existing files
- Use Bash for system commands (mkdir, make, git)
- File paths must be absolute
- Prefer specialized tools over Bash when possible

## Workflow Guidelines

1. Understand the task from agent definition
2. Use tools to gather information
3. Execute task following agent instructions
4. Verify results with appropriate tools
5. Respond to user

## Agent Persona

${agent.agent.customization || ''}

Role: ${agent.persona.role}
Style: ${agent.persona.style}
Identity: ${agent.persona.identity}
Focus: ${agent.persona.focus}

Core Principles:
${agent.persona.core_principles.map(p => `- ${p}`).join('\n')}

## Available Commands

${agent.commands.map(cmd => `- ${cmd}`).join('\n')}

## Agent Activation Instructions

${agent.activation_instructions.join('\n')}

Now, adopt this persona and await user commands.
`;
  }

  private getClaudeCodeBasePrompt(): string {
    return `
You are Claude, an AI assistant with access to specialized tools for software development and content creation.

Your capabilities include:
- Reading and writing files
- Editing existing files with precise replacements
- Executing bash commands for system operations
- Searching files with grep patterns
- Finding files with glob patterns

You will receive an agent persona to adopt, which defines your role, style, and available commands.
Follow the agent's instructions precisely while maintaining access to these tools.
`.trim();
  }

  private formatToolDescriptions(tools: Tool[]): string {
    return tools.map(tool => `
### ${tool.name}

${tool.description}

Parameters:
${JSON.stringify(tool.input_schema, null, 2)}

Example:
${this.getToolExample(tool.name)}
`).join('\n');
  }

  private getToolExample(toolName: string): string {
    const examples = {
      read_file: `{ "file_path": "/project/docs/prd.md" }`,
      write_file: `{ "file_path": "/project/output/document.md", "content": "# Document\\n\\nContent here" }`,
      edit_file: `{ "file_path": "/project/file.md", "old_string": "old text", "new_string": "new text" }`,
      bash_command: `{ "command": "mkdir -p chapters", "description": "Create chapters directory" }`,
      grep_search: `{ "pattern": "TODO", "path": "/project", "output_mode": "files_with_matches" }`,
      glob_pattern: `{ "pattern": "*.md", "path": "/project/docs" }`
    };
    return examples[toolName] || `{ "param": "value" }`;
  }
}
```

### Tool Execution Strategy

**Primary: MCP Integration** (when configured)
```typescript
async executeTool(toolCall: ToolCall): Promise<any> {
  // Check if MCP server provides this tool
  if (this.mcp.hasTool(toolCall.name)) {
    return await this.mcp.executeTool(toolCall.name, toolCall.input);
  }

  // Fallback to built-in VFS
  return await this.fallbackVFS.executeTool(toolCall.name, toolCall.input);
}
```

**Fallback: Virtual Filesystem**
```typescript
class FallbackToolExecutor {
  private vfs = new Map<string, string>();

  async executeTool(name: string, input: any): Promise<any> {
    switch (name) {
      case 'read_file':
        return this.readFile(input.file_path);

      case 'write_file':
        this.vfs.set(input.file_path, input.content);
        return { success: true, path: input.file_path };

      case 'edit_file':
        const content = this.vfs.get(input.file_path);
        if (!content) throw new Error('File not found');
        const updated = content.replace(input.old_string, input.new_string);
        this.vfs.set(input.file_path, updated);
        return { success: true };

      case 'bash_command':
        // Limited execution for safety
        if (this.isAllowedCommand(input.command)) {
          return await this.executeBashCommand(input.command);
        }
        throw new Error('Command not allowed');

      default:
        throw new Error(`Tool ${name} not supported in fallback mode`);
    }
  }

  private isAllowedCommand(cmd: string): boolean {
    const allowed = ['mkdir', 'ls', 'pwd', 'echo'];
    const command = cmd.split(' ')[0];
    return allowed.includes(command);
  }
}
```

### Integration with Session

```typescript
class BmadSession {
  private systemPromptGenerator: SystemPromptGenerator;
  private toolExecutor: ToolExecutor;

  async execute(): Promise<SessionResult> {
    // 1. Load agent definition
    const agent = await this.client.agents.get(this.agentId);

    // 2. Get available tools (MCP or fallback)
    const tools = this.getAvailableTools();

    // 3. Generate Claude Code style system prompt
    const systemPrompt = this.systemPromptGenerator.generate(agent, tools);

    // 4. Start conversation with LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.getUserCommand() }
    ];

    // 5. Tool call loop
    let response = await this.provider.sendMessage(messages, tools);

    while (response.stopReason === 'tool_use') {
      // Execute all tool calls
      const toolResults = await Promise.all(
        response.message.toolCalls.map(tc =>
          this.toolExecutor.executeTool(tc)
        )
      );

      // Add tool results to conversation
      messages.push(response.message);
      messages.push({
        role: 'user',
        content: this.formatToolResults(response.message.toolCalls, toolResults)
      });

      // Continue conversation
      response = await this.provider.sendMessage(messages, tools);
    }

    return this.buildResult(response);
  }
}
```

---

## Backend Architecture

### Technology Stack

**Core Technologies:**
- **Language:** TypeScript 5.3+
- **Runtime:** Node.js 18+ (LTS)
- **Package Manager:** pnpm 8+
- **Build Tool:** tsup (fast TypeScript bundler)
- **Testing:** Vitest (fast, TypeScript-native)
- **Linting:** ESLint + @typescript-eslint
- **Formatting:** Prettier

**Dependencies:**
- **LLM SDK:** `@anthropic-ai/sdk` (required)
- **Utilities:** `zod` (schema validation), `eventemitter3` (events), `gray-matter` (YAML frontmatter parsing)
- **Future:** `@modelcontextprotocol/sdk` (for MCP integration), `@google-cloud/storage` (for GCS storage)

**Dev Dependencies:**
- **TypeDoc:** API documentation generation
- **Changesets:** Version management and changelog
- **Nock/MSW:** HTTP mocking for tests

### API Layer

**BmadClient Class:**

```typescript
interface MCPServerConfig {
  name: string; // Unique identifier
  command: string; // Executable (e.g., 'npx', 'node', '/usr/bin/mcp-server')
  args?: string[]; // Command arguments
  env?: Record<string, string>; // Environment variables
  transport?: 'stdio' | 'sse'; // Default: stdio
}

interface BmadClientConfig {
  provider: {
    type: 'anthropic' | 'openai' | 'custom';
    apiKey: string;
    model?: string;
    baseURL?: string; // For custom providers
  };
  storage?: StorageAdapter;
  mcpServers?: MCPServerConfig[]; // MCP server configurations
  costLimit?: number; // Global default
  expansionPacks?: string[]; // NPM package names
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  logger?: Logger; // Custom logger implementation
}

class BmadClient {
  constructor(config: BmadClientConfig);

  // Agent management
  readonly agents: AgentRegistry;
  loadExpansionPack(packageName: string): Promise<void>;

  // MCP management
  readonly mcp: MCPClient;
  getMCPTools(): Tool[]; // Get all discovered tools from MCP servers

  // Session management
  startAgent(
    agentId: string,
    command: string,
    options?: SessionOptions
  ): Promise<BmadSession>;

  resumeSession(sessionId: string): Promise<BmadSession>;

  // Utilities
  healthCheck(): Promise<HealthCheckResult>;
  estimateCost(agentId: string, command: string, options?: any): Promise<CostEstimate>;
  getDiagnostics(): Diagnostics;

  // Cleanup
  async dispose(): Promise<void>; // Shutdown MCP servers gracefully
}
```

**BmadSession Class:**

```typescript
interface SessionOptions {
  costLimit?: number;
  pauseTimeout?: number; // Minutes
  storage?: StorageAdapter; // Override client default
  context?: Record<string, any>; // Variables for templates
}

class BmadSession extends EventEmitter {
  readonly id: string;
  readonly agentId: string;
  readonly command: string;

  // Execution control
  execute(): Promise<SessionResult>;
  answer(input: string): Promise<void>;
  abort(): Promise<void>;

  // State queries
  getStatus(): SessionStatus;
  getCosts(): CostReport;
  getHistory(): Message[];

  // State persistence
  serialize(): SessionState;
  static deserialize(state: SessionState, client: BmadClient): BmadSession;

  // Events
  on(event: 'started', handler: () => void): this;
  on(event: 'question', handler: (q: Question) => void): this;
  on(event: 'resumed', handler: () => void): this;
  on(event: 'completed', handler: (result: SessionResult) => void): this;
  on(event: 'failed', handler: (error: Error) => void): this;
  on(event: 'cost-warning', handler: (costs: CostReport) => void): this;
  on(event: 'document-saved', handler: (path: string) => void): this;
}
```

**Session Result:**

```typescript
interface SessionResult {
  status: 'completed' | 'failed' | 'timeout';
  documents: { path: string; content: string }[];
  costs: CostReport;
  duration: number; // milliseconds
  error?: Error;
}

interface CostReport {
  totalCost: number;
  currency: string; // e.g., 'USD', 'EUR'
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  breakdown: ModelCost[];
}

interface ModelCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
}
```

### Service Layer

**Provider Abstraction:**

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

interface ProviderResponse {
  message: {
    role: 'assistant';
    content: string;
    toolCalls?: ToolCall[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}
```

**Anthropic Provider Implementation:**

```typescript
class AnthropicProvider implements LLMProvider {
  constructor(apiKey: string, model: string = 'claude-sonnet-4');

  async sendMessage(messages, tools, options): Promise<ProviderResponse> {
    // Use @anthropic-ai/sdk
    const response = await this.client.messages.create({
      model: this.model,
      messages: this.formatMessages(messages),
      tools: this.formatTools(tools),
      max_tokens: options?.maxTokens ?? 4096,
    });

    return this.parseResponse(response);
  }

  calculateCost(usage: Usage): number {
    // Pricing table
    const pricing = {
      'claude-sonnet-4': { input: 0.003, output: 0.015 }, // per 1K tokens
      'claude-opus-4': { input: 0.015, output: 0.075 },
      'claude-haiku-4': { input: 0.00025, output: 0.00125 },
    };

    const rates = pricing[this.model];
    return (usage.inputTokens / 1000) * rates.input +
           (usage.outputTokens / 1000) * rates.output;
  }
}
```

**Agent System:**

```typescript
interface AgentDefinition {
  agent: {
    name: string;
    id: string;
    title: string;
    icon: string;
    whenToUse: string;
    customization?: string;
  };
  persona: {
    role: string;
    style: string;
    identity: string;
    focus: string;
    core_principles: string[];
  };
  commands: Command[];
  dependencies: {
    tasks?: string[];
    templates?: string[];
    checklists?: string[];
    data?: string[];
  };
}

class AgentRegistry {
  register(agent: AgentDefinition): void;
  get(agentId: string): AgentDefinition;
  list(): AgentDefinition[];
  getCommands(agentId: string): Command[];
}

class AgentLoader {
  async loadFromDirectory(dirPath: string): Promise<AgentDefinition[]> {
    const files = await glob(path.join(dirPath, '*.md'));
    return Promise.all(files.map(f => this.parseAgentFile(f)));
  }

  private async parseAgentFile(filePath: string): Promise<AgentDefinition> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: markdown } = matter(content); // Extract YAML frontmatter
    return AgentDefinitionSchema.parse(data);
  }
}
```

**MCP Integration:**

```typescript
interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema; // JSON Schema for parameters
  serverName: string; // Which MCP server provides this tool
}

interface MCPConnection {
  serverName: string;
  process: ChildProcess;
  transport: 'stdio' | 'sse';
  status: 'connecting' | 'ready' | 'error' | 'closed';
  capabilities: ServerCapabilities;
  tools: MCPTool[];
}

class MCPClient {
  private connections: Map<string, MCPConnection> = new Map();
  private toolRegistry: Map<string, MCPTool> = new Map(); // tool name → MCPTool

  async connect(config: MCPServerConfig): Promise<void> {
    // 1. Spawn MCP server process
    const proc = spawn(config.command, config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
    });

    // 2. Setup JSON-RPC 2.0 communication over stdio
    const transport = new StdioTransport(proc.stdin, proc.stdout);

    // 3. Send initialize request
    const initResponse = await transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'bmad-client',
        version: '1.0.0',
      },
    });

    // 4. Send initialized notification
    await transport.notify('notifications/initialized');

    // 5. Discover tools
    const toolsResponse = await transport.request('tools/list', {});

    // 6. Store connection
    const connection: MCPConnection = {
      serverName: config.name,
      process: proc,
      transport: 'stdio',
      status: 'ready',
      capabilities: initResponse.capabilities,
      tools: toolsResponse.tools.map(t => ({
        ...t,
        serverName: config.name,
      })),
    };

    this.connections.set(config.name, connection);

    // 7. Register tools in central registry
    for (const tool of connection.tools) {
      this.toolRegistry.set(tool.name, tool);
    }
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    // 1. Find which server provides this tool
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      throw new ToolNotFoundError(toolName);
    }

    const connection = this.connections.get(tool.serverName);
    if (!connection || connection.status !== 'ready') {
      throw new MCPServerNotReadyError(tool.serverName);
    }

    // 2. Send tools/call request via JSON-RPC
    const transport = new StdioTransport(
      connection.process.stdin!,
      connection.process.stdout!
    );

    const response = await transport.request('tools/call', {
      name: toolName,
      arguments: args,
    });

    // 3. Return result
    return response.content;
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.toolRegistry.values());
  }

  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) return;

    // Send shutdown notification if server supports it
    try {
      const transport = new StdioTransport(
        connection.process.stdin!,
        connection.process.stdout!
      );
      await transport.notify('notifications/cancelled');
    } catch (error) {
      // Ignore errors during shutdown
    }

    connection.process.kill();
    this.connections.delete(serverName);

    // Remove tools from registry
    for (const [toolName, tool] of this.toolRegistry.entries()) {
      if (tool.serverName === serverName) {
        this.toolRegistry.delete(toolName);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.connections.keys());
    await Promise.all(serverNames.map(name => this.disconnect(name)));
  }
}

class StdioTransport {
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
  private buffer = '';

  constructor(
    private stdin: Writable,
    private stdout: Readable
  ) {
    stdout.on('data', (chunk) => this.handleData(chunk));
  }

  async request(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.stdin.write(JSON.stringify(message) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new MCPTimeoutError(method));
        }
      }, 30000);
    });
  }

  async notify(method: string, params?: any): Promise<void> {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.stdin.write(JSON.stringify(message) + '\n');
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        if ('id' in message && 'result' in message) {
          // Response to our request
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            pending.resolve(message.result);
            this.pendingRequests.delete(message.id);
          }
        } else if ('id' in message && 'error' in message) {
          // Error response
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            pending.reject(new MCPError(message.error.message, message.error.code));
            this.pendingRequests.delete(message.id);
          }
        }
        // Notifications from server are ignored in this simplified implementation
      } catch (error) {
        // Invalid JSON, skip
      }
    }
  }
}
```

**Fallback Virtual File System (when no MCP servers configured):**

```typescript
class FallbackVFS {
  private files: Map<string, VirtualFile> = new Map();

  // Same implementation as before, used only when mcpServers array is empty
  readFile(path: string): string {
    const file = this.files.get(path);
    if (!file) throw new FileNotFoundError(path);
    return file.content;
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, {
      content,
      metadata: {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        size: Buffer.byteLength(content, 'utf-8'),
      },
    });
  }

  // ... other VFS methods (exists, delete, list, serialize)
}
```

**Storage Abstraction:**

```typescript
interface StorageAdapter {
  save(path: string, content: string, metadata?: Record<string, any>): Promise<void>;
  load(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

class GoogleCloudStorageAdapter implements StorageAdapter {
  private bucket: Bucket;

  constructor(config: { bucketName: string; credentials?: any; keyFilename?: string }) {
    const storage = new Storage({
      credentials: config.credentials,
      keyFilename: config.keyFilename,
    });
    this.bucket = storage.bucket(config.bucketName);
  }

  async save(path: string, content: string, metadata?): Promise<void> {
    const file = this.bucket.file(path);
    await file.save(content, {
      metadata: {
        contentType: 'text/markdown',
        ...metadata,
      },
    });
  }

  async load(path: string): Promise<string> {
    const file = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) throw new FileNotFoundError(path);

    const [content] = await file.download();
    return content.toString('utf-8');
  }

  async exists(path: string): Promise<boolean> {
    const [exists] = await this.bucket.file(path).exists();
    return exists;
  }

  async delete(path: string): Promise<void> {
    await this.bucket.file(path).delete();
  }

  async list(prefix: string): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix });
    return files.map(f => f.name);
  }
}
```

**Cost Tracking:**

```typescript
class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private apiCallCount = 0;
  private perModelUsage: Map<string, { inputTokens: number; outputTokens: number }> = new Map();

  recordUsage(usage: Usage, model: string): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.apiCallCount++;

    const current = this.perModelUsage.get(model) || { inputTokens: 0, outputTokens: 0 };
    this.perModelUsage.set(model, {
      inputTokens: current.inputTokens + usage.inputTokens,
      outputTokens: current.outputTokens + usage.outputTokens,
    });
  }

  getTotalCost(calculator: CostCalculator): number {
    let total = 0;
    for (const [model, usage] of this.perModelUsage.entries()) {
      total += calculator.calculateCost(usage, model);
    }
    return total;
  }

  getReport(calculator: CostCalculator, currency: string): CostReport {
    const breakdown: ModelCost[] = [];
    for (const [model, usage] of this.perModelUsage.entries()) {
      const cost = calculator.calculateCost(usage, model);
      breakdown.push({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        inputCost: calculator.calculateInputCost(usage.inputTokens, model),
        outputCost: calculator.calculateOutputCost(usage.outputTokens, model),
      });
    }

    return {
      totalCost: this.getTotalCost(calculator),
      currency,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      apiCalls: this.apiCallCount,
      breakdown,
    };
  }
}

class CostCalculator {
  private pricing: Map<string, { input: number; output: number }> = new Map([
    ['claude-sonnet-4', { input: 0.003, output: 0.015 }], // per 1K tokens
    ['claude-opus-4', { input: 0.015, output: 0.075 }],
    ['claude-haiku-4', { input: 0.00025, output: 0.00125 }],
    ['gpt-4-turbo', { input: 0.01, output: 0.03 }],
  ]);

  calculateCost(usage: Usage, model: string): number {
    const rates = this.pricing.get(model);
    if (!rates) throw new UnknownModelError(model);

    return (usage.inputTokens / 1000) * rates.input +
           (usage.outputTokens / 1000) * rates.output;
  }

  calculateInputCost(tokens: number, model: string): number {
    const rates = this.pricing.get(model);
    return (tokens / 1000) * rates.input;
  }

  calculateOutputCost(tokens: number, model: string): number {
    const rates = this.pricing.get(model);
    return (tokens / 1000) * rates.output;
  }
}
```

### Data Models

**Session State (for persistence):**

```typescript
interface SessionState {
  id: string;
  agentId: string;
  command: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'timeout';
  messages: Message[];
  mcpToolsSnapshot: MCPTool[]; // Tools available at session start (for resume)
  fallbackVfsState?: Record<string, VirtualFile>; // Only if using fallback VFS
  costTracker: {
    totalInputTokens: number;
    totalOutputTokens: number;
    apiCallCount: number;
    perModelUsage: Record<string, { inputTokens: number; outputTokens: number }>;
  };
  context: Record<string, any>; // Template variables
  startedAt: number;
  pausedAt?: number;
  completedAt?: number;
  pauseReason?: string; // Question text if paused for user input
}
```

**Agent Definition Schema (Zod):**

```typescript
const AgentDefinitionSchema = z.object({
  agent: z.object({
    name: z.string(),
    id: z.string(),
    title: z.string(),
    icon: z.string(),
    whenToUse: z.string(),
    customization: z.string().optional(),
  }),
  persona: z.object({
    role: z.string(),
    style: z.string(),
    identity: z.string(),
    focus: z.string(),
    core_principles: z.array(z.string()),
  }),
  commands: z.array(z.any()), // Command schema TBD
  dependencies: z.object({
    tasks: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    checklists: z.array(z.string()).optional(),
    data: z.array(z.string()).optional(),
  }),
});
```

### Database Design

**N/A - No Database Required**

The SDK is stateless by design. Session state persistence is handled through:
1. **In-memory** during active session
2. **Storage adapter** (GCS, S3, local) for session serialization if needed
3. **Application's database** (optional) - applications can store `SessionState` JSON in their own databases

This keeps the SDK lightweight and avoids database dependencies.

### Security & Authentication

**API Key Management:**
- SDK **never stores** API keys
- API keys passed in config at runtime by integrating application
- Applications responsible for secure key storage (environment variables, secret managers)
- SDK validates API key format but doesn't validate against provider until first API call

**MCP Server Security:**
- MCP servers run as **separate processes** (process isolation)
- Server processes inherit limited environment variables (only those explicitly configured)
- **No shell execution** - servers spawned with `spawn()` and `shell: false`
- Server commands must be explicit executables (e.g., `/usr/bin/node`, `npx`)
- Timeout enforcement on MCP requests prevents hanging connections
- MCP servers have their own permission models (e.g., filesystem server can be restricted to specific directories)

**Input Validation:**
- All user inputs validated with Zod schemas
- Tool parameters validated before execution
- File paths sanitized to prevent traversal attacks
- Command arguments sanitized before execution

**Storage Security:**
- GCS bucket permissions managed by user (SDK doesn't create buckets)
- Supports GCS IAM for authentication (no keys in code)
- Application Default Credentials (ADC) preferred for production

**GDPR Compliance:**
- `session.delete()` method to remove all session data
- Storage adapters support `delete()` for document removal
- No telemetry or tracking in SDK core
- Applications handle user consent and data retention

---

## Frontend Architecture

**N/A - Backend-Only Library**

This SDK is a **headless backend library** with no frontend components. However, it's designed to integrate seamlessly with frontend applications through backend APIs.

**Recommended Integration Patterns:**

**1. REST API Wrapper:**

```typescript
// Express example
app.post('/api/agents/:agentId/:command', async (req, res) => {
  const session = await bmadClient.startAgent(
    req.params.agentId,
    req.params.command,
    { costLimit: req.body.costLimit }
  );

  session.on('question', (q) => {
    // Store question in DB, send to frontend via WebSocket or polling
    questionQueue.push({ sessionId: session.id, question: q });
  });

  session.on('completed', (result) => {
    res.json({ sessionId: session.id, result });
  });

  session.execute();
});

app.post('/api/sessions/:sessionId/answer', async (req, res) => {
  const session = await bmadClient.resumeSession(req.params.sessionId);
  await session.answer(req.body.answer);
  res.json({ status: 'resumed' });
});
```

**2. GraphQL API:**

```graphql
type Mutation {
  startAgent(agentId: String!, command: String!, costLimit: Float): Session!
  answerQuestion(sessionId: ID!, answer: String!): Session!
}

type Subscription {
  sessionEvents(sessionId: ID!): SessionEvent!
}
```

**3. WebSocket for Real-Time Updates:**

```typescript
io.on('connection', (socket) => {
  socket.on('start-agent', async ({ agentId, command }) => {
    const session = await bmadClient.startAgent(agentId, command);

    session.on('question', (q) => {
      socket.emit('question', q);
    });

    session.on('cost-warning', (costs) => {
      socket.emit('cost-warning', costs);
    });

    session.on('completed', (result) => {
      socket.emit('completed', result);
    });

    session.execute();
  });
});
```

---

## Infrastructure & DevOps

### CI/CD Pipeline

**GitHub Actions Workflow:**

```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v3

  e2e:
    runs-on: ubuntu-latest
    # Only run nightly to save API costs
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test:e2e
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GCS_KEY_FILE: ${{ secrets.GCS_KEY_FILE }}

  publish:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')
    needs: test
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm build
      - run: pnpm publish-packages
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Deployment Strategy

**Package Publishing:**

1. **Versioning:** Changesets for semantic versioning
2. **Release Process:**
   - PR merged to `main` → CI runs tests
   - Maintainer runs `pnpm changeset version` → bumps versions
   - Tag created → CI publishes to NPM
3. **NPM Packages:**
   - `@bmad/client` (core SDK)
   - `@bmad/provider-anthropic`
   - `@bmad/storage-gcs`
4. **Pre-release:** `@bmad/client@beta` for testing

**Documentation Deployment:**

- **VitePress site** deployed to Vercel or GitHub Pages
- **Auto-deploy** on `main` branch changes
- **Versioned docs** for each major release

**Example Applications:**

- Deployed to Vercel/Railway for live demos
- Environment variables for API keys (not committed)

### Monitoring & Logging

**SDK Logging:**

```typescript
interface Logger {
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class DefaultLogger implements Logger {
  constructor(private level: LogLevel) {}

  error(msg, meta) {
    if (this.shouldLog('error')) {
      console.error(`[BMAD ERROR] ${msg}`, meta);
    }
  }

  // ... other levels
}
```

**Application Integration:**

```typescript
import winston from 'winston';

const logger = winston.createLogger({ /* config */ });

const bmadClient = new BmadClient({
  provider: { ... },
  logger: {
    error: (msg, meta) => logger.error(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    info: (msg, meta) => logger.info(msg, meta),
    debug: (msg, meta) => logger.debug(msg, meta),
  },
});
```

**Metrics (Optional):**

Applications can track:
- Session success/failure rates
- Average session duration
- Average cost per session
- Tool usage frequency
- Agent popularity

SDK provides hooks:

```typescript
session.on('completed', (result) => {
  metrics.recordSessionDuration(result.duration);
  metrics.recordSessionCost(result.costs.totalCost);
});
```

### Error Handling & Recovery

**Error Hierarchy:**

```typescript
class BmadError extends Error {
  constructor(
    message: string,
    public code: string,
    public isRetriable: boolean,
    public details?: any
  ) {
    super(message);
    this.name = 'BmadError';
  }
}

class ConfigurationError extends BmadError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', false);
  }
}

class ProviderError extends BmadError {
  constructor(message: string, isRetriable = true) {
    super(message, 'PROVIDER_ERROR', isRetriable);
  }
}

class RateLimitError extends BmadError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', true);
  }
}

class CostLimitExceededError extends BmadError {
  constructor(public currentCost: number, public limit: number) {
    super(
      `Session cost ${currentCost} exceeds limit ${limit}. Consider increasing costLimit or optimizing agent prompts.`,
      'COST_LIMIT_EXCEEDED',
      false
    );
  }
}

class CommandNotAllowedError extends BmadError {
  constructor(command: string) {
    super(
      `Command '${command}' not in allowed commands whitelist. Add to config.allowedCommands to enable.`,
      'COMMAND_NOT_ALLOWED',
      false
    );
  }
}
```

**Retry Logic:**

```typescript
interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  backoffMultiplier: number;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = { maxAttempts: 3, initialDelay: 1000, backoffMultiplier: 2 }
): Promise<T> {
  let attempt = 0;
  let delay = policy.initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;

      if (!(error instanceof BmadError) || !error.isRetriable || attempt >= policy.maxAttempts) {
        throw error;
      }

      logger.warn(`Retry attempt ${attempt}/${policy.maxAttempts} after ${delay}ms`, { error });
      await sleep(delay);
      delay *= policy.backoffMultiplier;
    }
  }
}
```

**Session Recovery:**

```typescript
// Persist session state to storage
session.on('paused', async () => {
  const state = session.serialize();
  await storage.save(`.bmad-sessions/${session.id}.json`, JSON.stringify(state));
});

// Resume after application restart
async function recoverSessions(client: BmadClient): Promise<BmadSession[]> {
  const sessionFiles = await storage.list('.bmad-sessions/');
  const sessions = [];

  for (const file of sessionFiles) {
    const stateJSON = await storage.load(file);
    const state = JSON.parse(stateJSON);
    const session = BmadSession.deserialize(state, client);
    sessions.push(session);
  }

  return sessions;
}
```

---

## Testing Strategy

### Test Levels

**1. Unit Tests (70% of tests):**

- **Target:** Individual classes and functions in isolation
- **Mocking:** All external dependencies (LLM APIs, storage, filesystem)
- **Coverage:** 90%+ for all service layer code

Example:

```typescript
describe('CostTracker', () => {
  it('should record usage and calculate total cost', () => {
    const tracker = new CostTracker();
    const calculator = new CostCalculator();

    tracker.recordUsage({ inputTokens: 1000, outputTokens: 500 }, 'claude-sonnet-4');
    tracker.recordUsage({ inputTokens: 500, outputTokens: 250 }, 'claude-sonnet-4');

    const report = tracker.getReport(calculator, 'USD');

    expect(report.totalCost).toBeCloseTo(0.015); // (1500/1000)*0.003 + (750/1000)*0.015
    expect(report.inputTokens).toBe(1500);
    expect(report.outputTokens).toBe(750);
  });
});
```

**2. Integration Tests (25% of tests):**

- **Target:** Component interactions (session + provider + tools + storage)
- **Mocking:** External APIs (Anthropic, GCS) using Nock or MSW
- **Coverage:** Critical paths (session execution, tool orchestration, state persistence)

Example:

```typescript
describe('Session Integration', () => {
  it('should execute agent with tool calls and save document', async () => {
    // Mock Anthropic API
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_123',
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'write', input: { path: '/docs/test.md', content: 'Hello' } }
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_124',
        role: 'assistant',
        content: 'Document created successfully.',
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 20 },
      });

    // Mock GCS
    const mockStorage = new InMemoryStorageAdapter();

    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test-key' },
      storage: mockStorage,
    });

    const session = await client.startAgent('test-agent', 'test-command');
    const result = await session.execute();

    expect(result.status).toBe('completed');
    expect(result.costs.totalCost).toBeGreaterThan(0);
    expect(await mockStorage.exists('/docs/test.md')).toBe(true);
  });
});
```

**3. End-to-End Tests (5% of tests):**

- **Target:** Full workflows against real LLM APIs
- **Frequency:** Nightly (to avoid excessive API costs)
- **Coverage:** One test per agent type with low-cost model (Claude Haiku)

Example:

```typescript
describe('E2E: PM Agent', () => {
  it('should create PRD with real Anthropic API', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: 'claude-haiku-4', // Cheapest model
      },
      storage: new InMemoryStorageAdapter(),
    });

    const session = await client.startAgent('pm', 'create-prd');

    // Auto-answer questions for automated test
    session.on('question', () => {
      session.answer('Test project for automated testing');
    });

    const result = await session.execute();

    expect(result.status).toBe('completed');
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.costs.totalCost).toBeLessThan(0.50); // Sanity check
  }, 120000); // 2 min timeout
});
```

### Test Automation

**Pre-commit hooks:**

```bash
# .husky/pre-commit
pnpm lint
pnpm typecheck
pnpm test:unit
```

**CI Pipeline:**

1. **Every PR:** Unit + Integration tests
2. **Nightly:** E2E tests against real APIs
3. **Pre-release:** Full test suite + manual smoke tests

**Coverage Requirements:**

- Overall: 90%+
- Service layer: 95%+
- Critical paths (session execution, cost tracking): 100%

---

## Performance Considerations

### Optimization Strategy

**1. Session Initialization (<500ms goal):**

- **Lazy loading:** Don't load agents until needed
- **Agent registry cache:** In-memory cache after first load
- **Provider initialization:** Reuse HTTP clients

**2. Concurrent Sessions (10+ per process):**

- **Event-driven architecture:** Non-blocking I/O
- **Streaming responses:** Process LLM output as it arrives (future)
- **Resource pooling:** Limit concurrent LLM API calls (configurable)

**3. Document Operations:**

- **Virtual filesystem:** In-memory (no disk I/O during session)
- **Lazy GCS saves:** Only save to storage on session completion
- **Batch operations:** Combine multiple file writes when possible

**4. Bundle Size (<200KB minified+gzipped):**

- **Tree shaking:** ESM exports for optimal bundling
- **Minimal dependencies:** Carefully evaluate each dependency
- **Optional dependencies:** Provider and storage packages separate

### Scalability Patterns

**Horizontal Scaling:**

- SDK is **stateless** by design
- Applications can run multiple instances
- Session state persisted to storage for resume after instance failure

**Cost Optimization:**

- **Model selection:** Allow per-session model override (use Haiku for simple tasks)
- **Token limits:** Set `max_tokens` to prevent runaway costs
- **Early termination:** Abort sessions approaching cost limit before exceeding

**Caching (Future):**

- Cache agent prompts (same agent + command = same initial prompt)
- Cache template renders (same template + context = same output)

---

## Appendices

### A. Technology Decision Log

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Language | JavaScript, TypeScript | **TypeScript** | Type safety critical for SDK reliability, better DX |
| Package Manager | npm, yarn, pnpm | **pnpm** | Fast, efficient, strict dependency management |
| Build Tool | tsc, esbuild, tsup, rollup | **tsup** | Fast, simple config, dual format output |
| Testing Framework | Jest, Vitest, Mocha | **Vitest** | Fast, TypeScript-native, better ESM support |
| LLM SDK | Direct HTTP, @anthropic-ai/sdk | **@anthropic-ai/sdk** | Official, type-safe, maintained by Anthropic |
| Storage (MVP) | GCS, S3, Azure Blob | **GCS** | Simpler auth (ADC), good Node.js SDK |
| **Tool Execution** | **Custom tools, MCP integration** | **MCP (Model Context Protocol)** | **75% less code, standardized, real filesystems, community ecosystem** |
| MCP SDK | Build from scratch, @modelcontextprotocol/sdk | **@modelcontextprotocol/sdk** | Official implementation, well-tested, maintained |
| Fallback VFS | No fallback, custom in-memory | **Custom in-memory Map** | Backward compatibility, testing without MCP servers |
| Event System | Native EventEmitter, eventemitter3 | **eventemitter3** | Typed events, better error handling |
| Schema Validation | Zod, Yup, Joi | **Zod** | TypeScript-first, excellent inference |

### B. Glossary

- **Agent:** Specialized AI persona with defined role, commands, and dependencies (e.g., PM, Architect, Dev)
- **Session:** Single execution context for an agent command, managing conversation state and lifecycle
- **MCP (Model Context Protocol):** Anthropic's standard protocol for connecting LLMs to external tools and resources via JSON-RPC 2.0
- **MCP Server:** External process providing tools to the SDK (filesystem access, database queries, API integrations, etc.)
- **MCP Client:** Component in the SDK that connects to MCP servers, discovers tools, and routes tool calls
- **Tool:** Function exposed to LLM for performing actions (provided by MCP servers or fallback VFS)
- **Fallback VFS:** In-memory virtual filesystem used when no MCP servers are configured (backward compatibility)
- **Provider:** Anthropic Claude API integration
- **Storage Adapter:** Abstraction for document persistence (GCS, S3, local, etc.)
- **Expansion Pack:** External NPM package containing additional agents for specialized domains
- **Template:** YAML-defined structure for generating documents (PRD, architecture, stories)
- **Task:** Markdown workflow defining multi-step agent processes with elicitation
- **Elicitation:** Interactive process where agent asks questions to gather user input
- **Cost Tracking:** Monitoring token usage and calculating LLM API costs in real-time
- **Pause/Resume:** Session capability to suspend execution for user input and continue later

### C. References

- **Anthropic API Documentation:** https://docs.anthropic.com
- **Model Context Protocol Specification:** https://modelcontextprotocol.io/
- **MCP SDK for TypeScript:** https://github.com/modelcontextprotocol/typescript-sdk
- **Official MCP Servers:** https://github.com/modelcontextprotocol/servers
- **Google Cloud Storage SDK:** https://cloud.google.com/nodejs/docs/reference/storage/latest
- **BMad-Method Core:** `.bmad-core/` directory structure and conventions
- **Expansion Pack Example:** `@bmad-expansions/bmad-expert-author` (educational authoring)
- **Creative Intelligence Suite:** CIS module (design thinking, storytelling, brainstorming)

### D. Open Questions & Future Considerations

**Resolved:**
- ✅ Tool execution approach: **MCP integration chosen** over custom tools (75% code reduction, standardized protocol)
- ✅ Multi-provider support: Abstraction layer designed
- ✅ Cost management: Comprehensive tracking and limits
- ✅ Real filesystem access: Achieved via MCP filesystem servers instead of in-memory VFS

**Pending Research:**
- **MCP server lifecycle:** Best practices for reconnecting to crashed MCP servers during long sessions
- **MCP tool namespacing:** How to handle tool name collisions between multiple MCP servers
- **Streaming responses:** Can we stream LLM output for real-time feedback?
- **Multi-agent workflows:** How to orchestrate multiple agents in sequence (Analyst → PM → Architect)?
- **Agent versioning:** How to handle breaking changes in agent definitions?
- **Expansion pack discovery:** NPM registry search or dedicated marketplace?
- **Fine-tuning:** Can we fine-tune models for specific agents to reduce costs?

**Future Enhancements (Post-MVP):**
- **Additional MCP servers:** Web search, Slack, Jira, Notion integrations via MCP
- **Custom MCP server templates:** Starter kits for building domain-specific MCP servers
- **Collaborative sessions:** Multi-user editing with conflict resolution
- **Visual workflow builder:** UI for creating custom agent sequences
- **Self-hosted LLMs:** Support for Ollama, LM Studio, etc.
- **Advanced cost optimization:** Multi-model routing, prompt caching
- **MCP server marketplace:** Curated list of community MCP servers for BMad workflows

---

**Document Version:** 2.0
**Created:** 2025-10-31
**Updated:** 2025-10-31 (MCP integration)
**Author:** Winston (Architect)
**Reviewed by:** PM (John), Analyst (Mary)
**Next Steps:** Begin Epic 1 implementation (Foundation & SDK Core Infrastructure) followed by Epic 4 (MCP Integration & Tool Orchestration)
