import { z } from 'zod';

/**
 * Zod schema for validating AgentDefinition from YAML frontmatter
 */
export const AgentDefinitionSchema = z.object({
  agent: z.object({
    name: z.string(),
    id: z.string(),
    title: z.string().optional(),
    icon: z.string().optional(),
    whenToUse: z.string().optional(),
    customization: z.string().optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    model: z.string().optional(),
  }),
  persona: z.object({
    role: z.string(),
    style: z.string(),
    identity: z.string(),
    focus: z.string(),
    core_principles: z.array(z.string()),
  }).optional(),
  commands: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  dependencies: z.object({
    tasks: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    checklists: z.array(z.string()).optional(),
    data: z.array(z.string()).optional(),
  }).optional(),
  activation_instructions: z.array(z.string()).optional(),
});

export type ParsedAgentDefinition = z.infer<typeof AgentDefinitionSchema>;
