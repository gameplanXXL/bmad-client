/**
 * Simple BMad Agent Execution Example
 *
 * This example demonstrates how to:
 * - Initialize the BmadClient
 * - Start an agent session
 * - Listen for events
 * - Execute the agent and get results
 */

import { BmadClient } from '../packages/core/src/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  console.log('🚀 BMad Client - Simple Agent Example\n');

  // 1. Initialize client with Anthropic provider
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set');
    console.log('   Please create a .env file in the project root with:');
    console.log('   ANTHROPIC_API_KEY="your-key-here"\n');
    console.log('   Or copy .env.example to .env and fill in your key');
    process.exit(1);
  }

  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: apiKey,
      model: (process.env.BMAD_MODEL as any) || 'claude-sonnet-4',
    },
  });

  console.log('✅ Client initialized');
  console.log(`   Provider: anthropic`);
  console.log(`   Model: ${client.getConfig().provider.model || 'default'}\n`);

  // 2. Start agent session
  const agentId = 'pm'; // Product Manager agent
  const command = '*help';

  console.log(`📋 Starting agent: ${agentId}`);
  console.log(`   Command: ${command}\n`);

  const session = await client.startAgent(agentId, command);

  console.log(`🆔 Session ID: ${session.id}\n`);

  // 3. Set up event listeners
  session.on('started', () => {
    console.log('▶️  Session started - Agent is now executing...\n');
  });

  session.on('completed', (result) => {
    console.log('\n✅ Session completed successfully!');
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Status: ${result.status}\n`);
  });

  session.on('failed', (error) => {
    console.error('\n❌ Session failed:', error.message);
  });

  // 4. Execute the session
  const startTime = Date.now();
  const result = await session.execute();
  const duration = Date.now() - startTime;

  // 5. Display results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 EXECUTION RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${duration}ms\n`);

  // Show what the agent did (if there were any messages/responses)
  console.log('🤖 Agent Activity:');
  console.log(`   The agent processed your "${command}" command`);
  console.log(`   and completed ${result.costs.apiCalls} API call(s) to Claude.\n`);

  // Agent Response
  if (result.finalResponse) {
    console.log('💬 Agent Response:');
    console.log('─'.repeat(60));
    console.log(result.finalResponse);
    console.log('─'.repeat(60));
    console.log();
  }

  // Cost Report
  console.log('💰 Cost Report:');
  console.log(`   Total Cost: $${result.costs.totalCost.toFixed(4)} USD`);
  console.log(`   Input Tokens: ${result.costs.inputTokens.toLocaleString()}`);
  console.log(`   Output Tokens: ${result.costs.outputTokens.toLocaleString()}`);
  console.log(`   API Calls: ${result.costs.apiCalls}\n`);

  // Cost Breakdown
  if (result.costs.breakdown.length > 0) {
    console.log('   Breakdown:');
    result.costs.breakdown.forEach((cost) => {
      console.log(`   - ${cost.model}:`);
      console.log(
        `     Input: $${cost.inputCost.toFixed(4)} (${cost.inputTokens.toLocaleString()} tokens)`
      );
      console.log(
        `     Output: $${cost.outputCost.toFixed(4)} (${cost.outputTokens.toLocaleString()} tokens)`
      );
    });
    console.log();
  }

  // Documents Created
  console.log(`📄 Documents Created: ${result.documents.length}`);
  if (result.documents.length > 0) {
    console.log();
    result.documents.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.path}`);
      console.log(`      Size: ${doc.content.length} bytes`);
      if (doc.content.length <= 200) {
        console.log(`      Preview: ${doc.content.substring(0, 100)}...`);
      }
    });
  }

  // Error handling
  if (result.error) {
    console.log('\n❌ Error Details:');
    console.log(`   ${result.error.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
  console.log('✨ Example completed!\n');
}

// Run the example
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
