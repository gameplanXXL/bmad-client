import type { Tool, ToolCall } from '../types.js';
import { minimatch } from 'minimatch';
import { CommandExecutor, type CommandConfig } from './command-executor.js';

/**
 * Virtual File in the in-memory filesystem
 */
interface VirtualFile {
  content: string;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    size: number;
  };
}

/**
 * Tool execution result
 */
interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * FallbackToolExecutor - Provides Claude Code-style tools via in-memory VFS
 *
 * This executor provides an in-memory virtual filesystem and safe command execution
 * for all agent operations. Documents created in the VFS can be persisted to
 * external storage (e.g., Google Cloud Storage) after session completion.
 */
export class FallbackToolExecutor {
  private vfs: Map<string, VirtualFile> = new Map();
  private session?: any; // Session reference (set after construction to avoid circular dependency)
  private commandExecutor?: CommandExecutor; // Optional command executor for execute_command tool

  /**
   * Set session reference (needed for invoke_agent)
   */
  setSession(session: any): void {
    this.session = session;
  }

  /**
   * Configure command executor for execute_command tool
   *
   * @param config - Command executor configuration (whitelist, timeout, etc.)
   */
  setCommandExecutor(config?: CommandConfig): void {
    this.commandExecutor = new CommandExecutor(config);
  }

  /**
   * Check if command execution is enabled
   */
  isCommandExecutionEnabled(): boolean {
    return this.commandExecutor !== undefined;
  }

  /**
   * Get tool definitions for this executor
   */
  getTools(): Tool[] {
    return [
      {
        name: 'read_file',
        description:
          'Read a text file from the virtual filesystem. Use for reading markdown, code, JSON, and other text files.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file (e.g., /docs/prd.md)',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'write_file',
        description:
          'Write content to a text file in the virtual filesystem. Creates directories as needed.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path where to write the file',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'edit_file',
        description:
          'Edit an existing file by replacing old text with new text. Use for making precise changes to files.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to edit',
            },
            old_string: {
              type: 'string',
              description: 'Text to find and replace (must be unique in file)',
            },
            new_string: {
              type: 'string',
              description: 'Text to replace with',
            },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'list_files',
        description: 'List all files in a directory in the virtual filesystem.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (e.g., /docs)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'bash_command',
        description:
          'Execute a safe bash command. Only basic commands are supported: mkdir, ls, pwd, echo.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute',
            },
            description: {
              type: 'string',
              description: 'Brief description of what this command does',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'glob_pattern',
        description:
          'Find files matching a glob pattern in the virtual filesystem. Supports wildcards like *.md, **/*.ts, etc. Use for discovering files dynamically.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description:
                'Glob pattern to match files (e.g., "*.md", ".bmad-core/agents/*.md", "**/*.ts")',
            },
            path: {
              type: 'string',
              description: 'Base directory to search from (default: "/")',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'execute_command',
        description: `Execute a whitelisted system command for content generation and asset processing.

Supported commands include:
- pandoc: Document conversion (Markdown to PDF, HTML, DOCX, etc.)
- pdflatex, xelatex, lualatex: LaTeX compilation
- wkhtmltopdf: HTML to PDF conversion
- convert: Image format conversion (ImageMagick)
- make: Build automation
- npm, node: JavaScript build scripts
- python: Python scripts for data processing

Examples:
- Convert Markdown to PDF: execute_command("pandoc", ["input.md", "-o", "output.pdf", "--pdf-engine=xelatex"])
- Compile LaTeX: execute_command("pdflatex", ["document.tex"])
- HTML to PDF: execute_command("wkhtmltopdf", ["page.html", "output.pdf"])

Note: Commands must be in the whitelist. Configure whitelist via setCommandExecutor().`,
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute (must be in whitelist)',
            },
            args: {
              type: 'array',
              description: 'Command arguments as array of strings',
              items: { type: 'string' },
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for command execution (optional)',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'invoke_agent',
        description: `Invoke a specialized BMad agent to handle a specific task. Use this for delegating work to expert agents like PM, Architect, Dev, QA, etc.

When to use:
- User needs PRD creation → invoke pm agent
- User needs system architecture → invoke architect agent
- User needs code implementation → invoke dev agent
- User needs test strategy → invoke qa agent

The sub-agent will execute autonomously in its own session and return results including generated documents and costs.`,
        input_schema: {
          type: 'object',
          properties: {
            agent_id: {
              type: 'string',
              description: 'ID of the agent to invoke',
              enum: ['pm', 'po', 'architect', 'dev', 'qa', 'sm', 'analyst', 'ux-expert'],
            },
            command: {
              type: 'string',
              description:
                'Command for the agent to execute (e.g., "create-prd", "*create-architecture")',
            },
            context: {
              type: 'object',
              description: 'Context to pass to the sub-agent (project details, requirements, etc.)',
            },
          },
          required: ['agent_id', 'command'],
        },
      },
      {
        name: 'ask_user',
        description: `Ask the user a question and wait for their answer. Use this when you need information from the user to continue.

The session will pause until the user provides an answer. The answer will be returned as the tool result.

Examples:
- "What should be the primary color scheme?"
- "Which database technology do you prefer: PostgreSQL, MySQL, or MongoDB?"
- "What is the target audience for this feature?"`,
        input_schema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask the user',
            },
            context: {
              type: 'string',
              description: 'Optional context to help the user understand what you need',
            },
          },
          required: ['question'],
        },
      },
    ];
  }

  /**
   * Execute a tool call
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'read_file':
          return await this.readFile(toolCall.input['file_path'] as string);

        case 'write_file':
          return await this.writeFile(
            toolCall.input['file_path'] as string,
            toolCall.input['content'] as string
          );

        case 'edit_file':
          return await this.editFile(
            toolCall.input['file_path'] as string,
            toolCall.input['old_string'] as string,
            toolCall.input['new_string'] as string
          );

        case 'list_files':
          return await this.listFiles(toolCall.input['path'] as string);

        case 'bash_command':
          return await this.executeBashCommand(
            toolCall.input['command'] as string,
            toolCall.input['description'] as string | undefined
          );

        case 'glob_pattern':
          return await this.globPattern(
            toolCall.input['pattern'] as string,
            toolCall.input['path'] as string | undefined
          );

        case 'ask_user':
          return await this.askUser(
            toolCall.input['question'] as string,
            toolCall.input['context'] as string | undefined
          );

        case 'invoke_agent':
          return await this.invokeAgent(
            toolCall.input['agent_id'] as string,
            toolCall.input['command'] as string,
            toolCall.input['context'] as Record<string, unknown> | undefined
          );

        case 'execute_command':
          return await this.executeCommand(
            toolCall.input['command'] as string,
            toolCall.input['args'] as string[] | undefined,
            toolCall.input['working_directory'] as string | undefined
          );

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolCall.name}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Alias for execute() - for convenience in tests and applications
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    return this.execute(toolCall);
  }

  /**
   * Read a file from VFS
   */
  private async readFile(filePath: string): Promise<ToolResult> {
    this.validatePath(filePath);

    const file = this.vfs.get(filePath);
    if (!file) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    return {
      success: true,
      content: file.content,
      metadata: {
        size: file.metadata.size,
        modifiedAt: file.metadata.modifiedAt,
      },
    };
  }

  /**
   * Write a file to VFS
   */
  private async writeFile(filePath: string, content: string): Promise<ToolResult> {
    this.validatePath(filePath);

    const now = Date.now();
    const existingFile = this.vfs.get(filePath);

    this.vfs.set(filePath, {
      content,
      metadata: {
        createdAt: existingFile?.metadata.createdAt || now,
        modifiedAt: now,
        size: Buffer.byteLength(content, 'utf-8'),
      },
    });

    return {
      success: true,
      content: `File written: ${filePath} (${Buffer.byteLength(content, 'utf-8')} bytes)`,
      metadata: {
        path: filePath,
        size: Buffer.byteLength(content, 'utf-8'),
      },
    };
  }

  /**
   * Edit a file in VFS
   */
  private async editFile(
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<ToolResult> {
    this.validatePath(filePath);

    const file = this.vfs.get(filePath);
    if (!file) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    // Check if old_string exists
    if (!file.content.includes(oldString)) {
      return {
        success: false,
        error: `String not found in file: "${oldString.substring(0, 50)}${oldString.length > 50 ? '...' : ''}"`,
      };
    }

    // Check if old_string is unique
    const occurrences = file.content.split(oldString).length - 1;
    if (occurrences > 1) {
      return {
        success: false,
        error: `String appears ${occurrences} times in file. Please provide a unique string.`,
      };
    }

    // Perform replacement
    const newContent = file.content.replace(oldString, newString);

    const now = Date.now();
    this.vfs.set(filePath, {
      content: newContent,
      metadata: {
        createdAt: file.metadata.createdAt,
        modifiedAt: now,
        size: Buffer.byteLength(newContent, 'utf-8'),
      },
    });

    return {
      success: true,
      content: `File edited: ${filePath}`,
      metadata: {
        path: filePath,
        oldSize: file.metadata.size,
        newSize: Buffer.byteLength(newContent, 'utf-8'),
      },
    };
  }

  /**
   * List files in a directory
   */
  private async listFiles(dirPath: string): Promise<ToolResult> {
    this.validatePath(dirPath);

    // Normalize directory path
    const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;

    // Find all files in directory
    const files: string[] = [];
    for (const [path] of this.vfs) {
      if (path.startsWith(normalizedDir)) {
        const relativePath = path.substring(normalizedDir.length);
        // Only include direct children (not subdirectories)
        if (!relativePath.includes('/')) {
          files.push(path);
        }
      }
    }

    if (files.length === 0) {
      return {
        success: true,
        content: `Directory is empty or does not exist: ${dirPath}`,
        metadata: { count: 0, files: [] },
      };
    }

    const fileList = files.map((path) => {
      const file = this.vfs.get(path)!;
      return `${path} (${file.metadata.size} bytes)`;
    });

    return {
      success: true,
      content: fileList.join('\n'),
      metadata: {
        count: files.length,
        files: files,
      },
    };
  }

  /**
   * Execute safe bash command
   */
  private async executeBashCommand(command: string, _description?: string): Promise<ToolResult> {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'mkdir':
        return this.cmdMkdir(args);

      case 'ls':
        return await this.cmdLs(args);

      case 'pwd':
        return this.cmdPwd();

      case 'echo':
        return this.cmdEcho(args);

      default:
        return {
          success: false,
          error: `Command not allowed: ${cmd}. Supported commands: mkdir, ls, pwd, echo`,
        };
    }
  }

  /**
   * mkdir command - Create directory marker
   */
  private cmdMkdir(args: string[]): ToolResult {
    if (args.length === 0) {
      return { success: false, error: 'mkdir: missing directory name' };
    }

    // Handle -p flag (note: not actually used in simple implementation)
    // const _createParents = args.includes('-p');
    const dirPath = args[args.length - 1];

    if (!dirPath || !dirPath.startsWith('/')) {
      return { success: false, error: 'mkdir: path must be absolute' };
    }

    // Create directory marker (empty file named .directory)
    const markerPath = `${dirPath}/.directory`;
    const now = Date.now();

    this.vfs.set(markerPath, {
      content: '',
      metadata: {
        createdAt: now,
        modifiedAt: now,
        size: 0,
      },
    });

    return {
      success: true,
      content: `Directory created: ${dirPath}`,
    };
  }

  /**
   * ls command - List directory contents
   */
  private async cmdLs(args: string[]): Promise<ToolResult> {
    const path = args.length > 0 && args[0] ? args[0] : '/';
    return await this.listFiles(path);
  }

  /**
   * pwd command - Print working directory
   */
  private cmdPwd(): ToolResult {
    return {
      success: true,
      content: '/',
    };
  }

  /**
   * echo command - Echo text
   */
  private cmdEcho(args: string[]): ToolResult {
    return {
      success: true,
      content: args.join(' '),
    };
  }

  /**
   * Find files matching glob pattern in VFS
   */
  private async globPattern(pattern: string, basePath?: string): Promise<ToolResult> {
    const base = basePath || '/';

    // Normalize pattern to absolute path
    let fullPattern = pattern;
    if (!pattern.startsWith('/')) {
      fullPattern = base.endsWith('/') ? `${base}${pattern}` : `${base}/${pattern}`;
    }

    // Find all matching files
    const matches: string[] = [];

    for (const [path] of this.vfs) {
      // Skip directory markers
      if (path.endsWith('/.directory')) continue;

      // Check if path matches pattern
      // Use matchBase option for patterns like *.md to match in any directory
      if (minimatch(path, fullPattern, { matchBase: false, dot: true })) {
        matches.push(path);
      }
    }

    // Sort alphabetically for consistent output
    matches.sort();

    if (matches.length === 0) {
      return {
        success: true,
        content: `No files matching pattern: ${fullPattern}`,
        metadata: { count: 0, matches: [], pattern: fullPattern },
      };
    }

    return {
      success: true,
      content: matches.join('\n'),
      metadata: {
        count: matches.length,
        matches: matches,
        pattern: fullPattern,
      },
    };
  }

  /**
   * Validate file path
   */
  private validatePath(path: string): void {
    if (!path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
  }

  /**
   * Get all documents from VFS (for session result)
   * Excludes agent definitions that were loaded for discovery
   */
  getDocuments(): Array<{ path: string; content: string }> {
    const documents: Array<{ path: string; content: string }> = [];

    for (const [path, file] of this.vfs) {
      // Skip directory markers
      if (path.endsWith('/.directory')) continue;

      // Skip agent definitions (they're loaded for discovery, not output)
      if (
        path.includes('/.bmad-core/agents/') ||
        (path.includes('/.bmad-') && path.endsWith('/agents/'))
      ) {
        continue;
      }

      documents.push({
        path,
        content: file.content,
      });
    }

    return documents;
  }

  /**
   * Initialize VFS with files
   */
  initializeFiles(files: Record<string, string>): void {
    const now = Date.now();
    for (const [path, content] of Object.entries(files)) {
      this.vfs.set(path, {
        content,
        metadata: {
          createdAt: now,
          modifiedAt: now,
          size: Buffer.byteLength(content, 'utf-8'),
        },
      });
    }
  }

  /**
   * Clear all files from VFS
   */
  clear(): void {
    this.vfs.clear();
  }

  /**
   * Get VFS size in bytes
   */
  getSize(): number {
    let total = 0;
    for (const [, file] of this.vfs) {
      total += file.metadata.size;
    }
    return total;
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.vfs.size;
  }

  /**
   * Read file content directly from VFS (synchronous)
   * Used by tests and for direct VFS access
   */
  getFileContent(filePath: string): string {
    const file = this.vfs.get(filePath);
    if (!file) {
      return '';
    }
    return file.content;
  }

  /**
   * Check if file exists in VFS
   */
  hasFile(filePath: string): boolean {
    return this.vfs.has(filePath);
  }

  /**
   * Invoke a sub-agent to handle a task
   */
  private async invokeAgent(
    agentId: string,
    command: string,
    context?: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this.session) {
      return {
        success: false,
        error: 'invoke_agent: Session reference not set',
      };
    }

    try {
      const parentSession = this.session;
      const client = parentSession.getClient();
      const logger = client.getLogger();

      logger.info('Invoking sub-agent', {
        parentSessionId: parentSession.id,
        agentId,
        command,
      });

      // Create child session with context
      const childSession = await client.startAgent(agentId, command, {
        costLimit: parentSession.getRemainingBudget(),
        context: {
          ...context,
          parentSessionId: parentSession.id,
          isSubAgent: true,
        },
      });

      // Execute child session
      const result = await childSession.execute();

      if (result.status !== 'completed') {
        return {
          success: false,
          error: `Sub-agent failed: ${result.error?.message || 'Unknown error'}`,
        };
      }

      // Add child costs to parent
      const childCost: any = {
        sessionId: childSession.id,
        agent: agentId,
        command,
        totalCost: result.costs.totalCost,
        inputTokens: result.costs.inputTokens,
        outputTokens: result.costs.outputTokens,
        apiCalls: result.costs.apiCalls,
      };

      parentSession.addChildSessionCost(childCost);

      // Merge child documents into parent VFS
      const parentToolExecutor = parentSession.getToolExecutor();
      for (const doc of result.documents) {
        const now = Date.now();
        parentToolExecutor.vfs.set(doc.path, {
          content: doc.content,
          metadata: {
            createdAt: now,
            modifiedAt: now,
            size: doc.content.length,
          },
        });
      }

      logger.info('Sub-agent completed', {
        parentSessionId: parentSession.id,
        agentId,
        documentCount: result.documents.length,
        cost: result.costs.totalCost,
      });

      // Return structured result to LLM
      const responseData = {
        status: 'completed',
        agent: agentId,
        command,
        documents: result.documents.map((d: any) => ({
          path: d.path,
          size: d.content.length,
        })),
        costs: {
          totalCost: result.costs.totalCost,
          inputTokens: result.costs.inputTokens,
          outputTokens: result.costs.outputTokens,
          apiCalls: result.costs.apiCalls,
        },
        duration: result.duration,
      };

      return {
        success: true,
        content: JSON.stringify(responseData, null, 2),
        metadata: responseData,
      };
    } catch (error) {
      return {
        success: false,
        error: `invoke_agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Ask the user a question (pauses session until answer provided)
   */
  private async askUser(question: string, context?: string): Promise<ToolResult> {
    if (!this.session) {
      return {
        success: false,
        error: 'ask_user: Session reference not set',
      };
    }

    try {
      // Request answer from session (this will pause execution)
      const answer = await this.session.requestUserAnswer(question, context);

      return {
        success: true,
        content: answer,
      };
    } catch (error) {
      return {
        success: false,
        error: `ask_user failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Execute a whitelisted system command
   */
  private async executeCommand(
    command: string,
    args?: string[],
    workingDirectory?: string
  ): Promise<ToolResult> {
    if (!this.commandExecutor) {
      return {
        success: false,
        error:
          'Command execution is not enabled. Configure CommandExecutor via setCommandExecutor().',
      };
    }

    try {
      const options: Partial<import('./command-executor.js').CommandConfig> = {};
      if (workingDirectory) {
        options.workingDirectory = workingDirectory;
      }

      const result = await this.commandExecutor.execute(command, args || [], options);

      // Format result as JSON for the LLM
      const output = JSON.stringify(
        {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration: result.duration,
          timedOut: result.timedOut,
        },
        null,
        2
      );

      return {
        success: result.success,
        content: output,
        metadata: {
          command: result.command,
          args: result.args,
          exitCode: result.exitCode,
          duration: result.duration,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `execute_command failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
