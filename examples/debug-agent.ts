/**
 * Debug BMad Agent Execution Example
 *
 * This example shows detailed information about what happens during agent execution:
 * - All messages sent to/from the LLM
 * - Tool calls made by the agent
 * - Step-by-step execution flow
 */

import { BmadClient } from '../packages/core/src/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  console.log('🔍 BMad Client - DEBUG MODE\n');
  console.log('This example shows detailed execution information.\n');

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set');
    console.log('   Please configure your .env file\n');
    process.exit(1);
  }

  // Initialize client
  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: apiKey,
      model: (process.env.BMAD_MODEL as any) || 'claude-sonnet-4',
    },
  });

  console.log('✅ Client initialized\n');

  // Start session
  const agentId = 'pm';
  const command = '*help';

  console.log(`📋 Starting agent: ${agentId}`);
  console.log(`   Command: ${command}\n`);

  const session = await client.startAgent(agentId, command);

  console.log(`🆔 Session ID: ${session.id}`);
  console.log(`   Status: ${session.getStatus()}\n`);

  // Track execution steps
  let stepCount = 0;

  session.on('started', () => {
    stepCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`STEP ${stepCount}: SESSION STARTED`);
    console.log('='.repeat(60));
    console.log('▶️  Agent execution beginning...');
    console.log('   The agent will now:');
    console.log('   1. Load its persona and instructions');
    console.log('   2. Send initial message to Claude API');
    console.log('   3. Process any tool calls');
    console.log('   4. Continue until task is complete\n');
  });

  session.on('completed', (result) => {
    stepCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`STEP ${stepCount}: SESSION COMPLETED`);
    console.log('='.repeat(60));
    console.log(`✅ Status: ${result.status}`);
    console.log(`⏱️  Duration: ${result.duration}ms`);
    console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
    console.log(`📞 API Calls: ${result.costs.apiCalls}`);
    console.log(`📄 Documents: ${result.documents.length}\n`);
  });

  session.on('failed', (error) => {
    stepCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`STEP ${stepCount}: SESSION FAILED`);
    console.log('='.repeat(60));
    console.error(`❌ Error: ${error.message}\n`);
  });

  console.log('🚀 Executing session...\n');

  // Execute
  const result = await session.execute();

  // Detailed results
  console.log('\n' + '='.repeat(60));
  console.log('📊 DETAILED EXECUTION REPORT');
  console.log('='.repeat(60) + '\n');

  console.log('🎯 Summary:');
  console.log(`   Agent: ${agentId}`);
  console.log(`   Command: ${command}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Duration: ${result.duration}ms\n`);

  console.log('💬 Communication:');
  console.log(`   Input Tokens: ${result.costs.inputTokens.toLocaleString()}`);
  console.log(`   Output Tokens: ${result.costs.outputTokens.toLocaleString()}`);
  console.log(
    `   Total Tokens: ${(result.costs.inputTokens + result.costs.outputTokens).toLocaleString()}\n`
  );

  console.log('💰 Cost Breakdown:');
  result.costs.breakdown.forEach((cost) => {
    console.log(`   Model: ${cost.model}`);
    console.log(
      `   - Input:  ${cost.inputTokens.toLocaleString()} tokens = $${cost.inputCost.toFixed(4)}`
    );
    console.log(
      `   - Output: ${cost.outputTokens.toLocaleString()} tokens = $${cost.outputCost.toFixed(4)}`
    );
    console.log(`   - Total:  $${(cost.inputCost + cost.outputCost).toFixed(4)}\n`);
  });

  console.log('💬 Agent Response:');
  if (result.finalResponse) {
    console.log('   ┌─────────────────────────────────────────────────────┐');
    const responseLines = result.finalResponse.split('\n');
    responseLines.forEach((line) => {
      // Wrap long lines at 50 chars
      if (line.length > 50) {
        const words = line.split(' ');
        let currentLine = '   │ ';
        words.forEach((word) => {
          if ((currentLine + word).length > 55) {
            console.log(currentLine.padEnd(58) + '│');
            currentLine = '   │ ' + word + ' ';
          } else {
            currentLine += word + ' ';
          }
        });
        if (currentLine.trim().length > 3) {
          console.log(currentLine.padEnd(58) + '│');
        }
      } else {
        console.log(`   │ ${line}`.padEnd(58) + '│');
      }
    });
    console.log('   └─────────────────────────────────────────────────────┘\n');
  } else {
    console.log('   (No text response - agent may have used tools only)\n');
  }

  console.log('📄 Generated Documents:');
  if (result.documents.length === 0) {
    console.log('   (none - this was a simple query)\n');
  } else {
    result.documents.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.path}`);
      console.log(`      Size: ${doc.content.length} bytes`);
      console.log(`      Preview:\n${doc.content.substring(0, 200)}...\n`);
    });
  }

  console.log('💭 Conversation Summary:');
  if (result.messages) {
    const messagesByRole = {
      system: result.messages.filter((m) => m.role === 'system').length,
      user: result.messages.filter((m) => m.role === 'user').length,
      assistant: result.messages.filter((m) => m.role === 'assistant').length,
    };
    console.log(`   System messages: ${messagesByRole.system}`);
    console.log(`   User messages: ${messagesByRole.user}`);
    console.log(`   Assistant messages: ${messagesByRole.assistant}`);
    console.log(`   Total: ${result.messages.length} messages\n`);
  }

  if (result.error) {
    console.log('❌ Errors:');
    console.log(`   ${result.error.message}\n`);
  }

  console.log('═'.repeat(60));
  console.log('✨ First request complete!\n');

  // Explanation
  console.log('💡 What happened:');
  console.log('   1. The agent persona was loaded from .bmad-core/agents/pm.md');
  console.log('   2. A system prompt was generated (Claude Code style)');
  console.log('   3. Your command was sent to Claude API');
  console.log(`   4. Claude processed it and sent back ${result.costs.outputTokens} tokens`);
  console.log('   5. The session completed successfully');
  console.log('\n   The agent understood your request and responded accordingly.');
  console.log(
    `   Total cost: $${result.costs.totalCost.toFixed(4)} (~${(result.costs.totalCost * 100).toFixed(2)}¢)\n`
  );

  // ========================================================================
  // SECOND REQUEST (Same Session - Continued Conversation)
  // ========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('🔄 CONTINUING SAME SESSION WITH SECOND REQUEST');
  console.log('='.repeat(60) + '\n');

  const command2 = 'What is your role?';

  console.log(`📋 Continuing session: ${session.id}`);
  console.log(`   New message: ${command2}`);
  console.log(`   Status: ${session.getStatus()}\n`);

  console.log('🚀 Sending second message in same conversation...\n');

  // Continue with second request in the SAME session
  const result2 = await session.continueWith(command2);

  // Detailed results for second request
  console.log('\n' + '='.repeat(60));
  console.log('📊 SECOND REQUEST - DETAILED EXECUTION REPORT');
  console.log('='.repeat(60) + '\n');

  console.log('🎯 Summary:');
  console.log(`   Session ID: ${session.id} (continued)`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   Message: ${command2}`);
  console.log(`   Status: ${result2.status}`);
  console.log(`   Duration: ${result2.duration}ms\n`);

  console.log('💬 Communication:');
  console.log(`   Input Tokens: ${result2.costs.inputTokens.toLocaleString()}`);
  console.log(`   Output Tokens: ${result2.costs.outputTokens.toLocaleString()}`);
  console.log(
    `   Total Tokens: ${(result2.costs.inputTokens + result2.costs.outputTokens).toLocaleString()}\n`
  );

  console.log('💰 Cost Breakdown:');
  result2.costs.breakdown.forEach((cost) => {
    console.log(`   Model: ${cost.model}`);
    console.log(
      `   - Input:  ${cost.inputTokens.toLocaleString()} tokens = $${cost.inputCost.toFixed(4)}`
    );
    console.log(
      `   - Output: ${cost.outputTokens.toLocaleString()} tokens = $${cost.outputCost.toFixed(4)}`
    );
    console.log(`   - Total:  $${(cost.inputCost + cost.outputCost).toFixed(4)}\n`);
  });

  console.log('💬 Agent Response:');
  if (result2.finalResponse) {
    console.log('   ┌─────────────────────────────────────────────────────┐');
    const responseLines2 = result2.finalResponse.split('\n');
    responseLines2.forEach((line) => {
      // Wrap long lines at 50 chars
      if (line.length > 50) {
        const words = line.split(' ');
        let currentLine = '   │ ';
        words.forEach((word) => {
          if ((currentLine + word).length > 55) {
            console.log(currentLine.padEnd(58) + '│');
            currentLine = '   │ ' + word + ' ';
          } else {
            currentLine += word + ' ';
          }
        });
        if (currentLine.trim().length > 3) {
          console.log(currentLine.padEnd(58) + '│');
        }
      } else {
        console.log(`   │ ${line}`.padEnd(58) + '│');
      }
    });
    console.log('   └─────────────────────────────────────────────────────┘\n');
  } else {
    console.log('   (No text response - agent may have used tools only)\n');
  }

  // Combined summary
  console.log('\n' + '═'.repeat(60));
  console.log('📈 COMBINED SUMMARY (Same Session - Two Requests)');
  console.log('═'.repeat(60) + '\n');

  console.log(`🆔 Session ID: ${session.id} (Same session for both requests)`);
  console.log(`   The agent remembered the first conversation!\n`);

  console.log('💰 Cumulative Session Costs:');
  console.log(`   After Request 1: $${result.costs.totalCost.toFixed(4)}`);
  console.log(`   After Request 2: $${result2.costs.totalCost.toFixed(4)}`);
  console.log(
    `   Final Total:     $${result2.costs.totalCost.toFixed(4)} (~${(result2.costs.totalCost * 100).toFixed(2)}¢)\n`
  );

  console.log('📊 Total Session Tokens:');
  console.log(`   Total Input:  ${result2.costs.inputTokens.toLocaleString()}`);
  console.log(`   Total Output: ${result2.costs.outputTokens.toLocaleString()}`);
  console.log(
    `   Grand Total:  ${(result2.costs.inputTokens + result2.costs.outputTokens).toLocaleString()}\n`
  );

  console.log('📞 Total API Calls: ' + result2.costs.apiCalls + '\n');

  console.log('💡 What happened:');
  console.log('   1. First request was sent to the agent');
  console.log('   2. Second request was sent to the SAME session');
  console.log('   3. The agent had full context from both messages');
  console.log('   4. All costs accumulated in a single session');
  console.log('   5. Conversation history was preserved\n');

  console.log('═'.repeat(60));
  console.log('✨ Multi-turn conversation complete!\n');
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
