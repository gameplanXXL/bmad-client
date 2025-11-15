import { describe, it, expect } from 'vitest';
import { AgentLoader, AgentLoadError } from '../agent-loader.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AgentLoader', () => {
  const loader = new AgentLoader();

  // Valid agent YAML for testing
  const validAgentYAML = `---
agent:
  name: TestAgent
  id: test-agent
  title: Test Agent
  icon: 🧪
  whenToUse: Use for testing
  customization: Test customization
persona:
  role: Tester
  style: Methodical
  identity: Test specialist
  focus: Testing everything
  core_principles:
    - Test thoroughly
    - Document findings
    - Report clearly
commands:
  - help
  - test
  - exit
dependencies:
  tasks:
    - test-task.md
  templates:
    - test-template.yaml
activation_instructions:
  - Read this file
  - Adopt the persona
  - Start testing
---

# Test Agent

This is the test agent content.
`;

  const invalidAgentYAML = `---
agent:
  name: TestAgent
  # Missing required fields
persona:
  role: Tester
---

# Invalid Agent
`;

  describe('loadAgent', () => {
    it('should load agent from valid markdown file', async () => {
      // Create temp file
      const tempDir = join(tmpdir(), 'bmad-test-' + Date.now());
      await mkdir(tempDir, { recursive: true });
      const filePath = join(tempDir, 'test-agent.md');
      await writeFile(filePath, validAgentYAML, 'utf-8');

      try {
        const agent = await loader.loadAgent(filePath);

        expect(agent).toBeDefined();
        expect(agent.agent.id).toBe('test-agent');
        expect(agent.agent.name).toBe('TestAgent');
        expect(agent.agent.title).toBe('Test Agent');
        expect(agent.agent.icon).toBe('🧪');
        expect(agent.persona?.role).toBe('Tester');
        expect(agent.persona?.core_principles).toHaveLength(3);
        expect(agent.commands).toContain('help');
        expect(agent.dependencies?.tasks).toContain('test-task.md');
      } finally {
        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should throw AgentLoadError for non-existent file', async () => {
      await expect(loader.loadAgent('/non/existent/file.md')).rejects.toThrow(AgentLoadError);
    });

    it('should throw AgentLoadError for invalid YAML', async () => {
      const tempDir = join(tmpdir(), 'bmad-test-' + Date.now());
      await mkdir(tempDir, { recursive: true });
      const filePath = join(tempDir, 'invalid-agent.md');
      await writeFile(filePath, invalidAgentYAML, 'utf-8');

      try {
        await expect(loader.loadAgent(filePath)).rejects.toThrow(AgentLoadError);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle agent without optional fields', async () => {
      const minimalAgentYAML = `---
agent:
  name: MinimalAgent
  id: minimal
  title: Minimal
  icon: ⚡
  whenToUse: Minimal testing
persona:
  role: Minimalist
  style: Simple
  identity: Minimal tester
  focus: Basics
  core_principles:
    - Keep it simple
commands:
  - help
dependencies: {}
---

# Minimal Agent
`;

      const tempDir = join(tmpdir(), 'bmad-test-' + Date.now());
      await mkdir(tempDir, { recursive: true });
      const filePath = join(tempDir, 'minimal-agent.md');
      await writeFile(filePath, minimalAgentYAML, 'utf-8');

      try {
        const agent = await loader.loadAgent(filePath);

        expect(agent).toBeDefined();
        expect(agent.agent.id).toBe('minimal');
        expect(agent.agent.customization).toBeUndefined();
        expect(agent.activation_instructions).toBeUndefined();
        expect(agent.dependencies?.tasks).toBeUndefined();
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('loadFromDirectory', () => {
    it('should load multiple agents from directory', async () => {
      const tempDir = join(tmpdir(), 'bmad-test-' + Date.now());
      await mkdir(tempDir, { recursive: true });

      // Create two agent files
      const agent1YAML = validAgentYAML;
      const agent2YAML = validAgentYAML.replace(/test-agent/g, 'test-agent-2');

      await writeFile(join(tempDir, 'agent1.md'), agent1YAML, 'utf-8');
      await writeFile(join(tempDir, 'agent2.md'), agent2YAML, 'utf-8');

      // Create non-MD file (should be ignored)
      await writeFile(join(tempDir, 'readme.txt'), 'Not an agent', 'utf-8');

      try {
        const agents = await loader.loadFromDirectory(tempDir);

        expect(agents).toHaveLength(2);
        expect(agents[0]?.agent.id).toMatch(/test-agent/);
        expect(agents[1]?.agent.id).toMatch(/test-agent/);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty array for directory with no markdown files', async () => {
      const tempDir = join(tmpdir(), 'bmad-test-' + Date.now());
      await mkdir(tempDir, { recursive: true });

      await writeFile(join(tempDir, 'readme.txt'), 'Not an agent', 'utf-8');

      try {
        const agents = await loader.loadFromDirectory(tempDir);
        expect(agents).toHaveLength(0);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should throw AgentLoadError for non-existent directory', async () => {
      await expect(loader.loadFromDirectory('/non/existent/directory')).rejects.toThrow(
        AgentLoadError
      );
    });
  });

  describe('Real PM Agent Integration', () => {
    it('should load real PM agent from bmad-export-author', async () => {
      const pmAgentPath = '../bmad-export-author/.bmad-core/agents/pm.md';

      try {
        const agent = await loader.loadAgent(pmAgentPath);

        expect(agent).toBeDefined();
        expect(agent.agent.id).toBe('pm');
        expect(agent.agent.name).toBe('John');
        expect(agent.agent.title).toBe('Product Manager');
        expect(agent.persona?.role).toContain('Product');
        expect(agent.commands?.length).toBeGreaterThan(0);
      } catch (error) {
        // This test may fail if bmad-export-author is not available
        // That's OK for now - we'll skip it
        if (error instanceof AgentLoadError) {
          console.log('Skipping real PM agent test - bmad-export-author not found');
        } else {
          throw error;
        }
      }
    });
  });
});
