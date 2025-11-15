# BMad Client Examples

This directory contains example applications demonstrating how to use the BMad Client SDK.

## Prerequisites

1. **Anthropic API Key**: You need an API key from [Anthropic](https://console.anthropic.com/)
2. **Node.js 18+**: Make sure you have Node.js installed

## Setup

1. Install dependencies from the project root:

   ```bash
   cd ..
   npm install
   ```

2. Configure your API key:

   **Option A: Using .env file (Recommended)**

   ```bash
   # Copy the example file
   cp .env.example .env

   # Edit .env and add your API key
   # ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

   **Option B: Environment variable**

   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

## Examples

### 1. Simple Agent Execution

The most basic example - execute an agent and see the results.

```bash
npm run simple
```

**What it does:**

- Initializes BmadClient with Anthropic provider
- Starts the PM (Product Manager) agent
- Executes the `*help` command
- Displays cost report and created documents

**File:** `simple-agent.ts`

### 2. Advanced Agent with Options

More advanced example showing:

- Custom session options
- Cost limits
- Context initialization
- Event handling

```bash
npm run advanced
```

**File:** `advanced-agent.ts` (coming soon)

## Environment Variables

Configure these in your `.env` file:

- `ANTHROPIC_API_KEY` (required) - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)
- `BMAD_MODEL` (optional) - Model to use (default: `claude-sonnet-4`)
  - `claude-opus-4` - Most capable, highest cost (~$15 per 1M input tokens)
  - `claude-sonnet-4` - Balanced performance and cost (~$3 per 1M input tokens) **[Recommended]**
  - `claude-haiku-3-5` - Fastest, lowest cost (~$0.25 per 1M input tokens)

## Understanding the Output

### Cost Report

The SDK tracks token usage and calculates costs in real-time:

```
💰 Cost Report:
   Total Cost: $0.0082 USD
   Input Tokens: 1,500
   Output Tokens: 250
   API Calls: 1
```

### Documents Created

Any files created by the agent using tools are returned as documents:

```
📄 Documents Created: 1
   1. /docs/prd.md
      Size: 2048 bytes
```

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable not set"

Set your API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "Agent not found: pm"

Make sure you're running from the examples directory and the `.bmad-core/agents/` directory exists in the project root.

### Import errors

Make sure you've built the packages:

```bash
cd ..
npm run build
```

## Next Steps

- Explore different agents: `pm`, `dev`, `architect`, `qa`
- Try different commands: `*help`, `*plan`, `*analyze`
- Experiment with session options (cost limits, context)
- Check the [main README](../README.md) for full SDK documentation
