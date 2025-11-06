import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BmadClient } from '../../client.js';
import { BmadSession } from '../../session.js';

describe('invoke_agent tool', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    // Mock Anthropic API calls
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            id: 'msg_test',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Test response',
              },
            ],
            stop_reason: 'end_turn',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
            },
          }),
        },
      })),
    }));
  });

  it('should be included in tool definitions', () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: mockApiKey,
      },
    });

    const session = new BmadSession(client, 'pm', 'test-command');
    const toolExecutor = session.getToolExecutor();
    const tools = toolExecutor.getTools();

    const invokeAgentTool = tools.find((t) => t.name === 'invoke_agent');

    expect(invokeAgentTool).toBeDefined();
    expect(invokeAgentTool?.description).toContain('Invoke a specialized BMad agent');
    expect(invokeAgentTool?.input_schema.required).toContain('agent_id');
    expect(invokeAgentTool?.input_schema.required).toContain('command');
  });

  it('should have correct agent_id enum values', () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: mockApiKey,
      },
    });

    const session = new BmadSession(client, 'pm', 'test-command');
    const toolExecutor = session.getToolExecutor();
    const tools = toolExecutor.getTools();

    const invokeAgentTool = tools.find((t) => t.name === 'invoke_agent');
    const agentIdProperty = invokeAgentTool?.input_schema.properties.agent_id as any;

    expect(agentIdProperty.enum).toContain('pm');
    expect(agentIdProperty.enum).toContain('architect');
    expect(agentIdProperty.enum).toContain('dev');
    expect(agentIdProperty.enum).toContain('qa');
  });

  it('should include context as optional parameter', () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: mockApiKey,
      },
    });

    const session = new BmadSession(client, 'pm', 'test-command');
    const toolExecutor = session.getToolExecutor();
    const tools = toolExecutor.getTools();

    const invokeAgentTool = tools.find((t) => t.name === 'invoke_agent');

    expect(invokeAgentTool?.input_schema.properties.context).toBeDefined();
    expect(invokeAgentTool?.input_schema.required).not.toContain('context');
  });

  // TODO: Add integration tests that actually invoke sub-agents
  // This requires mocking or real agent definitions

  it.skip('should invoke sub-agent and return result', async () => {
    // This test requires:
    // 1. Mock agent definition for PM
    // 2. Mock Anthropic API responses
    // 3. Test full execution flow

    // Placeholder for future integration test
  });

  it.skip('should aggregate child session costs', async () => {
    // Test that child session costs are added to parent
    // Placeholder for future test
  });

  it.skip('should merge child documents into parent VFS', async () => {
    // Test that documents from child session are accessible in parent
    // Placeholder for future test
  });

  it.skip('should respect parent session cost limits', async () => {
    // Test that child sessions respect remaining budget
    // Placeholder for future test
  });
});
