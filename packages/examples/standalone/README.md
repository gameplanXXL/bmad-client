# BMad Client - Standalone Example

Simple standalone Node.js script demonstrating BMad Client usage.

## Features

- Basic client configuration with Anthropic provider
- Starting an agent session (PM agent creating a PRD)
- Handling user questions with pause/resume
- Accessing generated documents from VFS
- Cost tracking and reporting
- Interactive CLI interface

## Prerequisites

- Node.js 18+ installed
- Anthropic API key
- `tsx` for TypeScript execution (or compile to JavaScript)

## Setup

1. Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

2. Install dependencies (from monorepo root):

```bash
pnpm install
```

## Running the Example

```bash
npx tsx simple-session.ts
```

## What It Does

1. Initializes BMad Client with Anthropic provider
2. Starts a PM agent session with the `create-prd` command
3. The agent will ask you questions about the product (pause/resume)
4. You answer via terminal input
5. When complete, displays:
   - Final cost report (tokens, API calls, total cost)
   - List of generated documents
   - Preview of first document

## Expected Output

```
🚀 BMad Client - Simple Session Example

✅ Client initialized

📝 Starting PM agent session: create-prd

🔄 Executing session...

❓ Agent Question: What is the name of the product?

Your answer: My Awesome App

❓ Agent Question: Who are the target users?

Your answer: Small business owners

✅ Session completed!

Status: completed
Duration: 15432ms

Cost Report:
  Total Cost: €0.0234
  Input Tokens: 1523
  Output Tokens: 892
  API Calls: 3

📄 Generated Documents (1):
  1. /docs/prd.md (12543 bytes)

📝 First Document Preview:
Path: /docs/prd.md
Content (first 500 chars):
# Product Requirements Document: My Awesome App

## Executive Summary

My Awesome App is a productivity tool designed for small business owners...
```

## Customization

You can modify the example to:

- Use different agents (architect, dev, qa, etc.)
- Change the command (different tasks)
- Adjust cost limits
- Enable auto-save to storage
- Use different LLM models (Opus, Haiku)

```typescript
const session = await client.startAgent('architect', 'design-system', {
  costLimit: 2.0,
  autoSave: true,
});
```

## Error Handling

The example includes error handling for:

- Missing API key
- Session failures
- Cost limit exceeded
- API errors

## Next Steps

- See `../express-api/` for REST API integration
- Check the main documentation for advanced features
- Explore agent customization and expansion packs
