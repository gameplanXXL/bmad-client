import type { TaskDefinition } from './schema.js';
import type { Logger } from '../types.js';

/**
 * Task Executor - Provides task instructions to agents for execution
 *
 * Tasks are workflow definitions (markdown files) that instruct agents
 * on how to process templates, interact with users, and generate documents.
 *
 * Unlike templates (which define document structure), tasks define the
 * PROCESS for creating those documents.
 *
 * @example
 * ```typescript
 * const executor = new TaskExecutor(logger);
 *
 * // Get task instructions to include in agent system prompt
 * const instructions = executor.prepareTaskInstructions(task);
 *
 * // Agent executes task using instructions + tools (read_file, write_file, etc.)
 * ```
 */
export class TaskExecutor {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Prepare task instructions for agent execution
   *
   * Returns the task content (markdown) that will be included in the
   * agent's system prompt. The LLM will read these instructions and
   * execute the workflow using available tools.
   *
   * @param task - Task definition
   * @returns Task instructions as markdown string
   */
  prepareTaskInstructions(task: TaskDefinition): string {
    this.logger?.debug('Preparing task instructions', {
      filepath: task.filepath,
      hasMetadata: !!task.metadata,
    });

    let instructions = '';

    // Add metadata header if present
    if (task.metadata) {
      instructions += '# Task Instructions\n\n';

      if (task.metadata.name) {
        instructions += `**Task:** ${task.metadata.name}\n\n`;
      }

      if (task.metadata.description) {
        instructions += `**Description:** ${task.metadata.description}\n\n`;
      }

      if (task.metadata.requires && task.metadata.requires.length > 0) {
        instructions += '**Requirements:**\n';
        for (const req of task.metadata.requires) {
          instructions += `- ${req}\n`;
        }
        instructions += '\n';
      }

      instructions += '---\n\n';
    }

    // Add main task content (workflow instructions)
    instructions += task.content;

    return instructions;
  }

  /**
   * Validate task requirements before execution
   *
   * Checks if all required resources (templates, checklists, etc.)
   * are available before allowing task execution.
   *
   * @param task - Task definition
   * @param availableResources - Set of available resource IDs
   * @returns Validation result with missing requirements
   */
  validateRequirements(
    task: TaskDefinition,
    availableResources: Set<string>
  ): TaskValidationResult {
    const missing: string[] = [];

    if (task.metadata?.requires) {
      for (const requirement of task.metadata.requires) {
        if (!availableResources.has(requirement)) {
          missing.push(requirement);
        }
      }
    }

    const valid = missing.length === 0;

    if (!valid) {
      this.logger?.warn('Task validation failed - missing requirements', {
        task: task.metadata?.name || task.filepath,
        missing,
      });
    }

    return {
      valid,
      missing,
    };
  }

  /**
   * Get task metadata summary for logging/debugging
   *
   * @param task - Task definition
   * @returns Summary object
   */
  getTaskSummary(task: TaskDefinition): TaskSummary {
    return {
      id: task.metadata?.id || 'unknown',
      name: task.metadata?.name || 'Unnamed Task',
      description: task.metadata?.description,
      filepath: task.filepath,
      requires: task.metadata?.requires || [],
      permissions: task.metadata?.permissions,
      contentLength: task.content.length,
    };
  }

  /**
   * Extract task commands/actions for analysis
   *
   * Parses task content to identify key actions/commands that the task
   * instructs agents to perform. Useful for task discovery and tooling.
   *
   * @param task - Task definition
   * @returns List of identified actions
   */
  extractActions(task: TaskDefinition): string[] {
    const actions: string[] = [];

    // Extract markdown headers as actions
    const headerRegex = /^#+\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(task.content)) !== null) {
      const header = match[1].trim();

      // Filter out metadata headers
      if (
        !header.startsWith('⚠️') &&
        !header.includes('CRITICAL') &&
        !header.includes('Task Instructions')
      ) {
        actions.push(header);
      }
    }

    // Extract numbered steps
    const stepRegex = /^\d+\.\s+\*\*(.+?)\*\*/gm;
    while ((match = stepRegex.exec(task.content)) !== null) {
      actions.push(match[1].trim());
    }

    return actions;
  }

  /**
   * Check if task requires user interaction (elicitation)
   *
   * @param task - Task definition
   * @returns true if task mentions elicitation
   */
  requiresElicitation(task: TaskDefinition): boolean {
    const lowerContent = task.content.toLowerCase();
    return (
      lowerContent.includes('elicit') ||
      lowerContent.includes('user interaction') ||
      lowerContent.includes('wait for user')
    );
  }

  /**
   * Check if task is agent-restricted
   *
   * @param task - Task definition
   * @param agentId - Current agent ID
   * @returns true if agent is authorized for this task
   */
  isAgentAuthorized(task: TaskDefinition, agentId: string): boolean {
    // If no permissions specified, task is public (any agent can execute)
    if (!task.metadata?.permissions) {
      return true;
    }

    const { owner, editors } = task.metadata.permissions;

    // Check if agent is owner
    if (owner && owner === agentId) {
      return true;
    }

    // Check if agent is in editors list
    if (editors && editors.includes(agentId)) {
      return true;
    }

    // If permissions are specified but agent is not in them, deny
    if (owner || (editors && editors.length > 0)) {
      return false;
    }

    // No restrictions found, allow
    return true;
  }
}

/**
 * Task validation result
 */
export interface TaskValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Task summary for logging/debugging
 */
export interface TaskSummary {
  id: string;
  name: string;
  description?: string;
  filepath: string;
  requires: string[];
  permissions?: {
    owner?: string;
    editors?: string[];
  };
  contentLength: number;
}

/**
 * Task execution error
 */
export class TaskExecutionError extends Error {
  constructor(
    message: string,
    public taskId?: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'TaskExecutionError';
  }
}

/**
 * Task authorization error
 */
export class TaskAuthorizationError extends Error {
  constructor(
    public taskId: string,
    public agentId: string,
    public requiredRole?: string
  ) {
    super(
      `Agent '${agentId}' is not authorized to execute task '${taskId}'${
        requiredRole ? ` (requires: ${requiredRole})` : ''
      }`
    );
    this.name = 'TaskAuthorizationError';
  }
}

/**
 * Task requirements missing error
 */
export class TaskRequirementsMissingError extends Error {
  constructor(
    public taskId: string,
    public missing: string[]
  ) {
    super(
      `Task '${taskId}' cannot be executed - missing requirements: ${missing.join(', ')}`
    );
    this.name = 'TaskRequirementsMissingError';
  }
}
