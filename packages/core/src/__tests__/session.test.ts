import { describe, it, expect, vi } from 'vitest';
import { BmadClient } from '../client.js';
import { BmadSession } from '../session.js';

describe('BmadSession', () => {
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

  it('should emit completed event with result', async () => {
    const client = new BmadClient({
      provider: { type: 'anthropic', apiKey: 'test' },
    });

    const session = await client.startAgent('pm', '*help');

    const completedHandler = vi.fn();
    session.on('completed', completedHandler);

    const result = await session.execute();

    expect(completedHandler).toHaveBeenCalledWith(result);
    expect(result.status).toBe('completed');
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
