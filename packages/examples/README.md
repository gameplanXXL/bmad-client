# BMad Client Examples

This directory contains example applications demonstrating how to use the BMad Client Library.

## Available Examples

### conversational-session.ts

**Interactive REPL for multi-turn conversations with agents.**

Demonstrates the ConversationalSession API, which provides a Claude Code-like REPL experience. Unlike one-shot execution (BmadSession), ConversationalSession maintains context across multiple messages.

```bash
ANTHROPIC_API_KEY=sk-... npx tsx packages/examples/conversational-session.ts
```

**What it shows:**
- Starting a conversational session
- Sending multiple messages with context retention
- Handling agent questions (elicitation)
- Real-time cost tracking
- Viewing conversation history
- Document accumulation across turns
- Ending conversation and getting final results

**Key Features:**
- **Persistent Context:** VFS and conversation history maintained across turns
- **Natural Flow:** Send follow-up messages like "update that" or "what did we decide?"
- **Interactive:** Type messages in a REPL-style interface
- **Commands:** Type `status` for current state, `history` for all turns, `quit` to end

### conversational-http-api.ts

**Production-ready HTTP API for conversational sessions.**

Demonstrates how to integrate ConversationalSession with an Express API, solving the HTTP timeout problem for long-running LLM operations.

```bash
ANTHROPIC_API_KEY=sk-... npx tsx packages/examples/conversational-http-api.ts
```

Then in another terminal:

```bash
# Start conversation
curl -X POST http://localhost:3000/conversations \
  -H "Content-Type: application/json" \
  -d '{"agentId": "pm", "message": "Create a PRD for todo app"}'

# Returns: {"conversationId": "conv_123...", "status": "processing"}

# Poll status (repeat until idle)
curl http://localhost:3000/conversations/conv_123...

# Send follow-up message
curl -X POST http://localhost:3000/conversations/conv_123.../messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Update target users section"}'

# End conversation
curl -X POST http://localhost:3000/conversations/conv_123.../end
```

**Architecture:**
- **POST /conversations** - Start conversation, return ID immediately (202 Accepted)
- **POST /conversations/:id/messages** - Send message, return immediately
- **GET /conversations/:id** - Poll status (returns current state)
- **GET /conversations/:id/history** - Get all turns
- **GET /conversations/:id/documents** - Get generated documents
- **POST /conversations/:id/answers** - Answer agent questions
- **POST /conversations/:id/end** - End conversation

**Solves HTTP Timeout Problem:**
- All endpoints return immediately (< 100ms)
- Long-running LLM operations happen in background
- Client polls for status updates
- Compatible with serverless platforms (Vercel, AWS Lambda + API Gateway)

### expansion-pack-loading.ts

Demonstrates how to load agents from expansion packs installed in `.bmad-*` directories.

```bash
npx tsx packages/examples/expansion-pack-loading.ts
```

**What it shows:**
- Auto-discovery of expansion packs from parent directory
- Manual expansion pack discovery using AgentLoader
- Listing agents from discovered packs

**Requirements:**
- Expansion packs must be in `.bmad-*` directories (e.g., `.bmad-expert-author/`)
- Each pack must have an `agents/` subdirectory with agent definition markdown files
- Agent files must follow the BMad agent schema (YAML frontmatter)

## Expansion Pack Structure

```
.bmad-your-pack/
├── agents/
│   ├── agent1.md
│   ├── agent2.md
│   └── ...
├── tasks/
│   └── *.md
├── templates/
│   └── *.yaml
└── data/
    └── *.md
```

## Agent File Format

Each agent markdown file must include YAML frontmatter:

```markdown
---
agent:
  name: Agent Name
  id: agent-id
  title: Agent Title
  icon: 🤖
  whenToUse: Description of when to use this agent
persona:
  role: Agent role
  style: Communication style
  identity: Agent identity
  focus: Primary focus
  core_principles:
    - Principle 1
    - Principle 2
commands:
  - command1
  - command2
dependencies:
  tasks: []
  templates: []
  checklists: []
  data: []
---

# Agent Content

Agent description and instructions...
```

## Configuration

To specify custom expansion pack search paths:

```typescript
const client = new BmadClient({
  provider: { /* ... */ },
  expansionPackPaths: [
    '../custom-location/',
    '/absolute/path/to/packs/'
  ]
});
```

If not specified, the SDK will auto-discover packs in the parent directory (`../`).
