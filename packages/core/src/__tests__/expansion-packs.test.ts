import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { AgentLoader } from '../agent-loader.js';

describe('Expansion Pack Loading', () => {
  const testDir = join(process.cwd(), '.test-expansion-packs');
  let loader: AgentLoader;

  beforeEach(async () => {
    loader = new AgentLoader();

    // Create test directory structure
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it('should discover expansion packs in directory', async () => {
    // Create mock expansion pack structure
    const packPath = join(testDir, '.bmad-test-pack');
    const agentsPath = join(packPath, 'agents');
    await mkdir(agentsPath, { recursive: true });

    // Create test agent
    const agentContent = `---
agent:
  name: Test Agent
  id: test-agent
  title: Test Agent
  icon: 🧪
  whenToUse: For testing
persona:
  role: Tester
  style: Test-driven
  identity: Test agent for expansion packs
  focus: Testing
  core_principles:
    - Test everything
commands:
  - test
dependencies:
  tasks: []
  templates: []
---

# Test Agent
`;

    await writeFile(join(agentsPath, 'test-agent.md'), agentContent, 'utf-8');

    // Load expansion packs
    const packs = await loader.loadExpansionPacks([testDir]);

    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe('test-pack');
    expect(packs[0].agentCount).toBe(1);
    expect(packs[0].agents[0].agent.id).toBe('test-agent');
  });

  it('should discover multiple expansion packs', async () => {
    // Create two expansion packs
    const pack1Path = join(testDir, '.bmad-pack-one');
    const pack2Path = join(testDir, '.bmad-pack-two');

    await mkdir(join(pack1Path, 'agents'), { recursive: true });
    await mkdir(join(pack2Path, 'agents'), { recursive: true });

    const agentContent = (id: string) => `---
agent:
  name: Agent ${id}
  id: ${id}
  title: Agent ${id}
  icon: 🧪
  whenToUse: Testing
persona:
  role: Tester
  style: Test
  identity: Test
  focus: Test
  core_principles:
    - Test
commands:
  - test
dependencies:
  tasks: []
  templates: []
---
# Agent ${id}
`;

    await writeFile(join(pack1Path, 'agents', 'agent1.md'), agentContent('agent1'), 'utf-8');
    await writeFile(join(pack2Path, 'agents', 'agent2.md'), agentContent('agent2'), 'utf-8');

    const packs = await loader.loadExpansionPacks([testDir]);

    expect(packs).toHaveLength(2);
    expect(packs.map(p => p.name).sort()).toEqual(['pack-one', 'pack-two']);
  });

  it('should handle multiple agents in one expansion pack', async () => {
    const packPath = join(testDir, '.bmad-multi-agent');
    const agentsPath = join(packPath, 'agents');
    await mkdir(agentsPath, { recursive: true });

    const agentContent = (id: string) => `---
agent:
  name: Agent ${id}
  id: ${id}
  title: Agent ${id}
  icon: 🧪
  whenToUse: Testing
persona:
  role: Tester
  style: Test
  identity: Test
  focus: Test
  core_principles:
    - Test
commands:
  - test
dependencies:
  tasks: []
  templates: []
---
# Agent ${id}
`;

    await writeFile(join(agentsPath, 'agent1.md'), agentContent('agent1'), 'utf-8');
    await writeFile(join(agentsPath, 'agent2.md'), agentContent('agent2'), 'utf-8');
    await writeFile(join(agentsPath, 'agent3.md'), agentContent('agent3'), 'utf-8');

    const packs = await loader.loadExpansionPacks([testDir]);

    expect(packs).toHaveLength(1);
    expect(packs[0].agentCount).toBe(3);
    expect(packs[0].agents.map(a => a.agent.id).sort()).toEqual(['agent1', 'agent2', 'agent3']);
  });

  it('should skip directories without agents subdirectory', async () => {
    // Create expansion pack without agents directory
    const packPath = join(testDir, '.bmad-no-agents');
    await mkdir(packPath, { recursive: true });

    const packs = await loader.loadExpansionPacks([testDir]);

    expect(packs).toHaveLength(0);
  });

  it('should handle invalid agent files gracefully', async () => {
    const packPath = join(testDir, '.bmad-invalid');
    const agentsPath = join(packPath, 'agents');
    await mkdir(agentsPath, { recursive: true });

    // Create invalid agent file (missing required fields)
    await writeFile(join(agentsPath, 'invalid.md'), '---\ninvalid: yaml\n---\n', 'utf-8');

    // Should not throw, just skip invalid agents
    const packs = await loader.loadExpansionPacks([testDir]);

    // Pack is found but has 0 agents (invalid one was skipped)
    expect(packs.some(p => p.name === 'invalid')).toBe(false);
  });

  it('should handle non-existent search paths gracefully', async () => {
    const nonExistentPath = join(testDir, 'does-not-exist');

    // Should not throw
    const packs = await loader.loadExpansionPacks([nonExistentPath]);

    expect(packs).toHaveLength(0);
  });

  it('should search multiple paths', async () => {
    const dir1 = join(testDir, 'dir1');
    const dir2 = join(testDir, 'dir2');

    await mkdir(join(dir1, '.bmad-pack1', 'agents'), { recursive: true });
    await mkdir(join(dir2, '.bmad-pack2', 'agents'), { recursive: true });

    const agentContent = (id: string) => `---
agent:
  name: Agent ${id}
  id: ${id}
  title: Agent ${id}
  icon: 🧪
  whenToUse: Testing
persona:
  role: Tester
  style: Test
  identity: Test
  focus: Test
  core_principles:
    - Test
commands:
  - test
dependencies:
  tasks: []
  templates: []
---
# Agent ${id}
`;

    await writeFile(join(dir1, '.bmad-pack1', 'agents', 'agent1.md'), agentContent('agent1'), 'utf-8');
    await writeFile(join(dir2, '.bmad-pack2', 'agents', 'agent2.md'), agentContent('agent2'), 'utf-8');

    const packs = await loader.loadExpansionPacks([dir1, dir2]);

    expect(packs).toHaveLength(2);
    expect(packs.map(p => p.name).sort()).toEqual(['pack1', 'pack2']);
  });

  it('should ignore non-.bmad directories', async () => {
    // Create regular directory (not starting with .bmad-)
    const regularDir = join(testDir, 'regular-dir');
    await mkdir(join(regularDir, 'agents'), { recursive: true });

    const agentContent = `---
agent:
  name: Regular
  id: regular
  title: Regular
  icon: 🧪
  whenToUse: Testing
persona:
  role: Tester
  style: Test
  identity: Test
  focus: Test
  core_principles:
    - Test
commands:
  - test
dependencies:
  tasks: []
  templates: []
---
# Regular
`;

    await writeFile(join(regularDir, 'agents', 'regular.md'), agentContent, 'utf-8');

    const packs = await loader.loadExpansionPacks([testDir]);

    // Should not find regular-dir, only .bmad-* directories
    expect(packs).toHaveLength(0);
  });
});
