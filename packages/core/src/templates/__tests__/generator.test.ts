import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentGenerator, ElicitationError } from '../generator.js';
import type { TemplateDefinition } from '../schema.js';
import type { DocumentContext, ElicitationQuestion } from '../generator.js';

describe('DocumentGenerator', () => {
  describe('Basic Document Generation', () => {
    it('should generate simple document with title', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'simple-doc',
          name: 'Simple Document',
          version: '1.0',
          output: {
            format: 'markdown',
            filename: 'simple.md',
            title: 'Test Document',
          },
        },
        sections: [
          {
            id: 'intro',
            title: 'Introduction',
            content: 'This is a test document.',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('# Test Document');
      expect(result.content).toContain('## Introduction');
      expect(result.content).toContain('This is a test document.');
      expect(result.metadata.templateId).toBe('simple-doc');
      expect(result.metadata.sectionCount).toBe(1);
    });

    it('should generate document without title', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'no-title',
          name: 'No Title Doc',
          version: '1.0',
          output: {
            format: 'markdown',
            filename: 'notitle.md',
          },
        },
        sections: [
          {
            id: 'section1',
            title: 'Section 1',
            content: 'Content here',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).not.toContain('# undefined');
      expect(result.content).toContain('## Section 1');
    });

    it('should handle multiple sections', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'multi-section',
          name: 'Multi Section',
          version: '1.0',
          output: { format: 'markdown', filename: 'multi.md' },
        },
        sections: [
          { id: 'section1', title: 'Section 1', content: 'Content 1' },
          { id: 'section2', title: 'Section 2', content: 'Content 2' },
          { id: 'section3', title: 'Section 3', content: 'Content 3' },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('## Section 1');
      expect(result.content).toContain('## Section 2');
      expect(result.content).toContain('## Section 3');
      expect(result.content).toContain('Content 1');
      expect(result.content).toContain('Content 2');
      expect(result.content).toContain('Content 3');
    });
  });

  describe('Nested Sections', () => {
    it('should handle nested sections with correct heading levels', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'nested',
          name: 'Nested Sections',
          version: '1.0',
          output: { format: 'markdown', filename: 'nested.md', title: 'Main Title' },
        },
        sections: [
          {
            id: 'parent',
            title: 'Parent Section',
            content: 'Parent content',
            sections: [
              {
                id: 'child1',
                title: 'Child 1',
                content: 'Child 1 content',
              },
              {
                id: 'child2',
                title: 'Child 2',
                content: 'Child 2 content',
                sections: [
                  {
                    id: 'grandchild',
                    title: 'Grandchild',
                    content: 'Grandchild content',
                  },
                ],
              },
            ],
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('# Main Title');
      expect(result.content).toContain('## Parent Section');
      expect(result.content).toContain('### Child 1');
      expect(result.content).toContain('### Child 2');
      expect(result.content).toContain('#### Grandchild');
    });

    it('should limit heading level to h6', async () => {
      const deeplyNested: TemplateDefinition = {
        template: {
          id: 'deep',
          name: 'Deep',
          version: '1.0',
          output: { format: 'markdown', filename: 'deep.md', title: 'Title' },
        },
        sections: [
          {
            id: 'l1',
            title: 'Level 1',
            sections: [
              {
                id: 'l2',
                title: 'Level 2',
                sections: [
                  {
                    id: 'l3',
                    title: 'Level 3',
                    sections: [
                      {
                        id: 'l4',
                        title: 'Level 4',
                        sections: [
                          {
                            id: 'l5',
                            title: 'Level 5',
                            sections: [
                              {
                                id: 'l6',
                                title: 'Level 6 (should still be h6)',
                                content: 'Deep content',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const generator = new DocumentGenerator(deeplyNested);
      const result = await generator.generate();

      // Should not contain h7 or deeper
      expect(result.content).not.toMatch(/#######/);
      expect(result.content).toContain('######');
    });
  });

  describe('Variable Substitution', () => {
    it('should substitute variables in title', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'var-title',
          name: 'Variable Title',
          version: '1.0',
          output: {
            format: 'markdown',
            filename: 'var.md',
            title: '{{project_name}} Documentation',
          },
        },
        sections: [{ id: 's1', content: 'Content' }],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({ project_name: 'BMad Client' });

      expect(result.content).toContain('# BMad Client Documentation');
    });

    it('should substitute variables in section content', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'var-content',
          name: 'Variable Content',
          version: '1.0',
          output: { format: 'markdown', filename: 'var.md' },
        },
        sections: [
          {
            id: 'intro',
            title: 'Introduction',
            content: 'Welcome to {{project_name}} by {{author}}',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({
        project_name: 'My Project',
        author: 'John Doe',
      });

      expect(result.content).toContain('Welcome to My Project by John Doe');
    });

    it('should support default values for missing variables', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'default-vars',
          name: 'Default Variables',
          version: '1.0',
          output: { format: 'markdown', filename: 'default.md' },
        },
        sections: [
          {
            id: 's1',
            content: 'Project: {{project_name|Unnamed Project}} by {{author|Anonymous}}',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({ author: 'Alice' });

      expect(result.content).toContain('Project: Unnamed Project by Alice');
    });

    it('should keep placeholder if variable not found and no default', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'missing-var',
          name: 'Missing Variable',
          version: '1.0',
          output: { format: 'markdown', filename: 'missing.md' },
        },
        sections: [{ id: 's1', content: 'Name: {{unknown_var}}' }],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('Name: {{unknown_var}}');
    });

    it('should update context dynamically', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'dynamic-context',
          name: 'Dynamic Context',
          version: '1.0',
          output: { format: 'markdown', filename: 'dynamic.md' },
        },
        sections: [{ id: 's1', content: 'Value: {{dynamic_value}}' }],
      };

      const generator = new DocumentGenerator(template);
      generator.updateContext({ dynamic_value: 'Initial' });

      const result = await generator.generate();
      expect(result.content).toContain('Value: Initial');
    });
  });

  describe('Conditional Sections', () => {
    it('should include section when condition is met', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'conditional',
          name: 'Conditional',
          version: '1.0',
          output: { format: 'markdown', filename: 'cond.md' },
        },
        sections: [
          {
            id: 'optional',
            title: 'Optional Section',
            content: 'This is optional',
            condition: 'show_optional',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({ show_optional: true });

      expect(result.content).toContain('Optional Section');
      expect(result.content).toContain('This is optional');
    });

    it('should skip section when condition is not met', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'conditional',
          name: 'Conditional',
          version: '1.0',
          output: { format: 'markdown', filename: 'cond.md' },
        },
        sections: [
          {
            id: 'optional',
            title: 'Optional Section',
            content: 'This is optional',
            condition: 'show_optional',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({ show_optional: false });

      expect(result.content).not.toContain('Optional Section');
      expect(result.content).not.toContain('This is optional');
    });

    it('should support negated conditions', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'negated',
          name: 'Negated Condition',
          version: '1.0',
          output: { format: 'markdown', filename: 'neg.md' },
        },
        sections: [
          {
            id: 's1',
            title: 'Show when flag is false',
            content: 'Shown',
            condition: '!hide_section',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({ hide_section: false });

      expect(result.content).toContain('Show when flag is false');
    });
  });

  describe('Elicitation', () => {
    it('should call question handler for elicit sections', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'elicit',
          name: 'Elicitation Test',
          version: '1.0',
          output: { format: 'markdown', filename: 'elicit.md' },
        },
        workflow: {
          mode: 'interactive',
          elicitation: 'numbered-options',
        },
        sections: [
          {
            id: 'user-input',
            title: 'User Input Section',
            instruction: 'Please describe your project',
            elicit: true,
          },
        ],
      };

      let questionReceived: ElicitationQuestion | null = null;

      const generator = new DocumentGenerator(template);
      generator.onQuestion(async (question) => {
        questionReceived = question;
        return 'User provided this answer';
      });

      const result = await generator.generate();

      expect(questionReceived).not.toBeNull();
      expect(questionReceived?.sectionId).toBe('user-input');
      expect(questionReceived?.instruction).toBe('Please describe your project');
      expect(questionReceived?.elicitationMethod).toBe('numbered-options');
      expect(result.content).toContain('User provided this answer');
      expect(result.context['user-input']).toBe('User provided this answer');
    });

    it('should handle multiple elicitation rounds', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'multi-elicit',
          name: 'Multiple Elicitation',
          version: '1.0',
          output: { format: 'markdown', filename: 'multi-elicit.md' },
        },
        sections: [
          { id: 'q1', instruction: 'Question 1', elicit: true },
          { id: 'q2', instruction: 'Question 2', elicit: true },
          { id: 'q3', instruction: 'Question 3', elicit: true },
        ],
      };

      const answers = ['Answer 1', 'Answer 2', 'Answer 3'];
      let answerIndex = 0;

      const generator = new DocumentGenerator(template);
      generator.onQuestion(async () => answers[answerIndex++]);

      const result = await generator.generate();

      expect(result.content).toContain('Answer 1');
      expect(result.content).toContain('Answer 2');
      expect(result.content).toContain('Answer 3');
      expect(answerIndex).toBe(3);
    });

    it('should throw ElicitationError when handler throws', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'error-elicit',
          name: 'Error Elicitation',
          version: '1.0',
          output: { format: 'markdown', filename: 'error.md' },
        },
        sections: [{ id: 'error-section', elicit: true }],
      };

      const generator = new DocumentGenerator(template);
      generator.onQuestion(async () => {
        throw new Error('User cancelled');
      });

      await expect(generator.generate()).rejects.toThrow(ElicitationError);
      await expect(generator.generate()).rejects.toThrow('Elicitation failed for section: error-section');
    });

    it('should skip elicitation when no handler is set', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'no-handler',
          name: 'No Handler',
          version: '1.0',
          output: { format: 'markdown', filename: 'nohandler.md' },
        },
        sections: [
          { id: 'elicit-section', title: 'Elicit Section', elicit: true },
          { id: 'normal-section', title: 'Normal Section', content: 'Normal content' },
        ],
      };

      const generator = new DocumentGenerator(template);
      // No onQuestion handler set

      const result = await generator.generate();

      // Should not crash, just skip elicitation
      expect(result.content).toContain('Normal Section');
      expect(result.content).toContain('Normal content');
    });
  });

  describe('Template-based Content', () => {
    it('should process template field', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'template-field',
          name: 'Template Field',
          version: '1.0',
          output: { format: 'markdown', filename: 'template.md' },
        },
        sections: [
          {
            id: 's1',
            title: 'Section',
            template: 'Project: {{project_name}}\nAuthor: {{author}}',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate({
        project_name: 'Test Project',
        author: 'Jane Doe',
      });

      expect(result.content).toContain('Project: Test Project');
      expect(result.content).toContain('Author: Jane Doe');
    });

    it('should prefer content over template', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'prefer-content',
          name: 'Prefer Content',
          version: '1.0',
          output: { format: 'markdown', filename: 'prefer.md' },
        },
        sections: [
          {
            id: 's1',
            content: 'This is content',
            template: 'This is template',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('This is content');
      expect(result.content).not.toContain('This is template');
    });
  });

  describe('Instruction-based Sections', () => {
    it('should include instruction as comment when no content', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'instruction',
          name: 'Instruction',
          version: '1.0',
          output: { format: 'markdown', filename: 'instruction.md' },
        },
        sections: [
          {
            id: 's1',
            title: 'Section with Instruction',
            instruction: 'Agent should generate content here',
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('<!-- Instruction: Agent should generate content here -->');
    });
  });

  describe('Context Management', () => {
    it('should provide context in elicitation questions', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'context',
          name: 'Context',
          version: '1.0',
          output: { format: 'markdown', filename: 'context.md' },
        },
        sections: [{ id: 'q1', elicit: true }],
      };

      let receivedContext: DocumentContext | null = null;

      const generator = new DocumentGenerator(template, {
        context: { existing_var: 'existing value' },
      });

      generator.onQuestion(async (question) => {
        receivedContext = question.context;
        return 'Answer';
      });

      await generator.generate({ new_var: 'new value' });

      expect(receivedContext).toMatchObject({
        existing_var: 'existing value',
        new_var: 'new value',
      });
    });

    it('should accumulate context across elicitation rounds', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'accumulate',
          name: 'Accumulate',
          version: '1.0',
          output: { format: 'markdown', filename: 'accumulate.md' },
        },
        sections: [
          { id: 'q1', elicit: true },
          { id: 'q2', elicit: true },
          { id: 'summary', content: 'Q1: {{q1}}, Q2: {{q2}}' },
        ],
      };

      let roundNum = 0;
      const generator = new DocumentGenerator(template);

      generator.onQuestion(async () => {
        roundNum++;
        return `Answer ${roundNum}`;
      });

      const result = await generator.generate();

      expect(result.context.q1).toBe('Answer 1');
      expect(result.context.q2).toBe('Answer 2');
      expect(result.content).toContain('Q1: Answer 1, Q2: Answer 2');
    });

    it('should return current context via getContext', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'get-context',
          name: 'Get Context',
          version: '1.0',
          output: { format: 'markdown', filename: 'getcontext.md' },
        },
        sections: [{ id: 's1', content: 'Test' }],
      };

      const generator = new DocumentGenerator(template, {
        context: { initial: 'value' },
      });

      const contextBefore = generator.getContext();
      expect(contextBefore.initial).toBe('value');

      generator.updateContext({ updated: 'new value' });

      const contextAfter = generator.getContext();
      expect(contextAfter.initial).toBe('value');
      expect(contextAfter.updated).toBe('new value');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty sections array', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'empty',
          name: 'Empty',
          version: '1.0',
          output: { format: 'markdown', filename: 'empty.md', title: 'Empty Document' },
        },
        sections: [],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('# Empty Document');
      expect(result.metadata.sectionCount).toBe(0);
    });

    it('should handle section without title', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'no-section-title',
          name: 'No Section Title',
          version: '1.0',
          output: { format: 'markdown', filename: 'notitle.md' },
        },
        sections: [{ id: 's1', content: 'Content without title' }],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      expect(result.content).toContain('Content without title');
      expect(result.content).not.toMatch(/^##\s*$/m); // No empty heading
    });

    it('should handle repeatable flag (marked but not yet implemented)', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'repeatable',
          name: 'Repeatable',
          version: '1.0',
          output: { format: 'markdown', filename: 'repeat.md' },
        },
        sections: [
          {
            id: 'repeatable-section',
            title: 'Repeatable Section',
            content: 'This can repeat',
            repeatable: true,
          },
        ],
      };

      const generator = new DocumentGenerator(template);
      const result = await generator.generate();

      // Should not crash, just log debug message
      expect(result.content).toContain('Repeatable Section');
    });
  });

  describe('Content Retrieval', () => {
    it('should return current content via getContent', async () => {
      const template: TemplateDefinition = {
        template: {
          id: 'get-content',
          name: 'Get Content',
          version: '1.0',
          output: { format: 'markdown', filename: 'getcontent.md' },
        },
        sections: [{ id: 's1', content: 'First section' }],
      };

      const generator = new DocumentGenerator(template);
      await generator.generate();

      const content = generator.getContent();
      expect(content).toContain('First section');
    });
  });
});
