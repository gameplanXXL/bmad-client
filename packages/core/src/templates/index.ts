/**
 * Template System - YAML template parsing, validation, registry, loading, and generation
 */

export {
  TemplateSchema,
  TemplateValidationError,
  type TemplateDefinition,
  type TemplateMetadata,
  type WorkflowConfig,
  type OutputConfig,
  type Section,
} from './schema.js';

export {
  parseTemplate,
  validateTemplate,
  hasElicitation,
  extractSectionIds,
  getTemplateSummary,
} from './parser.js';

export { TemplateRegistry, TemplateNotFoundError } from './registry.js';

export { TemplateLoader } from './loader.js';

export {
  DocumentGenerator,
  ElicitationError,
  type DocumentContext,
  type GeneratorOptions,
  type ElicitationQuestion,
  type GeneratedDocument,
} from './generator.js';
