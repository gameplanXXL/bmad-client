<!-- Powered by BMAD™ Core - SDK Version -->

# BMad Orchestrator (SDK Version)

**Version:** 1.0 (SDK-adapted)
**Date:** 2025-11-05
**Purpose:** Orchestrator agent adapted for @bmad/client SDK using invoke_agent tool delegation

---

This is a backup/reference copy of the SDK-adapted BMad Orchestrator agent.

The active version is located at: `.bmad-core/agents/bmad-orchestrator.md`

---

## Key Differences from Claude Code Version

### Architecture

| **Aspect**          | **Claude Code**                          | **BMad Client SDK**                     |
| ------------------- | ---------------------------------------- | --------------------------------------- |
| **Agent Switching** | System Prompt Replacement (SlashCommand) | Nested Sessions (invoke_agent tool)     |
| **Identity**        | Orchestrator "becomes" PM                | Orchestrator "invokes" PM               |
| **Tool**            | `SlashCommand("/BMad:agents:pm")`        | `invoke_agent({ agent_id: "pm", ... })` |
| **Session Model**   | Single session, persona swap             | Parent-child session hierarchy          |
| **Context**         | Shared conversation memory               | Explicit context passing                |
| **Documents**       | Shared VFS                               | Child VFS merged to parent              |
| **Costs**           | Single session total                     | Aggregated parent + children            |

### Core Principles Changes

**OLD (Claude Code):**

```yaml
core_principles:
  - Become any agent on demand
  - When embodied, specialized persona's principles take precedence
```

**NEW (SDK):**

```yaml
core_principles:
  - Orchestrate specialized agents via invoke_agent tool
  - Never transform - remain Orchestrator throughout session
  - Delegate tasks with complete context and requirements
  - Monitor sub-agent progress and aggregate results
  - Track costs across all sub-agents transparently
```

### Tool Usage

**invoke_agent Example:**

```typescript
// Orchestrator delegates to PM
invoke_agent({
  agent_id: "pm",
  command: "create-prd",
  context: {
    project_type: "web application",
    target_users: "backend developers",
    key_features: ["API", "Authentication", "Dashboard"]
  }
})

// Returns:
{
  "status": "completed",
  "agent": "pm",
  "documents": [{ "path": "/docs/prd.md", "size": 15420 }],
  "costs": { "totalCost": 0.42, "inputTokens": 8500, "outputTokens": 6200 },
  "duration": 12500
}
```

### Sequential Workflow Example

```
User: "Set up a new project"

Orchestrator orchestrates:

1. invoke_agent({ agent_id: "pm", command: "create-prd" })
   → PM creates /docs/prd.md ($0.42)

2. invoke_agent({
     agent_id: "architect",
     command: "create-architecture",
     context: { prd_path: "/docs/prd.md" }
   })
   → Architect creates /docs/architecture.md ($0.68)

3. invoke_agent({
     agent_id: "dev",
     command: "scaffold-project",
     context: {
       prd_path: "/docs/prd.md",
       architecture_path: "/docs/architecture.md"
     }
   })
   → Dev creates /src/* ($0.77)

Total Cost: $1.87 (aggregated across all sub-agents)
```

### Result Presentation Format

**Template:**

```
✓ [Agent Title] completed [task] ($X.XX)

📄 Documents created:
- [path] ([size] KB)

💡 Key highlights:
- [brief summary]

Next suggested steps:
1. [action 1]
2. [action 2]
```

**Example:**

```
✓ PM completed PRD ($0.42)

📄 Documents created:
- /docs/prd.md (15.4 KB)

💡 Key highlights:
- Defined 12 functional requirements
- 2 primary user personas
- 3 core goals

Next suggested steps:
1. Review PRD sections
2. Invoke architect for system design
3. Create initial user stories with PO
```

---

## Implementation Notes

### Cost Tracking

- All sub-agent costs are automatically tracked
- Parent session aggregates costs from all children
- Cost limits are respected across the entire hierarchy
- Each completion message includes cost information

### Document Management

- Each sub-agent has its own isolated VFS
- Documents created by sub-agents are automatically merged into parent VFS
- Parent can read sub-agent documents via standard read_file tool
- No manual file transfer needed

### Context Passing

Always include relevant context when invoking sub-agents:

```typescript
invoke_agent({
  agent_id: 'architect',
  command: 'create-architecture',
  context: {
    // Reference to previous documents
    prd_path: '/docs/prd.md',

    // Extracted key information
    tech_stack: ['Node.js', 'TypeScript', 'PostgreSQL'],

    // User requirements
    scalability: 'Must handle 10K concurrent users',

    // Constraints
    budget: 50000,
    timeline: '3 months',
  },
});
```

### Error Handling

If a sub-agent fails:

```json
{
  "success": false,
  "error": "Sub-agent failed: Cost limit exceeded"
}
```

Orchestrator should:

1. Log the error
2. Inform user about failure
3. Suggest corrective action (increase budget, simplify requirements, etc.)
4. Optionally retry with modified parameters

---

## Migration from Claude Code

If you have existing orchestrator workflows in Claude Code:

1. **Search for SlashCommand usage:**
   - Replace with `invoke_agent` tool calls

2. **Update persona expectations:**
   - Remove references to "I am now the PM"
   - Use "I've invoked the PM to handle this"

3. **Update result handling:**
   - Parse JSON result from invoke_agent
   - Extract documents and costs
   - Present summary to user

4. **Update cost reporting:**
   - Include sub-agent breakdown
   - Show total aggregated cost

---

## Testing

To test the SDK orchestrator:

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

const session = await client.startAgent('bmad-orchestrator', 'create a PRD for my web app');

session.on('completed', (result) => {
  console.log('Documents:', result.documents);
  console.log('Total Cost:', result.costs.totalCost);
  console.log('Child Sessions:', result.costs.childSessions);
});

const result = await session.execute();
```

---

## See Also

- [Agent Adaptation Guide](../agent-adaptation-guide.md) - Complete migration guide
- [BMad Client Architecture](../architecture.md) - SDK architecture
- [Tool Usage Guide](../tools.md) - How invoke_agent works internally

---

**Document Version:** 1.0
**Last Updated:** 2025-11-05
**Maintained By:** Winston (Architect)
