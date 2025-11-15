import { describe, it, expect, beforeEach } from 'vitest';
import { TaskExecutor } from '../executor.js';
import type { TaskDefinition } from '../schema.js';

describe('TaskExecutor', () => {
  let executor: TaskExecutor;

  beforeEach(() => {
    executor = new TaskExecutor();
  });

  describe('prepareTaskInstructions', () => {
    it('should return task content without metadata', () => {
      const task: TaskDefinition = {
        content: '# Task Instructions\n\nStep 1: Do something\nStep 2: Do something else',
        filepath: '/tasks/simple.md',
      };

      const instructions = executor.prepareTaskInstructions(task);

      expect(instructions).toContain('# Task Instructions');
      expect(instructions).toContain('Step 1: Do something');
      expect(instructions).toContain('Step 2: Do something else');
    });

    it('should include metadata header when metadata present', () => {
      const task: TaskDefinition = {
        metadata: {
          id: 'create-prd',
          name: 'Create PRD from Template',
          description: 'Generate a Product Requirements Document',
        },
        content: 'Task content here',
        filepath: '/tasks/create-prd.md',
      };

      const instructions = executor.prepareTaskInstructions(task);

      expect(instructions).toContain('# Task Instructions');
      expect(instructions).toContain('**Task:** Create PRD from Template');
      expect(instructions).toContain('**Description:** Generate a Product Requirements Document');
      expect(instructions).toContain('Task content here');
    });

    it('should include requirements list when present', () => {
      const task: TaskDefinition = {
        metadata: {
          requires: ['prd-tmpl.yaml', 'elicitation-methods.md'],
        },
        content: 'Task content',
        filepath: '/tasks/task.md',
      };

      const instructions = executor.prepareTaskInstructions(task);

      expect(instructions).toContain('**Requirements:**');
      expect(instructions).toContain('- prd-tmpl.yaml');
      expect(instructions).toContain('- elicitation-methods.md');
    });

    it('should format instructions correctly', () => {
      const task: TaskDefinition = {
        metadata: {
          name: 'Test Task',
          description: 'Test description',
          requires: ['resource1', 'resource2'],
        },
        content: 'Main task content',
        filepath: '/tasks/test.md',
      };

      const instructions = executor.prepareTaskInstructions(task);

      // Should have header, metadata, separator, and content
      expect(instructions).toMatch(/# Task Instructions/);
      expect(instructions).toMatch(/---/);
      expect(instructions).toContain('Main task content');
    });
  });

  describe('validateRequirements', () => {
    it('should validate task with no requirements as valid', () => {
      const task: TaskDefinition = {
        content: 'Task content',
        filepath: '/tasks/simple.md',
      };

      const availableResources = new Set(['resource1', 'resource2']);
      const result = executor.validateRequirements(task, availableResources);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should validate task when all requirements are available', () => {
      const task: TaskDefinition = {
        metadata: {
          requires: ['prd-tmpl.yaml', 'story-tmpl.yaml'],
        },
        content: 'Task content',
        filepath: '/tasks/task.md',
      };

      const availableResources = new Set([
        'prd-tmpl.yaml',
        'story-tmpl.yaml',
        'architecture-tmpl.yaml',
      ]);

      const result = executor.validateRequirements(task, availableResources);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should identify missing requirements', () => {
      const task: TaskDefinition = {
        metadata: {
          requires: ['prd-tmpl.yaml', 'missing-template.yaml', 'checklist.md'],
        },
        content: 'Task content',
        filepath: '/tasks/task.md',
      };

      const availableResources = new Set(['prd-tmpl.yaml']);

      const result = executor.validateRequirements(task, availableResources);

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(2);
      expect(result.missing).toContain('missing-template.yaml');
      expect(result.missing).toContain('checklist.md');
    });

    it('should handle empty requirements array', () => {
      const task: TaskDefinition = {
        metadata: {
          requires: [],
        },
        content: 'Task content',
        filepath: '/tasks/task.md',
      };

      const availableResources = new Set<string>();

      const result = executor.validateRequirements(task, availableResources);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('getTaskSummary', () => {
    it('should extract task summary with full metadata', () => {
      const task: TaskDefinition = {
        metadata: {
          id: 'create-prd',
          name: 'Create PRD',
          description: 'Generate PRD from template',
          requires: ['prd-tmpl.yaml'],
          permissions: {
            owner: 'pm',
            editors: ['architect', 'po'],
          },
        },
        content: 'Task content with some length',
        filepath: '/tasks/create-prd.md',
      };

      const summary = executor.getTaskSummary(task);

      expect(summary.id).toBe('create-prd');
      expect(summary.name).toBe('Create PRD');
      expect(summary.description).toBe('Generate PRD from template');
      expect(summary.filepath).toBe('/tasks/create-prd.md');
      expect(summary.requires).toEqual(['prd-tmpl.yaml']);
      expect(summary.permissions?.owner).toBe('pm');
      expect(summary.permissions?.editors).toEqual(['architect', 'po']);
      expect(summary.contentLength).toBeGreaterThan(0);
    });

    it('should handle task without metadata', () => {
      const task: TaskDefinition = {
        content: 'Simple task content',
        filepath: '/tasks/simple.md',
      };

      const summary = executor.getTaskSummary(task);

      expect(summary.id).toBe('unknown');
      expect(summary.name).toBe('Unnamed Task');
      expect(summary.description).toBeUndefined();
      expect(summary.requires).toEqual([]);
      expect(summary.permissions).toBeUndefined();
    });

    it('should handle partial metadata', () => {
      const task: TaskDefinition = {
        metadata: {
          name: 'Test Task',
        },
        content: 'Content',
        filepath: '/tasks/test.md',
      };

      const summary = executor.getTaskSummary(task);

      expect(summary.id).toBe('unknown');
      expect(summary.name).toBe('Test Task');
      expect(summary.requires).toEqual([]);
    });
  });

  describe('extractActions', () => {
    it('should extract markdown headers as actions', () => {
      const task: TaskDefinition = {
        content: `
# Processing Flow

## Step 1: Parse Template

## Step 2: Process Sections

## Step 3: Save Document
        `,
        filepath: '/tasks/task.md',
      };

      const actions = executor.extractActions(task);

      expect(actions).toContain('Processing Flow');
      expect(actions).toContain('Step 1: Parse Template');
      expect(actions).toContain('Step 2: Process Sections');
      expect(actions).toContain('Step 3: Save Document');
    });

    it('should extract numbered bold steps', () => {
      const task: TaskDefinition = {
        content: `
1. **Load template from file**
2. **Validate template schema**
3. **Generate document content**
        `,
        filepath: '/tasks/task.md',
      };

      const actions = executor.extractActions(task);

      expect(actions).toContain('Load template from file');
      expect(actions).toContain('Validate template schema');
      expect(actions).toContain('Generate document content');
    });

    it('should filter out metadata headers', () => {
      const task: TaskDefinition = {
        content: `
## ⚠️ CRITICAL EXECUTION NOTICE ⚠️

## Processing Flow

## CRITICAL REMINDERS
        `,
        filepath: '/tasks/task.md',
      };

      const actions = executor.extractActions(task);

      expect(actions).toContain('Processing Flow');
      expect(actions).not.toContain('⚠️ CRITICAL EXECUTION NOTICE ⚠️');
      expect(actions).not.toContain('CRITICAL REMINDERS');
    });

    it('should return empty array for task without actions', () => {
      const task: TaskDefinition = {
        content: 'Plain text content without headers or steps.',
        filepath: '/tasks/simple.md',
      };

      const actions = executor.extractActions(task);

      expect(actions).toEqual([]);
    });
  });

  describe('requiresElicitation', () => {
    it('should detect elicitation keywords', () => {
      const task1: TaskDefinition = {
        content: 'When elicit: true, ask user for input',
        filepath: '/tasks/task1.md',
      };

      const task2: TaskDefinition = {
        content: 'This task requires user interaction',
        filepath: '/tasks/task2.md',
      };

      const task3: TaskDefinition = {
        content: 'Wait for user response before continuing',
        filepath: '/tasks/task3.md',
      };

      expect(executor.requiresElicitation(task1)).toBe(true);
      expect(executor.requiresElicitation(task2)).toBe(true);
      expect(executor.requiresElicitation(task3)).toBe(true);
    });

    it('should return false for non-interactive tasks', () => {
      const task: TaskDefinition = {
        content: 'Automatically process all sections without stopping',
        filepath: '/tasks/automated.md',
      };

      expect(executor.requiresElicitation(task)).toBe(false);
    });

    it('should be case insensitive', () => {
      const task: TaskDefinition = {
        content: 'ELICIT user feedback during processing',
        filepath: '/tasks/task.md',
      };

      expect(executor.requiresElicitation(task)).toBe(true);
    });
  });

  describe('isAgentAuthorized', () => {
    it('should authorize any agent when no permissions specified', () => {
      const task: TaskDefinition = {
        content: 'Public task',
        filepath: '/tasks/public.md',
      };

      expect(executor.isAgentAuthorized(task, 'pm')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'architect')).toBe(true);
    });

    it('should authorize owner agent', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {
            owner: 'pm',
          },
        },
        content: 'PM-owned task',
        filepath: '/tasks/pm-task.md',
      };

      expect(executor.isAgentAuthorized(task, 'pm')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(false);
    });

    it('should authorize editor agents', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {
            owner: 'pm',
            editors: ['architect', 'po'],
          },
        },
        content: 'Restricted task',
        filepath: '/tasks/restricted.md',
      };

      expect(executor.isAgentAuthorized(task, 'pm')).toBe(true); // owner
      expect(executor.isAgentAuthorized(task, 'architect')).toBe(true); // editor
      expect(executor.isAgentAuthorized(task, 'po')).toBe(true); // editor
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(false); // not authorized
    });

    it('should deny access when permissions are specified but agent not included', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {
            owner: 'pm',
          },
        },
        content: 'PM-only task',
        filepath: '/tasks/pm-only.md',
      };

      expect(executor.isAgentAuthorized(task, 'qa')).toBe(false);
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(false);
    });

    it('should authorize when only editors specified (no owner)', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {
            editors: ['dev', 'qa'],
          },
        },
        content: 'Dev and QA task',
        filepath: '/tasks/dev-qa.md',
      };

      expect(executor.isAgentAuthorized(task, 'dev')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'qa')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'pm')).toBe(false);
    });

    it('should handle empty permissions object', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {},
        },
        content: 'Task',
        filepath: '/tasks/task.md',
      };

      expect(executor.isAgentAuthorized(task, 'pm')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(true);
    });

    it('should handle empty editors array', () => {
      const task: TaskDefinition = {
        metadata: {
          permissions: {
            owner: 'pm',
            editors: [],
          },
        },
        content: 'PM-only task',
        filepath: '/tasks/pm-only.md',
      };

      expect(executor.isAgentAuthorized(task, 'pm')).toBe(true);
      expect(executor.isAgentAuthorized(task, 'dev')).toBe(false);
    });
  });

  describe('Real Task Example', () => {
    it('should process create-doc.md task structure', () => {
      const createDocTask: TaskDefinition = {
        metadata: {
          id: 'create-doc',
          name: 'Create Document from Template',
          requires: ['template', 'elicitation-methods'],
        },
        content: `
<!-- Powered by BMAD™ Core -->

# Create Document from Template (YAML Driven)

## ⚠️ CRITICAL EXECUTION NOTICE ⚠️

**THIS IS AN EXECUTABLE WORKFLOW - NOT REFERENCE MATERIAL**

## CRITICAL: Mandatory Elicitation Format

**When \`elicit: true\`, this is a HARD STOP requiring user interaction:**

1. Present section content
2. Provide detailed rationale
3. **STOP and present numbered options 1-9:**

## Processing Flow

1. **Parse YAML template** - Load template metadata and sections
2. **Set preferences** - Show current mode (Interactive), confirm output file
3. **Process each section:**
   - Skip if condition unmet
   - Check agent permissions
   - Draft content using section instruction
        `,
        filepath: '.bmad-core/tasks/create-doc.md',
      };

      const instructions = executor.prepareTaskInstructions(createDocTask);
      expect(instructions).toContain('Create Document from Template');
      expect(instructions).toContain('CRITICAL EXECUTION NOTICE');

      const summary = executor.getTaskSummary(createDocTask);
      expect(summary.name).toBe('Create Document from Template');
      expect(summary.requires).toContain('template');
      expect(summary.requires).toContain('elicitation-methods');

      const actions = executor.extractActions(createDocTask);
      expect(actions).toContain('Processing Flow');
      expect(actions).toContain('Parse YAML template');

      expect(executor.requiresElicitation(createDocTask)).toBe(true);
    });
  });
});
