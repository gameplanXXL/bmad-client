import { describe, it, expect } from 'vitest';
import {
  parseTemplate,
  validateTemplate,
  hasElicitation,
  extractSectionIds,
  getTemplateSummary,
  TemplateValidationError,
} from '../parser.js';

describe('Template Parser', () => {
  describe('parseTemplate', () => {
    it('should parse valid minimal template', () => {
      const yaml = `
template:
  id: test-template
  name: Test Template
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: intro
    title: Introduction
`;

      const template = parseTemplate(yaml);

      expect(template.template.id).toBe('test-template');
      expect(template.template.name).toBe('Test Template');
      expect(template.template.version).toBe(1.0); // YAML parses as number
      expect(template.template.output.format).toBe('markdown');
      expect(template.sections).toHaveLength(1);
      expect(template.sections[0].id).toBe('intro');
    });

    it('should parse template with workflow', () => {
      const yaml = `
template:
  id: interactive-template
  name: Interactive Template
  version: 2.0
  output:
    format: markdown
    filename: output.md

workflow:
  mode: interactive
  elicitation: advanced-elicitation

sections:
  - id: section1
    title: Section 1
`;

      const template = parseTemplate(yaml);

      expect(template.workflow?.mode).toBe('interactive');
      expect(template.workflow?.elicitation).toBe('advanced-elicitation');
    });

    it('should parse template with nested sections', () => {
      const yaml = `
template:
  id: nested-template
  name: Nested Template
  version: 1.0
  output:
    format: markdown
    filename: nested.md

sections:
  - id: parent
    title: Parent Section
    sections:
      - id: child1
        title: Child 1
      - id: child2
        title: Child 2
        sections:
          - id: grandchild
            title: Grandchild
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].sections).toHaveLength(2);
      expect(template.sections[0].sections![0].id).toBe('child1');
      expect(template.sections[0].sections![1].sections).toHaveLength(1);
      expect(template.sections[0].sections![1].sections![0].id).toBe('grandchild');
    });

    it('should parse template with elicitation flags', () => {
      const yaml = `
template:
  id: elicit-template
  name: Elicitation Template
  version: 1.0
  output:
    format: markdown
    filename: elicit.md

sections:
  - id: section1
    title: Section 1
    elicit: true
    instruction: Ask user for input
  - id: section2
    title: Section 2
    elicit: false
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].elicit).toBe(true);
      expect(template.sections[0].instruction).toBe('Ask user for input');
      expect(template.sections[1].elicit).toBe(false);
    });

    it('should parse template with repeatable sections', () => {
      const yaml = `
template:
  id: repeatable-template
  name: Repeatable Template
  version: 1.0
  output:
    format: markdown
    filename: repeat.md

sections:
  - id: epic
    title: Epic {{epic_number}}
    repeatable: true
    template: "Epic {{epic_number}}: {{epic_title}}"
    sections:
      - id: story
        title: Story {{story_number}}
        repeatable: true
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].repeatable).toBe(true);
      expect(template.sections[0].template).toContain('{{epic_number}}');
      expect(template.sections[0].sections![0].repeatable).toBe(true);
    });

    it('should parse template with section types', () => {
      const yaml = `
template:
  id: types-template
  name: Types Template
  version: 1.0
  output:
    format: markdown
    filename: types.md

sections:
  - id: paragraphs
    title: Paragraphs
    type: paragraphs
  - id: bullets
    title: Bullets
    type: bullet-list
  - id: numbered
    title: Numbered
    type: numbered-list
    prefix: FR
  - id: table
    title: Table
    type: table
    columns: [Name, Description, Status]
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].type).toBe('paragraphs');
      expect(template.sections[1].type).toBe('bullet-list');
      expect(template.sections[2].type).toBe('numbered-list');
      expect(template.sections[2].prefix).toBe('FR');
      expect(template.sections[3].type).toBe('table');
      expect(template.sections[3].columns).toEqual(['Name', 'Description', 'Status']);
    });

    it('should parse template with choices and examples', () => {
      const yaml = `
template:
  id: choices-template
  name: Choices Template
  version: 1.0
  output:
    format: markdown
    filename: choices.md

sections:
  - id: section1
    title: Section 1
    choices:
      platform: [Web, Mobile, Desktop]
      framework: [React, Vue, Angular]
    examples:
      - "Example 1: Web application using React"
      - "Example 2: Mobile app with React Native"
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].choices).toEqual({
        platform: ['Web', 'Mobile', 'Desktop'],
        framework: ['React', 'Vue', 'Angular'],
      });
      expect(template.sections[0].examples).toHaveLength(2);
      expect(template.sections[0].examples![0]).toContain('React');
    });

    it('should parse template with conditions', () => {
      const yaml = `
template:
  id: conditional-template
  name: Conditional Template
  version: 1.0
  output:
    format: markdown
    filename: conditional.md

sections:
  - id: required
    title: Required Section
  - id: optional
    title: Optional Section
    condition: Has UI requirements
  - id: conditional
    title: Conditional Section
    condition: project_type == 'backend'
`;

      const template = parseTemplate(yaml);

      expect(template.sections[0].condition).toBeUndefined();
      expect(template.sections[1].condition).toBe('Has UI requirements');
      expect(template.sections[2].condition).toBe("project_type == 'backend'");
    });

    it('should throw error for empty template', () => {
      expect(() => parseTemplate('')).toThrow(TemplateValidationError);
      expect(() => parseTemplate('# Only comments')).toThrow(TemplateValidationError);
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = `
template:
  id: test
  name: Test
  invalid syntax here: [
`;

      expect(() => parseTemplate(invalidYaml)).toThrow(TemplateValidationError);
    });

    it('should throw error for missing required fields', () => {
      const missingId = `
template:
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections: []
`;

      expect(() => parseTemplate(missingId)).toThrow(TemplateValidationError);
    });

    it('should throw error for invalid output format', () => {
      const invalidFormat = `
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: pdf
    filename: test.md

sections: []
`;

      expect(() => parseTemplate(invalidFormat)).toThrow(TemplateValidationError);
    });

    it('should throw error for invalid workflow mode', () => {
      const invalidMode = `
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

workflow:
  mode: manual

sections: []
`;

      expect(() => parseTemplate(invalidMode)).toThrow(TemplateValidationError);
    });

    it('should parse numeric version', () => {
      const yaml = `
template:
  id: numeric-version
  name: Numeric Version
  version: 2
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
`;

      const template = parseTemplate(yaml);
      expect(template.template.version).toBe(2);
    });

    it('should parse string version', () => {
      const yaml = `
template:
  id: string-version
  name: String Version
  version: "2.1.0"
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
`;

      const template = parseTemplate(yaml);
      expect(template.template.version).toBe('2.1.0');
    });
  });

  describe('validateTemplate', () => {
    it('should validate valid template object', () => {
      const templateObj = {
        template: {
          id: 'test',
          name: 'Test',
          version: 1.0,
          output: {
            format: 'markdown',
            filename: 'test.md',
          },
        },
        sections: [
          {
            id: 'intro',
            title: 'Introduction',
          },
        ],
      };

      const template = validateTemplate(templateObj);
      expect(template.template.id).toBe('test');
    });

    it('should throw error for invalid template object', () => {
      const invalidObj = {
        template: {
          name: 'Missing ID',
        },
        sections: [],
      };

      expect(() => validateTemplate(invalidObj)).toThrow(TemplateValidationError);
    });
  });

  describe('hasElicitation', () => {
    it('should return true if template has elicitation', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
  - id: section2
    title: Section 2
    elicit: true
`);

      expect(hasElicitation(template)).toBe(true);
    });

    it('should return true if nested section has elicitation', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: parent
    title: Parent
    sections:
      - id: child
        title: Child
        elicit: true
`);

      expect(hasElicitation(template)).toBe(true);
    });

    it('should return false if no elicitation', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
  - id: section2
    title: Section 2
`);

      expect(hasElicitation(template)).toBe(false);
    });
  });

  describe('extractSectionIds', () => {
    it('should extract all section IDs', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
  - id: section2
    title: Section 2
  - id: section3
    title: Section 3
`);

      const ids = extractSectionIds(template);
      expect(ids).toEqual(['section1', 'section2', 'section3']);
    });

    it('should extract nested section IDs', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: parent1
    title: Parent 1
    sections:
      - id: child1
        title: Child 1
      - id: child2
        title: Child 2
  - id: parent2
    title: Parent 2
`);

      const ids = extractSectionIds(template);
      expect(ids).toEqual(['parent1', 'child1', 'child2', 'parent2']);
    });
  });

  describe('getTemplateSummary', () => {
    it('should return template summary', () => {
      const template = parseTemplate(`
template:
  id: test-template
  name: Test Template
  version: 2.0
  output:
    format: markdown
    filename: docs/test.md

workflow:
  mode: interactive

sections:
  - id: section1
    title: Section 1
    elicit: true
  - id: section2
    title: Section 2
    repeatable: true
`);

      const summary = getTemplateSummary(template);

      expect(summary.id).toBe('test-template');
      expect(summary.name).toBe('Test Template');
      expect(summary.version).toBe(2.0); // YAML parses as number
      expect(summary.outputFormat).toBe('markdown');
      expect(summary.outputFile).toBe('docs/test.md');
      expect(summary.mode).toBe('interactive');
      expect(summary.sectionCount).toBe(2);
      expect(summary.hasElicitation).toBe(true);
      expect(summary.isRepeatable).toBe(true);
    });

    it('should use default mode if workflow not specified', () => {
      const template = parseTemplate(`
template:
  id: test
  name: Test
  version: 1.0
  output:
    format: markdown
    filename: test.md

sections:
  - id: section1
    title: Section 1
`);

      const summary = getTemplateSummary(template);
      expect(summary.mode).toBe('automated');
    });
  });

  describe('TemplateValidationError', () => {
    it('should provide formatted error details', () => {
      let errorDetails = '';

      try {
        parseTemplate('template:\n  name: Missing ID');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('TemplateValidationError');

        if (error instanceof Error && 'getDetails' in error) {
          errorDetails = (error as TemplateValidationError).getDetails();
        }
      }

      expect(errorDetails).toContain('template.id');
      expect(errorDetails).toContain('Required');
    });
  });
});
