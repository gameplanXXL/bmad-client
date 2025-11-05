# BMad Client Setup Guide

Quick guide to get started with the BMad Client SDK.

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure API Key

### Option A: Using .env file (Recommended)

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```

3. (Optional) Choose a model:
   ```
   BMAD_MODEL=claude-sonnet-4
   ```

### Option B: Environment Variable

```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

## 3. Get Your API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy it to your `.env` file

## 4. Run the Example

```bash
npm run example:simple
```

You should see output like:

```
🚀 BMad Client - Simple Agent Example

✅ Client initialized
   Provider: anthropic
   Model: claude-sonnet-4

📋 Starting agent: pm
   Command: *help

🆔 Session ID: sess_1234567890_abcdef

▶️  Session started - Agent is now executing...

✅ Session completed successfully!
   Duration: 2543ms
   Status: completed

═══════════════════════════════════════════════════════════
📊 EXECUTION RESULTS
═══════════════════════════════════════════════════════════

Status: completed
Duration: 2543ms

💰 Cost Report:
   Total Cost: $0.0082 USD
   Input Tokens: 1,234
   Output Tokens: 567
   API Calls: 1

...
```

## 5. Verify Everything Works

If the example runs successfully, you're all set! 🎉

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

Make sure your `.env` file exists and contains a valid API key:

```bash
# Check if .env exists
ls -la .env

# View contents (be careful not to share this!)
cat .env
```

### "Agent not found: pm"

Make sure you're in the project root directory and the `.bmad-core/agents/` directory exists.

### Import errors

Build the packages first:

```bash
npm run build
```

### Tests failing

Run the test suite:

```bash
npm test
```

All 84 tests should pass.

## Next Steps

- Read the [main README](README.md) for SDK documentation
- Check [examples/README.md](examples/README.md) for more examples
- Explore different agents: `pm`, `dev`, `architect`, `qa`
- Try different commands: `*help`, `*plan`, `*analyze`

## Security Notes

⚠️ **Important:**
- Never commit your `.env` file to Git
- The `.gitignore` already includes `.env`
- Keep your API key secret
- Rotate your key if it's accidentally exposed

## Cost Estimation

Typical costs per agent execution:

- Simple `*help` command: ~$0.01 - $0.02
- Complex planning tasks: ~$0.05 - $0.15
- Document generation: ~$0.10 - $0.50

Models:
- Haiku: ~10x cheaper, faster, less capable
- Sonnet: Balanced (recommended)
- Opus: ~5x more expensive, most capable

You can set cost limits in your code:

```typescript
const session = await client.startAgent('pm', '*help', {
  costLimit: 0.10  // Max $0.10 per session
});
```
