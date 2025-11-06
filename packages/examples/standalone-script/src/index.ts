#!/usr/bin/env node

import { BmadClient } from '@bmad/client';
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Error: ANTHROPIC_API_KEY not found in environment');
  console.error('Please create a .env file with your API key:');
  console.error('  ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompts user for input
 */
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 BMad Client - Standalone Script Example\n');

  // Initialize client
  console.log('⏳ Initializing BMad Client...');
  const bmadClient = new BmadClient({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
    storage: {
      type: 'memory', // Use in-memory storage for this example
    },
    logLevel: 'info',
  });

  await bmadClient.waitForInit();
  console.log('✓ Client initialized\n');

  // Get user input for agent and command
  const agentId = await askQuestion('Enter agent ID (e.g., "pm", "architect"): ');
  if (!agentId) {
    console.error('❌ Agent ID is required');
    rl.close();
    process.exit(1);
  }

  const command = await askQuestion('Enter command (e.g., "create-prd"): ');
  if (!command) {
    console.error('❌ Command is required');
    rl.close();
    process.exit(1);
  }

  console.log(`\n🤖 Starting agent "${agentId}" with command "${command}"...\n`);

  // Create session
  const session = await bmadClient.startAgent(agentId, command, {
    autoSave: false, // We'll manually save documents
  });

  // Handle questions from the agent
  session.on('question', async (data) => {
    console.log('\n❓ Agent Question:');
    console.log(`   ${data.question}\n`);

    const answer = await askQuestion('Your answer: ');
    session.answer(answer);
  });

  // Track progress
  session.on('progress', (data) => {
    console.log(`📊 Progress: ${data.message}`);
  });

  // Track costs in real-time
  session.on('costs', (costs) => {
    console.log(`💰 Cost update: $${costs.totalCost.toFixed(4)} (${costs.totalInputTokens + costs.totalOutputTokens} tokens)`);
  });

  // Execute session
  console.log('⏳ Executing session...\n');
  const result = await session.execute();

  // Close readline interface
  rl.close();

  // Display results
  console.log('\n✅ Session completed!\n');

  console.log('📄 Documents generated:');
  if (result.documents.length === 0) {
    console.log('   (none)');
  } else {
    for (const doc of result.documents) {
      console.log(`   - ${doc.path} (${doc.content.length} chars)`);
    }
  }

  console.log('\n💰 Total Cost:');
  console.log(`   Input tokens:  ${result.costs.totalInputTokens.toLocaleString()}`);
  console.log(`   Output tokens: ${result.costs.totalOutputTokens.toLocaleString()}`);
  console.log(`   Total cost:    $${result.costs.totalCost.toFixed(4)}`);
  console.log(`   API calls:     ${result.costs.apiCallCount}`);

  console.log(`\n⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);

  // Save documents to ./output directory
  if (result.documents.length > 0) {
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`\n💾 Saving documents to ${outputDir}/...`);
    for (const doc of result.documents) {
      // Create subdirectories if needed
      const filePath = path.join(outputDir, doc.path);
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, doc.content, 'utf-8');
      console.log(`   ✓ ${doc.path}`);
    }

    console.log('\n✅ All documents saved!');
  }

  console.log('\n👋 Done!\n');
}

// Run main and handle errors
main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  rl.close();
  process.exit(1);
});
