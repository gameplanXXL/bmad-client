import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackToolExecutor } from '../fallback-executor.js';

describe('FallbackToolExecutor', () => {
  let executor: FallbackToolExecutor;

  beforeEach(() => {
    executor = new FallbackToolExecutor();
  });

  describe('getTools', () => {
    it('should return all tool definitions', () => {
      const tools = executor.getTools();

      expect(tools).toHaveLength(5);
      expect(tools.map((t) => t.name)).toEqual([
        'read_file',
        'write_file',
        'edit_file',
        'list_files',
        'bash_command',
      ]);
    });

    it('should have proper tool schemas', () => {
      const tools = executor.getTools();
      const readFile = tools.find((t) => t.name === 'read_file')!;

      expect(readFile.description).toBeDefined();
      expect(readFile.input_schema.type).toBe('object');
      expect(readFile.input_schema.required).toContain('file_path');
    });
  });

  describe('write_file', () => {
    it('should write a new file', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'write_file',
        input: {
          file_path: '/docs/test.md',
          content: '# Test\n\nHello World',
        },
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('File written');
      expect(result.metadata?.size).toBeGreaterThan(0);
    });

    it('should require absolute path', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'write_file',
        input: {
          file_path: 'relative/path.md',
          content: 'content',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should overwrite existing file', async () => {
      await executor.execute({
        id: 'tool_1',
        name: 'write_file',
        input: { file_path: '/test.md', content: 'First' },
      });

      const result = await executor.execute({
        id: 'tool_2',
        name: 'write_file',
        input: { file_path: '/test.md', content: 'Second' },
      });

      expect(result.success).toBe(true);

      const readResult = await executor.execute({
        id: 'tool_3',
        name: 'read_file',
        input: { file_path: '/test.md' },
      });

      expect(readResult.content).toBe('Second');
    });
  });

  describe('read_file', () => {
    beforeEach(async () => {
      await executor.execute({
        id: 'setup',
        name: 'write_file',
        input: {
          file_path: '/docs/test.md',
          content: '# Test Document\n\nContent here',
        },
      });
    });

    it('should read an existing file', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'read_file',
        input: { file_path: '/docs/test.md' },
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('# Test Document\n\nContent here');
      expect(result.metadata?.size).toBeGreaterThan(0);
    });

    it('should return error for non-existent file', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'read_file',
        input: { file_path: '/does-not-exist.md' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should require absolute path', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'read_file',
        input: { file_path: 'relative.md' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });
  });

  describe('edit_file', () => {
    beforeEach(async () => {
      await executor.execute({
        id: 'setup',
        name: 'write_file',
        input: {
          file_path: '/docs/test.md',
          content: '# Hello World\n\nThis is a test document.',
        },
      });
    });

    it('should edit file with string replacement', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'edit_file',
        input: {
          file_path: '/docs/test.md',
          old_string: 'Hello World',
          new_string: 'Goodbye World',
        },
      });

      expect(result.success).toBe(true);

      const readResult = await executor.execute({
        id: 'tool_2',
        name: 'read_file',
        input: { file_path: '/docs/test.md' },
      });

      expect(readResult.content).toContain('Goodbye World');
      expect(readResult.content).not.toContain('Hello World');
    });

    it('should fail if old_string not found', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'edit_file',
        input: {
          file_path: '/docs/test.md',
          old_string: 'Does not exist',
          new_string: 'Something',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail if old_string not unique', async () => {
      await executor.execute({
        id: 'setup2',
        name: 'write_file',
        input: {
          file_path: '/docs/dup.md',
          content: 'test test test',
        },
      });

      const result = await executor.execute({
        id: 'tool_1',
        name: 'edit_file',
        input: {
          file_path: '/docs/dup.md',
          old_string: 'test',
          new_string: 'changed',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('3 times');
    });

    it('should fail for non-existent file', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'edit_file',
        input: {
          file_path: '/does-not-exist.md',
          old_string: 'old',
          new_string: 'new',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('list_files', () => {
    beforeEach(async () => {
      await executor.execute({
        id: 's1',
        name: 'write_file',
        input: { file_path: '/docs/file1.md', content: 'A' },
      });
      await executor.execute({
        id: 's2',
        name: 'write_file',
        input: { file_path: '/docs/file2.md', content: 'B' },
      });
      await executor.execute({
        id: 's3',
        name: 'write_file',
        input: { file_path: '/other/file3.md', content: 'C' },
      });
    });

    it('should list files in directory', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'list_files',
        input: { path: '/docs' },
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('/docs/file1.md');
      expect(result.content).toContain('/docs/file2.md');
      expect(result.content).not.toContain('/other/file3.md');
      expect(result.metadata?.count).toBe(2);
    });

    it('should return empty for non-existent directory', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'list_files',
        input: { path: '/nonexistent' },
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('empty');
      expect(result.metadata?.count).toBe(0);
    });

    it('should handle trailing slash', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'list_files',
        input: { path: '/docs/' },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
    });
  });

  describe('bash_command', () => {
    describe('mkdir', () => {
      it('should create directory', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: {
            command: 'mkdir -p /new/directory',
            description: 'Create directory',
          },
        });

        expect(result.success).toBe(true);
        expect(result.content).toContain('Directory created');
      });

      it('should fail without path', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'mkdir' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('missing');
      });

      it('should require absolute path', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'mkdir relative/path' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('absolute');
      });
    });

    describe('ls', () => {
      beforeEach(async () => {
        await executor.execute({
          id: 's1',
          name: 'write_file',
          input: { file_path: '/test/a.md', content: 'A' },
        });
      });

      it('should list directory', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'ls /test' },
        });

        expect(result.success).toBe(true);
        expect(result.content).toContain('/test/a.md');
      });

      it('should default to root', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'ls' },
        });

        expect(result.success).toBe(true);
      });
    });

    describe('pwd', () => {
      it('should return root directory', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'pwd' },
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('/');
      });
    });

    describe('echo', () => {
      it('should echo text', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'echo Hello World' },
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello World');
      });
    });

    describe('unsupported commands', () => {
      it('should reject dangerous commands', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'rm -rf /' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should list supported commands in error', async () => {
        const result = await executor.execute({
          id: 'tool_1',
          name: 'bash_command',
          input: { command: 'git status' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('mkdir');
        expect(result.error).toContain('ls');
      });
    });
  });

  describe('unknown tools', () => {
    it('should return error for unknown tool', async () => {
      const result = await executor.execute({
        id: 'tool_1',
        name: 'unknown_tool',
        input: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('helper methods', () => {
    describe('getDocuments', () => {
      it('should return all files as documents', async () => {
        await executor.execute({
          id: 's1',
          name: 'write_file',
          input: { file_path: '/doc1.md', content: 'Content 1' },
        });
        await executor.execute({
          id: 's2',
          name: 'write_file',
          input: { file_path: '/doc2.md', content: 'Content 2' },
        });

        const docs = executor.getDocuments();

        expect(docs).toHaveLength(2);
        expect(docs[0].path).toBe('/doc1.md');
        expect(docs[0].content).toBe('Content 1');
      });

      it('should exclude directory markers', async () => {
        await executor.execute({
          id: 's1',
          name: 'bash_command',
          input: { command: 'mkdir /test' },
        });
        await executor.execute({
          id: 's2',
          name: 'write_file',
          input: { file_path: '/test/file.md', content: 'Test' },
        });

        const docs = executor.getDocuments();

        expect(docs).toHaveLength(1);
        expect(docs[0].path).toBe('/test/file.md');
      });
    });

    describe('initializeFiles', () => {
      it('should initialize VFS with files', () => {
        executor.initializeFiles({
          '/file1.md': 'Content 1',
          '/file2.md': 'Content 2',
        });

        const docs = executor.getDocuments();
        expect(docs).toHaveLength(2);
      });
    });

    describe('clear', () => {
      it('should clear all files', async () => {
        await executor.execute({
          id: 's1',
          name: 'write_file',
          input: { file_path: '/test.md', content: 'Test' },
        });

        executor.clear();

        expect(executor.getFileCount()).toBe(0);
        expect(executor.getSize()).toBe(0);
      });
    });

    describe('getSize', () => {
      it('should calculate total size', async () => {
        await executor.execute({
          id: 's1',
          name: 'write_file',
          input: { file_path: '/test.md', content: 'Hello' }, // 5 bytes
        });

        expect(executor.getSize()).toBe(5);
      });

      it('should return 0 for empty VFS', () => {
        expect(executor.getSize()).toBe(0);
      });
    });

    describe('getFileCount', () => {
      it('should count files', async () => {
        await executor.execute({
          id: 's1',
          name: 'write_file',
          input: { file_path: '/file1.md', content: 'A' },
        });
        await executor.execute({
          id: 's2',
          name: 'write_file',
          input: { file_path: '/file2.md', content: 'B' },
        });

        expect(executor.getFileCount()).toBe(2);
      });
    });
  });
});
