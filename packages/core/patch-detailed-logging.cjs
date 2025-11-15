const fs = require('fs');
const path = require('path');

const filePath = '/home/cneise/Project/bmad-client/packages/core/src/conversational-session.ts';

// Read file
let content = fs.readFileSync(filePath, 'utf8');

// Restore from latest backup first
const backups = fs
  .readdirSync(path.dirname(filePath))
  .filter((f) => f.startsWith('conversational-session.ts.backup-'))
  .sort()
  .reverse();

if (backups.length > 0) {
  content = fs.readFileSync(path.join(path.dirname(filePath), backups[0]), 'utf8');
  console.log(`Restored from ${backups[0]}`);
}

// Create new backup
const backupPath = `${filePath}.backup-${Date.now()}`;
fs.writeFileSync(backupPath, content);
console.log(`Created backup: ${backupPath}`);

// Replace all `this.messages.push(` with logged version
const loggedPush = `this.client.getLogger().error('[DEBUG] Adding message:', JSON.stringify({ role: arguments[0].role, contentType: typeof arguments[0].content, contentIsArray: Array.isArray(arguments[0].content), hasToolUse: Array.isArray(arguments[0].content) && arguments[0].content.some((c: any) => c.type === 'tool_use'), hasToolResult: Array.isArray(arguments[0].content) && arguments[0].content.some((c: any) => c.type === 'tool_result') }, null, 2));\n      this.messages.push(`;

content = content.replace(
  /this\.messages\.push\(/g,
  `this.client.getLogger().error('[DEBUG] Adding message:', JSON.stringify({ role: arguments[0]?.role || 'unknown', contentType: typeof arguments[0]?.content, stack: new Error().stack.split('\\n')[2] }, null, 2));\n      this.messages.push(`
);

// Write back
fs.writeFileSync(filePath, content);
console.log('Patched file with detailed logging');
