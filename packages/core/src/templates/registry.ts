import type { TemplateDefinition } from './schema.js';

/**
 * Custom error for template not found
 */
export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

/**
 * Template Registry - Central store for loaded templates
 */
export class TemplateRegistry {
  private templates: Map<string, TemplateDefinition> = new Map();

  /**
   * Register a template
   *
   * @param template - Template definition to register
   * @throws Error if template with same ID already exists
   */
  register(template: TemplateDefinition): void {
    const id = template.template.id;

    if (this.templates.has(id)) {
      throw new Error(`Template with ID '${id}' is already registered`);
    }

    this.templates.set(id, template);
  }

  /**
   * Get a template by ID
   *
   * @param templateId - Template ID to retrieve
   * @returns Template definition
   * @throws TemplateNotFoundError if template not found
   */
  get(templateId: string): TemplateDefinition {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new TemplateNotFoundError(templateId);
    }

    return template;
  }

  /**
   * Check if template exists
   *
   * @param templateId - Template ID to check
   * @returns true if template exists
   */
  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * List all registered templates
   *
   * @returns Array of template definitions
   */
  list(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all template IDs
   *
   * @returns Array of template IDs
   */
  listIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get template metadata summary
   *
   * @returns Array of template metadata
   */
  listMetadata(): Array<{
    id: string;
    name: string;
    version: string | number;
    outputFormat: string;
  }> {
    return this.list().map((template) => ({
      id: template.template.id,
      name: template.template.name,
      version: template.template.version,
      outputFormat: template.template.output.format,
    }));
  }

  /**
   * Clear all templates (useful for testing)
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Get number of registered templates
   */
  get size(): number {
    return this.templates.size;
  }

  /**
   * Unregister a template
   *
   * @param templateId - Template ID to unregister
   * @returns true if template was unregistered, false if not found
   */
  unregister(templateId: string): boolean {
    return this.templates.delete(templateId);
  }
}
