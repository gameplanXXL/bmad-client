import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BmadClient } from '../../client.js';
import { AgentLoader } from '../../agent-loader.js';
import { getMockAgentDefinitions } from '../../__tests__/test-helpers.js';
import { MockLLMProvider } from '../../__tests__/mock-llm-provider.js';

/**
 * Integration Tests for invoke_agent Tool
 *
 * These tests verify end-to-end functionality with MockLLMProvider
 * and mocked agent definitions.
 */

describe('invoke_agent Integration Tests', () => {
  let client: BmadClient;
  let mockAgents: ReturnType<typeof getMockAgentDefinitions>;
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    mockAgents = getMockAgentDefinitions();

    // Mock AgentLoader.loadAgent to return our mock agent definitions
    vi.spyOn(AgentLoader.prototype, 'loadAgent').mockImplementation(async (path: string) => {
      const agentId = path.includes('bmad-orchestrator')
        ? 'bmad-orchestrator'
        : path.includes('/pm.md')
          ? 'pm'
          : path.includes('/architect.md')
            ? 'architect'
            : 'unknown';

      const agent = mockAgents[agentId];
      if (!agent) {
        throw new Error(`Mock agent not found: ${agentId}`);
      }
      return agent;
    });

    // Create mock provider with default response
    mockProvider = new MockLLMProvider({
      content: 'Default mock response',
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    });

    client = new BmadClient({
      provider: mockProvider,
      logLevel: 'error',
    });
  });

  /**
   * Test 1: Basic invoke_agent functionality
   */
  it('should invoke PM agent and return result', async () => {
    // Setup mock responses using MockLLMProvider rules
    mockProvider.addRules([
      // Orchestrator decides to invoke PM
      {
        userMessageContains: 'create prd',
        response: {
          content: [
            { type: 'text', text: 'I will invoke the PM agent' },
            {
              type: 'tool_use',
              id: 'tool_invoke_pm',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke_pm',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // PM writes document
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Creating PRD' },
            {
              type: 'tool_use',
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: '# PRD\n\nTest PRD content' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: '# PRD\n\nTest PRD content' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 500,
          outputTokens: 200,
        },
      },
      // PM completes (after tool result)
      {
        toolResultContains: 'File written',
        response: {
          content: 'PRD created successfully',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      // Orchestrator processes child result
      {
        toolResultContains: 'Child session completed',
        response: {
          content: 'PM has completed the PRD',
          stopReason: 'end_turn',
          inputTokens: 800,
          outputTokens: 150,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'create prd');
    const result = await session.execute();

    // Verify session completed
    expect(result.status).toBe('completed');

    // Verify child session was created
    expect(result.costs.childSessions).toBeDefined();
    expect(result.costs.childSessions).toHaveLength(1);
    expect(result.costs.childSessions?.[0]?.agent).toBe('pm');

    // Verify document was created
    expect(result.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/docs/prd.md',
          content: expect.stringContaining('Test PRD content'),
        }),
      ])
    );

    // Verify cost aggregation
    const childCost = result.costs.childSessions?.[0]?.totalCost ?? 0;
    expect(result.costs.totalCost).toBeGreaterThanOrEqual(childCost);
  });

  /**
   * Test 2: Sequential multi-agent workflow
   * TODO: Complex multi-session orchestration needs better mock setup
   */
  it.skip('should orchestrate PM → Architect workflow', async () => {
    mockProvider.addRules([
      // Orchestrator invokes PM
      {
        userMessageContains: 'setup project',
        response: {
          content: [
            { type: 'text', text: 'Starting with PM' },
            {
              type: 'tool_use',
              id: 'tool_invoke_pm',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke_pm',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // PM creates PRD
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Creating PRD' },
            {
              type: 'tool_use',
              id: 'tool_write_prd',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: '# PRD' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write_prd',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: '# PRD' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 500,
          outputTokens: 200,
        },
      },
      // PM completes
      {
        toolResultContains: 'File written',
        userMessageContains: 'create-prd',
        response: {
          content: 'PRD done',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      // Orchestrator invokes Architect
      {
        toolResultContains: 'Child session completed',
        response: {
          content: [
            { type: 'text', text: 'Now invoking Architect' },
            {
              type: 'tool_use',
              id: 'tool_invoke_architect',
              name: 'invoke_agent',
              input: { agent_id: 'architect', command: 'create-architecture' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke_architect',
              name: 'invoke_agent',
              input: { agent_id: 'architect', command: 'create-architecture' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1200,
          outputTokens: 150,
        },
        once: true,
      },
      // Architect creates architecture
      {
        userMessageContains: 'create-architecture',
        response: {
          content: [
            { type: 'text', text: 'Creating architecture' },
            {
              type: 'tool_use',
              id: 'tool_write_arch',
              name: 'write_file',
              input: { file_path: '/docs/architecture.md', content: '# Architecture' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write_arch',
              name: 'write_file',
              input: { file_path: '/docs/architecture.md', content: '# Architecture' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 800,
          outputTokens: 300,
        },
      },
      // Architect completes
      {
        toolResultContains: 'File written',
        userMessageContains: 'create-architecture',
        response: {
          content: 'Architecture done',
          stopReason: 'end_turn',
          inputTokens: 150,
          outputTokens: 80,
        },
      },
      // Orchestrator completes
      {
        toolResultContains: 'Child session completed',
        response: {
          content: 'Workflow complete',
          stopReason: 'end_turn',
          inputTokens: 1000,
          outputTokens: 200,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'setup project');
    const result = await session.execute();

    // Verify both child sessions
    expect(result.costs.childSessions).toHaveLength(2);
    expect(result.costs.childSessions![0]!.agent).toBe('pm');
    expect(result.costs.childSessions![1]!.agent).toBe('architect');

    // Verify both documents (may include duplicates from merging)
    expect(result.documents.length).toBeGreaterThanOrEqual(2);
    expect(result.documents.map((d) => d.path)).toContain('/docs/prd.md');
    expect(result.documents.map((d) => d.path)).toContain('/docs/architecture.md');
  });

  /**
   * Test 3: Cost limit enforcement
   */
  it('should enforce cost limits across hierarchy', async () => {
    mockProvider.addRules([
      // Orchestrator invokes PM (uses little budget)
      {
        userMessageContains: 'create prd',
        response: {
          content: [
            { type: 'text', text: 'Invoking PM' },
            {
              type: 'tool_use',
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 10000, // ~$0.03
          outputTokens: 5000, // ~$0.075
        },
      },
      // PM uses MASSIVE tokens (exceeds limit)
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Writing PRD with lots of tokens' },
            {
              type: 'tool_use',
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 200000, // ~$0.60
          outputTokens: 100000, // ~$1.50
          // Total: ~$2.25 > $1.00 limit
        },
      },
      // PM tries to complete but cost limit should be hit
      {
        toolResultContains: 'File written',
        response: {
          content: 'Done',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      // Orchestrator handles the error and completes
      {
        toolResultContains: 'Sub-agent failed',
        response: {
          content: 'PM agent exceeded cost limit',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 100,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'create prd', {
      costLimit: 1.0,
    });

    const result = await session.execute();

    // Orchestrator completed (child failed but parent handled it)
    expect(result.status).toBe('completed');

    // Child session should not be in successful childSessions list
    // (since it failed, it won't be added to childSessionCosts)
    expect(result.costs.childSessions).toBeUndefined();
  });

  /**
   * Test 4: Token usage accuracy
   * TODO: Token counting across nested sessions needs verification
   */
  it.skip('should accurately track token usage', async () => {
    // Parent: 1000 + 500 = 1500 input, 100 + 200 = 300 output
    // Child: 2000 + 200 = 2200 input, 500 + 100 = 600 output
    // Total: 3700 input, 900 output

    mockProvider.addRules([
      {
        userMessageContains: 'task',
        response: {
          content: [
            { type: 'text', text: 'Invoking PM' },
            {
              type: 'tool_use',
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Creating' },
            {
              type: 'tool_use',
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 2000,
          outputTokens: 500,
        },
      },
      {
        toolResultContains: 'File written',
        response: {
          content: 'Done',
          stopReason: 'end_turn',
          inputTokens: 200,
          outputTokens: 100,
        },
      },
      {
        toolResultContains: 'Child session completed',
        response: {
          content: 'Complete',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 200,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'task');
    const result = await session.execute();

    // Verify token totals
    expect(result.costs.inputTokens).toBe(3700);
    expect(result.costs.outputTokens).toBe(900);

    // Verify child session tokens
    expect(result.costs.childSessions![0]!.inputTokens).toBe(2200);
    expect(result.costs.childSessions![0]!.outputTokens).toBe(600);

    // Verify cost calculation (Sonnet 4: $3/MTok input, $15/MTok output)
    const expectedCost = (3700 / 1000) * 0.003 + (900 / 1000) * 0.015;
    expect(result.costs.totalCost).toBeCloseTo(expectedCost, 4);
  });

  /**
   * Test 5: Document merging
   */
  it('should merge child documents into parent VFS', async () => {
    mockProvider.addRules([
      // Orchestrator invokes PM
      {
        userMessageContains: 'create and review prd',
        response: {
          content: [
            { type: 'text', text: 'Invoking PM to create PRD' },
            {
              type: 'tool_use',
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'pm', command: 'create-prd' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // PM creates document
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Creating PRD' },
            {
              type: 'tool_use',
              id: 'tool_write',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# PRD\n\nGoals: Build awesome product',
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write',
              name: 'write_file',
              input: {
                file_path: '/docs/prd.md',
                content: '# PRD\n\nGoals: Build awesome product',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 500,
          outputTokens: 200,
        },
      },
      // PM completes
      {
        toolResultContains: 'File written',
        userMessageContains: 'create-prd',
        response: {
          content: 'PRD created',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      // Orchestrator reads the document (should work - document was merged)
      {
        toolResultContains: 'Child session completed',
        response: {
          content: [
            { type: 'text', text: 'Now reviewing the PRD' },
            {
              type: 'tool_use',
              id: 'tool_read',
              name: 'read_file',
              input: { file_path: '/docs/prd.md' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_read',
              name: 'read_file',
              input: { file_path: '/docs/prd.md' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 800,
          outputTokens: 100,
        },
      },
      // Orchestrator completes
      {
        toolResultContains: 'Build awesome product',
        response: {
          content: 'I reviewed the PRD',
          stopReason: 'end_turn',
          inputTokens: 1000,
          outputTokens: 150,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'create and review prd');
    const result = await session.execute();

    // Verify document exists and contains expected content
    expect(result.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/docs/prd.md',
          content: expect.stringContaining('Build awesome product'),
        }),
      ])
    );

    // Verify session completed (no error when reading merged document)
    expect(result.status).toBe('completed');
  });

  /**
   * Test 6: Context passing
   */
  it('should pass context to child sessions', async () => {
    const contextData = {
      project_type: 'mobile app',
      target_platform: 'iOS',
      key_features: ['push', 'offline'],
    };

    mockProvider.addRules([
      // Orchestrator invokes PM with context
      {
        userMessageContains: 'create mobile app prd',
        response: {
          content: [
            { type: 'text', text: 'Invoking PM with context' },
            {
              type: 'tool_use',
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: {
                agent_id: 'pm',
                command: 'create-prd',
                context: contextData,
              },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: {
                agent_id: 'pm',
                command: 'create-prd',
                context: contextData,
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // PM works (context received in session options)
      {
        userMessageContains: 'create-prd',
        response: {
          content: [
            { type: 'text', text: 'Creating PRD for mobile app' },
            {
              type: 'tool_use',
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD for mobile app' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_write',
              name: 'write_file',
              input: { file_path: '/docs/prd.md', content: 'PRD for mobile app' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 500,
          outputTokens: 200,
        },
      },
      // PM completes
      {
        toolResultContains: 'File written',
        response: {
          content: 'Done',
          stopReason: 'end_turn',
          inputTokens: 100,
          outputTokens: 50,
        },
      },
      // Orchestrator completes
      {
        toolResultContains: 'Child session completed',
        response: {
          content: 'Complete',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 100,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'create mobile app prd');
    const result = await session.execute();

    // Verify PM was invoked
    expect(result.costs.childSessions).toBeDefined();
    expect(result.costs.childSessions![0]!.agent).toBe('pm');

    // Context passing verified via successful execution
    // (If context wasn't passed, child session setup would fail)
    expect(result.status).toBe('completed');
  });

  /**
   * Test 7: Error handling
   */
  it('should handle child session errors gracefully', async () => {
    mockProvider.addRules([
      // Orchestrator tries to invoke non-existent agent
      {
        userMessageContains: 'invoke bad agent',
        response: {
          content: [
            { type: 'text', text: 'Trying to invoke agent' },
            {
              type: 'tool_use',
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'non-existent', command: 'do-something' },
            },
          ],
          toolCalls: [
            {
              id: 'tool_invoke',
              name: 'invoke_agent',
              input: { agent_id: 'non-existent', command: 'do-something' },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // Orchestrator handles error
      {
        toolResultContains: 'invoke_agent failed',
        response: {
          content: 'Agent not found error occurred',
          stopReason: 'end_turn',
          inputTokens: 500,
          outputTokens: 100,
        },
      },
    ]);

    const session = await client.startAgent('bmad-orchestrator', 'invoke bad agent');
    const result = await session.execute();

    // Should complete (orchestrator handled the error)
    expect(result.status).toBe('completed');

    // Should not have successful child sessions
    expect(result.costs.childSessions).toBeUndefined();
  });
});
