# Agent Metadata Inspection via VFS Tools

**Story 3.5 Implementation Guide**

---

## Overview

BMad Client provides a **VFS-based approach** for agent discovery and metadata inspection. Instead of a traditional Registry pattern, applications use standard VFS tools (`glob_pattern` and `read_file`) to dynamically discover and inspect agents.

## Why VFS-Based Approach?

### Advantages over Traditional Registry:

1. **Dynamic Discovery** - Agents can be discovered at runtime without pre-registration
2. **Tool-Native** - Uses the same tools agents use, ensuring consistency
3. **Expansion Pack Support** - Automatically includes agents from expansion packs
4. **Flexible Queries** - Use glob patterns to filter agents by name, prefix, etc.
5. **Real-Time Updates** - VFS reflects current state without manual registry updates

### Comparison:

| Aspect | Traditional Registry | VFS-Based |
|--------|---------------------|-----------|
| Discovery | `registry.list()` | `glob_pattern('/.bmad-core/agents/*.md')` |
| Access | `registry.get(id)` | `read_file(path)` |
| Updates | Manual registration | Automatic via VFS |
| Filtering | Limited API | Full glob pattern support |
| Expansion Packs | Separate loading | Integrated automatically |

---

## Usage

### Step 1: Initialize Client & Session

```typescript
import { BmadClient } from '@bmad/client';

const client = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!
  }
});

// Start any agent session to get VFS access
const session = await client.startAgent('pm', '*help');
const executor = session.getToolExecutor();
```

### Step 2: Discover Agents with `glob_pattern`

```typescript
const globResult = await executor.executeTool({
  id: 'discover-agents',
  name: 'glob_pattern',
  input: {
    pattern: '/.bmad-core/agents/*.md'
  }
});

const agentPaths = globResult.content!.split('\n').filter(Boolean);
console.log(`Found ${agentPaths.length} agents`);
```

### Step 3: Read Agent File with `read_file`

```typescript
const readResult = await executor.executeTool({
  id: 'read-agent',
  name: 'read_file',
  input: {
    file_path: agentPaths[0]
  }
});

const agentMarkdown = readResult.content!;
```

### Step 4: Extract Metadata with `gray-matter`

```typescript
import matter from 'gray-matter';

const { data } = matter(agentMarkdown);

console.log('Agent Metadata:', {
  id: data.agent.id,
  title: data.agent.title,
  icon: data.agent.icon,
  whenToUse: data.agent.whenToUse,
  commands: data.commands,
  persona: data.persona
});
```

---

## Metadata Structure

Agent markdown files use YAML frontmatter with this structure:

```yaml
agent:
  name: string           # Display name
  id: string             # Unique identifier
  title: string          # Job title
  icon: string           # Emoji icon
  whenToUse: string      # Description of use cases

persona:
  role: string           # Agent role
  style: string          # Communication style
  identity: string       # Agent identity
  focus: string          # Primary focus
  core_principles:       # Array of principles
    - string
    - string

commands:                # Array of available commands
  - string
  - string

dependencies:            # Agent dependencies
  tasks: string[]
  templates: string[]
  checklists: string[]
  data: string[]
```

---

## Advanced Patterns

### Filter Agents by Pattern

```typescript
// Find all PM-related agents
const pmAgents = await executor.executeTool({
  id: 'find-pm',
  name: 'glob_pattern',
  input: {
    pattern: '/.bmad-core/agents/pm*.md'
  }
});

// Find all QA agents
const qaAgents = await executor.executeTool({
  id: 'find-qa',
  name: 'glob_pattern',
  input: {
    pattern: '/.bmad-core/agents/*qa*.md'
  }
});
```

### Build Agent Catalog

```typescript
async function buildAgentCatalog(executor: FallbackToolExecutor) {
  const globResult = await executor.executeTool({
    id: 'glob',
    name: 'glob_pattern',
    input: { pattern: '/.bmad-core/agents/*.md' }
  });

  const agentPaths = globResult.content!.split('\n').filter(Boolean);

  const catalog = await Promise.all(
    agentPaths.map(async (path) => {
      const readResult = await executor.executeTool({
        id: `read-${path}`,
        name: 'read_file',
        input: { file_path: path }
      });

      if (!readResult.success) return null;

      const { data } = matter(readResult.content!);

      return {
        id: data.agent?.id,
        title: data.agent?.title,
        icon: data.agent?.icon,
        whenToUse: data.agent?.whenToUse,
        commands: data.commands || [],
        role: data.persona?.role
      };
    })
  );

  return catalog.filter(Boolean);
}
```

### Search by Role or Keyword

```typescript
async function searchAgentsByRole(executor: FallbackToolExecutor, role: string) {
  const catalog = await buildAgentCatalog(executor);

  return catalog.filter((agent) =>
    agent.role.toLowerCase().includes(role.toLowerCase())
  );
}

// Usage:
const productAgents = await searchAgentsByRole(executor, 'product');
const developerAgents = await searchAgentsByRole(executor, 'developer');
```

### Present Agent Options to User

```typescript
async function presentAgentOptions(executor: FallbackToolExecutor) {
  const catalog = await buildAgentCatalog(executor);

  console.log('Available Agents:\n');

  catalog.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.icon} ${agent.title}`);
    console.log(`   ID: ${agent.id}`);
    console.log(`   Use when: ${agent.whenToUse}`);
    console.log(`   Commands: ${agent.commands.length}\n`);
  });

  // Return for programmatic selection
  return catalog;
}
```

---

## Integration with Orchestrator Agent

The **bmad-orchestrator** agent uses this VFS-based approach in its `*help` command to dynamically list available agents:

```markdown
## In Orchestrator Agent Definition:

commands:
  - help: List available agents using VFS tools

## In *help Command Implementation:

1. Execute glob_pattern("/.bmad-core/agents/*.md")
2. For each agent file:
   - Read with read_file(path)
   - Parse metadata with gray-matter
   - Extract id, title, icon, whenToUse
3. Format as numbered list for user selection
4. User types number or agent ID to invoke
```

---

## Testing

### Unit Tests

```typescript
it('should discover agents using glob_pattern', async () => {
  const executor = session.getToolExecutor();

  const result = await executor.executeTool({
    id: 'test',
    name: 'glob_pattern',
    input: { pattern: '/.bmad-core/agents/*.md' }
  });

  expect(result.success).toBe(true);
  expect(result.content).toContain('.md');
});

it('should extract agent metadata', async () => {
  const executor = session.getToolExecutor();

  const globResult = await executor.executeTool({
    id: 'glob',
    name: 'glob_pattern',
    input: { pattern: '/.bmad-core/agents/pm.md' }
  });

  const path = globResult.content!.trim();

  const readResult = await executor.executeTool({
    id: 'read',
    name: 'read_file',
    input: { file_path: path }
  });

  const { data } = matter(readResult.content!);

  expect(data.agent.id).toBe('pm');
  expect(data.agent.title).toBeDefined();
  expect(data.commands).toBeInstanceOf(Array);
});
```

---

## Examples

See `packages/examples/list-agents.ts` for a complete working example demonstrating:

- Agent discovery via glob_pattern
- Metadata extraction via read_file + gray-matter
- Dynamic agent catalog building
- Filtering and searching
- User-facing presentation

Run it with:

```bash
npx tsx packages/examples/list-agents.ts
```

---

## Best Practices

### 1. Cache Agent Metadata

Agent discovery can be expensive if called frequently. Cache results:

```typescript
let agentCatalog: AgentMetadata[] | null = null;

async function getAgentCatalog(executor: FallbackToolExecutor, forceRefresh = false) {
  if (!agentCatalog || forceRefresh) {
    agentCatalog = await buildAgentCatalog(executor);
  }
  return agentCatalog;
}
```

### 2. Handle Errors Gracefully

Some agents may have invalid metadata:

```typescript
const agents = await Promise.all(
  paths.map(async (path) => {
    try {
      const result = await readAndParseAgent(path);
      return result;
    } catch (error) {
      console.warn(`Failed to load agent: ${path}`);
      return null;
    }
  })
);

const validAgents = agents.filter(Boolean);
```

### 3. Validate Metadata Structure

Use Zod schema validation for agent metadata:

```typescript
import { AgentDefinitionSchema } from '@bmad/client/agent-schema';

const { data } = matter(agentMarkdown);
const validated = AgentDefinitionSchema.parse(data);
```

### 4. Provide Search/Filter UX

For many agents, provide search functionality:

```typescript
function filterAgents(catalog: AgentMetadata[], query: string) {
  const lowerQuery = query.toLowerCase();

  return catalog.filter((agent) =>
    agent.title.toLowerCase().includes(lowerQuery) ||
    agent.id.toLowerCase().includes(lowerQuery) ||
    agent.whenToUse.toLowerCase().includes(lowerQuery)
  );
}
```

---

## API Reference

### VFS Tools

**glob_pattern**
- **Input:** `{ pattern: string }`
- **Output:** Newline-separated list of matching file paths
- **Use:** Discover agents matching pattern

**read_file**
- **Input:** `{ file_path: string }`
- **Output:** File content as string
- **Use:** Load agent markdown content

### gray-matter

```typescript
import matter from 'gray-matter';

const { data, content } = matter(markdownString);
// data: YAML frontmatter object
// content: Markdown content after frontmatter
```

---

## Migration from Registry Pattern

If you were using a traditional registry, migration is simple:

**Before (Registry):**
```typescript
const agents = registry.list();
const agent = registry.get('pm');
```

**After (VFS):**
```typescript
const agents = await buildAgentCatalog(executor);
const agent = agents.find(a => a.id === 'pm');
```

**Benefits:**
- Includes expansion pack agents automatically
- No manual registration required
- More flexible filtering
- Real-time updates

---

## Summary

- ✅ Use `glob_pattern` + `read_file` for agent discovery
- ✅ Parse YAML frontmatter with `gray-matter`
- ✅ Metadata includes: id, title, icon, whenToUse, commands, persona
- ✅ Supports expansion pack agents automatically
- ✅ Flexible glob patterns for filtering
- ✅ Integrates with orchestrator agent's `*help` command

For complete working examples, see:
- `packages/examples/list-agents.ts`
- `packages/core/src/__tests__/agent-discovery.test.ts`
