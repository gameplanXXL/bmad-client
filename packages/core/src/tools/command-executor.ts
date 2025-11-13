/**
 * CommandExecutor - Safe execution of whitelisted system commands
 *
 * Provides controlled command execution for content-creation and asset-generation
 * workflows (pandoc, pdflatex, wkhtmltopdf, make, etc.)
 *
 * Security Features:
 * - Whitelist-only command execution
 * - Configurable timeout limits
 * - Working directory isolation
 * - Resource constraints
 * - Stdout/stderr capture
 */

import { spawn } from 'child_process';
import { access, mkdir } from 'fs/promises';
import { constants } from 'fs';

/**
 * Command execution configuration
 */
export interface CommandConfig {
  /**
   * List of allowed commands (e.g., ['pandoc', 'pdflatex', 'make'])
   * Default: ['echo', 'cat', 'ls'] (safe read-only commands)
   */
  whitelist?: string[];

  /**
   * Maximum execution time in milliseconds
   * Default: 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Working directory for command execution
   * Default: process.cwd()
   */
  workingDirectory?: string;

  /**
   * Environment variables to inject
   * Default: inherit from process.env
   */
  env?: Record<string, string>;

  /**
   * Maximum stdout/stderr buffer size in bytes
   * Default: 10MB
   */
  maxBuffer?: number;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  command: string;
  args: string[];
  duration: number;
  timedOut: boolean;
  error?: string;
}

/**
 * Error thrown when attempting to execute non-whitelisted command
 */
export class CommandNotAllowedError extends Error {
  constructor(command: string, whitelist: string[]) {
    super(
      `Command '${command}' is not in the whitelist. Allowed commands: ${whitelist.join(', ')}`
    );
    this.name = 'CommandNotAllowedError';
  }
}

/**
 * Error thrown when command execution times out
 */
export class CommandTimeoutError extends Error {
  constructor(command: string, timeout: number) {
    super(`Command '${command}' timed out after ${timeout}ms`);
    this.name = 'CommandTimeoutError';
  }
}

/**
 * Default safe command whitelist (read-only operations)
 */
const DEFAULT_WHITELIST = [
  'echo',    // Print text
  'cat',     // Display file contents
  'ls',      // List directory
  'pwd',     // Print working directory
  'which',   // Locate command
  'whoami',  // Print current user
  'date',    // Print date/time
  'uname',   // Print system info
];

/**
 * Content-creation command whitelist
 * These are commonly needed for document generation workflows
 */
export const CONTENT_CREATION_WHITELIST = [
  ...DEFAULT_WHITELIST,
  'pandoc',        // Document converter
  'pdflatex',      // LaTeX to PDF
  'xelatex',       // XeLaTeX
  'lualatex',      // LuaLaTeX
  'bibtex',        // Bibliography processor
  'makeindex',     // Index generator
  'wkhtmltopdf',   // HTML to PDF
  'convert',       // ImageMagick converter
  'gs',            // Ghostscript
  'inkscape',      // SVG processor
  'gnuplot',       // Plotting
  'graphviz',      // Graph visualization
  'dot',           // GraphViz dot
  'make',          // Build tool
  'npm',           // Node package manager (for build scripts)
  'node',          // Node.js runtime
  'python3',       // Python interpreter
  'python',        // Python interpreter
];

/**
 * CommandExecutor - Executes whitelisted system commands with safety controls
 *
 * @example
 * ```typescript
 * const executor = new CommandExecutor({
 *   whitelist: ['pandoc', 'pdflatex'],
 *   timeout: 60000, // 1 minute
 *   workingDirectory: '/tmp/build',
 * });
 *
 * const result = await executor.execute('pandoc', [
 *   'input.md',
 *   '-o', 'output.pdf',
 *   '--pdf-engine=xelatex',
 * ]);
 *
 * if (result.success) {
 *   console.log('PDF generated successfully');
 * } else {
 *   console.error('Error:', result.stderr);
 * }
 * ```
 */
export class CommandExecutor {
  private config: Required<CommandConfig>;

  constructor(config?: CommandConfig) {
    this.config = {
      whitelist: config?.whitelist || DEFAULT_WHITELIST,
      timeout: config?.timeout || 300000, // 5 minutes default
      workingDirectory: config?.workingDirectory || process.cwd(),
      env: config?.env || {},
      maxBuffer: config?.maxBuffer || 10 * 1024 * 1024, // 10MB default
    };
  }

  /**
   * Execute a whitelisted command
   *
   * @param command - Command to execute (must be in whitelist)
   * @param args - Command arguments
   * @param options - Override default config for this execution
   * @returns Command execution result
   * @throws CommandNotAllowedError if command not in whitelist
   */
  async execute(
    command: string,
    args: string[] = [],
    options?: Partial<CommandConfig>
  ): Promise<CommandResult> {
    const startTime = Date.now();

    // Merge options with config
    const execConfig = {
      ...this.config,
      ...options,
    };

    // Validate command is in whitelist
    if (!execConfig.whitelist.includes(command)) {
      throw new CommandNotAllowedError(command, execConfig.whitelist);
    }

    // Ensure working directory exists and is accessible
    try {
      await this.ensureWorkingDirectory(execConfig.workingDirectory);
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: `Failed to access working directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        exitCode: null,
        signal: null,
        command,
        args,
        duration: Date.now() - startTime,
        timedOut: false,
        error: 'Working directory error',
      };
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Spawn child process
      const childProcess = spawn(command, args, {
        cwd: execConfig.workingDirectory,
        env: {
          ...process.env,
          ...execConfig.env,
        },
        shell: false, // Security: don't use shell
        timeout: execConfig.timeout,
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        childProcess.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, execConfig.timeout);

      // Capture stdout
      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= execConfig.maxBuffer) {
          stdout += chunk;
        }
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= execConfig.maxBuffer) {
          stderr += chunk;
        }
      });

      // Handle completion
      childProcess.on('close', (exitCode, signal) => {
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        resolve({
          success: exitCode === 0 && !timedOut,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          signal,
          command,
          args,
          duration,
          timedOut,
          error: timedOut
            ? `Command timed out after ${execConfig.timeout}ms`
            : exitCode !== 0
            ? `Command exited with code ${exitCode}`
            : undefined,
        });
      });

      // Handle errors
      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);

        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: null,
          signal: null,
          command,
          args,
          duration: Date.now() - startTime,
          timedOut: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Ensure working directory exists and is accessible
   */
  private async ensureWorkingDirectory(dir: string): Promise<void> {
    try {
      // Check if directory exists and is accessible
      await access(dir, constants.R_OK | constants.W_OK | constants.X_OK);
    } catch (error) {
      // Try to create directory
      await mkdir(dir, { recursive: true });

      // Verify it's now accessible
      await access(dir, constants.R_OK | constants.W_OK | constants.X_OK);
    }
  }

  /**
   * Get current whitelist
   */
  getWhitelist(): string[] {
    return [...this.config.whitelist];
  }

  /**
   * Check if command is allowed
   */
  isAllowed(command: string): boolean {
    return this.config.whitelist.includes(command);
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<CommandConfig> {
    return { ...this.config };
  }
}
