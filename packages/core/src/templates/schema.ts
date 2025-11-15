import { z } from 'zod';

/**
 * Zod schema for YAML template validation
 */

// Output configuration
const OutputSchema = z.object({
  format: z.enum(['markdown', 'html', 'json', 'yaml']),
  filename: z.string(),
  title: z.string().optional(),
});

// Workflow configuration
const WorkflowSchema = z.object({
  mode: z.enum(['interactive', 'automated', 'non-interactive']),
  elicitation: z.string().optional(),
});

// Section schema (recursive for nested sections)
const BaseSectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(), // Optional for some legacy templates
  instruction: z.string().optional(),
  content: z.string().optional(), // Static content (non-interactive templates)
  type: z
    .enum([
      'paragraphs',
      'bullet-list',
      'numbered-list',
      'table',
      'code',
      'custom',
      'mermaid',
      'choice',
      'template-text',
      'checklist',
    ])
    .optional(),
  elicit: z.boolean().optional(),
  condition: z.string().optional(),
  repeatable: z.boolean().optional(),
  template: z.string().optional(),
  item_template: z.string().optional(),
  prefix: z.string().optional(),
  columns: z.array(z.string()).optional(),
  choices: z.union([z.record(z.array(z.string())), z.array(z.string())]).optional(), // Can be object or array
  examples: z.array(z.string()).optional(),
  items: z
    .array(
      z.union([
        z.string(), // Simple string items
        z.record(z.any()), // Any object structure (including YAML key-value pairs from [[LLM: ...]] annotations)
      ])
    )
    .optional(), // For checklist-style sections
});

// Recursive type for sections with nested sections
export type Section = z.infer<typeof BaseSectionSchema> & {
  sections?: Section[];
};

const SectionSchema: z.ZodType<Section> = BaseSectionSchema.extend({
  sections: z.lazy(() => z.array(SectionSchema).optional()),
});

// Root template schema
export const TemplateSchema = z.object({
  template: z.object({
    id: z.string(),
    name: z.string(),
    version: z.union([z.string(), z.number()]),
    output: OutputSchema,
  }),
  workflow: WorkflowSchema.optional(),
  sections: z.array(SectionSchema).optional(), // Optional for non-interactive templates (e.g., YAML-to-YAML templates)
});

// TypeScript types derived from Zod schemas
export type TemplateDefinition = z.infer<typeof TemplateSchema>;
export type TemplateMetadata = z.infer<typeof TemplateSchema>['template'];
export type WorkflowConfig = z.infer<typeof WorkflowSchema>;
export type OutputConfig = z.infer<typeof OutputSchema>;

/**
 * Custom error for template validation failures
 */
export class TemplateValidationError extends Error {
  constructor(
    message: string,
    public errors?: z.ZodError
  ) {
    super(message);
    this.name = 'TemplateValidationError';
  }

  /**
   * Get formatted error details
   */
  getDetails(): string {
    if (!this.errors) return this.message;

    return this.errors.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('\n');
  }
}
