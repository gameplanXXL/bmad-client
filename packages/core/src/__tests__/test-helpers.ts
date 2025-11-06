/**
 * Test Helpers for Integration Tests
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const fixturesDir = resolve(__dirname, 'fixtures');

/**
 * Get mock agent definitions for testing
 */
export function getMockAgentDefinitions(): Record<string, AgentDefinition> {
  return {
    'bmad-orchestrator': {
      agent: {
        name: 'Test Orchestrator',
        id: 'bmad-orchestrator',
        title: 'Test Orchestrator',
        icon: '🎭',
        whenToUse: 'Test orchestrator',
      },
      persona: {
        role: 'Test Orchestrator',
        style: 'Testing',
        identity: 'Test orchestrator',
        focus: 'Testing',
        core_principles: ['Test'],
      },
      commands: ['help', 'agent'],
      dependencies: {},
    },
    pm: {
      agent: {
        name: 'Test PM',
        id: 'pm',
        title: 'Test Product Manager',
        icon: '📋',
        whenToUse: 'Test PM',
      },
      persona: {
        role: 'Test PM',
        style: 'Testing',
        identity: 'Test PM',
        focus: 'Testing',
        core_principles: ['Test'],
      },
      commands: ['create-prd'],
      dependencies: {},
    },
    architect: {
      agent: {
        name: 'Test Architect',
        id: 'architect',
        title: 'Test Architect',
        icon: '🏗️',
        whenToUse: 'Test architect',
      },
      persona: {
        role: 'Test Architect',
        style: 'Testing',
        identity: 'Test architect',
        focus: 'Testing',
        core_principles: ['Test'],
      },
      commands: ['create-architecture'],
      dependencies: {},
    },
  };
}

/**
 * Create a mock Anthropic response
 */
export function createMockAnthropicResponse(params: {
  toolUse?: { name: string; input: Record<string, unknown> };
  text?: string;
  stopReason: 'tool_use' | 'end_turn' | 'max_tokens';
  inputTokens: number;
  outputTokens: number;
}): any {
  const { toolUse, text, stopReason, inputTokens, outputTokens } = params;

  const content: any[] = [];

  if (text) {
    content.push({ type: 'text', text });
  }

  if (toolUse) {
    content.push({
      type: 'tool_use',
      id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role: 'assistant',
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}
