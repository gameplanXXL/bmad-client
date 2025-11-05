import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { BmadSession } from '../session.js';
import { AgentLoader } from '../agent-loader.js';
import type { AgentDefinition } from '../types.js';
import Anthropic from '@anthropic-ai/sdk';

// Mock agent definition for testing
const mockAgentDefinition: AgentDefinition = {
  agent: {
    name: 'Test Agent',
    id: 'test-agent',
    title: 'Integration Test Agent',
    icon: '🧪',
    whenToUse: 'For integration testing',
    customization: 'Full integration test agent',
  },
  persona: {
    role: 'Test Assistant',
    style: 'Concise and test-focused',
    identity: 'An integration test agent',
    focus: 'Testing all components together',
    core_principles: [
      'Test thoroughly',
      'Verify integration points',
      'Ensure components work together',
    ],
  },
  commands: ['*test', '*help'],
  dependencies: {
    tasks: [],
    templates: [],
    checklists: [],
    data: [],
  },
  activation_instructions: [
    'You are running as an integration test agent',
    'All components (promptGenerator, agentLoader, provider, toolExecutor) are active',
    'Test the full tool call loop',
    'You have access to read_file, write_file, edit_file, list_files, bash_command',
  ],
};

// Mock AgentLoader to return our test agent
vi.mock('../agent-loader.js', () => {
  return {
    AgentLoader: vi.fn().mockImplementation(() => ({
      loadAgent: vi.fn().mockResolvedValue(mockAgentDefinition),
    })),
  };
});

// Mock Anthropic SDK for integration tests
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_integration_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Integration test response complete!' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1500,
            output_tokens: 250,
          },
        }),
      },
    })),
  };
});

describe('Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should execute full session with all components integrated', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test-integration-key' },
    });

    const session = await client.startAgent('test-agent', '*test');

    // Verify session properties
    expect(session.id).toMatch(/^sess_\d+_[a-z0-9]+$/);
    expect(session.agentId).toBe('test-agent');
    expect(session.command).toBe('*test');
    expect(session.getStatus()).toBe('pending');

    // Set up event listeners
    let startedCalled = false;
    let completedResult: any = null;
    let failedError: any = null;

    session.on('started', () => {
      startedCalled = true;
    });

    session.on('completed', (result) => {
      completedResult = result;
    });

    session.on('failed', (error) => {
      failedError = error;
    });

    // Execute the session
    const result = await session.execute();

    // Verify session executed successfully
    expect(startedCalled).toBe(true);
    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.duration).toBeGreaterThan(0);

    // Verify costs are tracked
    expect(result.costs).toBeDefined();
    expect(result.costs.totalCost).toBeGreaterThan(0);
    expect(result.costs.inputTokens).toBe(1500);
    expect(result.costs.outputTokens).toBe(250);
    expect(result.costs.apiCalls).toBe(1);
    expect(result.costs.currency).toBe('USD');
    expect(result.costs.breakdown).toHaveLength(1);
    expect(result.costs.breakdown[0].model).toBe('claude-sonnet-4-20250514');

    // Verify documents (should be empty for this test since no tools were called)
    expect(result.documents).toBeDefined();
    expect(Array.isArray(result.documents)).toBe(true);

    // Verify events were emitted correctly
    expect(completedResult).toBeTruthy();
    expect(failedError).toBeFalsy();
  });

  it('should handle tool calls in session', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test-tool-key' },
    });

    // Mock provider to return tool use
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        // First call - LLM wants to use a tool
        id: 'msg_tool_use',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'write_file',
            input: {
              file_path: '/test.md',
              content: '# Test Document\n\nContent here',
            },
          },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
        },
      })
      .mockResolvedValueOnce({
        // Second call - LLM is done after seeing tool result
        id: 'msg_done',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'File created successfully!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1200,
          output_tokens: 50,
        },
      });

    // Override the mock for this test
    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }));

    const session = await client.startAgent('test-agent', '*test');
    const result = await session.execute();

    // Verify session completed with multiple API calls
    expect(result.status).toBe('completed');
    expect(result.costs.apiCalls).toBe(2);
    expect(result.costs.inputTokens).toBe(2200); // 1000 + 1200
    expect(result.costs.outputTokens).toBe(150); // 100 + 50

    // Verify tool was executed and document was created
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].path).toBe('/test.md');
    expect(result.documents[0].content).toContain('# Test Document');

    // Verify mock was called twice (tool call loop)
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should handle session failure gracefully', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test-fail-key' },
    });

    // Mock provider to throw an error
    const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));

    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }));

    const session = await client.startAgent('test-agent', '*test');

    let failedCalled = false;
    session.on('failed', () => {
      failedCalled = true;
    });

    const result = await session.execute();

    // Verify failure handling
    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('API Error');
    expect(failedCalled).toBe(true);

    // Cost report should still be available
    expect(result.costs).toBeDefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should enforce cost limits', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test-cost-limit-key' },
    });

    // Mock provider to return high token usage
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'msg_expensive',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'write_file',
          input: { file_path: '/test.md', content: 'Test' },
        },
      ],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 100000, // High token count
        output_tokens: 50000,
      },
    });

    (Anthropic as any).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }));

    const session = await client.startAgent('test-agent', '*test', {
      costLimit: 0.01, // Very low limit ($0.01)
    });

    const result = await session.execute();

    // Should fail due to cost limit
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Cost limit exceeded');
  });
});
