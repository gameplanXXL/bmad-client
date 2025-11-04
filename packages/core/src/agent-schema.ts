import { z } from 'zod';

/**
 * Zod schema for validating AgentDefinition from YAML frontmatter
 */
export const AgentDefinitionSchema = z.object({
  agent: z.object({
    name: z.string(),
    id: z.string(),
    title: z.string(),
    icon: z.string(),
    whenToUse: z.string(),
    customization: z.string().optional(),
  }),
  persona: z.object({
    role: z.string(),
    style: z.string(),
    identity: z.string(),
    focus: z.string(),
    core_principles: z.array(z.string()),
  }),
  commands: z.array(z.string()),
  dependencies: z.object({
    tasks: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    checklists: z.array(z.string()).optional(),
    data: z.array(z.string()).optional(),
  }),
  activation_instructions: z.array(z.string()).optional(),
});

export type ParsedAgentDefinition = z.infer<typeof AgentDefinitionSchema>;
