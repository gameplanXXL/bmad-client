# BMad Client Library - Projektkontext für Claude Code

## Projektübersicht

Dieses Projekt entwickelt die **BMad Client Library**, einen Node.js/TypeScript SDK, der es Entwicklern ermöglicht, BMad-Method-Workflows in Web- und Desktop-Anwendungen zu integrieren. Der Client automatisiert die Orchestrierung von BMad-Agenten über LLM-APIs (Anthropic Claude, OpenAI) und bietet Session-Management, Kostentracking und Dokumenten-Speicherung.

### Beziehung zu Expansion Packs

Dieser Client ist darauf ausgelegt, mit **BMad Expansion Packs** zu arbeiten, die sich im benachbarten Repository befinden:

**Expansion Pack Speicherort:** `../bmad-export-author/`

Im benachbarten Projekt befinden sich:
1. **Expert Author** - Agenten für die Erstellung transformativer Sachbücher
2. **Competency Assessor** - Systematische Extraktion und Dokumentation von Expertise

### BMad Method Core Installation

Die BMad Method selbst ist in `../bmad-export-author/` installiert:

```
../bmad-export-author/
├── .bmad-core/                   # BMad Core Framework
├── .bmad-competency-assessor/    # Competency Assessor Expansion Pack
├── .bmad-expert-author/          # Expert Author Expansion Pack
└── expansion-packs/              # SOURCE für Expansion Packs
    ├── competency-assessor/      # Quellcode für Competency Assessor
    └── expert-author/            # Quellcode für Expert Author
```

## Wichtig für Agenten: Expansion Pack Zugriff

### Expansion Pack Source Files

**Expansion Packs befinden sich NICHT in diesem Repository!**

Wenn du als Agent Expansion Pack Definitionen, Agenten oder Templates benötigst, findest du diese hier:

```bash
# Expansion Pack Source Code
../bmad-export-author/expansion-packs/expert-author/
../bmad-export-author/expansion-packs/competency-assessor/

# Installierte Expansion Packs
../bmad-export-author/.bmad-expert-author/
../bmad-export-author/.bmad-competency-assessor/

# Core Framework
../bmad-export-author/.bmad-core/
```

### Zugriff auf Expansion Pack Agenten

**Expert Author Agenten:**
```bash
# Source Agenten (DEVELOPMENT)
../bmad-export-author/expansion-packs/expert-author/agents/*.md

# Installierte Agenten (USER MODE)
../bmad-export-author/.bmad-expert-author/agents/*.md
```

**Competency Assessor Agenten:**
```bash
# Source Agenten (DEVELOPMENT)
../bmad-export-author/expansion-packs/competency-assessor/agents/*.md

# Installierte Agenten (USER MODE)
../bmad-export-author/.bmad-competency-assessor/agents/*.md
```

### Templates und Tasks

**Expert Author:**
```bash
../bmad-export-author/.bmad-expert-author/templates/*.yaml
../bmad-export-author/.bmad-expert-author/tasks/*.md
```

**Competency Assessor:**
```bash
../bmad-export-author/.bmad-competency-assessor/templates/*.yaml
../bmad-export-author/.bmad-competency-assessor/tasks/*.md
```

## Projektstruktur

```
bmad-client/                          # DIESES PROJEKT
├── packages/
│   ├── core/                         # @bmad/client (Haupt-SDK)
│   │   ├── src/
│   │   │   ├── client.ts             # BmadClient Hauptklasse
│   │   │   ├── session.ts            # Session Management
│   │   │   ├── agents/               # Agent Registry, Loader, Schema
│   │   │   ├── providers/            # LLM Provider Abstraction
│   │   │   ├── storage/              # Dokumenten-Speicherung
│   │   │   ├── mcp/                  # Model Context Protocol Integration
│   │   │   ├── templates/            # Template Parser, Generator
│   │   │   ├── tasks/                # Task Executor
│   │   │   ├── cost/                 # Cost Tracker, Calculator
│   │   │   └── errors/               # Custom Error Types
│   │   └── package.json
│   ├── provider-anthropic/           # @bmad/provider-anthropic
│   ├── storage-gcs/                  # @bmad/storage-gcs
│   └── examples/                     # Beispiel-Integrationen
│       ├── express-api/
│       ├── nextjs-route/
│       └── standalone-script/
├── docs/
│   ├── architecture.md               # Vollständige Architektur-Dokumentation
│   ├── prd.md                        # Product Requirements Document
│   └── brief.md                      # Project Brief
├── CLAUDE.md                         # Diese Datei
└── package.json                      # Workspace Root

../bmad-export-author/                # BENACHBARTES PROJEKT (Expansion Packs)
├── .bmad-core/                       # Core Framework (installiert)
├── .bmad-expert-author/              # Expert Author (installiert)
├── .bmad-competency-assessor/        # Competency Assessor (installiert)
└── expansion-packs/                  # SOURCE CODE
    ├── expert-author/                # Expert Author Development
    │   ├── agents/                   # 17 spezialisierte Agenten
    │   ├── tasks/                    # Task-Workflows
    │   ├── templates/                # Dokumentvorlagen
    │   ├── checklists/               # Qualitätschecklisten
    │   └── data/                     # Referenzdaten
    └── competency-assessor/          # Competency Assessor Development
        ├── agents/                   # 7 spezialisierte Agenten
        ├── tasks/
        └── templates/
```

## Verfügbare Agenten (Core BMad)

Dieses Projekt soll folgende **Core BMad Agenten** unterstützen (via Client Library):

### Software Development Agents
- **pm** (Product Manager) - PRD-Erstellung, Produktstrategie
- **po** (Product Owner) - User Stories, Sprint Planning
- **architect** (Architect) - Architektur-Design, Tech Stack
- **dev** (Developer) - Code-Implementierung
- **qa** (QA Engineer) - Test-Strategien, Qualitätssicherung
- **sm** (Scrum Master) - Agile Prozesse, Retrospektiven
- **analyst** (Business Analyst) - Requirements Analysis
- **ux-expert** (UX Expert) - User Experience Design

### Content Creation Agents (via Expansion Packs)

**Expert Author (17 Agenten in `../bmad-export-author/`):**
- book-strategist, learning-architect, skill-analyzer, content-structurer
- book-author, exercise-designer, case-study-curator, researcher
- document-processor, ea-shard
- fact-checker, visual-designer, lector, clarity-editor
- reader-motivation, workbook-developer

**Competency Assessor (7 Agenten in `../bmad-export-author/`):**
- skill-interviewer, knowledge-extractor, framework-architect
- learning-designer, documentation-specialist, assessment-designer
- quality-reviewer

## Core Workflow (Client Library)

```
1. Application initializes BmadClient
   ↓
2. Client loads agents from .bmad-core/agents/ (and expansion packs)
   ↓
3. Application starts agent session: client.startAgent('pm', 'create-prd')
   ↓
4. Session orchestrates conversation with LLM
   ↓
5. Session pauses for user questions (emit 'question' event)
   ↓
6. Application answers via session.answer(input)
   ↓
7. Session completes, documents saved to storage (GCS)
   ↓
8. Application receives SessionResult with costs and documents
```

## Wichtige Arbeitsrichtlinien für Claude Code

### 1. Dateizugriff auf Expansion Packs

**Wenn du Agent-Definitionen, Templates oder Tasks benötigst:**

```bash
# Read tool verwenden mit absolutem Pfad
Read ../bmad-export-author/expansion-packs/expert-author/agents/ea-book-author.md
Read ../bmad-export-author/.bmad-expert-author/templates/book-blueprint-tmpl.yaml
```

**NIEMALS:**
- Expansion Pack Dateien in dieses Repository kopieren
- Annahmen über Expansion Pack Struktur treffen ohne zu prüfen
- Expansion Packs committen oder modifizieren (nur Lesen!)

### 2. Entwicklung vs. Referenz

**Dieses Projekt (bmad-client):**
- Entwicklung des SDK (TypeScript/Node.js)
- Keine Agent-Definitionen hier (werden dynamisch geladen)
- Tests für Agent-Loading-Mechanismus
- Beispiele für Integration

**Benachbartes Projekt (bmad-export-author):**
- Referenz für Agent-Struktur und Format
- Referenz für Template-YAML-Schema
- Referenz für Task-Workflow-Definition
- **NUR LESEZUGRIFF** - keine Änderungen!

### 3. Git-Workflow

**In diesem Projekt (bmad-client):**
- Commits erfolgen normal für SDK-Code
- Dokumentation wird committet
- Tests werden committet
- NIEMALS Expansion Pack Dateien committen

### 4. Testing mit Expansion Packs

**Integration Tests:**
```typescript
// Beispiel: Agent-Loading von Expansion Pack testen
describe('Expansion Pack Loading', () => {
  it('should load agents from expert-author expansion pack', async () => {
    const loader = new AgentLoader();
    const agents = await loader.loadFromDirectory(
      '../bmad-export-author/.bmad-expert-author/agents/'
    );

    expect(agents.length).toBeGreaterThan(0);
    expect(agents.some(a => a.agent.id === 'book-author')).toBe(true);
  });
});
```

### 5. Dokumentation

**Bei Architektur-Entscheidungen:**
- Referenziere Expansion Pack Struktur in docs/architecture.md
- Erkläre Agent-Loading-Mechanismus
- Zeige Beispiele für Expansion Pack Integration

**Bei API-Dokumentation:**
- Erkläre, wie Expansion Packs geladen werden
- Zeige Pfade zu Expansion Pack Ordnern
- Gib Beispiele für NPM-Package-basierte Expansion Packs

## Häufige Aufgaben

### Expansion Pack Agent-Definition prüfen

```bash
# Read das Agent File
Read ../bmad-export-author/expansion-packs/expert-author/agents/ea-book-author.md

# Extrahiere YAML Frontmatter
# Parse Agent-Definition
# Validiere Schema
```

### Template-Schema verstehen

```bash
# Read Template
Read ../bmad-export-author/.bmad-expert-author/templates/book-blueprint-tmpl.yaml

# Analysiere Struktur
# Verstehe Section-Definitionen
# Prüfe Elicitation-Flags
```

### Task-Workflow analysieren

```bash
# Read Task
Read ../bmad-export-author/.bmad-expert-author/tasks/create-deep-research-prompt.md

# Verstehe Workflow-Steps
# Prüfe Dependencies (Templates, andere Tasks)
```

## Wichtige Dateien

### In diesem Projekt (bmad-client)
- `docs/prd.md` - Product Requirements Document (vollständig)
- `docs/architecture.md` - Architektur-Dokumentation (vollständig)
- `docs/brief.md` - Project Brief
- `CLAUDE.md` - Diese Datei

### Im benachbarten Projekt (bmad-export-author)
- `CLAUDE.md` - Expansion Pack Dokumentation
- `expansion-packs/expert-author/README.md` - Expert Author Doku
- `expansion-packs/competency-assessor/README.md` - Competency Assessor Doku

## Wichtige Konzepte

### Model Context Protocol (MCP)

Der Client verwendet **MCP (Model Context Protocol)** für Tool-Ausführung:
- MCP Server als externe Prozesse (stdio/SSE)
- JSON-RPC 2.0 Kommunikation
- Tool Discovery via `tools/list`
- Tool Execution via `tools/call`
- Fallback zu VFS wenn keine MCP Server

### Agent-Loading-System

Agenten werden dynamisch geladen:
1. Markdown-Dateien mit YAML Frontmatter
2. Schema-Validierung mit Zod
3. Agent Registry für O(1) Lookup
4. Support für Expansion Packs via NPM

### Session Management

Sessions sind die zentrale Orchestrierungseinheit:
- Conversation State
- Pause/Resume für User Questions
- Cost Tracking in Echtzeit
- State Serialization für Recovery

### Template Processing

Templates definieren Dokument-Struktur:
- YAML-basiert mit Sections
- Variable Substitution
- Elicitation-Logic für User Input
- Repeatable Sections

## Kontakt & Support

- **Projekt:** BMad Client Library
- **Framework:** BMAD-METHOD™
- **Expansion Packs:** Expert Author, Competency Assessor
- **Dokumentation:** Siehe docs/ Verzeichnis

---

**Letzte Aktualisierung:** 2025-11-04
**Projekt:** BMad Client Library
**Framework:** BMAD-METHOD™ + Expansion Packs
**Expansion Pack Location:** `../bmad-export-author/`
