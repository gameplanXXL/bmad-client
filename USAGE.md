# BMad Client - Usage Guide

## Wie du sehen kannst, was passiert ist

### 1. Debug-Modus (Empfohlen für Details)

```bash
npm run example:debug
```

**Zeigt dir:**

- ✅ Schritt-für-Schritt Ausführung
- ✅ Anzahl API-Calls
- ✅ Token-Verbrauch (Input + Output)
- ✅ Kosten-Breakdown
- ✅ Dauer der Ausführung
- ✅ Erstellte Dokumente
- ✅ Erklärung was passiert ist

**Beispiel-Output:**

```
🎯 Summary:
   Agent: pm
   Command: *help
   Status: completed
   Duration: 4598ms

💬 Communication:
   Input Tokens: 2,089
   Output Tokens: 91
   Total Tokens: 2,180

💰 Cost Breakdown:
   Model: claude-sonnet-4-20250514
   - Input:  2,089 tokens = $0.0063
   - Output: 91 tokens = $0.0014
   - Total:  $0.0076
```

### 2. Einfacher Modus

```bash
npm run example:simple
```

**Zeigt dir:**

- Status (completed/failed)
- Dauer
- Kosten-Report
- Erstellte Dokumente

### 3. Test-Suite anschauen

```bash
# Alle Tests mit Output
npm test

# Nur Integration Tests (zeigen echte Flows)
npm test -- --run packages/core/src/__tests__/integration.test.ts
```

## Was genau ist passiert?

Bei deiner letzten Ausführung:

### Schritt 1: Agent wurde geladen

```
Agent: pm (Product Manager)
Datei: .bmad-core/agents/pm.md
Persona: Professional Product Manager
```

### Schritt 2: System Prompt wurde generiert

Das SDK hat einen ~2000 Token langen Prompt erstellt:

- Claude Code Emulation (Tools, Regeln, etc.)
- Agent Persona (PM Rolle, Stil, Prinzipien)
- Verfügbare Tools (read_file, write_file, etc.)
- Dein Command: `*help`

### Schritt 3: API Call zu Claude

```
Request → Anthropic API
Input: 2,089 tokens (Prompt + Command)
Model: claude-sonnet-4-20250514
```

### Schritt 4: Claude Antwort

```
Response ← Anthropic API
Output: 91 tokens (Agent's Antwort)
Stop Reason: end_turn (Agent ist fertig)
```

### Schritt 5: Session abgeschlossen

```
Status: completed
Duration: ~4.6 Sekunden
Cost: $0.0076 USD (~0.76 Cent)
API Calls: 1
```

## Was war in den 91 Output-Tokens?

Claude hat als PM-Agent auf deinen `*help` Command geantwortet. Die Antwort enthielt wahrscheinlich:

- Eine Begrüßung als PM
- Liste der verfügbaren Commands
- Erklärung was der Agent tun kann

**Leider loggen wir die tatsächliche Text-Antwort noch nicht** - das wäre ein gutes Enhancement!

## Wie kann ich die LLM-Antwort sehen?

Aktuell wird nur die **Metrik** geloggt (Tokens, Kosten, Status), aber nicht der **Inhalt**.

### Option A: Erweitere das Debug-Script

Ich kann das Debug-Script erweitern, um die tatsächliche Antwort anzuzeigen.

### Option B: Logging im Session-Code

Ich kann die Session-Klasse erweitern, um Nachrichten zu loggen.

### Option C: Return Messages im Result

Ich kann das `SessionResult` erweitern, um alle Nachrichten zurückzugeben.

## Möchtest du die LLM-Antworten sehen?

Sag mir, welche Option du bevorzugst, und ich implementiere es!

## Weitere nützliche Commands

```bash
# Build das Projekt neu
npm run build

# Alle Tests laufen lassen
npm test

# Tests mit Coverage
npm run test:coverage

# Code formatieren
npm run format

# Type-Check
npm run typecheck
```

## Kosten-Übersicht

Pro Agent-Ausführung (ungefähr):

| Command           | Tokens  | Kosten | Beschreibung         |
| ----------------- | ------- | ------ | -------------------- |
| `*help`           | ~2,200  | $0.007 | Simple Hilfe-Abfrage |
| `*plan`           | ~5,000  | $0.020 | Komplexere Planung   |
| Document creation | ~10,000 | $0.040 | Große Dokumente      |

**Modell-Kosten** (pro 1M Tokens):

- Haiku: $0.25 / $1.25 (in/out) - 10x günstiger
- Sonnet: $3 / $15 (in/out) - **Standard**
- Opus: $15 / $75 (in/out) - 5x teurer

## Logs verstehen

```
[BMAD INFO]  - Informations-Log
[BMAD WARN]  - Warnung (z.B. Cost Limit nah)
[BMAD ERROR] - Fehler
[BMAD DEBUG] - Debug-Info (nur wenn aktiviert)
```

## Nächste Schritte

1. **Versuche andere Agents:**

   ```bash
   # Ändere in examples/simple-agent.ts:
   const agentId = 'architect'; // oder 'dev', 'qa'
   ```

2. **Versuche andere Commands:**

   ```bash
   const command = '*plan'; // oder andere Commands
   ```

3. **Erstelle einen eigenen Agent:**
   - Kopiere `.bmad-core/agents/pm.md`
   - Passe Persona an
   - Teste!

4. **Arbeite mit Tools:**
   - Agent kann Dateien erstellen (write_file)
   - Agent kann Dateien lesen (read_file)
   - Agent kann bash commands ausführen (mkdir, ls, etc.)
