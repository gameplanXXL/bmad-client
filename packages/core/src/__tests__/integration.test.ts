import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { MockLLMProvider } from './mock-llm-provider.js';
import Anthropic from '@anthropic-ai/sdk';

// Don't mock AgentLoader - we'll use the real one with fixtures

describe('Integration Tests', () => {
  let mockProvider: MockLLMProvider;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock provider with default responses
    mockProvider = new MockLLMProvider({
      content: 'Integration test response complete!',
      stopReason: 'end_turn',
      inputTokens: 1500,
      outputTokens: 250,
    });
  });

  it('should execute full session with all components integrated', async () => {
    const client = new BmadClient({
      provider: mockProvider,
      logLevel: 'error',
    });

    const session = await client.startAgent('pm', '*help');

    // Verify session properties
    expect(session.id).toMatch(/^sess_\d+_[a-z0-9]+$/);
    expect(session.agentId).toBe('pm');
    expect(session.command).toBe('*help');
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
    expect(result.costs.breakdown[0]?.model).toBe('mock-llm-v1');

    // Verify documents (should be empty for this test since no tools were called)
    expect(result.documents).toBeDefined();
    expect(Array.isArray(result.documents)).toBe(true);

    // Verify events were emitted correctly
    expect(completedResult).toBeTruthy();
    expect(failedError).toBeFalsy();
  });

  it('should handle tool calls in session', async () => {
    // Create fresh provider for this test with tool call sequence
    const toolProvider = new MockLLMProvider();
    toolProvider.addRules([
      // First response - LLM wants to use a tool
      {
        userMessageContains: '*test',
        response: {
          content: [
            { type: 'text', text: 'Creating test file' },
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
          toolCalls: [
            {
              id: 'tool_1',
              name: 'write_file',
              input: {
                file_path: '/test.md',
                content: '# Test Document\n\nContent here',
              },
            },
          ],
          stopReason: 'tool_use',
          inputTokens: 1000,
          outputTokens: 100,
        },
      },
      // Second response - LLM is done after seeing tool result
      {
        toolResultContains: 'File written',
        response: {
          content: 'File created successfully!',
          stopReason: 'end_turn',
          inputTokens: 1200,
          outputTokens: 50,
        },
      },
    ]);

    const client = new BmadClient({
      provider: toolProvider,
      logLevel: 'error',
    });

    const session = await client.startAgent('pm', '*test');
    const result = await session.execute();

    // Verify session completed with multiple API calls
    expect(result.status).toBe('completed');
    expect(result.costs.apiCalls).toBe(2);
    // Note: First call has *test command which is 100 input + tool response adds 1000
    expect(result.costs.inputTokens).toBeGreaterThan(1000); // At least the tool call
    expect(result.costs.outputTokens).toBeGreaterThan(100); // At least the tool response

    // Verify tool was executed and document was created
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.path).toBe('/test.md');
    expect(result.documents[0]?.content).toContain('# Test Document');
  });

  it.skip('should handle session failure gracefully', async () => {
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

  it.skip('should enforce cost limits', async () => {
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
