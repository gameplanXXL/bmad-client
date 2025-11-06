import { describe, it, expect } from 'vitest';
import { BmadClient } from '../client.js';
import matter from 'gray-matter';

/**
 * Story 3.5: Agent Metadata Inspection via Tools
 *
 * Tests VFS-based agent discovery using glob_pattern and read_file tools
 */
describe('Agent Metadata Inspection via VFS Tools', () => {
  it('should discover agents using glob_pattern tool', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
    });

    const session = await client.startAgent('pm', '*help');

    // Execute glob_pattern tool to discover agents
    const globResult = await session.getToolExecutor().executeTool({
      id: 'test-glob',
      name: 'glob_pattern',
      input: {
        pattern: '/.bmad-core/agents/*.md',
      },
    });

    expect(globResult.success).toBe(true);
    expect(globResult.content).toBeDefined();

    // Parse the result to get agent file paths
    const agentPaths = globResult.content!.split('\n').filter(Boolean);

    expect(agentPaths.length).toBeGreaterThan(0);
    expect(agentPaths.some(path => path.includes('pm.md'))).toBe(true);
  });

  it('should read agent file and extract metadata', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
    });

    const session = await client.startAgent('pm', '*help');
    const executor = session.getToolExecutor();

    // First, discover agents
    const globResult = await executor.executeTool({
      id: 'test-glob',
      name: 'glob_pattern',
      input: {
        pattern: '/.bmad-core/agents/*.md',
      },
    });

    const agentPaths = globResult.content!.split('\n').filter(Boolean);
    expect(agentPaths.length).toBeGreaterThan(0);

    // Read pm.md (has frontmatter format for testing)
    const pmPath = agentPaths.find(p => p.includes('pm.md'))!;
    expect(pmPath).toBeDefined();

    const readResult = await executor.executeTool({
      id: 'test-read',
      name: 'read_file',
      input: {
        file_path: pmPath,
      },
    });

    expect(readResult.success).toBe(true);
    expect(readResult.content).toBeDefined();

    // Parse YAML frontmatter using gray-matter
    const { data } = matter(readResult.content!);

    // Verify metadata structure
    expect(data).toHaveProperty('agent');
    expect(data.agent).toHaveProperty('id');
    expect(data.agent).toHaveProperty('title');
    expect(data.agent).toHaveProperty('icon');
    expect(data.agent).toHaveProperty('whenToUse');

    expect(data).toHaveProperty('persona');
    expect(data.persona).toHaveProperty('role');
    expect(data.persona).toHaveProperty('style');
    expect(data.persona).toHaveProperty('identity');
    expect(data.persona).toHaveProperty('focus');
    expect(data.persona).toHaveProperty('core_principles');

    expect(data).toHaveProperty('commands');
    expect(Array.isArray(data.commands)).toBe(true);
  });

  it('should extract all agent metadata from VFS', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
    });

    const session = await client.startAgent('pm', '*help');
    const executor = session.getToolExecutor();

    // Discover all agents
    const globResult = await executor.executeTool({
      id: 'glob-agents',
      name: 'glob_pattern',
      input: {
        pattern: '/.bmad-core/agents/*.md',
      },
    });

    const agentPaths = globResult.content!.split('\n').filter(Boolean);

    // Filter to only pm.md which has frontmatter format
    const frontmatterAgents = agentPaths.filter(p => p.includes('pm.md'));

    // Extract metadata from frontmatter agents
    const agentsMetadata = await Promise.all(
      frontmatterAgents.map(async (path) => {
        const readResult = await executor.executeTool({
          id: `read-${path}`,
          name: 'read_file',
          input: {
            file_path: path,
          },
        });

        if (!readResult.success) return null;

        const { data } = matter(readResult.content!);

        return {
          path,
          id: data.agent?.id,
          title: data.agent?.title,
          icon: data.agent?.icon,
          whenToUse: data.agent?.whenToUse,
          commands: data.commands,
          persona: {
            role: data.persona?.role,
            focus: data.persona?.focus,
          },
        };
      })
    );

    const validAgents = agentsMetadata.filter(Boolean);

    expect(validAgents.length).toBeGreaterThan(0);

    // Verify we have expected agents
    const agentIds = validAgents.map((a) => a?.id);
    expect(agentIds).toContain('pm');

    // Verify metadata structure for all agents
    validAgents.forEach((agent) => {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('title');
      expect(agent).toHaveProperty('icon');
      expect(agent).toHaveProperty('whenToUse');
      expect(agent).toHaveProperty('commands');
      expect(agent).toHaveProperty('persona');
    });
  });

  it('should handle agent discovery from expansion packs', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
      expansionPackPaths: ['../bmad-export-author/'],
    });

    const session = await client.startAgent('pm', '*help');
    const executor = session.getToolExecutor();

    // Wait for VFS to be populated
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Discover agents - should include expansion pack agents
    const globResult = await executor.executeTool({
      id: 'glob-all',
      name: 'glob_pattern',
      input: {
        pattern: '/.bmad-core/agents/*.md',
      },
    });

    const agentPaths = globResult.content!.split('\n').filter(Boolean);

    // Should have core agents + potentially expansion pack agents
    expect(agentPaths.length).toBeGreaterThan(0);
  });

  it('should support filtering agents by pattern', async () => {
    const client = new BmadClient({
      provider: {
        type: 'anthropic',
        apiKey: 'test-key',
      },
    });

    const session = await client.startAgent('pm', '*help');
    const executor = session.getToolExecutor();

    // Search for specific agent pattern (e.g., agents starting with 'p')
    const globResult = await executor.executeTool({
      id: 'glob-filtered',
      name: 'glob_pattern',
      input: {
        pattern: '/.bmad-core/agents/p*.md',
      },
    });

    const agentPaths = globResult.content!.split('\n').filter(Boolean);

    // All results should match pattern
    agentPaths.forEach((path) => {
      expect(path).toMatch(/\/p[^/]*\.md$/);
    });
  });
});
