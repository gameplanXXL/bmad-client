/**
 * Task System - Task workflow loading and execution
 *
 * Tasks are markdown files (with optional YAML frontmatter) that define
 * multi-step workflows for agents to execute. Tasks can reference templates,
 * checklists, and other tasks.
 */

export {
  TaskMetadataSchema,
  TaskValidationError,
  type TaskMetadata,
  type TaskDefinition,
} from './schema.js';

export { TaskLoader, TaskNotFoundError } from './loader.js';

export {
  TaskExecutor,
  TaskExecutionError,
  TaskAuthorizationError,
  TaskRequirementsMissingError,
  type TaskValidationResult,
  type TaskSummary,
} from './executor.js';
