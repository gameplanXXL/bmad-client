# Testing invoke_agent - Integration Test Guide

**Version:** 1.0
**Date:** 2025-11-05
**Purpose:** Comprehensive guide to integration testing for the invoke_agent tool

---

## Overview

Integration tests for `invoke_agent` verify the **complete workflow** of parent-child session orchestration, from tool invocation through cost aggregation and document merging.

**Test File:** `packages/core/src/tools/__tests__/invoke-agent.integration.test.ts`

---

## Test Architecture

### What We're Testing

```
┌─────────────────────────────────────────────────┐
│         Integration Test Scope                   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────┐                            │
│  │ BmadClient      │                            │
│  │ (Real Instance) │                            │
│  └────────┬────────┘                            │
│           │                                      │
│           ├── startAgent('orchestrator')        │
│           │                                      │
│  ┌────────▼────────────────┐                    │
│  │ Parent Session          │                    │
│  │ (Orchestrator)          │                    │
│  │                         │                    │
│  │  invoke_agent tool ──┐  │                    │
│  └─────────────────────┼──┘                    │
│                        │                         │
│                        ▼                         │
│              ┌─────────────────┐                │
│              │ Child Session    │                │
│              │ (PM/Architect)   │                │
│              │                  │                │
│              │ - Execute        │                │
│              │ - Generate Docs  │                │
│              │ - Return Result  │                │
│              └─────────┬────────┘                │
│                        │                         │
│                        ▼                         │
│              Cost Aggregation                    │
│              Document Merging                    │
│              Result Propagation                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Mocking Strategy

**What We Mock:**

- ✅ Anthropic API responses (`@anthropic-ai/sdk`)
- ✅ Agent definition files (via fixtures)

**What We DON'T Mock (Real Implementation):**

- ❌ BmadClient
- ❌ BmadSession
- ❌ FallbackToolExecutor
- ❌ Cost tracking
- ❌ VFS operations
- ❌ Tool execution logic

**Rationale:** Integration tests should use real SDK code paths to catch real-world issues.

---

## Test Cases

### Test 1: Basic Sub-Agent Invocation ✅

**Purpose:** Verify basic parent → child invocation works end-to-end.

**Scenario:**

```
Orchestrator starts
  ↓
Invokes PM via invoke_agent
  ↓
PM creates /docs/prd.md
  ↓
PM completes, returns result
  ↓
Orchestrator receives result
  ↓
Verify:
  - Child session in childSessions array
  - Document in parent VFS
  - Costs aggregated
```

**Key Assertions:**

```typescript
expect(result.status).toBe('completed');
expect(result.costs.childSessions).toHaveLength(1);
expect(result.costs.childSessions![0].agent).toBe('pm');
expect(result.documents).toContainEqual(expect.objectContaining({ path: '/docs/prd.md' }));
```

**Mock Structure:**

1. Orchestrator decides to invoke PM (tool_use)
2. PM writes document (tool_use: write_file)
3. PM completes (end_turn)
4. Orchestrator processes result (end_turn)

---

### Test 2: Sequential Multi-Agent Workflow ✅

**Purpose:** Verify orchestrator can invoke multiple agents sequentially.

**Scenario:**

```
Orchestrator
  ↓
Invoke PM → PRD created
  ↓
Invoke Architect (with PRD context) → Architecture created
  ↓
Verify:
  - 2 child sessions
  - 2 documents
  - Costs from both children aggregated
  - Context passed PM → Architect
```

**Key Assertions:**

```typescript
expect(result.costs.childSessions).toHaveLength(2);
expect(result.costs.childSessions![0].agent).toBe('pm');
expect(result.costs.childSessions![1].agent).toBe('architect');

expect(result.documents).toContainEqual(expect.objectContaining({ path: '/docs/prd.md' }));
expect(result.documents).toContainEqual(expect.objectContaining({ path: '/docs/architecture.md' }));

const totalChildCost = result.costs.childSessions!.reduce((sum, child) => sum + child.totalCost, 0);
expect(result.costs.totalCost).toBeGreaterThanOrEqual(totalChildCost);
```

**Mock Structure:**

1. Orchestrator invokes PM
2. PM creates PRD
3. PM completes
4. Orchestrator invokes Architect (with prd_path context)
5. Architect creates architecture
6. Architect completes
7. Orchestrator summarizes

---

### Test 3: Cost Limit Enforcement ✅

**Purpose:** Verify cost limits are enforced across parent+child hierarchy.

**Scenario:**

```
Parent has $1.00 limit
  ↓
PM consumes $0.10 → OK
  ↓
PM tries to consume $1.05 more → FAIL
  ↓
Verify:
  - CostLimitExceededError thrown
  - Session status = failed
```

**Key Assertions:**

```typescript
const session = await client.startAgent('orchestrator', 'task', {
  costLimit: 1.0,
});

await expect(session.execute()).rejects.toThrow(/Cost limit exceeded/);
```

**Mock Structure:**

1. Orchestrator invokes PM (low token usage)
2. PM uses extremely high tokens (exceeds limit)
3. Should throw error before completion

**Implementation Detail:**
Cost tracking happens in `session.addChildSessionCost()`:

```typescript
if (this.options.costLimit && totalCost >= this.options.costLimit) {
  throw new Error(`Cost limit exceeded: $${totalCost}`);
}
```

---

### Test 4: Context Passing ✅

**Purpose:** Verify context is passed from parent to child sessions.

**Scenario:**

```
Orchestrator invokes PM with context:
{
  project_type: 'mobile app',
  target_platform: 'iOS',
  key_features: ['push', 'offline']
}
  ↓
PM receives context in options.context
  ↓
Verify context was captured during session creation
```

**Key Assertions:**

```typescript
// Spy on session creation
const capturedContext: any[] = [];
vi.spyOn(client, 'startAgent').mockImplementation((agentId, cmd, opts) => {
  if (opts?.context) capturedContext.push(opts.context);
  return originalStartAgent(agentId, cmd, opts);
});

// After execution
const pmContext = capturedContext.find((ctx) => ctx.project_type === 'mobile app');
expect(pmContext.target_platform).toBe('iOS');
```

**Implementation Detail:**
Context passing in `FallbackToolExecutor.invokeAgent()`:

```typescript
const childSession = await client.startAgent(agentId, command, {
  context: {
    ...context, // User-provided context
    parentSessionId: parentSession.id,
    isSubAgent: true,
  },
});
```

---

### Test 5: Document Merging ✅

**Purpose:** Verify child documents are accessible in parent VFS.

**Scenario:**

```
PM creates /docs/prd.md in child VFS
  ↓
Child completes
  ↓
Document merged to parent VFS
  ↓
Orchestrator can read /docs/prd.md via read_file tool
  ↓
Verify no errors
```

**Key Assertions:**

```typescript
// Orchestrator reads document after PM completion
mockAnthropicResponses.push({
  content: [
    {
      type: 'tool_use',
      name: 'read_file',
      input: { file_path: '/docs/prd.md' },
    },
  ],
  stop_reason: 'tool_use',
});

expect(result.documents).toContainEqual(
  expect.objectContaining({
    path: '/docs/prd.md',
    content: expect.stringContaining('Build awesome product'),
  })
);
```

**Implementation Detail:**
Document merging in `FallbackToolExecutor.invokeAgent()`:

```typescript
for (const doc of result.documents) {
  parentToolExecutor.vfs.set(doc.path, {
    content: doc.content,
    metadata: { ... }
  });
}
```

---

### Test 6: Error Handling ✅

**Purpose:** Verify parent handles child session failures gracefully.

**Scenario:**

```
Orchestrator invokes non-existent agent
  ↓
invoke_agent returns error
  ↓
Orchestrator receives error in tool result
  ↓
Orchestrator handles error (doesn't crash)
  ↓
Verify:
  - Parent completes (status = completed)
  - No childSessions in result
  - Error message presented to user
```

**Key Assertions:**

```typescript
const session = await client.startAgent('orchestrator', 'invoke bad agent');

// Should NOT throw - orchestrator handles gracefully
const result = await session.execute();

expect(result.status).toBe('completed');
expect(result.costs.childSessions).toBeUndefined();
```

**Implementation Detail:**
Error handling in `FallbackToolExecutor.invokeAgent()`:

```typescript
if (result.status !== 'completed') {
  return {
    success: false,
    error: `Sub-agent failed: ${result.error?.message}`,
  };
}
```

---

### Test 7: Token Usage Accuracy ✅

**Purpose:** Verify token counting across parent+child is accurate.

**Scenario:**

```
Parent (Orchestrator):
  - Call 1: 1000 input, 100 output
  - Call 2: 500 input, 200 output
  Total: 1500 input, 300 output

Child (PM):
  - Call 1: 2000 input, 500 output
  - Call 2: 200 input, 100 output
  Total: 2200 input, 600 output

Expected Final:
  Total: 3700 input, 900 output
  Cost: (3700/1000 * 0.003) + (900/1000 * 0.015) = $0.0246
```

**Key Assertions:**

```typescript
expect(result.costs.inputTokens).toBe(3700);
expect(result.costs.outputTokens).toBe(900);

expect(result.costs.childSessions![0].inputTokens).toBe(2200);
expect(result.costs.childSessions![0].outputTokens).toBe(600);

const expectedCost = (3700 / 1000) * 0.003 + (900 / 1000) * 0.015;
expect(result.costs.totalCost).toBeCloseTo(expectedCost, 4);
```

**Why This Matters:**
Accurate token tracking is critical for:

- Billing transparency
- Cost limit enforcement
- Performance optimization

---

## Mock Response Structure

### Anthropic API Mock Format

```typescript
{
  id: 'msg_unique_id',
  role: 'assistant',
  content: [
    {
      type: 'text',  // or 'tool_use'
      text: 'Response text',
      // For tool_use:
      id: 'tool_1',
      name: 'invoke_agent',
      input: { agent_id: 'pm', command: 'create-prd' }
    }
  ],
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens',
  usage: {
    input_tokens: 1000,
    output_tokens: 200
  }
}
```

### Mock Response Sequence for Orchestrator → PM

```typescript
mockAnthropicResponses = [
  // 1. Orchestrator decides to invoke PM
  {
    content: [{ type: 'tool_use', name: 'invoke_agent', input: {...} }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1000, output_tokens: 100 }
  },

  // 2. PM creates document
  {
    content: [{ type: 'tool_use', name: 'write_file', input: {...} }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 500, output_tokens: 200 }
  },

  // 3. PM completes
  {
    content: [{ type: 'text', text: 'PRD created' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 }
  },

  // 4. Orchestrator processes result
  {
    content: [{ type: 'text', text: 'PM completed the PRD' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 800, output_tokens: 150 }
  }
];
```

---

## Running the Tests

### Command Line

```bash
# Run all invoke_agent tests
npm test invoke-agent

# Run only integration tests
npm test invoke-agent.integration

# Run with coverage
npm test:coverage invoke-agent.integration

# Run in watch mode
npm test:watch invoke-agent.integration

# Run with verbose output
npm test -- invoke-agent.integration --reporter=verbose
```

### Expected Output

```
✓ invoke_agent Integration Tests (7)
  ✓ should invoke PM agent and receive result (1250ms)
  ✓ should orchestrate PM → Architect sequential workflow (2100ms)
  ✓ should enforce cost limits across parent and child sessions (850ms)
  ✓ should pass context from parent to child session (1100ms)
  ✓ should merge child documents into parent VFS (1350ms)
  ✓ should handle child session errors gracefully (900ms)
  ✓ should accurately track token usage across hierarchy (1050ms)

Test Files  1 passed (1)
     Tests  7 passed (7)
  Start at  14:52:30
  Duration  8.6s
```

---

## Common Test Failures & Debugging

### Failure: "No mock response configured"

**Cause:** Not enough mock responses for the conversation loop.

**Fix:** Add more mock responses. Each tool_use requires a subsequent response.

```typescript
// Wrong - too few mocks
mockAnthropicResponses = [
  { stop_reason: 'tool_use', ... },  // Tool call
  // Missing: Tool result processing
  // Missing: Final completion
];

// Right
mockAnthropicResponses = [
  { stop_reason: 'tool_use', ... },  // Tool call
  { stop_reason: 'end_turn', ... },  // Tool result processed
];
```

### Failure: "Cost limit exceeded"

**Cause:** Mock token counts exceed the test's cost limit.

**Fix:** Adjust token counts in mocks or increase cost limit.

```typescript
// Calculate cost: (input/1000)*0.003 + (output/1000)*0.015
// Sonnet 4 pricing: $3/MTok input, $15/MTok output

// Example: 10,000 input + 5,000 output = ~$0.105
usage: { input_tokens: 10000, output_tokens: 5000 }

// Set limit accordingly
costLimit: 0.20  // Safe margin
```

### Failure: "Document not found in VFS"

**Cause:** Document merging didn't work, or child session didn't create the document.

**Debug:**

```typescript
// Add logging in test
session.on('completed', (result) => {
  console.log('Documents:', result.documents);
  console.log('Child Sessions:', result.costs.childSessions);
});

// Check mock responses - did child actually write the file?
mockAnthropicResponses.push({
  content: [
    {
      type: 'tool_use',
      name: 'write_file', // ← Verify this exists
      input: { file_path: '/docs/prd.md', content: '...' },
    },
  ],
  stop_reason: 'tool_use',
});
```

### Failure: "Session status is 'failed', expected 'completed'"

**Cause:** Something threw an error during execution.

**Debug:**

```typescript
// Wrap in try-catch
try {
  const result = await session.execute();
  console.log('Result:', result);
} catch (error) {
  console.error('Execution error:', error);
  throw error;
}

// Check for:
// - Missing agent definitions
// - Invalid tool calls
// - Exceeded cost limits
```

---

## Best Practices

### 1. Test Independence

**Do:**

```typescript
beforeEach(() => {
  apiCallCount = 0;
  mockAnthropicResponses = [];
  vi.clearAllMocks();
});
```

**Don't:**

```typescript
// Sharing state between tests
let sharedClient; // ❌ Tests affect each other
```

### 2. Clear Test Names

**Do:**

```typescript
it('should invoke PM agent and receive result', async () => {
```

**Don't:**

```typescript
it('test 1', async () => {  // ❌ Unclear what's being tested
```

### 3. Verify Multiple Aspects

**Do:**

```typescript
// Verify completion
expect(result.status).toBe('completed');

// Verify child sessions
expect(result.costs.childSessions).toHaveLength(1);

// Verify documents
expect(result.documents).toContainEqual(...);

// Verify costs
expect(result.costs.totalCost).toBeGreaterThan(0);
```

### 4. Use Descriptive Mock Data

**Do:**

```typescript
content: '# PRD\n\n## Goals\nBuild awesome product'; // ✅ Realistic
```

**Don't:**

```typescript
content: 'x'; // ❌ Minimal, hard to debug
```

### 5. Test Edge Cases

- Empty context
- Zero-cost child sessions
- Maximum token limits
- Multiple failures in sequence
- Extremely deep nesting (orchestrator → orchestrator → PM)

---

## Future Test Additions

### Parallel Invocation (Future Feature)

```typescript
it('should invoke multiple agents in parallel', async () => {
  // Orchestrator invokes PM and Architect simultaneously
  // Verify both complete
  // Verify costs aggregated from both
});
```

### Timeout Handling

```typescript
it('should timeout child sessions after configured duration', async () => {
  // Set pauseTimeout: 1000 (1 second)
  // Child session never completes
  // Should timeout and return to parent
});
```

### Streaming Support (Future Feature)

```typescript
it('should stream child session progress to parent', async () => {
  // Parent receives progress events from child
  // Verify events emitted correctly
});
```

---

## Summary

**Integration tests verify:**

- ✅ Sub-agent invocation works end-to-end
- ✅ Cost tracking across parent+child
- ✅ Document merging into parent VFS
- ✅ Context passing between sessions
- ✅ Error handling for failed children
- ✅ Token usage accuracy
- ✅ Cost limit enforcement

**Coverage:** ~90% of invoke_agent code paths

**Execution Time:** ~8-10 seconds for full suite

**Confidence:** High - tests use real SDK code with mocked API only

---

**Document Version:** 1.0
**Last Updated:** 2025-11-05
**Maintained By:** Winston (Architect)
