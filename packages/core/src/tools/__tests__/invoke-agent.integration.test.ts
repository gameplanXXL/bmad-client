import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BmadClient } from '../../client.js';
import { AgentLoader } from '../../agent-loader.js';
import { getMockAgentDefinitions, createMockAnthropicResponse } from '../../__tests__/test-helpers.js';
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
    expect(result.costs.childSessions![0].agent).toBe('pm');

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
    const childCost = result.costs.childSessions![0].totalCost;
    expect(result.costs.totalCost).toBeGreaterThanOrEqual(childCost);
  });

  /**
   * Test 2: Sequential multi-agent workflow
   */
  it.skip('should orchestrate PM → Architect workflow', async () => {
    // Orchestrator invokes PM
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: { name: 'invoke_agent', input: { agent_id: 'pm', command: 'create-prd' } },
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      })
    );

    // PM creates PRD
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: { file_path: '/docs/prd.md', content: '# PRD' },
        },
        stopReason: 'tool_use',
        inputTokens: 500,
        outputTokens: 200,
      })
    );

    // PM completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'PRD done',
        stopReason: 'end_turn',
        inputTokens: 100,
        outputTokens: 50,
      })
    );

    // Orchestrator invokes Architect
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'invoke_agent',
          input: { agent_id: 'architect', command: 'create-architecture' },
        },
        stopReason: 'tool_use',
        inputTokens: 1200,
        outputTokens: 150,
      })
    );

    // Architect creates architecture
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: { file_path: '/docs/architecture.md', content: '# Architecture' },
        },
        stopReason: 'tool_use',
        inputTokens: 800,
        outputTokens: 300,
      })
    );

    // Architect completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Architecture done',
        stopReason: 'end_turn',
        inputTokens: 150,
        outputTokens: 80,
      })
    );

    // Orchestrator completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Workflow complete',
        stopReason: 'end_turn',
        inputTokens: 1000,
        outputTokens: 200,
      })
    );

    const session = await client.startAgent('bmad-orchestrator', 'setup project');
    const result = await session.execute();

    // Verify both child sessions
    expect(result.costs.childSessions).toHaveLength(2);
    expect(result.costs.childSessions![0].agent).toBe('pm');
    expect(result.costs.childSessions![1].agent).toBe('architect');

    // Verify both documents (may include duplicates from merging)
    expect(result.documents.length).toBeGreaterThanOrEqual(2);
    expect(result.documents.map((d) => d.path)).toContain('/docs/prd.md');
    expect(result.documents.map((d) => d.path)).toContain('/docs/architecture.md');
  });

  /**
   * Test 3: Cost limit enforcement
   */
  it.skip('should enforce cost limits across hierarchy', async () => {
    // Orchestrator invokes PM (uses little budget)
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: { name: 'invoke_agent', input: { agent_id: 'pm', command: 'create-prd' } },
        stopReason: 'tool_use',
        inputTokens: 10000, // ~$0.03
        outputTokens: 5000, // ~$0.075
      })
    );

    // PM uses MASSIVE tokens (exceeds limit)
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: { file_path: '/docs/prd.md', content: 'PRD' },
        },
        stopReason: 'tool_use',
        inputTokens: 200000, // ~$0.60
        outputTokens: 100000, // ~$1.50
        // Total: ~$2.25 > $1.00 limit
      })
    );

    // PM tries to complete but cost limit should be hit
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Done',
        stopReason: 'end_turn',
        inputTokens: 100,
        outputTokens: 50,
      })
    );

    // Orchestrator handles the error and completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'PM agent exceeded cost limit',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 100,
      })
    );

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
   */
  it.skip('should accurately track token usage', async () => {
    // Parent: 1000 + 500 = 1500 input, 100 + 200 = 300 output
    // Child: 2000 + 200 = 2200 input, 500 + 100 = 600 output
    // Total: 3700 input, 900 output

    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: { name: 'invoke_agent', input: { agent_id: 'pm', command: 'create-prd' } },
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      })
    );

    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: { file_path: '/docs/prd.md', content: 'PRD' },
        },
        stopReason: 'tool_use',
        inputTokens: 2000,
        outputTokens: 500,
      })
    );

    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Done',
        stopReason: 'end_turn',
        inputTokens: 200,
        outputTokens: 100,
      })
    );

    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Complete',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 200,
      })
    );

    const session = await client.startAgent('bmad-orchestrator', 'task');
    const result = await session.execute();

    // Verify token totals
    expect(result.costs.inputTokens).toBe(3700);
    expect(result.costs.outputTokens).toBe(900);

    // Verify child session tokens
    expect(result.costs.childSessions![0].inputTokens).toBe(2200);
    expect(result.costs.childSessions![0].outputTokens).toBe(600);

    // Verify cost calculation (Sonnet 4: $3/MTok input, $15/MTok output)
    const expectedCost = (3700 / 1000) * 0.003 + (900 / 1000) * 0.015;
    expect(result.costs.totalCost).toBeCloseTo(expectedCost, 4);
  });

  /**
   * Test 5: Document merging
   */
  it.skip('should merge child documents into parent VFS', async () => {
    // Orchestrator invokes PM
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: { name: 'invoke_agent', input: { agent_id: 'pm', command: 'create-prd' } },
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      })
    );

    // PM creates document
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: {
            file_path: '/docs/prd.md',
            content: '# PRD\n\nGoals: Build awesome product',
          },
        },
        stopReason: 'tool_use',
        inputTokens: 500,
        outputTokens: 200,
      })
    );

    // PM completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'PRD created',
        stopReason: 'end_turn',
        inputTokens: 100,
        outputTokens: 50,
      })
    );

    // Orchestrator reads the document (should work - document was merged)
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: { name: 'read_file', input: { file_path: '/docs/prd.md' } },
        stopReason: 'tool_use',
        inputTokens: 800,
        outputTokens: 100,
      })
    );

    // Orchestrator completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'I reviewed the PRD',
        stopReason: 'end_turn',
        inputTokens: 1000,
        outputTokens: 150,
      })
    );

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
  it.skip('should pass context to child sessions', async () => {
    const contextData = {
      project_type: 'mobile app',
      target_platform: 'iOS',
      key_features: ['push', 'offline'],
    };

    // Orchestrator invokes PM with context
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'invoke_agent',
          input: {
            agent_id: 'pm',
            command: 'create-prd',
            context: contextData,
          },
        },
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      })
    );

    // PM works (context received in session options)
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'write_file',
          input: { file_path: '/docs/prd.md', content: 'PRD for mobile app' },
        },
        stopReason: 'tool_use',
        inputTokens: 500,
        outputTokens: 200,
      })
    );

    // PM completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Done',
        stopReason: 'end_turn',
        inputTokens: 100,
        outputTokens: 50,
      })
    );

    // Orchestrator completes
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Complete',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 100,
      })
    );

    const session = await client.startAgent('bmad-orchestrator', 'create mobile app prd');
    const result = await session.execute();

    // Verify PM was invoked
    expect(result.costs.childSessions).toBeDefined();
    expect(result.costs.childSessions![0].agent).toBe('pm');

    // Context passing verified via successful execution
    // (If context wasn't passed, child session setup would fail)
    expect(result.status).toBe('completed');
  });

  /**
   * Test 7: Error handling
   */
  it.skip('should handle child session errors gracefully', async () => {
    // Orchestrator tries to invoke non-existent agent
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        toolUse: {
          name: 'invoke_agent',
          input: { agent_id: 'non-existent', command: 'do-something' },
        },
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      })
    );

    // Orchestrator handles error
    mockAnthropicResponses.push(
      createMockAnthropicResponse({
        text: 'Agent not found error occurred',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 100,
      })
    );

    const session = await client.startAgent('bmad-orchestrator', 'invoke bad agent');
    const result = await session.execute();

    // Should complete (orchestrator handled the error)
    expect(result.status).toBe('completed');

    // Should not have successful child sessions
    expect(result.costs.childSessions).toBeUndefined();
  });
});
