import { z } from 'zod';

/**
 * Task definition schema (optional YAML frontmatter + markdown content)
 */
export const TaskMetadataSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  requires: z.array(z.string()).optional(), // Required templates, checklists, etc.
  permissions: z.object({
    owner: z.string().optional(),
    editors: z.array(z.string()).optional(),
  }).optional(),
}).optional();

export type TaskMetadata = z.infer<typeof TaskMetadataSchema>;

/**
 * Task definition - markdown content with optional YAML frontmatter
 */
export interface TaskDefinition {
  metadata?: TaskMetadata;
  content: string;
  filepath: string;
}

/**
 * Custom error for task validation failures
 */
export class TaskValidationError extends Error {
  constructor(
    message: string,
    public errors?: z.ZodError
  ) {
    super(message);
    this.name = 'TaskValidationError';
  }

  getDetails(): string {
    if (!this.errors) return this.message;

    return this.errors.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');
  }
}
