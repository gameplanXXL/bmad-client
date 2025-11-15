import { parse as parseYaml } from 'yaml';
import { TemplateSchema } from './schema.js';
import type { TemplateDefinition, Section } from './schema.js';
import { TemplateValidationError } from './schema.js';

/**
 * Parse YAML template content and validate against schema
 *
 * @param yamlContent - Raw YAML template content
 * @returns Validated TemplateDefinition
 * @throws TemplateValidationError if validation fails
 *
 * @example
 * ```typescript
 * const templateYaml = await readFile('prd-tmpl.yaml', 'utf-8');
 * const template = parseTemplate(templateYaml);
 * console.log(template.template.id); // 'prd-template-v2'
 * ```
 */
export function parseTemplate(yamlContent: string): TemplateDefinition {
  try {
    // Parse YAML
    const parsed = parseYaml(yamlContent);

    if (!parsed) {
      throw new TemplateValidationError('Template file is empty or contains only comments');
    }

    // Validate against schema
    const result = TemplateSchema.safeParse(parsed);

    if (!result.success) {
      throw new TemplateValidationError('Template validation failed', result.error);
    }

    return result.data;
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      throw error;
    }

    // Handle YAML parsing errors
    if (error instanceof Error) {
      throw new TemplateValidationError(`Failed to parse YAML template: ${error.message}`);
    }

    throw new TemplateValidationError('Unknown error parsing template');
  }
}

/**
 * Validate a template object (already parsed)
 *
 * @param templateObj - Template object to validate
 * @returns Validated TemplateDefinition
 * @throws TemplateValidationError if validation fails
 */
export function validateTemplate(templateObj: unknown): TemplateDefinition {
  const result = TemplateSchema.safeParse(templateObj);

  if (!result.success) {
    throw new TemplateValidationError('Template validation failed', result.error);
  }

  return result.data;
}

/**
 * Check if a template has elicitation requirements
 *
 * @param template - Template to check
 * @returns true if any section has elicit: true
 */
export function hasElicitation(template: TemplateDefinition): boolean {
  const checkSections = (sections: Section[]): boolean => {
    return sections.some((section) => {
      if (section.elicit) return true;
      if (section.sections) return checkSections(section.sections);
      return false;
    });
  };

  return template.sections ? checkSections(template.sections) : false;
}

/**
 * Extract all section IDs from template (flattened)
 *
 * @param template - Template to extract IDs from
 * @returns Array of all section IDs
 */
export function extractSectionIds(template: TemplateDefinition): string[] {
  const ids: string[] = [];

  const collectIds = (sections: Section[]): void => {
    sections.forEach((section) => {
      ids.push(section.id);
      if (section.sections) {
        collectIds(section.sections);
      }
    });
  };

  if (template.sections) {
    collectIds(template.sections);
  }
  return ids;
}

/**
 * Get template metadata summary
 *
 * @param template - Template to summarize
 * @returns Summary object
 */
export function getTemplateSummary(template: TemplateDefinition) {
  return {
    id: template.template.id,
    name: template.template.name,
    version: template.template.version,
    outputFormat: template.template.output.format,
    outputFile: template.template.output.filename,
    mode: template.workflow?.mode || 'automated',
    sectionCount: extractSectionIds(template).length,
    hasElicitation: hasElicitation(template),
    isRepeatable: template.sections?.some((s) => s.repeatable) ?? false,
  };
}
