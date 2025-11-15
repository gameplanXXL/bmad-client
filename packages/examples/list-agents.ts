/**
 * Example: List Available Agents using VFS Tools
 *
 * This example demonstrates Story 3.5: Agent Metadata Inspection via Tools
 *
 * Shows how to:
 * 1. Use glob_pattern to discover agents in VFS
 * 2. Use read_file to load agent markdown files
 * 3. Parse YAML frontmatter with gray-matter to extract metadata
 * 4. Present agent information dynamically
 *
 * Run: npx tsx packages/examples/list-agents.ts
 */

import { BmadClient } from '../core/src/client.js';
import matter from 'gray-matter';

interface AgentMetadata {
  id: string;
  title: string;
  icon: string;
  whenToUse: string;
  role: string;
  commands: string[];
}

async function listAgents() {
  console.log('🔍 Agent Discovery via VFS Tools\n');
  console.log('='.repeat(60));

  // Initialize client
  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
    },
    logLevel: 'warn', // Reduce noise
  });

  // Start a session to get VFS access
  const session = await client.startAgent('pm', '*help');
  const executor = session.getToolExecutor();

  console.log('\n📁 Step 1: Discover agent files using glob_pattern');
  console.log('-'.repeat(60));

  // Use glob_pattern tool to discover all agents
  const globResult = await executor.executeTool({
    id: 'discover-agents',
    name: 'glob_pattern',
    input: {
      pattern: '/.bmad-core/agents/*.md',
    },
  });

  if (!globResult.success) {
    console.error('❌ Failed to discover agents:', globResult.error);
    return;
  }

  const agentPaths = globResult.content!.split('\n').filter(Boolean);
  console.log(`✅ Found ${agentPaths.length} agent files\n`);

  console.log('📖 Step 2: Read agent files and extract metadata');
  console.log('-'.repeat(60));

  const agents: AgentMetadata[] = [];

  for (const path of agentPaths) {
    // Use read_file tool to load agent content
    const readResult = await executor.executeTool({
      id: `read-${path}`,
      name: 'read_file',
      input: {
        file_path: path,
      },
    });

    if (!readResult.success) {
      console.warn(`⚠️  Failed to read ${path}`);
      continue;
    }

    // Parse YAML frontmatter using gray-matter
    const { data } = matter(readResult.content!);

    // Extract relevant metadata
    if (data.agent) {
      agents.push({
        id: data.agent.id,
        title: data.agent.title,
        icon: data.agent.icon,
        whenToUse: data.agent.whenToUse,
        role: data.persona?.role || 'Unknown',
        commands: data.commands || [],
      });
    }
  }

  console.log(`✅ Extracted metadata from ${agents.length} agents\n`);

  console.log('🤖 Step 3: Display available agents');
  console.log('='.repeat(60));

  agents.forEach((agent, index) => {
    console.log(`\n${index + 1}. ${agent.icon} ${agent.title} (${agent.id})`);
    console.log(`   Role: ${agent.role}`);
    console.log(`   When to use: ${agent.whenToUse}`);
    console.log(`   Commands: ${agent.commands.length} available`);

    if (agent.commands.length > 0) {
      const commandList = agent.commands.slice(0, 3).join(', ');
      const more = agent.commands.length > 3 ? `, +${agent.commands.length - 3} more` : '';
      console.log(`   Sample commands: ${commandList}${more}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total agents: ${agents.length}`);
  console.log(`   Discovery method: VFS glob_pattern + read_file`);
  console.log(`   Metadata parser: gray-matter (YAML frontmatter)`);

  console.log('\n💡 Usage in your application:');
  console.log('   1. Create BmadClient instance');
  console.log('   2. Start any agent session to get VFS access');
  console.log('   3. Use executor.executeTool() with glob_pattern and read_file');
  console.log('   4. Parse agent markdown with gray-matter');
  console.log('   5. Present metadata to users dynamically\n');
}

// Example: Filter agents by category
async function _filterAgentsByRole(_role: string) {
  console.log(`\n🔎 Filtering agents by role: "${_role}"`);

  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
    },
    logLevel: 'error',
  });

  const session = await client.startAgent('pm', '*help');
  const executor = session.getToolExecutor();

  // Discover all agents
  const globResult = await executor.executeTool({
    id: 'glob',
    name: 'glob_pattern',
    input: { pattern: '/.bmad-core/agents/*.md' },
  });

  const agentPaths = globResult.content!.split('\n').filter(Boolean);

  // Filter by role
  const matchingAgents = [];

  for (const path of agentPaths) {
    const readResult = await executor.executeTool({
      id: `read-${path}`,
      name: 'read_file',
      input: { file_path: path },
    });

    if (readResult.success) {
      const { data } = matter(readResult.content!);
      if (data.persona?.role?.toLowerCase().includes(role.toLowerCase())) {
        matchingAgents.push({
          id: data.agent?.id,
          title: data.agent?.title,
          icon: data.agent?.icon,
        });
      }
    }
  }

  console.log(`Found ${matchingAgents.length} agents with role containing "${role}":`);
  matchingAgents.forEach((agent) => {
    console.log(`  ${agent.icon} ${agent.title} (${agent.id})`);
  });
}

// Run examples
async function main() {
  try {
    await listAgents();

    // Uncomment to try filtering:
    // await filterAgentsByRole('Product');
    // await filterAgentsByRole('Developer');

    console.log('\n✅ Example completed successfully!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
