/**
 * BMad Client - Simple Standalone Session Example
 *
 * This example demonstrates:
 * - Basic client configuration
 * - Starting an agent session
 * - Handling user questions (pause/resume)
 * - Accessing generated documents
 * - Cost tracking
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key-here npx tsx simple-session.ts
 */

import { BmadClient } from '@bmad/client';
import * as readline from 'readline';

// Check for API key
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('🚀 BMad Client - Simple Session Example\n');

  // Initialize BMad Client
  const client = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey,
      model: 'claude-sonnet-4-20250514', // or 'claude-opus-4-20250514'
    },
    costLimit: 1.0, // Max $1.00 per session
    logLevel: 'info',
  });

  // Wait for client initialization (template loading)
  await client.waitForInit();
  console.log('✅ Client initialized\n');

  try {
    // Start a PM agent session to create a PRD
    console.log('📝 Starting PM agent session: create-prd\n');

    const session = await client.startAgent('pm', 'create-prd', {
      autoSave: false, // Disable auto-save for this example
    });

    // Handle user questions (session will pause when LLM asks for input)
    session.on('question', async (question) => {
      console.log(`\n❓ Agent Question: ${question.question}\n`);

      if (question.context) {
        console.log(`Context: ${question.context}\n`);
      }

      // Get user answer
      const answer = await askQuestion('Your answer: ');

      // Resume session with answer
      session.answer(answer);
    });

    // Handle session completion
    session.on('completed', (result) => {
      console.log('\n✅ Session completed!\n');
      console.log(`Status: ${result.status}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`\nCost Report:`);
      console.log(`  Total Cost: €${result.cost.totalCost.toFixed(4)}`);
      console.log(`  Input Tokens: ${result.cost.inputTokens}`);
      console.log(`  Output Tokens: ${result.cost.outputTokens}`);
      console.log(`  API Calls: ${result.cost.apiCalls}`);

      console.log(`\n📄 Generated Documents (${result.documents.length}):`);
      result.documents.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.path} (${doc.content.length} bytes)`);
      });
    });

    // Handle session failure
    session.on('failed', (error) => {
      console.error('\n❌ Session failed:', error.message);
    });

    // Execute the session
    console.log('🔄 Executing session...\n');
    const result = await session.execute();

    // Display final results
    console.log('\n📋 Final Results:');
    console.log(JSON.stringify(result, null, 2));

    // Access generated documents
    if (result.documents.length > 0) {
      console.log('\n📝 First Document Preview:');
      const firstDoc = result.documents[0];
      console.log(`Path: ${firstDoc.path}`);
      console.log(`Content (first 500 chars):`);
      console.log(firstDoc.content.substring(0, 500));
      console.log('...\n');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('\n❌ Error:', error.message);
      console.error(error.stack);
    }
  } finally {
    rl.close();
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
