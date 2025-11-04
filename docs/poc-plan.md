# BMad Client Library - Proof of Concept Plan

## Executive Summary

**Goal:** Build a working SDK that can execute BMAD agents with a simple example application to validate the architecture.

**Approach:** SDK Library + Example Scripts/Chat

**Timeline:** 4-6 weeks for PoC

**Success Criteria:**
- ✅ SDK can load and execute one BMAD agent (PM or book-author)
- ✅ Agent can use tools (read, write files)
- ✅ Simple script can interact with agent
- ✅ Optional: Simple web chat interface
- ✅ Cost tracking works
- ✅ Session pause/resume works

---

## Phase 1: Minimal SDK Core (Week 1-2)

### Goal
Prove that we can execute a BMAD agent through the SDK with Claude API.

### Deliverables

#### 1.1 Project Setup
```bash
bmad-client/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── index.ts
│       │   ├── client.ts
│       │   ├── session.ts
│       │   └── __tests__/
│       ├── package.json
│       └── tsconfig.json
├── package.json (workspace root)
├── pnpm-workspace.yaml
└── vitest.config.ts
```

**Tasks:**
- [ ] Initialize pnpm workspace
- [ ] Setup TypeScript with strict mode
- [ ] Configure Vitest for testing
- [ ] Setup ESLint + Prettier
- [ ] Create basic package structure

**Time:** 1 day

#### 1.2 System Prompt Generator

**File:** `packages/core/src/prompt-generator.ts`

```typescript
export class SystemPromptGenerator {
  generate(agentDefinition: AgentDefinition): string {
    // Combine Claude Code base prompt + agent persona
  }
}
```

**Test:**
```typescript
describe('SystemPromptGenerator', () => {
  it('generates valid system prompt from agent definition', () => {
    const prompt = generator.generate(pmAgentDefinition);
    expect(prompt).toContain('You are Claude');
    expect(prompt).toContain('Product Manager');
  });
});
```

**Tasks:**
- [ ] Implement base Claude Code prompt
- [ ] Add tool descriptions
- [ ] Inject agent persona
- [ ] Write unit tests

**Time:** 2 days

#### 1.3 Agent Loader

**File:** `packages/core/src/agents/loader.ts`

```typescript
export class AgentLoader {
  async loadAgent(filePath: string): Promise<AgentDefinition> {
    // Read MD file, parse YAML frontmatter
  }
}
```

**Test:**
```typescript
describe('AgentLoader', () => {
  it('loads agent from markdown file', async () => {
    const agent = await loader.loadAgent('../bmad-export-author/.bmad-core/agents/pm.md');
    expect(agent.agent.id).toBe('pm');
  });
});
```

**Tasks:**
- [ ] Parse markdown files with gray-matter
- [ ] Validate schema with Zod
- [ ] Handle parse errors gracefully
- [ ] Write unit tests

**Time:** 2 days

#### 1.4 Anthropic Provider (Minimal)

**File:** `packages/core/src/providers/anthropic.ts`

```typescript
export class AnthropicProvider {
  async sendMessage(
    messages: Message[],
    tools: Tool[]
  ): Promise<ProviderResponse> {
    // Call Anthropic API
  }
}
```

**Test:**
```typescript
describe('AnthropicProvider', () => {
  it('sends message with tools to Claude API', async () => {
    // Mock Anthropic SDK
    const response = await provider.sendMessage(messages, tools);
    expect(response.message.content).toBeDefined();
  });
});
```

**Tasks:**
- [ ] Install @anthropic-ai/sdk
- [ ] Implement sendMessage
- [ ] Handle tool calls in response
- [ ] Write unit tests with mocked SDK

**Time:** 2 days

#### 1.5 Fallback Tool Executor

**File:** `packages/core/src/tools/fallback-executor.ts`

```typescript
export class FallbackToolExecutor {
  private vfs = new Map<string, string>();

  async execute(toolName: string, input: any): Promise<any> {
    // Execute read_file, write_file, etc. on VFS
  }
}
```

**Tasks:**
- [ ] Implement read_file
- [ ] Implement write_file
- [ ] Implement edit_file
- [ ] Implement safe bash_command subset
- [ ] Write unit tests

**Time:** 3 days

#### 1.6 Basic Session

**File:** `packages/core/src/session.ts`

```typescript
export class BmadSession extends EventEmitter {
  async execute(): Promise<SessionResult> {
    // Tool call loop
  }
}
```

**Test:**
```typescript
describe('BmadSession', () => {
  it('executes tool call loop', async () => {
    const session = new BmadSession(client, 'pm', '*help');
    const result = await session.execute();
    expect(result.status).toBe('completed');
  });
});
```

**Tasks:**
- [ ] Implement tool call loop
- [ ] Handle tool responses
- [ ] Basic error handling
- [ ] Write integration test

**Time:** 3 days

#### 1.7 BmadClient (Minimal)

**File:** `packages/core/src/client.ts`

```typescript
export class BmadClient {
  constructor(config: BmadClientConfig) {
    // Init provider, loader, tools
  }

  async startAgent(agentId: string, command: string): Promise<BmadSession> {
    // Create session
  }
}
```

**Test:**
```typescript
describe('BmadClient', () => {
  it('creates session for agent', async () => {
    const client = new BmadClient({ provider: { type: 'anthropic', apiKey: 'test' } });
    const session = await client.startAgent('pm', '*help');
    expect(session).toBeInstanceOf(BmadSession);
  });
});
```

**Tasks:**
- [ ] Implement constructor
- [ ] Implement startAgent
- [ ] Load agents from directory
- [ ] Write integration test

**Time:** 2 days

---

## Phase 2: Example Application (Week 3)

### Goal
Prove SDK works in real application with simple scripts and chat.

### Deliverables

#### 2.1 Simple Script Example

**File:** `examples/simple-script/index.ts`

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!
  }
});

async function main() {
  console.log('Starting PM agent...');

  const session = await client.startAgent('pm', '*help');

  session.on('question', (q) => {
    console.log('Agent asks:', q.question);
    // For PoC, auto-answer
    session.answer('Test project for PoC');
  });

  const result = await session.execute();
  console.log('Result:', result);
}

main().catch(console.error);
```

**Tasks:**
- [ ] Create example directory
- [ ] Write simple script
- [ ] Test with real Anthropic API
- [ ] Document usage in README

**Time:** 1 day

#### 2.2 Interactive CLI Script

**File:** `examples/interactive-cli/index.ts`

```typescript
import { BmadClient } from '@bmad/client';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!
    }
  });

  console.log('BMad Client PoC - Interactive Mode');
  console.log('Available agents: pm, architect, dev');

  rl.question('Which agent? ', async (agentId) => {
    rl.question('Which command? ', async (command) => {
      const session = await client.startAgent(agentId, command);

      session.on('question', (q) => {
        console.log('\n🤔 Agent asks:', q.question);
        rl.question('Your answer: ', (answer) => {
          session.answer(answer);
        });
      });

      session.on('completed', (result) => {
        console.log('\n✅ Session completed!');
        console.log('Documents created:', result.documents.length);
        console.log('Cost:', result.costs.totalCost, result.costs.currency);
        rl.close();
      });

      await session.execute();
    });
  });
}

main().catch(console.error);
```

**Tasks:**
- [ ] Implement readline interface
- [ ] Handle questions interactively
- [ ] Display results nicely
- [ ] Test with PM agent

**Time:** 1 day

#### 2.3 Simple Web Chat (Optional)

**File:** `examples/web-chat/`

```
web-chat/
├── server/
│   └── index.ts          # Express + Socket.io
├── client/
│   ├── index.html
│   ├── chat.js
│   └── styles.css
└── package.json
```

**Server:**
```typescript
import express from 'express';
import { Server } from 'socket.io';
import { BmadClient } from '@bmad/client';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!
  }
});

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('start-agent', async ({ agentId, command }) => {
    const session = await client.startAgent(agentId, command);

    session.on('question', (q) => {
      socket.emit('question', q);
    });

    session.on('completed', (result) => {
      socket.emit('completed', result);
    });

    await session.execute();
  });

  socket.on('answer', (answer) => {
    // Resume session with answer
  });
});

server.listen(3000);
```

**Client:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>BMad Chat PoC</title>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <div id="chat">
    <div id="messages"></div>
    <input id="input" placeholder="Type your answer...">
  </div>

  <script src="chat.js"></script>
</body>
</html>
```

```javascript
// chat.js
const socket = io();

// Start agent on page load
socket.emit('start-agent', {
  agentId: 'pm',
  command: '*help'
});

socket.on('question', (q) => {
  addMessage('agent', q.question);
});

socket.on('completed', (result) => {
  addMessage('system', `✅ Completed! Cost: ${result.costs.totalCost} EUR`);
});

document.getElementById('input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const answer = e.target.value;
    addMessage('user', answer);
    socket.emit('answer', answer);
    e.target.value = '';
  }
});
```

**Tasks:**
- [ ] Setup Express + Socket.io
- [ ] Create simple HTML interface
- [ ] Connect SDK to websockets
- [ ] Test with PM agent
- [ ] Deploy to Vercel/Railway (optional)

**Time:** 3 days (optional)

---

## Phase 3: Essential Features (Week 4)

### Goal
Add critical features to make PoC production-like.

### Deliverables

#### 3.1 Cost Tracking

**File:** `packages/core/src/cost/tracker.ts`

```typescript
export class CostTracker {
  recordUsage(usage: Usage, model: string): void;
  getReport(): CostReport;
}
```

**Tasks:**
- [ ] Track input/output tokens
- [ ] Calculate costs per model
- [ ] Generate cost reports
- [ ] Write tests

**Time:** 1 day

#### 3.2 Pause/Resume

**Tasks:**
- [ ] Detect questions in LLM responses
- [ ] Pause session execution
- [ ] Emit question event
- [ ] Resume with answer
- [ ] Write tests

**Time:** 2 days

#### 3.3 Error Handling

**Tasks:**
- [ ] Create error hierarchy
- [ ] Handle API errors
- [ ] Handle tool execution errors
- [ ] Add retry logic
- [ ] Write tests

**Time:** 2 days

#### 3.4 Logging

**Tasks:**
- [ ] Create logger interface
- [ ] Add debug logging throughout
- [ ] Test log output

**Time:** 1 day

---

## Phase 4: Documentation & Polish (Week 5-6)

### Goal
Make PoC presentable and understandable.

### Deliverables

#### 4.1 Documentation

**Files:**
- `README.md` - Overview, quick start
- `docs/getting-started.md` - Detailed setup
- `docs/api-reference.md` - API docs
- `docs/examples.md` - Example code

**Time:** 3 days

#### 4.2 Demo Video/GIF

- Record demo of interactive CLI
- Record demo of web chat (if built)
- Upload to README

**Time:** 1 day

#### 4.3 Testing & Bug Fixes

- Run full test suite
- Test with multiple agents
- Fix discovered bugs
- Improve error messages

**Time:** 3 days

---

## Testing Strategy for PoC

### Unit Tests
```typescript
// Test individual components
describe('SystemPromptGenerator', () => { ... });
describe('AgentLoader', () => { ... });
describe('FallbackToolExecutor', () => { ... });
```

**Target:** 80% coverage

### Integration Tests
```typescript
// Test component interactions
describe('Session with Mocked Provider', () => {
  it('executes tool call loop', async () => {
    // Mock Anthropic responses
    // Verify tool execution
  });
});
```

**Target:** Critical paths covered

### E2E Tests
```typescript
// Test with real Anthropic API (limited)
describe('E2E: PM Agent', () => {
  it('executes *help command', async () => {
    // Real API call
    // Cost: ~$0.01
  });
});
```

**Target:** 1 test per agent

### Manual Testing
- [ ] Run simple-script example
- [ ] Run interactive-cli example
- [ ] Run web-chat example (if built)
- [ ] Test with different agents
- [ ] Test error scenarios

---

## Success Criteria

### Must Have (PoC Valid)
- ✅ SDK can execute PM agent *help command
- ✅ Agent uses tools (read/write VFS)
- ✅ Simple script example works
- ✅ Cost tracking reports accurate costs
- ✅ Basic error handling works
- ✅ Documentation exists

### Nice to Have
- ✅ Interactive CLI works smoothly
- ✅ Web chat interface functional
- ✅ Multiple agents work (PM, architect)
- ✅ Pause/resume works
- ✅ Tests have 80%+ coverage

### Out of Scope for PoC
- ❌ MCP server integration (fallback VFS only)
- ❌ GCS storage (in-memory only)
- ❌ Multiple provider support (Anthropic only)
- ❌ Production deployment
- ❌ Performance optimization
- ❌ Advanced features (streaming, multi-agent)

---

## Risk Mitigation

### Risk 1: Agent prompts don't work outside Claude Code
**Mitigation:** Start with simple agent, test early, iterate on system prompt

### Risk 2: Tool execution too complex
**Mitigation:** Use fallback VFS first, defer MCP to post-PoC

### Risk 3: API costs too high during testing
**Mitigation:** Use mocked provider for most tests, real API only for E2E

### Risk 4: Time overrun
**Mitigation:** Prioritize ruthlessly, skip web chat if needed

---

## Next Steps

### Immediate Actions (Day 1)

1. **Setup Repository**
   ```bash
   mkdir bmad-client
   cd bmad-client
   pnpm init
   mkdir -p packages/core/src
   ```

2. **Install Dependencies**
   ```bash
   pnpm add -D typescript vitest @types/node
   pnpm add @anthropic-ai/sdk zod gray-matter eventemitter3
   ```

3. **Create Basic Structure**
   ```bash
   touch packages/core/src/index.ts
   touch packages/core/src/client.ts
   touch packages/core/src/session.ts
   touch packages/core/package.json
   touch pnpm-workspace.yaml
   ```

4. **First Test**
   ```typescript
   // packages/core/src/__tests__/client.test.ts
   import { describe, it, expect } from 'vitest';
   import { BmadClient } from '../client';

   describe('BmadClient', () => {
     it('initializes', () => {
       const client = new BmadClient({
         provider: { type: 'anthropic', apiKey: 'test' }
       });
       expect(client).toBeDefined();
     });
   });
   ```

5. **Run First Test**
   ```bash
   pnpm test
   ```

### Week 1 Focus
- Complete Phase 1.1-1.4 (Setup, Prompt Generator, Agent Loader, Provider)
- Get first real API call working
- Validate system prompt generates correctly

---

## Budget Estimate

### Development Time
- Week 1-2: SDK Core (80 hours)
- Week 3: Examples (40 hours)
- Week 4: Features (40 hours)
- Week 5-6: Polish (40 hours)
- **Total:** 200 hours (~1.5 FTE for 6 weeks)

### API Costs (Testing)
- Unit tests: $0 (mocked)
- Integration tests: ~$5 (100 test runs)
- E2E tests: ~$10 (20 full agent runs)
- Manual testing: ~$50 (iterative testing)
- **Total:** ~$65

### Infrastructure
- GitHub repo: Free
- Vercel hosting (optional): Free tier
- **Total:** $0

---

## Deliverables Summary

### Code
- ✅ `@bmad/client` package (core SDK)
- ✅ `examples/simple-script` - Basic usage
- ✅ `examples/interactive-cli` - Interactive mode
- ✅ `examples/web-chat` - Web interface (optional)

### Documentation
- ✅ `README.md` - Project overview
- ✅ `docs/getting-started.md` - Setup guide
- ✅ `docs/architecture.md` - Architecture (updated)
- ✅ `docs/poc-plan.md` - This document

### Artifacts
- ✅ Demo video/GIF
- ✅ Test suite with 80%+ coverage
- ✅ Working examples

---

**Document Version:** 1.0
**Created:** 2025-11-04
**Author:** Winston (Architect)
**Status:** Ready for Implementation
