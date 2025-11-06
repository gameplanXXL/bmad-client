import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { TemplateLoader } from '../loader.js';
import { TemplateRegistry } from '../registry.js';

describe('TemplateLoader', () => {
  const testDir = join(process.cwd(), '.test-templates');
  let loader: TemplateLoader;
  let registry: TemplateRegistry;

  const validTemplateYaml = `
template:
  id: test-template
  name: Test Template
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
`;

  beforeEach(async () => {
    loader = new TemplateLoader();
    registry = new TemplateRegistry();
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('loadTemplate', () => {
    it('should load a valid template file', async () => {
      const templatePath = join(testDir, 'test.yaml');
      await writeFile(templatePath, validTemplateYaml, 'utf-8');

      const template = await loader.loadTemplate(templatePath);

      expect(template.template.id).toBe('test-template');
      expect(template.template.name).toBe('Test Template');
    });

    it('should throw error for invalid template', async () => {
      const templatePath = join(testDir, 'invalid.yaml');
      await writeFile(templatePath, 'invalid: yaml\nno template key', 'utf-8');

      await expect(loader.loadTemplate(templatePath)).rejects.toThrow();
    });

    it('should throw error for non-existent file', async () => {
      await expect(loader.loadTemplate(join(testDir, 'missing.yaml'))).rejects.toThrow();
    });
  });

  describe('loadFromDirectory', () => {
    it('should load all YAML files from directory', async () => {
      // Create multiple template files
      await writeFile(join(testDir, 'template1.yaml'), validTemplateYaml.replace('test-template', 'template1'), 'utf-8');
      await writeFile(join(testDir, 'template2.yaml'), validTemplateYaml.replace('test-template', 'template2'), 'utf-8');
      await writeFile(join(testDir, 'template3.yml'), validTemplateYaml.replace('test-template', 'template3'), 'utf-8');

      // Create non-YAML files (should be ignored)
      await writeFile(join(testDir, 'readme.md'), '# README', 'utf-8');
      await writeFile(join(testDir, 'config.json'), '{}', 'utf-8');

      const templates = await loader.loadFromDirectory(testDir);

      expect(templates).toHaveLength(3);
      expect(templates.map(t => t.template.id).sort()).toEqual(['template1', 'template2', 'template3']);
    });

    it('should return empty array for non-existent directory', async () => {
      const templates = await loader.loadFromDirectory(join(testDir, 'non-existent'));

      expect(templates).toEqual([]);
    });

    it('should skip invalid templates and continue loading', async () => {
      await writeFile(join(testDir, 'valid.yaml'), validTemplateYaml, 'utf-8');
      await writeFile(join(testDir, 'invalid.yaml'), 'invalid yaml content', 'utf-8');
      await writeFile(join(testDir, 'valid2.yaml'), validTemplateYaml.replace('test-template', 'template2'), 'utf-8');

      const templates = await loader.loadFromDirectory(testDir);

      // Should load 2 valid templates, skipping the invalid one
      expect(templates).toHaveLength(2);
      expect(templates.map(t => t.template.id).sort()).toEqual(['template2', 'test-template']);
    });

    it('should return empty array for empty directory', async () => {
      const templates = await loader.loadFromDirectory(testDir);

      expect(templates).toEqual([]);
    });
  });

  describe('loadAndRegister', () => {
    it('should load templates and register them', async () => {
      await writeFile(join(testDir, 'template1.yaml'), validTemplateYaml.replace('test-template', 'template1'), 'utf-8');
      await writeFile(join(testDir, 'template2.yaml'), validTemplateYaml.replace('test-template', 'template2'), 'utf-8');

      const count = await loader.loadAndRegister(testDir, registry);

      expect(count).toBe(2);
      expect(registry.size).toBe(2);
      expect(registry.has('template1')).toBe(true);
      expect(registry.has('template2')).toBe(true);
    });

    it('should return 0 for non-existent directory', async () => {
      const count = await loader.loadAndRegister(join(testDir, 'non-existent'), registry);

      expect(count).toBe(0);
      expect(registry.size).toBe(0);
    });

    it('should handle registration errors gracefully', async () => {
      // Pre-register a template
      const template = {
        template: {
          id: 'duplicate',
          name: 'Existing',
          version: '1.0',
          output: {
            format: 'markdown' as const,
            filename: 'test.md',
          },
        },
        sections: [{ id: 'test', title: 'Test' }],
      };
      registry.register(template);

      // Try to load a duplicate
      await writeFile(join(testDir, 'duplicate.yaml'), validTemplateYaml.replace('test-template', 'duplicate'), 'utf-8');
      await writeFile(join(testDir, 'new.yaml'), validTemplateYaml.replace('test-template', 'new'), 'utf-8');

      const count = await loader.loadAndRegister(testDir, registry);

      // Should register the new one, skip the duplicate
      expect(count).toBe(1);
      expect(registry.size).toBe(2); // Original + new
      expect(registry.has('new')).toBe(true);
    });
  });

  describe('loadFromMultiplePaths', () => {
    it('should load templates from multiple directories', async () => {
      const dir1 = join(testDir, 'dir1');
      const dir2 = join(testDir, 'dir2');

      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });

      await writeFile(join(dir1, 'template1.yaml'), validTemplateYaml.replace('test-template', 'template1'), 'utf-8');
      await writeFile(join(dir2, 'template2.yaml'), validTemplateYaml.replace('test-template', 'template2'), 'utf-8');

      const count = await loader.loadFromMultiplePaths([dir1, dir2], registry);

      expect(count).toBe(2);
      expect(registry.size).toBe(2);
      expect(registry.has('template1')).toBe(true);
      expect(registry.has('template2')).toBe(true);
    });

    it('should continue loading if one path fails', async () => {
      const dir1 = join(testDir, 'dir1');
      await mkdir(dir1, { recursive: true });
      await writeFile(join(dir1, 'template1.yaml'), validTemplateYaml.replace('test-template', 'template1'), 'utf-8');

      const count = await loader.loadFromMultiplePaths(
        [dir1, join(testDir, 'non-existent'), dir1],
        registry
      );

      // Should still load from dir1 (twice = 1 unique template)
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('loadFromExpansionPacks', () => {
    it('should discover and load templates from expansion packs', async () => {
      const pack1 = join(testDir, '.bmad-pack1');
      const pack2 = join(testDir, '.bmad-pack2');

      await mkdir(join(pack1, 'templates'), { recursive: true });
      await mkdir(join(pack2, 'templates'), { recursive: true });

      await writeFile(
        join(pack1, 'templates', 'template1.yaml'),
        validTemplateYaml.replace('test-template', 'pack1-template'),
        'utf-8'
      );

      await writeFile(
        join(pack2, 'templates', 'template2.yaml'),
        validTemplateYaml.replace('test-template', 'pack2-template'),
        'utf-8'
      );

      const count = await loader.loadFromExpansionPacks([testDir], registry);

      expect(count).toBe(2);
      expect(registry.has('pack1-template')).toBe(true);
      expect(registry.has('pack2-template')).toBe(true);
    });

    it('should skip expansion packs without templates directory', async () => {
      const pack1 = join(testDir, '.bmad-no-templates');
      await mkdir(pack1, { recursive: true });

      const count = await loader.loadFromExpansionPacks([testDir], registry);

      expect(count).toBe(0);
    });

    it('should skip non-.bmad directories', async () => {
      const regularDir = join(testDir, 'regular-dir');
      await mkdir(join(regularDir, 'templates'), { recursive: true });

      await writeFile(
        join(regularDir, 'templates', 'template.yaml'),
        validTemplateYaml,
        'utf-8'
      );

      const count = await loader.loadFromExpansionPacks([testDir], registry);

      // Should not load from regular-dir
      expect(count).toBe(0);
    });

    it('should handle non-existent search paths gracefully', async () => {
      const count = await loader.loadFromExpansionPacks([join(testDir, 'non-existent')], registry);

      expect(count).toBe(0);
    });
  });
});
