import { describe, it, expect } from 'vitest';
import { SystemPromptGenerator } from '../prompt-generator.js';
import type { AgentDefinition, Tool } from '../types.js';

describe('SystemPromptGenerator', () => {
  const generator = new SystemPromptGenerator();

  const mockAgent: AgentDefinition = {
    agent: {
      name: 'John',
      id: 'pm',
      title: 'Product Manager',
      icon: '📋',
      whenToUse: 'Use for creating PRDs',
      customization: 'You are an expert PM focused on user value.',
    },
    persona: {
      role: 'Product Strategist',
      style: 'Analytical, data-driven',
      identity: 'Product Manager specialized in documentation',
      focus: 'Creating PRDs and product specs',
      core_principles: ['User-centric design', 'Data-driven decisions', 'Clear communication'],
    },
    commands: ['*help', '*create-prd', '*exit'],
    dependencies: {
      tasks: ['create-doc.md'],
      templates: ['prd-tmpl.yaml'],
    },
    activation_instructions: [
      'Read this entire file',
      'Adopt the persona',
      'Greet user and run *help',
    ],
  };

  const mockTools: Tool[] = [
    {
      name: 'read_file',
      description: 'Read a file from the filesystem',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to file' },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['file_path', 'content'],
      },
    },
  ];

  describe('generate', () => {
    it('should generate complete system prompt', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(500);
    });

    it('should include Claude Code base prompt', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('You are Claude');
      expect(prompt).toContain('AI assistant');
      expect(prompt).toContain('specialized tools');
    });

    it('should include all tool descriptions', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Available Tools');
      expect(prompt).toContain('### read_file');
      expect(prompt).toContain('Read a file from the filesystem');
      expect(prompt).toContain('### write_file');
      expect(prompt).toContain('Write content to a file');
    });

    it('should include tool parameters with JSON schema', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('**Parameters:**');
      expect(prompt).toContain('file_path');
      expect(prompt).toContain('content');
    });

    it('should include tool examples', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('**Example:**');
      expect(prompt).toContain('/project/');
    });

    it('should include tool usage rules', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Tool Usage Rules');
      expect(prompt).toContain('ALWAYS use read_file before edit_file');
      expect(prompt).toContain('File paths must be absolute');
    });

    it('should include workflow guidelines', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Workflow Guidelines');
      expect(prompt).toContain('Understand the task');
      expect(prompt).toContain('Use tools to gather');
    });

    it('should include agent persona', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Agent Persona');
      expect(prompt).toContain('**Name:** John');
      expect(prompt).toContain('**Role:** Product Strategist');
      expect(prompt).toContain('**Title:** Product Manager');
      expect(prompt).toContain('**Icon:** 📋');
    });

    it('should include agent customization', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('You are an expert PM focused on user value');
    });

    it('should include persona details', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('**Style:** Analytical, data-driven');
      expect(prompt).toContain('**Identity:** Product Manager specialized in documentation');
      expect(prompt).toContain('**Focus:** Creating PRDs and product specs');
    });

    it('should include core principles', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('**Core Principles:**');
      expect(prompt).toContain('- User-centric design');
      expect(prompt).toContain('- Data-driven decisions');
      expect(prompt).toContain('- Clear communication');
    });

    it('should include available commands', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Available Commands');
      expect(prompt).toContain('- *help');
      expect(prompt).toContain('- *create-prd');
      expect(prompt).toContain('- *exit');
    });

    it('should include activation instructions', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('## Activation Instructions');
      expect(prompt).toContain('1. Read this entire file');
      expect(prompt).toContain('2. Adopt the persona');
      expect(prompt).toContain('3. Greet user and run *help');
    });

    it('should end with adoption prompt', () => {
      const prompt = generator.generate(mockAgent, mockTools);

      expect(prompt).toContain('Now, adopt this persona and await user commands');
    });

    it('should handle agent without customization', () => {
      const agentWithoutCustomization: AgentDefinition = {
        ...mockAgent,
        agent: {
          ...mockAgent.agent,
          customization: undefined,
        },
      };

      const prompt = generator.generate(agentWithoutCustomization, mockTools);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('**Name:** John');
      expect(prompt).not.toContain('You are an expert PM');
    });

    it('should handle agent without activation instructions', () => {
      const agentWithoutInstructions: AgentDefinition = {
        ...mockAgent,
        activation_instructions: undefined,
      };

      const prompt = generator.generate(agentWithoutInstructions, mockTools);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Follow the persona and commands defined above');
    });

    it('should handle empty tools array', () => {
      const prompt = generator.generate(mockAgent, []);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('## Available Tools');
    });
  });
});
