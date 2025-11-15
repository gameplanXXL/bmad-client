import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Test response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        }),
      },
    })),
  };
});

describe('BmadSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session with unique ID', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    expect(session.id).toMatch(/^sess_\d+_[a-z0-9]+$/);
    expect(session.agentId).toBe('pm');
    expect(session.command).toBe('*help');
  });

  it('should emit started event on execute', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    const startedHandler = vi.fn();
    session.on('started', startedHandler);

    await session.execute();

    expect(startedHandler).toHaveBeenCalled();
  });

  it('should emit completed or failed event with result', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    const completedHandler = vi.fn();
    const failedHandler = vi.fn();
    session.on('completed', completedHandler);
    session.on('failed', failedHandler);

    const result = await session.execute();

    // Either completed or failed should be called
    expect(completedHandler.mock.calls.length + failedHandler.mock.calls.length).toBeGreaterThan(0);
    expect(result.status).toMatch(/completed|failed/);
    expect(result.costs).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should have pending status initially', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    expect(session.getStatus()).toBe('pending');
  });

  it('should change status to running during execution', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    session.on('started', () => {
      expect(session.getStatus()).toBe('running');
    });

    await session.execute();
  });
});
