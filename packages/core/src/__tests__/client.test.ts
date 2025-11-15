import { describe, it, expect } from 'vitest';
import { BmadClient } from '../client.js';

describe('BmadClient', () => {
  it('should initialize with valid config', () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key-123',
      },
    });

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(BmadClient);
  });

  it('should have getConfig method', () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key-123',
        model: 'claude-sonnet-4',
      },
    });

    const config = client.getConfig();
    expect((config.provider as { type: string }).type).toBe('anthropic');
    expect((config.provider as { model: string }).model).toBe('claude-sonnet-4');
  });

  it('should create session', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key-123',
      },
    });

    const session = await client.startAgent('pm', '*help');

    expect(session).toBeDefined();
    expect(session.agentId).toBe('pm');
    expect(session.command).toBe('*help');
    expect(session.id).toMatch(/^sess_/);
  });

  it('should use custom logger', () => {
    const logs: string[] = [];
    const customLogger = {
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
    };

    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key-123',
      },
      logger: customLogger,
    });

    expect(client.getLogger()).toBe(customLogger);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('INFO: BmadClient initialized');
  });
});
