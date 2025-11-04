import type { Tool, ToolCall } from '../types.js';

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
 * FallbackToolExecutor - Provides Claude Code-style tools without MCP servers
 *
 * This executor provides an in-memory virtual filesystem and safe command execution
 * for testing and scenarios where MCP servers are not available.
 */
export class FallbackToolExecutor {
  private vfs: Map<string, VirtualFile> = new Map();

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
    ];
  }

  /**
   * Execute a tool call
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'read_file':
          return await this.readFile(toolCall.input.file_path as string);

        case 'write_file':
          return await this.writeFile(
            toolCall.input.file_path as string,
            toolCall.input.content as string
          );

        case 'edit_file':
          return await this.editFile(
            toolCall.input.file_path as string,
            toolCall.input.old_string as string,
            toolCall.input.new_string as string
          );

        case 'list_files':
          return await this.listFiles(toolCall.input.path as string);

        case 'bash_command':
          return await this.executeBashCommand(
            toolCall.input.command as string,
            toolCall.input.description as string
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
  private async executeBashCommand(
    command: string,
    description?: string
  ): Promise<ToolResult> {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'mkdir':
        return this.cmdMkdir(args);

      case 'ls':
        return this.cmdLs(args);

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

    // Handle -p flag
    const createParents = args.includes('-p');
    const dirPath = args[args.length - 1];

    if (!dirPath.startsWith('/')) {
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
  private cmdLs(args: string[]): ToolResult {
    const path = args.length > 0 ? args[0] : '/';
    return this.listFiles(path);
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
   * Validate file path
   */
  private validatePath(path: string): void {
    if (!path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
  }

  /**
   * Get all documents from VFS (for session result)
   */
  getDocuments(): Array<{ path: string; content: string }> {
    const documents: Array<{ path: string; content: string }> = [];

    for (const [path, file] of this.vfs) {
      // Skip directory markers
      if (path.endsWith('/.directory')) continue;

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
}
