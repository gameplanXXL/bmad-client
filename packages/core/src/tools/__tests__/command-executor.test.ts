/**
 * Tests for CommandExecutor - Safe system command execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CommandExecutor,
  CommandNotAllowedError,
  CONTENT_CREATION_WHITELIST,
} from '../command-executor.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';

describe('CommandExecutor', () => {
  let executor: CommandExecutor;
  let testDir: string;

  beforeEach(async () => {
    executor = new CommandExecutor();
    // Create temporary directory for tests
    testDir = await mkdtemp(join(tmpdir(), 'bmad-cmd-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Configuration', () => {
    it('should use default whitelist when none provided', () => {
      const executor = new CommandExecutor();
      expect(executor.getWhitelist()).toContain('echo');
      expect(executor.getWhitelist()).toContain('cat');
      expect(executor.getWhitelist()).toContain('ls');
    });

    it('should accept custom whitelist', () => {
      const executor = new CommandExecutor({
        whitelist: ['echo', 'cat', 'pandoc'],
      });

      expect(executor.getWhitelist()).toEqual(['echo', 'cat', 'pandoc']);
      expect(executor.isAllowed('echo')).toBe(true);
      expect(executor.isAllowed('pandoc')).toBe(true);
      expect(executor.isAllowed('rm')).toBe(false);
    });

    it('should accept custom timeout', () => {
      const executor = new CommandExecutor({
        timeout: 1000,
      });

      const config = executor.getConfig();
      expect(config.timeout).toBe(1000);
    });

    it('should accept custom working directory', () => {
      const executor = new CommandExecutor({
        workingDirectory: '/tmp',
      });

      const config = executor.getConfig();
      expect(config.workingDirectory).toBe('/tmp');
    });

    it('should support CONTENT_CREATION_WHITELIST', () => {
      const executor = new CommandExecutor({
        whitelist: CONTENT_CREATION_WHITELIST,
      });

      expect(executor.isAllowed('pandoc')).toBe(true);
      expect(executor.isAllowed('pdflatex')).toBe(true);
      expect(executor.isAllowed('wkhtmltopdf')).toBe(true);
      expect(executor.isAllowed('make')).toBe(true);
    });
  });

  describe('Whitelist Validation', () => {
    it('should reject non-whitelisted commands', async () => {
      await expect(executor.execute('rm', ['-rf', '/'])).rejects.toThrow(CommandNotAllowedError);
    });

    it('should reject non-whitelisted commands with helpful message', async () => {
      try {
        await executor.execute('dangerous-command', []);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandNotAllowedError);
        expect((error as Error).message).toContain('dangerous-command');
        expect((error as Error).message).toContain('not in the whitelist');
      }
    });

    it('should allow whitelisted commands', async () => {
      const result = await executor.execute('echo', ['hello']);
      expect(result.success).toBe(true);
    });
  });

  describe('Command Execution - echo', () => {
    it('should execute echo command successfully', async () => {
      const result = await executor.execute('echo', ['Hello, World!']);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello, World!');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.command).toBe('echo');
      expect(result.args).toEqual(['Hello, World!']);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.timedOut).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should handle multiline output', async () => {
      const result = await executor.execute('echo', ['-e', 'Line 1\\nLine 2\\nLine 3']);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 2');
      expect(result.stdout).toContain('Line 3');
    });

    it('should handle empty output', async () => {
      const result = await executor.execute('echo', ['-n', '']);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
    });
  });

  describe('Command Execution - cat', () => {
    it('should read file contents', async () => {
      // Create test file
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'Test content\n');

      const result = await executor.execute('cat', [testFile], {
        workingDirectory: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Test content');
      expect(result.exitCode).toBe(0);
    });

    it('should handle non-existent file', async () => {
      const result = await executor.execute('cat', ['/non/existent/file.txt']);

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No such file');
    });
  });

  describe('Command Execution - ls', () => {
    it('should list directory contents', async () => {
      // Create test files
      await writeFile(join(testDir, 'file1.txt'), 'content1');
      await writeFile(join(testDir, 'file2.txt'), 'content2');

      const result = await executor.execute('ls', [testDir]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('file1.txt');
      expect(result.stdout).toContain('file2.txt');
      expect(result.exitCode).toBe(0);
    });

    it('should handle empty directory', async () => {
      const result = await executor.execute('ls', [testDir]);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Working Directory', () => {
    it('should use configured working directory', async () => {
      const executor = new CommandExecutor({
        workingDirectory: testDir,
      });

      const result = await executor.execute('pwd', []);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe(testDir);
    });

    it('should override working directory per-execution', async () => {
      const result = await executor.execute('pwd', [], {
        workingDirectory: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe(testDir);
    });

    it('should create working directory if it does not exist', async () => {
      const newDir = join(testDir, 'new-subdir');

      const executor = new CommandExecutor({
        workingDirectory: newDir,
      });

      const result = await executor.execute('pwd', []);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe(newDir);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running commands', async () => {
      const executor = new CommandExecutor({
        timeout: 100, // 100ms timeout
      });

      // sleep command that takes 1 second
      const result = await executor.execute('sleep', ['1'], {
        whitelist: ['sleep'],
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timed out');
    });

    it('should not timeout fast commands', async () => {
      const executor = new CommandExecutor({
        timeout: 5000, // 5 second timeout
      });

      const result = await executor.execute('echo', ['fast']);

      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.duration).toBeLessThan(1000);
    });
  });

  describe('Environment Variables', () => {
    it('should inject custom environment variables', async () => {
      const executor = new CommandExecutor({
        env: {
          CUSTOM_VAR: 'test-value',
        },
        whitelist: ['sh'],
      });

      const result = await executor.execute('sh', ['-c', 'echo $CUSTOM_VAR']);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('test-value');
    });

    it('should inherit process environment', async () => {
      const executor = new CommandExecutor({
        whitelist: ['sh'],
      });

      // PATH should be inherited
      const result = await executor.execute('sh', ['-c', 'echo $PATH']);

      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('Output Buffering', () => {
    it('should capture large stdout', async () => {
      const executor = new CommandExecutor({
        whitelist: ['sh'],
      });

      // Generate ~1KB of output
      const result = await executor.execute('sh', [
        '-c',
        'for i in $(seq 1 100); do echo "Line $i with some extra text"; done',
      ]);

      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(1000);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 100');
    });

    it('should respect maxBuffer limit', async () => {
      const executor = new CommandExecutor({
        maxBuffer: 100, // Only 100 bytes
        whitelist: ['sh'],
      });

      // Generate large output
      const result = await executor.execute('sh', [
        '-c',
        'for i in $(seq 1 100); do echo "Line $i"; done',
      ]);

      // Output should be truncated to maxBuffer
      expect(result.stdout.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle command not found', async () => {
      const executor = new CommandExecutor({
        whitelist: ['nonexistent-command-xyz'],
      });

      const result = await executor.execute('nonexistent-command-xyz', []);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.exitCode).toBeNull();
    });

    it('should handle command with non-zero exit code', async () => {
      const executor = new CommandExecutor({
        whitelist: ['sh'],
      });

      const result = await executor.execute('sh', ['-c', 'exit 42']);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
      expect(result.error).toContain('exited with code 42');
    });

    it('should capture stderr on failure', async () => {
      const result = await executor.execute('cat', ['/non/existent/file.txt']);

      expect(result.success).toBe(false);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.stderr).toContain('No such file');
    });
  });

  describe('Metadata and Tracking', () => {
    it('should track execution duration', async () => {
      const result = await executor.execute('echo', ['test']);

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(1000); // Should be very fast
    });

    it('should preserve command and args in result', async () => {
      const result = await executor.execute('echo', ['-n', 'hello', 'world']);

      expect(result.command).toBe('echo');
      expect(result.args).toEqual(['-n', 'hello', 'world']);
    });
  });

  describe('Security', () => {
    it('should not allow shell injection via command', async () => {
      await expect(executor.execute('echo; rm -rf /', [])).rejects.toThrow(CommandNotAllowedError);
    });

    it('should not use shell by default', async () => {
      const executor = new CommandExecutor({
        whitelist: ['echo'],
      });

      // Pipe should not work (requires shell)
      const result = await executor.execute('echo', ['test | cat']);

      // Output should be literal (not piped)
      expect(result.stdout).toBe('test | cat');
    });

    it('should not allow path traversal in whitelist', async () => {
      await expect(executor.execute('../../../bin/rm', [])).rejects.toThrow(CommandNotAllowedError);
    });
  });

  describe('Real-world Content Creation Commands', () => {
    it('should define pandoc in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('pandoc');
    });

    it('should define pdflatex in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('pdflatex');
    });

    it('should define wkhtmltopdf in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('wkhtmltopdf');
    });

    it('should define make in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('make');
    });

    it('should define npm in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('npm');
    });

    it('should define python3 in CONTENT_CREATION_WHITELIST', () => {
      expect(CONTENT_CREATION_WHITELIST).toContain('python3');
    });
  });
});
