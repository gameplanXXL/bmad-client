/**
 * Example: Conversational Session (Multi-turn interaction)
 *
 * This example demonstrates the ConversationalSession API, which provides
 * a Claude Code-like REPL experience. Unlike BmadSession (one-shot execution),
 * ConversationalSession maintains context across multiple user messages.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx packages/examples/conversational-session.ts
 */

import { BmadClient } from '../core/src/index.js';
import * as readline from 'readline';

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('🎭 BMad Conversational Session Example\n');
  console.log('This example shows multi-turn conversation with persistent context.\n');

  // Initialize client
  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-20250514',
    },
    logLevel: 'info',
  });

  console.log('✅ Client initialized\n');

  // Start conversation with PM agent
  console.log('🚀 Starting conversation with PM agent...\n');
  const conversation = await client.startConversation('pm', {
    costLimit: 5.0, // Limit to $5
  });

  console.log(`✅ Conversation started: ${conversation.id}\n`);

  // Setup event listeners
  conversation.on('turn-started', () => {
    console.log('\n🔄 Agent processing...\n');
  });

  conversation.on('turn-completed', (turn) => {
    console.log(`\n✅ Turn completed (${turn.id})`);
    console.log(`💰 Cost: $${turn.cost.toFixed(4)}`);
    console.log(`📊 Tokens: ${turn.tokensUsed.input} input, ${turn.tokensUsed.output} output\n`);
    console.log('━'.repeat(80));
    console.log(`🤖 Agent: ${turn.agentResponse}`);
    console.log('━'.repeat(80) + '\n');
  });

  conversation.on('question', async ({ question }) => {
    console.log(`\n❓ Agent question: ${question}\n`);

    // Get answer from user
    const answer = await askUser('Your answer: ');
    await conversation.answer(answer);
  });

  conversation.on('cost-warning', (cost) => {
    console.warn(`\n⚠️  Cost warning: $${cost.toFixed(2)} (80% of limit reached)\n`);
  });

  conversation.on('error', (error) => {
    console.error(`\n❌ Error: ${error.message}\n`);
  });

  console.log('🎙️  Type your messages (or "quit" to end conversation)\n');

  // Interactive REPL loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let running = true;

  while (running) {
    const userMessage = await new Promise<string>((resolve) => {
      rl.question('\n👤 You: ', (answer) => {
        resolve(answer);
      });
    });

    if (userMessage.toLowerCase() === 'quit') {
      running = false;
      break;
    }

    if (userMessage.toLowerCase() === 'status') {
      // Show current status
      const costs = conversation.getCosts();
      const history = conversation.getHistory();
      const documents = conversation.getDocuments();

      console.log('\n📊 Conversation Status:');
      console.log(`  Turns: ${history.length}`);
      console.log(`  Cost: $${costs.totalCost.toFixed(4)}`);
      console.log(`  Tokens: ${costs.inputTokens} input, ${costs.outputTokens} output`);
      console.log(`  Documents: ${documents.length}`);
      if (documents.length > 0) {
        documents.forEach((doc) => {
          console.log(`    - ${doc.path} (${doc.content.length} bytes)`);
        });
      }
      console.log();
      continue;
    }

    if (userMessage.toLowerCase() === 'history') {
      // Show conversation history
      const history = conversation.getHistory();
      console.log('\n📜 Conversation History:\n');
      history.forEach((turn, index) => {
        console.log(`Turn ${index + 1}:`);
        console.log(`  👤 User: ${turn.userMessage.substring(0, 100)}`);
        console.log(`  🤖 Agent: ${turn.agentResponse.substring(0, 100)}`);
        console.log(`  💰 Cost: $${turn.cost.toFixed(4)}`);
        console.log();
      });
      continue;
    }

    if (!userMessage.trim()) {
      continue;
    }

    // Send message to agent
    await conversation.send(userMessage);

    // Wait for agent to finish processing
    try {
      await conversation.waitForCompletion(300000); // 5 min timeout
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
    }
  }

  // End conversation
  console.log('\n🛑 Ending conversation...\n');
  const result = await conversation.end();

  // Display final results
  console.log('━'.repeat(80));
  console.log('📊 Final Results');
  console.log('━'.repeat(80));
  console.log(`Conversation ID: ${result.conversationId}`);
  console.log(`Turns: ${result.turns.length}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`Total Cost: $${result.totalCost.toFixed(4)}`);
  console.log(`Total Tokens: ${result.totalTokens.input} input, ${result.totalTokens.output} output`);
  console.log(`\nDocuments created: ${result.documents.length}`);

  result.documents.forEach((doc) => {
    console.log(`  📄 ${doc.path}`);
    console.log(`     ${doc.content.substring(0, 100)}...`);
  });

  console.log('\n✅ Conversation ended successfully\n');

  rl.close();
}

// Helper function for user input
function askUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
