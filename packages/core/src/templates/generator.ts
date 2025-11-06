import type { TemplateDefinition, Section } from './schema.js';
import type { Logger } from '../types.js';

/**
 * Context for variable substitution during document generation
 */
export interface DocumentContext {
  [key: string]: unknown;
}

/**
 * Document generation options
 */
export interface GeneratorOptions {
  context?: DocumentContext;
  logger?: Logger;
  onQuestion?: (question: ElicitationQuestion) => Promise<string>;
}

/**
 * Elicitation question emitted during document generation
 */
export interface ElicitationQuestion {
  sectionId: string;
  sectionTitle?: string;
  instruction?: string;
  elicitationMethod?: string;
  context: DocumentContext;
}

/**
 * Generated document result
 */
export interface GeneratedDocument {
  content: string;
  metadata: {
    templateId: string;
    templateName: string;
    generatedAt: number;
    sectionCount: number;
  };
  context: DocumentContext;
}

/**
 * Document Generator - Generates structured documents from templates
 *
 * Processes template sections sequentially, handles elicitation, variable
 * substitution, and conditional logic to produce final markdown documents.
 *
 * @example
 * ```typescript
 * const generator = new DocumentGenerator(template, { logger });
 *
 * generator.onQuestion(async (question) => {
 *   const answer = await promptUser(question.instruction);
 *   return answer;
 * });
 *
 * const document = await generator.generate({
 *   project_name: 'BMad Client',
 *   user_name: 'John Doe'
 * });
 *
 * console.log(document.content);
 * ```
 */
export class DocumentGenerator {
  private template: TemplateDefinition;
  private logger?: Logger;
  private context: DocumentContext = {};
  private content: string[] = [];
  private onQuestionHandler?: (question: ElicitationQuestion) => Promise<string>;

  constructor(template: TemplateDefinition, options?: GeneratorOptions) {
    this.template = template;
    this.logger = options?.logger;
    this.context = options?.context || {};
    this.onQuestionHandler = options?.onQuestion;
  }

  /**
   * Set question handler for elicitation
   */
  onQuestion(handler: (question: ElicitationQuestion) => Promise<string>): void {
    this.onQuestionHandler = handler;
  }

  /**
   * Generate document from template
   *
   * @param initialContext - Initial context variables
   * @returns Generated document with metadata
   */
  async generate(initialContext?: DocumentContext): Promise<GeneratedDocument> {
    this.logger?.info(`Generating document from template: ${this.template.template.id}`);

    // Merge initial context
    if (initialContext) {
      this.context = { ...this.context, ...initialContext };
    }

    // Reset content
    this.content = [];

    // Add title if specified
    if (this.template.template.output.title) {
      this.content.push(`# ${this.substituteVariables(this.template.template.output.title)}\n`);
    }

    // Process all sections
    await this.processSections(this.template.sections, 0);

    const document: GeneratedDocument = {
      content: this.content.join('\n'),
      metadata: {
        templateId: this.template.template.id,
        templateName: this.template.template.name,
        generatedAt: Date.now(),
        sectionCount: this.template.sections.length,
      },
      context: this.context,
    };

    this.logger?.info(`Document generation complete: ${this.content.length} lines`);

    return document;
  }

  /**
   * Process sections recursively
   */
  private async processSections(sections: Section[], level: number): Promise<void> {
    for (const section of sections) {
      await this.processSection(section, level);
    }
  }

  /**
   * Process a single section
   */
  private async processSection(section: Section, level: number): Promise<void> {
    // Check condition if specified
    if (section.condition && !this.evaluateCondition(section.condition)) {
      this.logger?.debug(`Skipping section ${section.id} (condition not met)`);
      return;
    }

    // Add section title if specified
    if (section.title) {
      const headingLevel = Math.min(level + 2, 6); // Max heading level is 6
      const heading = '#'.repeat(headingLevel);
      this.content.push(`${heading} ${this.substituteVariables(section.title)}\n`);
    }

    // Handle elicitation if required
    if (section.elicit && this.onQuestionHandler) {
      await this.handleElicitation(section);
    }

    // Process section content based on type
    if (section.content) {
      // Static content (non-interactive templates)
      this.content.push(this.substituteVariables(section.content));
      this.content.push(''); // Empty line
    } else if (section.template) {
      // Template-based content
      this.content.push(this.substituteVariables(section.template));
      this.content.push(''); // Empty line
    } else if (section.instruction) {
      // Instruction-based content (agent generates content)
      this.content.push(`<!-- Instruction: ${section.instruction} -->`);
      this.content.push(''); // Empty line
    }

    // Process nested sections if any
    if (section.sections) {
      await this.processSections(section.sections, level + 1);
    }

    // Handle repeatable sections
    if (section.repeatable) {
      // Repeatable sections will be populated by context data
      // For now, just mark as repeatable
      this.logger?.debug(`Section ${section.id} is marked as repeatable`);
    }
  }

  /**
   * Handle elicitation for a section
   */
  private async handleElicitation(section: Section): Promise<void> {
    if (!this.onQuestionHandler) {
      this.logger?.warn(`Elicitation required for section ${section.id} but no handler set`);
      return;
    }

    const question: ElicitationQuestion = {
      sectionId: section.id,
      sectionTitle: section.title,
      instruction: section.instruction,
      elicitationMethod: this.template.workflow?.elicitation,
      context: this.context,
    };

    this.logger?.debug(`Eliciting user input for section: ${section.id}`);

    try {
      const answer = await this.onQuestionHandler(question);

      // Store answer in context
      this.context[section.id] = answer;

      // Add answer to content
      this.content.push(answer);
      this.content.push(''); // Empty line
    } catch (error) {
      this.logger?.error(`Elicitation failed for section ${section.id}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new ElicitationError(section.id, error);
    }
  }

  /**
   * Substitute variables in text ({{variable_name}})
   */
  private substituteVariables(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmed = variable.trim();

      // Support default values: {{variable|default}}
      const [varName, defaultValue] = trimmed.split('|').map((s: string) => s.trim());

      const value = this.context[varName];

      if (value !== undefined) {
        return String(value);
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      // Variable not found, keep placeholder
      this.logger?.warn(`Variable not found: ${varName}`);
      return match;
    });
  }

  /**
   * Evaluate condition expression
   *
   * Simple condition evaluation:
   * - "variable" - checks if variable exists and is truthy
   * - "!variable" - checks if variable is falsy or doesn't exist
   *
   * @param condition - Condition expression
   * @returns true if condition is met
   */
  private evaluateCondition(condition: string): boolean {
    const negated = condition.startsWith('!');
    const variable = negated ? condition.substring(1).trim() : condition.trim();

    const value = this.context[variable];
    const result = value !== undefined && value !== null && value !== false && value !== '';

    return negated ? !result : result;
  }

  /**
   * Update context with new variables
   */
  updateContext(updates: DocumentContext): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Get current context
   */
  getContext(): DocumentContext {
    return { ...this.context };
  }

  /**
   * Get current content
   */
  getContent(): string {
    return this.content.join('\n');
  }
}

/**
 * Custom error for elicitation failures
 */
export class ElicitationError extends Error {
  public readonly sectionId: string;
  public override readonly cause?: unknown;

  constructor(sectionId: string, cause?: unknown) {
    super(`Elicitation failed for section: ${sectionId}`);
    this.name = 'ElicitationError';
    this.sectionId = sectionId;
    this.cause = cause;
  }
}
