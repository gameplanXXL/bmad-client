import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BmadClient } from '../client.js';
import { MockLLMProvider } from './mock-llm-provider.js';
import type { AgentDefinition } from '../types.js';

/**
 * Tests for Pause/Resume functionality (ask_user tool)
 */

// Mock agent definition
const mockAgentDefinition: AgentDefinition = {
  agent: {
    name: 'Test Agent',
    id: 'test-agent',
    title: 'Test Agent',
    icon: '🧪',
    whenToUse: 'For testing',
  },
  persona: {
    role: 'Test Assistant',
    style: 'Concise',
    identity: 'A test agent',
    focus: 'Testing pause/resume',
    core_principles: ['Test thoroughly'],
  },
  commands: ['*test'],
  dependencies: {},
};

// Mock AgentLoader
vi.mock('../agent-loader.js', () => ({
  AgentLoader: vi.fn().mockImplementation(() => ({
    loadAgent: vi.fn().mockResolvedValue(mockAgentDefinition),
  })),
}));

describe('Pause/Resume Tests', () => {
  let client: BmadClient;
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    mockProvider = new MockLLMProvider({
      content: 'Default response',
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    });

    client = new BmadClient({
      provider: mockProvider,
      logLevel: 'error',
    });
  });

  it('should pause session when ask_user is called', async () => {
    // Setup mock responses
    mockProvider.setResponses([
      // First response: Agent calls ask_user
      {
        content: [
          { type: 'text', text: 'I need to ask you something' },
          {
            type: 'tool_use',
            id: 'tool_ask',
            name: 'ask_user',
            input: { question: 'What is your favorite color?', context: 'For theme selection' },
          },
        ],
        toolCalls: [
          {
            id: 'tool_ask',
            name: 'ask_user',
            input: { question: 'What is your favorite color?', context: 'For theme selection' },
          },
        ],
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      },
      // Second response: After answer, agent completes
      {
        content: 'Great choice! I will use blue as the primary color.',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 50,
      },
    ]);

    const session = await client.startAgent('test-agent', '*test');

    let questionReceived = false;
    let resumedFired = false;

    session.on('question', (q) => {
      questionReceived = true;
      expect(q.question).toBe('What is your favorite color?');
      expect(q.context).toBe('For theme selection');
      expect(session.getStatus()).toBe('paused');

      // Simulate user answering after a delay
      setTimeout(() => {
        session.answer('Blue');
      }, 10);
    });

    session.on('resumed', () => {
      resumedFired = true;
      expect(session.getStatus()).toBe('running');
    });

    const result = await session.execute();

    expect(result.status).toBe('completed');
    expect(questionReceived).toBe(true);
    expect(resumedFired).toBe(true);
    expect(result.finalResponse).toContain('blue');
  });

  it('should handle multiple questions in sequence', async () => {
    // Setup mock responses
    mockProvider.setResponses([
      // First question
      {
        content: [
          { type: 'text', text: 'Let me collect your information' },
          {
            type: 'tool_use',
            id: 'tool_ask_1',
            name: 'ask_user',
            input: { question: 'What is your name?' },
          },
        ],
        toolCalls: [
          {
            id: 'tool_ask_1',
            name: 'ask_user',
            input: { question: 'What is your name?' },
          },
        ],
        stopReason: 'tool_use',
        inputTokens: 1000,
        outputTokens: 100,
      },
      // Second question (after receiving first answer)
      {
        content: [
          { type: 'text', text: 'Thank you. Now I need your email.' },
          {
            type: 'tool_use',
            id: 'tool_ask_2',
            name: 'ask_user',
            input: { question: 'What is your email?' },
          },
        ],
        toolCalls: [
          {
            id: 'tool_ask_2',
            name: 'ask_user',
            input: { question: 'What is your email?' },
          },
        ],
        stopReason: 'tool_use',
        inputTokens: 800,
        outputTokens: 80,
      },
      // Completion (after receiving second answer)
      {
        content: 'Thank you! Profile created.',
        stopReason: 'end_turn',
        inputTokens: 500,
        outputTokens: 50,
      },
    ]);

    const session = await client.startAgent('test-agent', '*test');

    const questions: string[] = [];

    session.on('question', (q) => {
      questions.push(q.question);

      // Answer based on question
      setTimeout(() => {
        if (q.question === 'What is your name?') {
          session.answer('John Doe');
        } else if (q.question === 'What is your email?') {
          session.answer('john@example.com');
        }
      }, 10);
    });

    const result = await session.execute();

    expect(result.status).toBe('completed');
    expect(questions).toEqual(['What is your name?', 'What is your email?']);
  });

  it('should throw error if answer() called without pending question', async () => {
    const session = await client.startAgent('test-agent', '*test');

    expect(() => {
      session.answer('test');
    }).toThrow('No pending question to answer');
  });
});
