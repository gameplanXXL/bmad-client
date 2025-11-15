import { describe, it, expect } from 'vitest';
import { AgentLoader } from '../agent-loader.js';
import { existsSync } from 'fs';

describe('Expansion Pack Loading', () => {
  it('should load Expert Author agents with code-block YAML format', async () => {
    const expansionPackPath = '../../../bmad-export-author/.bmad-expert-author/agents';

    if (!existsSync(expansionPackPath)) {
      console.log('Skipping test - bmad-export-author not found');
      return;
    }

    const loader = new AgentLoader();
    const agent = await loader.loadAgent(`${expansionPackPath}/ea-book-strategist.md`);

    expect(agent).toBeDefined();
    expect(agent.agent.id).toBe('book-strategist');
    expect(agent.agent.name).toBe('Bianca');
    expect(agent.persona).toBeDefined();
    expect(agent.persona?.role).toContain('Strategic');
  });

  it('should load all Expert Author agents (tolerating malformed agents)', async () => {
    const expansionPackPath = '../../../bmad-export-author/.bmad-expert-author/agents';

    if (!existsSync(expansionPackPath)) {
      console.log('Skipping test - bmad-export-author not found');
      return;
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir(expansionPackPath);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    console.log(`Found ${mdFiles.length} agent files`);

    const loader = new AgentLoader();
    const results = await Promise.allSettled(
      mdFiles.map((file) => loader.loadAgent(`${expansionPackPath}/${file}`))
    );

    const successful = results.filter(
      (r) => r.status === 'fulfilled'
    ) as PromiseFulfilledResult<any>[];
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    console.log(`\n✅ Successfully loaded ${successful.length} agents:`);
    successful.forEach((r) => console.log(`  - ${r.value.agent.name} (${r.value.agent.id})`));

    if (failed.length > 0) {
      console.log(`\n❌ Failed to load ${failed.length} agents:`);
      failed.forEach((r, i) =>
        console.log(`  - ${mdFiles[i]}: ${r.reason.message.split('\n')[0]}`)
      );
    }

    expect(successful.length).toBeGreaterThan(0);
    expect(successful.some((r) => r.value.agent.id === 'book-strategist')).toBe(true);
  });

  it('should discover all expansion packs in bmad-export-author', async () => {
    const basePath = '../../../bmad-export-author';

    if (!existsSync(basePath)) {
      console.log('Skipping test - bmad-export-author not found');
      return;
    }

    const loader = new AgentLoader();
    const packs = await loader.loadExpansionPacks([basePath]);

    console.log(`Found ${packs.length} expansion packs:`);
    packs.forEach((p) => {
      console.log(`  - ${p.name}: ${p.agentCount} agents`);
      p.agents.forEach((a) => console.log(`    • ${a.agent.name} (${a.agent.id})`));
    });

    expect(packs.length).toBeGreaterThan(0);

    const expertAuthor = packs.find((p) => p.name === 'expert-author');
    if (expertAuthor) {
      expect(expertAuthor.agentCount).toBeGreaterThan(0);
    }
  });
});
