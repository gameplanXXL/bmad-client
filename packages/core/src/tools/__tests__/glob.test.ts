import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackToolExecutor } from '../fallback-executor.js';

describe('FallbackToolExecutor - glob_pattern Tool', () => {
  let executor: FallbackToolExecutor;

  beforeEach(() => {
    executor = new FallbackToolExecutor();

    // Setup test VFS with various files
    executor.initializeFiles({
      '/.bmad-core/agents/pm.md': '# PM Agent',
      '/.bmad-core/agents/architect.md': '# Architect Agent',
      '/.bmad-core/agents/dev.md': '# Dev Agent',
      '/.bmad-core/agents/qa.md': '# QA Agent',
      '/.bmad-core/templates/prd-tmpl.yaml': 'template: prd',
      '/.bmad-core/templates/story-tmpl.yaml': 'template: story',
      '/.bmad-core/tasks/create-doc.md': '# Create Document Task',
      '/docs/readme.md': '# Readme',
      '/docs/guide.md': '# Guide',
      '/src/index.ts': 'console.log("hello")',
      '/src/utils/helper.ts': 'export const helper = () => {}',
      '/src/components/Button.tsx': 'export const Button = () => {}',
    });
  });

  describe('Basic Pattern Matching', () => {
    it('should find all agent files with exact pattern', async () => {
      const result = await executor.execute({
        id: 'test-1',
        name: 'glob_pattern',
        input: {
          pattern: '/.bmad-core/agents/*.md',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(4);
      expect(result.metadata?.matches).toEqual([
        '/.bmad-core/agents/architect.md',
        '/.bmad-core/agents/dev.md',
        '/.bmad-core/agents/pm.md',
        '/.bmad-core/agents/qa.md',
      ]);
    });

    it('should find files with relative pattern from root', async () => {
      const result = await executor.execute({
        id: 'test-2',
        name: 'glob_pattern',
        input: {
          pattern: '.bmad-core/agents/*.md',
          path: '/',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(4);
    });

    it('should find all markdown files', async () => {
      const result = await executor.execute({
        id: 'test-3',
        name: 'glob_pattern',
        input: {
          pattern: '**/*.md',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(7); // 4 agents + 1 task + 2 docs
      expect(result.metadata?.matches).toContain('/.bmad-core/agents/pm.md');
      expect(result.metadata?.matches).toContain('/docs/readme.md');
    });

    it('should find all TypeScript files', async () => {
      const result = await executor.execute({
        id: 'test-4',
        name: 'glob_pattern',
        input: {
          pattern: '**/*.ts',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
      expect(result.metadata?.matches).toEqual(['/src/index.ts', '/src/utils/helper.ts']);
    });

    it('should find all YAML files', async () => {
      const result = await executor.execute({
        id: 'test-5',
        name: 'glob_pattern',
        input: {
          pattern: '**/*.yaml',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
      expect(result.metadata?.matches).toContain('/.bmad-core/templates/prd-tmpl.yaml');
    });
  });

  describe('Wildcard Patterns', () => {
    it('should support single wildcard in filename', async () => {
      const result = await executor.execute({
        id: 'test-6',
        name: 'glob_pattern',
        input: {
          pattern: '/.bmad-core/templates/*-tmpl.yaml',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
    });

    it('should support double wildcard for recursive search', async () => {
      const result = await executor.execute({
        id: 'test-7',
        name: 'glob_pattern',
        input: {
          pattern: '/.bmad-core/**/*.md',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(5); // 4 agents + 1 task
    });

    it('should find files in src directory recursively', async () => {
      const result = await executor.execute({
        id: 'test-8',
        name: 'glob_pattern',
        input: {
          pattern: '/src/**/*',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(3);
    });
  });

  describe('Specific Directories', () => {
    it('should find all files in docs directory', async () => {
      const result = await executor.execute({
        id: 'test-9',
        name: 'glob_pattern',
        input: {
          pattern: '/docs/*',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
      expect(result.metadata?.matches).toEqual(['/docs/guide.md', '/docs/readme.md']);
    });

    it('should find files with relative path', async () => {
      const result = await executor.execute({
        id: 'test-10',
        name: 'glob_pattern',
        input: {
          pattern: 'agents/*.md',
          path: '/.bmad-core',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(4);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty result when no matches', async () => {
      const result = await executor.execute({
        id: 'test-11',
        name: 'glob_pattern',
        input: {
          pattern: '/*.xyz',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(0);
      expect(result.metadata?.matches).toEqual([]);
      expect(result.content).toContain('No files matching pattern');
    });

    it('should handle pattern with no wildcards', async () => {
      const result = await executor.execute({
        id: 'test-12',
        name: 'glob_pattern',
        input: {
          pattern: '/docs/readme.md',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(1);
      expect(result.metadata?.matches).toEqual(['/docs/readme.md']);
    });

    it('should handle empty VFS', async () => {
      const emptyExecutor = new FallbackToolExecutor();

      const result = await emptyExecutor.execute({
        id: 'test-13',
        name: 'glob_pattern',
        input: {
          pattern: '**/*',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(0);
    });

    it('should sort results alphabetically', async () => {
      const result = await executor.execute({
        id: 'test-14',
        name: 'glob_pattern',
        input: {
          pattern: '/.bmad-core/agents/*.md',
        },
      });

      expect(result.success).toBe(true);
      const matches = result.metadata?.matches as string[];
      expect(matches[0]).toBe('/.bmad-core/agents/architect.md');
      expect(matches[1]).toBe('/.bmad-core/agents/dev.md');
      expect(matches[2]).toBe('/.bmad-core/agents/pm.md');
      expect(matches[3]).toBe('/.bmad-core/agents/qa.md');
    });
  });

  describe('Output Format', () => {
    it('should return newline-separated list in content', async () => {
      const result = await executor.execute({
        id: 'test-15',
        name: 'glob_pattern',
        input: {
          pattern: '/docs/*.md',
        },
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('/docs/guide.md\n/docs/readme.md');
    });

    it('should include metadata with count, matches, and pattern', async () => {
      const result = await executor.execute({
        id: 'test-16',
        name: 'glob_pattern',
        input: {
          pattern: '**/*.yaml',
        },
      });

      expect(result.metadata).toHaveProperty('count');
      expect(result.metadata).toHaveProperty('matches');
      expect(result.metadata).toHaveProperty('pattern');
      expect(result.metadata?.pattern).toBe('/**/*.yaml');
    });
  });

  describe('Directory Markers', () => {
    it('should skip directory markers in results', async () => {
      executor.initializeFiles({
        '/test/.directory': '',
        '/test/file.txt': 'content',
      });

      const result = await executor.execute({
        id: 'test-17',
        name: 'glob_pattern',
        input: {
          pattern: '/test/*',
        },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(1);
      expect(result.metadata?.matches).toEqual(['/test/file.txt']);
      expect(result.metadata?.matches).not.toContain('/test/.directory');
    });
  });
});
