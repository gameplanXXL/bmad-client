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
    customization: z.string().nullable().optional(),
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
    core_principles: z.array(z.string()).optional(),
  }).optional(),
  // Commands can be either:
  // 1. String array (Core agents): ['*help', '*plan']
  // 2. Object array (Expansion Pack agents): [{ help: 'Show commands' }]
  // 3. Mixed array (some strings, some objects with nested structures)
  // Allow any structure within command objects to support complex command definitions
  commands: z.union([
    z.array(z.string()),
    z.array(z.record(z.string(), z.any())),
    z.array(z.union([z.string(), z.record(z.string(), z.any())])),
  ]).optional(),
  tools: z.array(z.string()).optional(),
  dependencies: z.object({
    tasks: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    checklists: z.array(z.string()).optional(),
    data: z.array(z.string()).optional(),
    utils: z.array(z.string()).optional(),
    workflows: z.array(z.string()).optional(),
  }).optional(),
  activation_instructions: z.array(z.string()).optional(),
  // Meta fields used by BMad orchestration (flexible schema)
  'IDE-FILE-RESOLUTION': z.any().optional(),
  'REQUEST-RESOLUTION': z.any().optional(),
});

export type ParsedAgentDefinition = z.infer<typeof AgentDefinitionSchema>;
