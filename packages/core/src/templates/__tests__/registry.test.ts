import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRegistry, TemplateNotFoundError } from '../registry.js';
import type { TemplateDefinition } from '../schema.js';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  const createTestTemplate = (id: string, name: string): TemplateDefinition => ({
    template: {
      id,
      name,
      version: '1.0',
      output: {
        format: 'markdown',
        filename: `${id}.md`,
      },
    },
    sections: [
      {
        id: 'test-section',
        title: 'Test Section',
      },
    ],
  });

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  describe('register', () => {
    it('should register a template', () => {
      const template = createTestTemplate('test-template', 'Test Template');

      registry.register(template);

      expect(registry.size).toBe(1);
      expect(registry.has('test-template')).toBe(true);
    });

    it('should throw error if template ID already exists', () => {
      const template1 = createTestTemplate('duplicate', 'Template 1');
      const template2 = createTestTemplate('duplicate', 'Template 2');

      registry.register(template1);

      expect(() => registry.register(template2)).toThrow(
        "Template with ID 'duplicate' is already registered"
      );
    });
  });

  describe('get', () => {
    it('should retrieve registered template', () => {
      const template = createTestTemplate('test-template', 'Test Template');
      registry.register(template);

      const retrieved = registry.get('test-template');

      expect(retrieved).toBe(template);
      expect(retrieved.template.name).toBe('Test Template');
    });

    it('should throw TemplateNotFoundError if template not found', () => {
      expect(() => registry.get('non-existent')).toThrow(TemplateNotFoundError);
      expect(() => registry.get('non-existent')).toThrow('Template not found: non-existent');
    });
  });

  describe('has', () => {
    it('should return true if template exists', () => {
      const template = createTestTemplate('test-template', 'Test');
      registry.register(template);

      expect(registry.has('test-template')).toBe(true);
    });

    it('should return false if template does not exist', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no templates', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered templates', () => {
      const template1 = createTestTemplate('template1', 'Template 1');
      const template2 = createTestTemplate('template2', 'Template 2');
      const template3 = createTestTemplate('template3', 'Template 3');

      registry.register(template1);
      registry.register(template2);
      registry.register(template3);

      const templates = registry.list();

      expect(templates).toHaveLength(3);
      expect(templates).toContain(template1);
      expect(templates).toContain(template2);
      expect(templates).toContain(template3);
    });
  });

  describe('listIds', () => {
    it('should return empty array when no templates', () => {
      expect(registry.listIds()).toEqual([]);
    });

    it('should return all template IDs', () => {
      registry.register(createTestTemplate('template1', 'Template 1'));
      registry.register(createTestTemplate('template2', 'Template 2'));
      registry.register(createTestTemplate('template3', 'Template 3'));

      const ids = registry.listIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('template1');
      expect(ids).toContain('template2');
      expect(ids).toContain('template3');
    });
  });

  describe('listMetadata', () => {
    it('should return empty array when no templates', () => {
      expect(registry.listMetadata()).toEqual([]);
    });

    it('should return metadata for all templates', () => {
      registry.register(createTestTemplate('template1', 'Template 1'));
      registry.register(createTestTemplate('template2', 'Template 2'));

      const metadata = registry.listMetadata();

      expect(metadata).toHaveLength(2);
      expect(metadata[0]).toMatchObject({
        id: 'template1',
        name: 'Template 1',
        version: '1.0',
        outputFormat: 'markdown',
      });
      expect(metadata[1]).toMatchObject({
        id: 'template2',
        name: 'Template 2',
        version: '1.0',
        outputFormat: 'markdown',
      });
    });
  });

  describe('unregister', () => {
    it('should unregister a template', () => {
      const template = createTestTemplate('test-template', 'Test');
      registry.register(template);

      expect(registry.has('test-template')).toBe(true);

      const result = registry.unregister('test-template');

      expect(result).toBe(true);
      expect(registry.has('test-template')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('should return false if template does not exist', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all templates', () => {
      registry.register(createTestTemplate('template1', 'Template 1'));
      registry.register(createTestTemplate('template2', 'Template 2'));
      registry.register(createTestTemplate('template3', 'Template 3'));

      expect(registry.size).toBe(3);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.list()).toEqual([]);
    });
  });

  describe('size', () => {
    it('should return 0 when no templates', () => {
      expect(registry.size).toBe(0);
    });

    it('should return correct count of registered templates', () => {
      expect(registry.size).toBe(0);

      registry.register(createTestTemplate('template1', 'Template 1'));
      expect(registry.size).toBe(1);

      registry.register(createTestTemplate('template2', 'Template 2'));
      expect(registry.size).toBe(2);

      registry.unregister('template1');
      expect(registry.size).toBe(1);

      registry.clear();
      expect(registry.size).toBe(0);
    });
  });
});
