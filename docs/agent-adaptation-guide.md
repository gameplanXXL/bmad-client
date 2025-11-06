# BMad Agent Adaptation Guide for SDK

**Version:** 1.0
**Date:** 2025-11-05
**Author:** Winston (Architect)

---

## Table of Contents

1. [Overview](#overview)
2. [Why Agent Adaptation is Necessary](#why-agent-adaptation-is-necessary)
3. [Architectural Differences](#architectural-differences)
4. [Agent Modification Patterns](#agent-modification-patterns)
5. [Orchestrator Agent Changes](#orchestrator-agent-changes)
6. [Specialist Agent Changes](#specialist-agent-changes)
7. [Implementation Checklist](#implementation-checklist)
8. [Migration Examples](#migration-examples)

---

## Overview

This document describes the necessary adaptations to BMad Method agent definitions when migrating from **Claude Code environment** to the **BMad Client SDK**.

The core difference: **Agent invocation mechanism changes from system prompt replacement to nested session delegation.**

### Key Concepts

- **Claude Code:** Agents "transform" via SlashCommand (runtime system prompt swap)
- **BMad Client SDK:** Agents "invoke" sub-agents via `invoke_agent` tool (nested sessions)

---

## Why Agent Adaptation is Necessary

### Technical Constraints

**Anthropic Messages API Limitation:**
```typescript
// ❌ NOT POSSIBLE in Anthropic API
messages = [
  { role: 'system', content: 'You are Orchestrator' },
  { role: 'user', content: 'Do task' },
  { role: 'system', content: 'You are now PM' }, // INVALID - can't change system prompt mid-conversation
]
```

**Claude Code Special Capability:**
- Claude Code CLI can dynamically replace system prompts during tool execution
- This enables the "transformation" pattern where Orchestrator becomes PM

**SDK Reality:**
- Anthropic API requires system prompt at conversation start only
- Cannot be changed during the conversation
- Solution: Start new child session with different agent

### Behavioral Implications

| **Aspect** | **Claude Code** | **BMad Client SDK** |
|------------|-----------------|---------------------|
| **Identity** | Orchestrator becomes PM | Orchestrator invokes PM |
| **Context** | Shared conversation memory | Explicit context passing |
| **User Experience** | "I am now John the PM" | "I've asked John the PM to help" |
| **Session Model** | Single session, persona swap | Parent-child session hierarchy |
| **Cost Tracking** | Single session costs | Aggregated parent + child costs |

---

## Architectural Differences

### Claude Code Architecture

```
User: "Create a PRD"
  ↓
Orchestrator Agent (Active)
  ↓
Decision: "This needs PM agent"
  ↓
Tool Call: SlashCommand("/BMad:agents:pm")
  ↓
Claude Code Runtime:
  - Loads pm.md
  - Replaces system prompt
  - Orchestrator persona → PM persona
  ↓
PM Agent (Now Active) - Same session, new identity
  ↓
Executes *create-prd command
  ↓
Returns to user (still as PM until exit)
```

### BMad Client SDK Architecture

```
User: "Create a PRD"
  ↓
Orchestrator Agent (Parent Session)
  ↓
Decision: "This needs PM agent"
  ↓
Tool Call: invoke_agent({ agent_id: "pm", command: "create-prd" })
  ↓
FallbackToolExecutor:
  - Creates new BmadSession (child)
  - Initializes PM agent in child session
  - Child has own VFS, system prompt, context
  ↓
PM Agent (Child Session) - Separate session, separate identity
  ↓
Executes *create-prd command
  ↓
Child session completes → returns result to parent
  ↓
Orchestrator Agent (Parent Session) - Still orchestrator
  ↓
Processes PM result, presents to user
```

---

## Agent Modification Patterns

### Pattern 1: Transformation → Delegation

**When to Apply:** Any agent that "transforms" into other agents

#### Before (Claude Code):
```yaml
core_principles:
  - Become any agent on demand
  - When embodied, specialized persona's principles take precedence

transformation:
  - Match name/role to agents
  - Announce transformation
  - Operate until exit
```

#### After (SDK):
```yaml
core_principles:
  - Orchestrate specialized agents via invoke_agent tool
  - Never transform - remain in orchestrator role
  - Coordinate multiple agents for complex workflows

delegation:
  - Match name/role to agents
  - Use invoke_agent tool to start sub-agent
  - Pass context and requirements
  - Process and present sub-agent results
```

---

### Pattern 2: SlashCommand → invoke_agent Tool

**When to Apply:** Any reference to SlashCommand or agent switching

#### Before (Claude Code):
```yaml
commands:
  agent: Transform into a specialized agent

activation-instructions:
  - Use SlashCommand to switch agents
  - Transform based on user needs
```

#### After (SDK):
```yaml
commands:
  agent: Invoke a specialized agent to handle task

tool-usage:
  invoke_agent:
    - Use this tool to delegate tasks to specialized agents
    - Pass complete context so sub-agent understands task
    - Wait for completion and present results
```

---

### Pattern 3: Identity Preservation

**When to Apply:** Any agent that acts as coordinator/orchestrator

#### Before (Claude Code):
```yaml
identity: Unified interface that dynamically transforms into any specialized agent

style: "I'm now John the PM, let me create your PRD..."
```

#### After (SDK):
```yaml
identity: Orchestration layer that delegates to specialized agents

style: "I've invoked John the PM to create your PRD. Let me show you what he produced..."
```

---

### Pattern 4: Context & State Management

**When to Apply:** All agents that invoke other agents

#### Add New Section:
```yaml
context-passing:
  - Extract relevant context from user conversation
  - Package context for sub-agent consumption
  - Include: project_type, requirements, constraints, user_preferences
  - Example:
      context: {
        project_type: "web app",
        target_users: "developers",
        key_features: ["API", "Auth"],
        parent_session_id: "uuid",
        previous_documents: ["/docs/prd.md"]
      }

result-aggregation:
  - Receive sub-agent result with documents and costs
  - Extract generated documents from child VFS
  - Merge into parent VFS for access
  - Summarize results for user
  - Track cumulative costs
```

---

## Orchestrator Agent Changes

### Complete Diff for bmad-orchestrator.md

```diff
agent:
  name: BMad Orchestrator
  id: bmad-orchestrator
  title: BMad Master Orchestrator
  icon: 🎭
- whenToUse: Use for workflow coordination, multi-agent tasks, role switching guidance
+ whenToUse: Use for workflow coordination, multi-agent task delegation, and orchestrating complex workflows

persona:
  role: Master Orchestrator & BMad Method Expert
- style: Adaptable, can transform into any agent
+ style: Coordinating, delegates to specialized agents
- identity: Unified interface that dynamically transforms into any specialized agent
+ identity: Orchestration layer that delegates tasks to specialized agents via sub-sessions
  focus: Orchestrating the right agent/capability for each need

  core_principles:
-   - Become any agent on demand, loading files only when needed
+   - Orchestrate specialized agents via invoke_agent tool
-   - When embodied, specialized persona's principles take precedence
+   - Never transform - remain Orchestrator throughout session
+   - Delegate tasks with complete context and requirements
+   - Monitor sub-agent progress and aggregate results
+   - Track costs across all sub-agents
    - Be explicit about active persona and current task
    - Always use numbered lists for choices

commands:
  help: Show this guide with available agents and workflows
- agent: Transform into a specialized agent (list if name not specified)
+ agent: Invoke a specialized agent to handle task (list if name not specified)
  status: Show current context, active agent, and progress
+ status: Show active sub-agents, costs, and progress

- transformation:
+ delegation:
-   - Match name/role to agents
+   - Match user needs to appropriate specialist agent
-   - Announce transformation
+   - Use invoke_agent tool to start sub-agent
-   - Operate until exit
+   - Pass complete context: task, requirements, constraints
+   - Monitor sub-agent execution
+   - Extract documents from sub-agent VFS
+   - Present results clearly to user

+ tool-usage:
+   invoke_agent:
+     description: Start a sub-agent to handle specialized tasks
+     when_to_use:
+       - User needs PRD → invoke pm agent
+       - User needs architecture → invoke architect agent
+       - User needs code → invoke dev agent
+
+     parameters:
+       agent_id: ID of specialist agent (pm, architect, dev, qa, sm, po, analyst, ux-expert)
+       command: Command to execute (e.g., "create-prd", "*create-architecture")
+       context: Full context object with task details
+
+     example: |
+       invoke_agent({
+         agent_id: "pm",
+         command: "create-prd",
+         context: {
+           project_type: "web application",
+           target_users: "backend developers",
+           key_features: ["API", "Authentication", "Dashboard"]
+         }
+       })
+
+     result_handling: |
+       Tool returns:
+       {
+         status: "completed",
+         agent: "pm",
+         documents: [
+           { path: "/docs/prd.md", size: 15420 }
+         ],
+         costs: {
+           totalCost: 0.42,
+           inputTokens: 8500,
+           outputTokens: 6200
+         }
+       }
+
+       Actions:
+       1. Extract documents from result
+       2. Documents are already in parent VFS at reported paths
+       3. Summarize result for user
+       4. Include cost information
+       5. Suggest next logical workflow step

+ cost-management:
+   - Track costs from all sub-agents
+   - Maintain running total across invocations
+   - Warn user if approaching budget limit
+   - Include cost summary in final report
+   - Format: "Total: $X.XX (PM: $Y.YY, Architect: $Z.ZZ)"

+ result-presentation:
+   - Summarize what each sub-agent produced
+   - List generated documents with paths and sizes
+   - Highlight key sections or insights
+   - Suggest next logical workflow steps
+   - Offer to invoke next agent in workflow chain

help-display-template: |
  === BMad Orchestrator Commands ===

  Agent & Task Management:
- *agent [name] ....... Transform into specialized agent (list if no name)
+ *agent [name] ....... Invoke specialized agent for task (list if no name)

+ 💡 How Agent Invocation Works:
+ When you call *agent pm, I will:
+ 1. Start a sub-session with the PM agent
+ 2. Pass your requirements and context to them
+ 3. Monitor their progress (they work autonomously)
+ 4. Return their results (documents, costs) to you
+ 5. Suggest next steps in your workflow
+
+ You're always talking to the Orchestrator, who coordinates specialist agents.
+ Each agent works in their own isolated session.
```

---

## Specialist Agent Changes

### Pattern: Agents That Can Be Invoked

Most **specialist agents** (PM, Architect, Dev, QA, etc.) require **minimal or no changes** because they already work autonomously.

**Key Point:** Specialist agents don't invoke other agents, so they don't need `invoke_agent` tool.

### Required Changes: None for Most Agents

✅ **No changes needed for:**
- pm (Product Manager)
- po (Product Owner)
- architect (Architect)
- dev (Developer)
- qa (QA Engineer)
- analyst (Business Analyst)
- ux-expert (UX Expert)
- sm (Scrum Master)

These agents already:
- Work with VFS tools (read_file, write_file, etc.)
- Execute commands independently
- Generate documents
- Follow their persona guidelines

### Optional Enhancement: Sub-Agent Awareness

You *can* add metadata to help specialist agents understand they're in a sub-session:

```yaml
# Optional addition to any specialist agent

execution-context:
  standalone: Can be invoked directly by users via bmad-client
  sub-agent: Can be invoked by orchestrator via invoke_agent tool

  when-invoked-as-subagent:
    - Context is provided by parent agent
    - Work autonomously to complete task
    - Generate all required documents
    - No need to coordinate with parent
    - Return results via session completion
```

But this is **optional** - agents work fine without this awareness.

---

## Implementation Checklist

### Phase 1: Core Agents (Required)

- [x] **bmad-orchestrator.md** - Complete rewrite for delegation model
  - [ ] Update core_principles
  - [ ] Change transformation → delegation
  - [ ] Add tool-usage section
  - [ ] Add cost-management section
  - [ ] Add result-presentation section
  - [ ] Update help-display-template

### Phase 2: Specialist Agents (Optional Enhancements)

- [ ] **pm.md** - Add execution-context (optional)
- [ ] **architect.md** - Add execution-context (optional)
- [ ] **dev.md** - Add execution-context (optional)
- [ ] **qa.md** - Add execution-context (optional)
- [ ] **sm.md** - Add execution-context (optional)
- [ ] **po.md** - Add execution-context (optional)
- [ ] **analyst.md** - Add execution-context (optional)
- [ ] **ux-expert.md** - Add execution-context (optional)

### Phase 3: Expansion Pack Agents

If using expansion packs (e.g., Expert Author, Competency Assessor):

- [ ] Check if expansion pack has orchestrator-like agents
- [ ] Apply same delegation pattern
- [ ] Test invoke_agent with expansion pack agents

---

## Migration Examples

### Example 1: Orchestrator Invoking PM

#### Claude Code (Old):
```markdown
User: "I need a PRD for my web app"

Orchestrator: "I'll transform into John, the Product Manager, to help you."

[Orchestrator uses SlashCommand to load PM agent]
[System prompt changes to PM persona]

PM (as Orchestrator): "Hi! I'm John, your Product Manager. Let's create your PRD..."
[PM executes *create-prd command]
[PRD is generated in shared conversation context]
```

#### BMad Client SDK (New):
```markdown
User: "I need a PRD for my web app"

Orchestrator: "I'll invoke John, the Product Manager, to create your PRD."

[Orchestrator uses invoke_agent tool]
invoke_agent({
  agent_id: "pm",
  command: "create-prd",
  context: {
    project_type: "web application",
    user_request: "I need a PRD for my web app"
  }
})

[Child session starts with PM agent]
[PM works autonomously in child session]
[PM generates PRD in child VFS]
[Child session completes, returns result]

Orchestrator: "John has completed your PRD! Here's what he created:

📄 Product Requirements Document (PRD)
   Path: /docs/prd.md
   Size: 15.4 KB

   Key Sections:
   - Goals & Background (3 objectives defined)
   - User Personas (2 primary personas)
   - Functional Requirements (12 requirements)
   - Technical Assumptions

   Cost: $0.42 (8,500 input tokens, 6,200 output tokens)

Would you like me to:
1. Invoke the Architect to design the system
2. Show you the full PRD content
3. Have the PM refine any sections"
```

### Example 2: Multi-Agent Workflow

#### Claude Code (Old):
```markdown
User: "Set up a new project"

Orchestrator: "I'll coordinate the workflow."

[Orchestrator transforms into PM]
PM: "Creating PRD..."
[PRD created]

[PM transforms back to Orchestrator]
Orchestrator: "Now transforming into Architect..."

[Orchestrator transforms into Architect]
Architect: "Creating architecture..."
[Architecture created]
```

#### BMad Client SDK (New):
```markdown
User: "Set up a new project"

Orchestrator: "I'll coordinate a multi-agent workflow:
1. PM creates PRD
2. Architect designs system
3. Dev creates initial codebase

Let's start!"

[Orchestrator invokes PM]
invoke_agent({ agent_id: "pm", command: "create-prd", context: {...} })

Orchestrator: "✓ PM completed PRD ($0.42)

Now invoking Architect..."

[Orchestrator invokes Architect]
invoke_agent({
  agent_id: "architect",
  command: "create-architecture",
  context: {
    prd_path: "/docs/prd.md",
    ...
  }
})

Orchestrator: "✓ Architect completed architecture ($0.68)

Now invoking Developer..."

[Orchestrator invokes Dev]
invoke_agent({
  agent_id: "dev",
  command: "scaffold-project",
  context: {
    architecture_path: "/docs/architecture.md",
    ...
  }
})

Orchestrator: "✓ Project setup complete!

📊 Workflow Summary:
   - PRD: /docs/prd.md (15.4 KB)
   - Architecture: /docs/architecture.md (28.1 KB)
   - Codebase: /src/* (45 files)

   Total Cost: $1.87
   - PM: $0.42
   - Architect: $0.68
   - Developer: $0.77

   Next suggested steps:
   1. Review architecture decisions
   2. Set up CI/CD pipeline
   3. Create test strategy with QA agent"
```

---

## Testing Agent Adaptations

### Test Cases

#### Test 1: Orchestrator Can Invoke PM
```typescript
const client = new BmadClient(config);
const session = await client.startAgent('bmad-orchestrator', 'invoke pm for prd');

session.on('completed', (result) => {
  expect(result.documents).toContainEqual(
    expect.objectContaining({ path: '/docs/prd.md' })
  );
  expect(result.costs.childSessions).toHaveLength(1);
  expect(result.costs.childSessions[0].agent).toBe('pm');
});

await session.execute();
```

#### Test 2: Multi-Agent Workflow
```typescript
const session = await client.startAgent('bmad-orchestrator', 'full project setup');

session.on('completed', (result) => {
  // Should have invoked PM, Architect, Dev
  expect(result.costs.childSessions).toHaveLength(3);

  // Should have generated multiple documents
  expect(result.documents).toContainEqual(
    expect.objectContaining({ path: '/docs/prd.md' })
  );
  expect(result.documents).toContainEqual(
    expect.objectContaining({ path: '/docs/architecture.md' })
  );
});

await session.execute();
```

#### Test 3: Cost Aggregation
```typescript
const session = await client.startAgent('bmad-orchestrator', 'create prd and architecture');

const result = await session.execute();

expect(result.costs.totalCost).toBeGreaterThan(0);
expect(result.costs.childSessions).toBeDefined();

const totalChildCost = result.costs.childSessions.reduce(
  (sum, child) => sum + child.totalCost,
  0
);

expect(result.costs.totalCost).toBeGreaterThanOrEqual(totalChildCost);
```

---

## Conclusion

### Summary of Changes

1. **Orchestrator Agent:** Major changes - delegation instead of transformation
2. **Specialist Agents:** No changes required (optional enhancements available)
3. **Tool Usage:** `invoke_agent` tool replaces SlashCommand pattern
4. **Session Model:** Parent-child hierarchy instead of single session
5. **Cost Tracking:** Aggregated across parent and all children

### Benefits of SDK Approach

✅ **Clear Separation:** Each agent works in isolated session
✅ **Better Cost Tracking:** Explicit breakdown by agent
✅ **API Compliant:** Works with Anthropic API constraints
✅ **Scalability:** Can run multiple sub-agents in parallel (future)
✅ **Testability:** Each agent can be tested independently

### Migration Effort

- **Orchestrator:** 2-3 hours (one-time rewrite)
- **Specialist Agents:** 0 hours (no changes needed)
- **Testing:** 1-2 hours (verify invoke_agent works)
- **Total:** ~5 hours for complete migration

---

**Next Steps:**
1. Implement `invoke_agent` tool in FallbackToolExecutor
2. Update bmad-orchestrator.md with new delegation model
3. Test orchestrator → pm → architecture workflow
4. Document cost aggregation behavior

---

**Document Version:** 1.0
**Last Updated:** 2025-11-05
**Maintained By:** Winston (Architect)
