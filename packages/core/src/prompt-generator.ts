import type { AgentDefinition, Tool } from './types.js';

/**
 * SystemPromptGenerator - Generates Claude Code-style system prompts
 *
 * This class replicates the Claude Code environment by combining:
 * 1. Base Claude Code system prompt (tool descriptions, workflow rules)
 * 2. Agent persona (role, style, principles, commands)
 * 3. Activation instructions
 */
export class SystemPromptGenerator {
  /**
   * Generate complete system prompt for an agent
   */
  generate(agent: AgentDefinition, tools: Tool[]): string {
    const sections = [
      this.getClaudeCodeBasePrompt(),
      '',
      '## Available Tools',
      '',
      this.formatToolDescriptions(tools),
      '',
      '## Tool Usage Rules',
      '',
      this.getToolUsageRules(),
      '',
      '## Workflow Guidelines',
      '',
      this.getWorkflowGuidelines(),
      '',
      '## Agent Persona',
      '',
      this.formatAgentPersona(agent),
    ];

    // Only include sections if they exist
    if (agent.commands && agent.commands.length > 0) {
      sections.push('', '## Available Commands', '', this.formatCommands(agent.commands));
    }

    // Always include activation instructions (with fallback)
    sections.push('', '## Activation Instructions', '', this.formatActivationInstructions(agent));

    sections.push('', 'Now, adopt this persona and await user commands.');

    return sections.join('\n');
  }

  /**
   * Get base Claude Code system prompt
   */
  private getClaudeCodeBasePrompt(): string {
    return `You are Claude, an AI assistant with access to specialized tools for software development and content creation.

Your capabilities include:
- Reading and writing files
- Editing existing files with precise replacements
- Executing bash commands for system operations
- Searching files with grep patterns
- Finding files with glob patterns

You will receive an agent persona to adopt, which defines your role, style, and available commands.
Follow the agent's instructions precisely while maintaining access to these tools.`.trim();
  }

  /**
   * Format tool descriptions for the system prompt
   */
  private formatToolDescriptions(tools: Tool[]): string {
    return tools
      .map((tool) => {
        const schemaStr = JSON.stringify(tool.input_schema, null, 2)
          .split('\n')
          .map((line, i) => (i === 0 ? line : `  ${line}`))
          .join('\n');

        return `### ${tool.name}

${tool.description}

**Parameters:**
\`\`\`json
${schemaStr}
\`\`\`

**Example:**
\`\`\`json
${this.getToolExample(tool.name)}
\`\`\``;
      })
      .join('\n\n');
  }

  /**
   * Get example usage for a tool
   */
  private getToolExample(toolName: string): string {
    const examples: Record<string, string> = {
      read_file: JSON.stringify({ file_path: '/project/docs/prd.md' }, null, 2),
      write_file: JSON.stringify(
        {
          file_path: '/project/output/document.md',
          content: '# Document\n\nContent here',
        },
        null,
        2
      ),
      edit_file: JSON.stringify(
        {
          file_path: '/project/file.md',
          old_string: 'old text',
          new_string: 'new text',
        },
        null,
        2
      ),
      bash_command: JSON.stringify(
        {
          command: 'mkdir -p chapters',
          description: 'Create chapters directory',
        },
        null,
        2
      ),
      grep_search: JSON.stringify(
        {
          pattern: 'TODO',
          path: '/project',
          output_mode: 'files_with_matches',
        },
        null,
        2
      ),
      glob_pattern: JSON.stringify(
        {
          pattern: '*.md',
          path: '/project/docs',
        },
        null,
        2
      ),
    };

    return examples[toolName] || JSON.stringify({ param: 'value' }, null, 2);
  }

  /**
   * Get tool usage rules
   */
  private getToolUsageRules(): string {
    return `- ALWAYS use read_file before edit_file or write_file on existing files
- Use bash_command for system commands (mkdir, make, git)
- File paths must be absolute (starting with /)
- Prefer specialized tools over bash_command when possible
- Handle errors gracefully and report them clearly`;
  }

  /**
   * Get workflow guidelines
   */
  private getWorkflowGuidelines(): string {
    return `1. Understand the task from the agent definition and user command
2. Use tools to gather necessary information (read files, search, etc.)
3. Execute the task following agent-specific instructions
4. Verify results using appropriate tools
5. Provide clear, concise responses to the user
6. Ask questions when requirements are unclear`;
  }

  /**
   * Format agent persona section
   */
  private formatAgentPersona(agent: AgentDefinition): string {
    const sections = [];

    // Customization (if present)
    if (agent.agent.customization) {
      sections.push(agent.agent.customization.trim());
      sections.push('');
    }

    // Basic info
    sections.push(`**Name:** ${agent.agent.name}`);
    if (agent.persona?.role) {
      sections.push(`**Role:** ${agent.persona.role}`);
    }
    if (agent.agent.title) {
      sections.push(`**Title:** ${agent.agent.title}`);
    }
    if (agent.agent.icon) {
      sections.push(`**Icon:** ${agent.agent.icon}`);
    }
    sections.push('');

    // Persona details (if available)
    if (agent.persona) {
      if (agent.persona.style) {
        sections.push(`**Style:** ${agent.persona.style}`);
      }
      if (agent.persona.identity) {
        sections.push(`**Identity:** ${agent.persona.identity}`);
      }
      if (agent.persona.focus) {
        sections.push(`**Focus:** ${agent.persona.focus}`);
      }
      sections.push('');

      // Core principles
      if (agent.persona.core_principles && agent.persona.core_principles.length > 0) {
        sections.push('**Core Principles:**');
        agent.persona.core_principles.forEach((principle) => {
          sections.push(`- ${principle}`);
        });
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * Format available commands
   */
  private formatCommands(
    commands: string[] | Record<string, string>[] | (string | Record<string, string>)[]
  ): string {
    return commands
      .map((cmd) => {
        if (typeof cmd === 'string') {
          return `- ${cmd}`;
        } else {
          // Handle object format: { command: "description" }
          const entries = Object.entries(cmd);
          if (entries.length > 0) {
            const entry = entries[0]!;
            return `- ${entry[0]}: ${entry[1]}`;
          }
          return '- (unknown command)';
        }
      })
      .join('\n');
  }

  /**
   * Format activation instructions
   */
  private formatActivationInstructions(agent: AgentDefinition): string {
    if (!agent.activation_instructions || agent.activation_instructions.length === 0) {
      return 'Follow the persona and commands defined above.';
    }

    return agent.activation_instructions
      .map((instruction, i) => `${i + 1}. ${instruction}`)
      .join('\n');
  }
}
