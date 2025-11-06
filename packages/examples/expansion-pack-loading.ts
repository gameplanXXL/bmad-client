/**
 * Example: Loading Expansion Pack Agents
 *
 * This example demonstrates how to load agents from expansion packs
 * installed in .bmad-* directories.
 *
 * Run: npx tsx packages/examples/expansion-pack-loading.ts
 */

import { BmadClient } from '../core/src/client.js';
import type { BmadClientConfig } from '../core/src/types.js';

async function main() {
  console.log('🚀 BMad Client - Expansion Pack Loading Example\n');

  // Configure the client
  // By default, expansion packs are auto-discovered in parent directory
  const config: BmadClientConfig = {
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
      model: 'claude-sonnet-4',
    },
    logLevel: 'info',
    // Optional: explicitly specify where to look for expansion packs
    // expansionPackPaths: ['../', '/path/to/expansion/packs'],
  };

  const client = new BmadClient(config);

  console.log('✅ Client initialized');
  console.log('📦 Expansion packs will be auto-discovered from parent directory\n');

  // When you start a session, agents from expansion packs are loaded automatically
  console.log('Starting session with PM agent (from .bmad-core)...\n');

  try {
    const session = await client.startAgent('pm', '*help');

    console.log('Session created:', {
      id: session.id,
      agent: session.agentId,
      command: session.command,
    });

    console.log('\n📋 Available Features:');
    console.log('  - Core agents loaded from .bmad-core/agents/');
    console.log('  - Expansion pack agents auto-discovered from .bmad-*/agents/');
    console.log('  - All agents accessible via VFS for orchestrator agents');
    console.log('  - Use glob_pattern("/.bmad-core/agents/*.md") to discover agents\n');

    // Note: To actually run the session, you would call:
    // const result = await session.execute();

    console.log('✨ Example complete!');
    console.log('\n💡 Tips:');
    console.log('  - Place expansion packs in parent directory (e.g., ../bmad-export-author/)');
    console.log('  - Expansion packs must follow .bmad-* naming convention');
    console.log('  - Each pack should have an agents/ subdirectory');
    console.log('  - Agents are loaded automatically on session creation');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

// Example: Manual expansion pack discovery
async function discoverExpansionPacks() {
  console.log('\n\n🔍 Manual Expansion Pack Discovery\n');

  const { AgentLoader } = await import('../core/src/agent-loader.js');
  const loader = new AgentLoader();

  try {
    // Scan parent directory AND bmad-export-author for expansion packs
    const searchPaths = ['../', '../bmad-export-author/'];
    const packs = await loader.loadExpansionPacks(searchPaths);

    console.log(`Found ${packs.length} expansion pack(s):\n`);

    for (const pack of packs) {
      console.log(`  📦 ${pack.name}`);
      console.log(`     Path: ${pack.path}`);
      console.log(`     Agents: ${pack.agentCount}`);

      // List first few agents
      const agentList = pack.agents
        .slice(0, 5)
        .map(a => a.agent.id)
        .join(', ');

      console.log(`     Sample: ${agentList}`);

      if (pack.agents.length > 5) {
        console.log(`     ... and ${pack.agents.length - 5} more`);
      }

      console.log();
    }

    if (packs.length === 0) {
      console.log('  No expansion packs found in parent directory');
      console.log('  Create a .bmad-* directory with agents/ subdirectory\n');
    }

  } catch (error) {
    console.error('❌ Error discovering packs:', error instanceof Error ? error.message : error);
  }
}

// Run both examples
main()
  .then(() => discoverExpansionPacks())
  .then(() => {
    console.log('\n✅ All examples completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
