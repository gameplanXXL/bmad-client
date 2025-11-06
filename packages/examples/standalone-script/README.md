# BMad Standalone Script Example

A simple, minimal CLI script demonstrating the BMad Client SDK.

## Features

- ✅ Interactive CLI interface
- ✅ Real-time question handling
- ✅ Progress tracking
- ✅ Cost monitoring
- ✅ Document output to local filesystem
- ✅ TypeScript
- ✅ Minimal dependencies

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run the Script

```bash
npm start
```

## Usage

When you run the script, it will prompt you for:

1. **Agent ID** - The agent to execute (e.g., `pm`, `architect`, `dev`)
2. **Command** - The command to run (e.g., `create-prd`, `design-architecture`)

Example interaction:

```
🚀 BMad Client - Standalone Script Example

⏳ Initializing BMad Client...
✓ Client initialized

Enter agent ID (e.g., "pm", "architect"): pm
Enter command (e.g., "create-prd"): create-prd

🤖 Starting agent "pm" with command "create-prd"...

⏳ Executing session...

❓ Agent Question:
   What is the product name?

Your answer: MyApp

📊 Progress: Processing product requirements...
💰 Cost update: $0.0023 (1245 tokens)

✅ Session completed!

📄 Documents generated:
   - /docs/prd.md (5432 chars)

💰 Total Cost:
   Input tokens:  1,500
   Output tokens: 2,500
   Total cost:    $0.0234
   API calls:     3

⏱️  Duration: 12.45s

💾 Saving documents to /home/user/output/...
   ✓ /docs/prd.md

✅ All documents saved!

👋 Done!
```

## Output

Documents are saved to the `./output` directory relative to where you run the script.

Example structure:

```
output/
├── docs/
│   └── prd.md
├── architecture/
│   └── design.md
└── ...
```

## Available Agents

### Software Development Agents

- **pm** - Product Manager (PRDs, product strategy)
- **po** - Product Owner (user stories, sprint planning)
- **architect** - System Architect (architecture design, tech stack)
- **dev** - Developer (code implementation)
- **qa** - QA Engineer (test strategies, quality assurance)
- **sm** - Scrum Master (agile processes, retrospectives)
- **analyst** - Business Analyst (requirements analysis)
- **ux-expert** - UX Expert (user experience design)

### Expansion Pack Agents

If you have expansion packs installed (e.g., Expert Author, Competency Assessor), you can use their agents too:

- **book-strategist** - Book strategy and planning
- **learning-architect** - Learning pathway design
- **skill-analyzer** - Skill analysis and documentation
- And many more...

## Customization

### Change Storage Backend

By default, this example uses in-memory storage. To use Google Cloud Storage:

```typescript
const bmadClient = new BmadClient({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  storage: {
    type: 'gcs',
    projectId: process.env.GCP_PROJECT_ID!,
    bucketName: process.env.GCS_BUCKET_NAME!,
    keyFilename: process.env.GCS_KEY_FILE,
  },
  logLevel: 'info',
});
```

### Add Cost Limits

```typescript
const session = await bmadClient.startAgent(agentId, command, {
  autoSave: false,
  costLimit: 1.0, // Max $1.00
});
```

### Enable Auto-Save

```typescript
const session = await bmadClient.startAgent(agentId, command, {
  autoSave: true, // Automatically save to storage
});
```

## Development

### Watch Mode

Run with auto-reload on file changes:

```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
npm start
```

## Error Handling

The script handles common errors:

- Missing API key
- Invalid agent ID
- Agent execution failures
- File system errors

All errors are caught and displayed with clear messages.

## Next Steps

- Explore the [Express API example](../express-api/) for a full REST API
- Read the [Quickstart Guide](../../../docs/QUICKSTART.md) for more SDK features
- Check out [Session Recovery](../../../docs/QUICKSTART.md#session-recovery) for pause/resume
- Learn about [Cost Tracking](../../../docs/QUICKSTART.md#cost-tracking) and limits

## License

MIT
