# Project Brief: BMad Client Library

## Executive Summary

**BMad Client Library** is a Node.js backend SDK that enables developers to integrate the BMad-Method into web and desktop applications via LLM APIs. The library provides a headless, server-side runtime for BMad workflows, allowing applications to orchestrate BMad agents (PM, Architect, Developer, etc.) programmatically using Anthropic Claude or other LLM providers. Unlike Claude Code which runs locally, this library enables web applications to offer BMad-Method capabilities to end users through a secure, cost-tracked, and storage-integrated backend service.

**Primary Problem:** Developers building web applications want to integrate BMad-Method workflows (PRD creation, architecture design, story generation) but cannot use Claude Code in a web environment. They need a backend SDK that can orchestrate BMad agents via LLM APIs while managing sessions, costs, and document storage.

**Target Market:** Backend developers and teams building web/desktop applications that want to provide AI-powered product development workflows to their users.

**Key Value Proposition:** First-class SDK for embedding BMad-Method into applications with full session management, cost tracking, flexible agent plugins, and cloud storage integration.

---

## Problem Statement

### Current State & Pain Points

Software development teams and no-code/low-code platforms increasingly want to offer AI-powered product development assistance to their users. The BMad-Method provides an excellent framework for this through its agent-based approach (PM, Architect, Developer, QA, etc.), but currently:

1. **BMad-Method is CLI-only:** It runs exclusively through Claude Code CLI, which cannot be embedded into web applications
2. **No programmatic API:** There's no way to invoke BMad agents, manage sessions, or track progress programmatically
3. **Session management gap:** When LLMs need to ask questions, there's no mechanism to pause execution, return to the application layer, and resume later
4. **Cost invisibility:** Applications cannot track or limit LLM API costs per session
5. **Storage integration missing:** Generated documents (PRDs, architecture docs, stories) have no standard persistence layer

### Impact of the Problem

- **Lost opportunities:** Innovative web applications (project management tools, AI IDEs, development platforms) cannot integrate BMad-Method
- **Vendor lock-in:** Teams are locked into Claude Code CLI and cannot build custom UIs or workflows
- **Cost concerns:** Without cost tracking and limits, production deployments are risky
- **Scalability issues:** No multi-tenant support or cloud storage integration

### Why Existing Solutions Fall Short

- **Claude Code CLI:** Designed for local developer use, not embeddable in applications
- **Direct LLM APIs:** Require reimplementing all BMad-Method logic, templates, and workflows
- **Generic agent frameworks:** Don't include BMad-specific agents, templates, or workflows

### Urgency & Importance

The market for AI-powered development tools is exploding (Cursor, v0.dev, Bolt.new, Lovable, etc.). BMad-Method has proven value but risks being left behind if it remains CLI-only. Building a client library now:

- **Enables adoption** in modern web/desktop applications
- **Establishes BMad** as the standard for AI-powered product development
- **Creates ecosystem** for expansion packs and third-party integrations
- **Generates revenue opportunities** through SaaS platforms built on the SDK

---

## Proposed Solution

### Core Concept & Approach

**BMad Client Library** is a Node.js/TypeScript SDK that provides a complete runtime for BMad-Method in backend environments. The library:

1. **Abstracts LLM Providers:** Works with Anthropic Claude (exclusive for MVP, abstraction for future providers)
2. **Manages Sessions:** Handles conversation state, pause/resume for user questions, and workflow orchestration
3. **Loads Agents Dynamically:** Supports all core BMad agents plus expansion packs via a plugin system
4. **Emulates Claude Code Environment:** Provides in-memory VFS with Claude Code-style tools for session isolation
5. **Tracks Costs:** Monitors token usage and calculates costs per session with configurable limits
6. **Integrates Storage:** Persists generated documents to Google Cloud Storage (or other backends)
7. **Provides Headless API:** Framework-agnostic SDK that applications integrate via REST APIs, GraphQL, or direct imports

### Key Differentiators

- **BMad-native:** Built specifically for BMad-Method, includes all agents and templates
- **VFS-based:** In-memory Virtual Filesystem for session isolation and Claude Code emulation
- **Production-ready:** Cost tracking, limits, error handling, session management
- **Extensible:** Plugin system for custom agents and expansion packs
- **Anthropic Claude focused:** Optimized for Claude's tool-use capabilities (MVP)
- **Storage-flexible:** Google Cloud Storage by default, abstraction for other providers

### Why This Solution Will Succeed

1. **Proven foundation:** BMad-Method already works in Claude Code CLI
2. **Clear demand:** Web applications need embeddable AI workflows
3. **Complete package:** Not just API wrapper—includes agents, templates, workflows
4. **Developer-friendly:** TypeScript, well-documented, easy integration
5. **Cost-conscious:** Built-in tracking and limits address primary production concern

### High-Level Vision

Enable any web or desktop application to offer BMad-Method workflows through a simple, powerful SDK. Developers can integrate with minimal code:

```typescript
import { BmadClient } from 'bmad-client';

const client = new BmadClient({
  provider: { type: 'anthropic', apiKey: process.env.ANTHROPIC_KEY },
  costLimit: 5.00,
  logLevel: 'info'
});

const session = await client.startAgent('pm', 'create-prd');

// Handle questions interactively
session.on('question', async (q) => {
  const answer = await askUser(q);
  await session.answer(answer);
});

const result = await session.execute();

// Documents are in VFS, can be saved to storage
console.log(`PRD created! Cost: $${result.costs.totalCost}`);
console.log(`Documents: ${result.documents.map(d => d.path).join(', ')}`);
```

---

## Target Users

### Primary User Segment: Backend Developers Building AI-Powered Applications

**Demographic/Firmographic Profile:**
- Backend/full-stack developers at startups and SaaS companies
- Teams building project management tools, no-code platforms, AI IDEs
- Technical founders creating AI-native products
- Freelance developers building custom solutions for clients

**Current Behaviors & Workflows:**
- Integrate third-party APIs (Stripe, Twilio, OpenAI) into Node.js backends
- Build REST/GraphQL APIs consumed by frontend applications
- Deploy to cloud platforms (Google Cloud, AWS, Vercel)
- Use NPM packages and evaluate libraries based on documentation and TypeScript support

**Specific Needs & Pain Points:**
- Need to add AI-powered product development workflows to their applications
- Want to avoid building complex agent orchestration from scratch
- Require cost tracking and limits for production use
- Need reliable session management (pause/resume for user input)
- Want flexibility to switch LLM providers (not vendor-locked)

**Goals They're Trying to Achieve:**
- Ship AI features faster by using pre-built components
- Provide value-add features (automated PRD generation, architecture design) to their users
- Control costs and prevent runaway LLM API expenses
- Build differentiated products using BMad-Method as a foundation

### Secondary User Segment: Platform Teams Enabling Internal Developers

**Profile:**
- Engineering platform teams at mid-to-large companies
- DevOps/infrastructure teams building internal developer tools
- Innovation labs exploring AI-assisted development

**Needs:**
- Standardize product development processes across teams using BMad-Method
- Provide self-service tools for non-technical stakeholders (PMs, designers)
- Track and allocate AI costs by team/project
- Integrate with existing document storage and workflows

**Goals:**
- Accelerate internal product development cycles
- Democratize access to structured development methodologies
- Measure ROI of AI tooling investments

---

## Goals & Success Metrics

### Business Objectives

- **Adoption:** 50+ active integrations within 6 months of launch
- **Ecosystem growth:** 5+ community-contributed expansion packs by end of Year 1
- **Developer satisfaction:** 4.5+ star rating on NPM, positive GitHub activity
- **Documentation quality:** 90%+ of users report they could integrate without support
- **Revenue enablement:** Enable 3+ SaaS products built on BMad Client Library (if licensing/revenue model exists)

### User Success Metrics

- **Time to first integration:** Developers can complete first agent execution in <30 minutes
- **Session success rate:** 95%+ of sessions complete without errors
- **Cost predictability:** Users report high confidence in cost estimates vs. actuals
- **Storage reliability:** 99.9%+ document save success rate

### Key Performance Indicators (KPIs)

- **NPM Downloads:** 500+ downloads/week by Month 6
- **GitHub Stars:** 250+ stars by Month 6
- **Active Sessions/Month:** 10,000+ agent sessions executed across all users
- **Cost Tracking Accuracy:** <5% variance between estimated and actual costs
- **Plugin Adoption:** 80%+ of users load at least one expansion pack agent
- **Documentation Engagement:** 70%+ of new users read getting-started guide
- **Support Volume:** <10% of users require support tickets for basic integration

---

## MVP Scope

### Core Features (Must Have)

- **BmadClient Core:** Main SDK class with provider configuration, session management, and agent orchestration
- **Session Management:** Pause/resume for user questions, state persistence, conversation history
- **Cost Tracking:** Token counting, cost calculation per provider, session-level reporting
- **Cost Limits:** Hard limits per session that throw errors when exceeded
- **Multi-Provider Support:** Anthropic Claude API integration + abstract interface for OpenAI/custom providers
- **Agent Plugin System:** Load core BMad agents (PM, Architect, Dev, QA, SM, PO, Analyst, UX Expert) dynamically
- **Expansion Pack Support:** Import agents from external packages (e.g., `@bmad-expansions/expert-author`)
- **Virtual Filesystem (VFS):** In-memory filesystem with Claude Code-style tools for session isolation
- **Tool Execution:** read_file, write_file, edit_file, bash_command, grep_search, glob_pattern
- **Template Pre-loading:** VFS pre-populated with BMAD templates and agent files at session start
- **Google Cloud Storage Integration:** Save/load generated documents (PRDs, architecture, stories) to GCS buckets
- **Template Processing:** Load and process YAML templates from `.bmad-core/templates/`
- **Task Execution:** Execute task workflows from `.bmad-core/tasks/` markdown files
- **TypeScript Support:** Full TypeScript definitions and type safety
- **Error Handling:** Graceful handling of API errors, cost limit exceeded, session timeouts
- **Basic Documentation:** README, getting started guide, API reference, examples

### Out of Scope for MVP

- **UI Components:** No React/Vue components (headless only)
- **Multi-Model Routing:** Advanced features like routing questions to cheaper models
- **Streaming Responses:** Defer real-time streaming to post-MVP
- **Collaborative Sessions:** Multi-user editing/session sharing
- **Cost Analytics Dashboard:** Advanced reporting and visualization
- **Self-Hosted LLM Support:** Focus on cloud APIs first (Anthropic exclusive for MVP)
- **Database Storage:** Only GCS for MVP, other backends later
- **Workflow Builder:** Visual workflow editor or DSL
- **Real Filesystem Access:** VFS-only for MVP, no real filesystem operations

### MVP Success Criteria

**The MVP is successful when:**

1. A developer can install the package, configure it with their Anthropic API key, and execute a PM agent to create a PRD in <30 minutes
2. Tool calls from LLMs are executed via in-memory VFS with session isolation
3. Sessions correctly pause when LLMs ask questions, allow programmatic answers, and resume execution
4. Cost tracking reports accurate totals (within 5% of actual API charges) at session completion
5. Cost limits are enforced and throw clear errors when exceeded
6. Generated documents can be saved to Google Cloud Storage (future feature)
7. All 8 core agents load and execute their primary commands successfully
8. At least one expansion pack can be imported and used
9. VFS is pre-loaded with templates and agent files for each session
10. TypeScript types provide autocomplete and type safety in IDEs
11. Documentation enables integration without diving into source code
12. Integration tests demonstrate complete PRD generation workflow

---

## Post-MVP Vision

### Phase 2 Features

**Enhanced Session Management:**
- Workflow checkpoints and rollback
- Session templates for common flows (e.g., "Full Product Lifecycle")
- Concurrent session execution with resource limits

**Advanced Cost Management:**
- Predictive cost estimation before execution
- Multi-model routing (use cheaper models for simple tasks)
- Cost allocation by user/team/project
- Budget pools and quotas

**Storage Flexibility:**
- AWS S3 adapter
- Azure Blob Storage adapter
- Local filesystem option
- Database storage (PostgreSQL, MongoDB)

**Tool Execution Evolution:**
- Real filesystem access for brownfield projects (read actual code)
- External command execution (pandoc, pdflatex, etc.) for asset generation
- Database query execution for data-driven workflows

**Developer Experience:**
- CLI wrapper for testing sessions locally
- Web-based session debugger
- VSCode extension for agent development

### Long-Term Vision (1-2 Years)

**BMad Ecosystem Platform:**
- Official expansion pack marketplace
- Community-contributed agents and templates
- Certification program for high-quality plugins

**Enterprise Features:**
- SSO/SAML integration
- Audit logging and compliance features
- Multi-tenancy with org-level controls
- SLA guarantees and dedicated support

**AI Model Evolution:**
- Fine-tuned models for specific BMad agents
- Agentic workflows with autonomous decision-making
- Self-improving agents based on feedback loops

**Vertical Solutions:**
- Prebuilt integrations for specific platforms (Notion, Confluence, GitHub)
- Industry-specific agent packs (FinTech, HealthTech, GameDev, etc.)
- White-label SDKs for OEMs

### Expansion Opportunities

- **SaaS Product:** Hosted BMad-as-a-Service with web UI
- **Training & Certification:** Courses on building with BMad Method
- **Consulting Services:** Help teams customize and extend the library
- **Enterprise Licensing:** On-premise deployments with support contracts

---

## Technical Considerations

### Platform Requirements

- **Target Platforms:** Node.js (v18+), compatible with serverless (Vercel, AWS Lambda, Google Cloud Functions)
- **Browser/OS Support:** Backend-only, no browser compatibility needed
- **Performance Requirements:**
  - Session initialization: <500ms
  - Document save to GCS: <2s
  - Support for concurrent sessions (10+ per server instance)

### Technology Preferences

- **Language:** TypeScript (compile to JavaScript for NPM)
- **Runtime:** Node.js 18+ (ESM + CommonJS dual support)
- **Package Manager:** NPM (publish as `@bmad/client` or `bmad-client`)
- **Build Tool:** tsup or Rollup for bundling
- **Testing:** Vitest (fast, TypeScript-native)
- **LLM Integration:** Official Anthropic SDK (`@anthropic-ai/sdk`), OpenAI SDK optional
- **Storage:** `@google-cloud/storage` SDK for GCS

### Architecture Considerations

- **Repository Structure:**
  - Monorepo if multiple packages (core + providers + storage adapters)
  - Single package for MVP to reduce complexity

- **Service Architecture:**
  - Library architecture (not microservices)
  - Modular design with clean separation: core, providers, storage, agents, tools

- **Integration Requirements:**
  - Must work in Express, Fastify, Next.js API routes, standalone scripts
  - No framework dependencies (framework-agnostic)

- **Security/Compliance:**
  - API keys managed by consuming application (library doesn't store credentials)
  - Document access control delegated to GCS bucket policies
  - Input validation on all user-provided data
  - Rate limiting delegated to application layer
  - GDPR consideration: Allow users to delete all stored documents

---

## Constraints & Assumptions

### Constraints

- **Budget:** Open-source project (assuming no dedicated budget for MVP), relying on contributor time
- **Timeline:** Target MVP in 3-4 months with 1-2 dedicated developers
- **Resources:** Initially solo or small team development, community contributions post-launch
- **Technical:**
  - Must use public LLM APIs (Anthropic, OpenAI)—no self-hosted models in MVP
  - GCS-only for MVP storage (other providers post-MVP)
  - Cannot execute arbitrary shell commands (security risk)

### Key Assumptions

- Anthropic API remains stable and backward-compatible
- Developers have access to Google Cloud for storage (or accept in-memory/local fallback)
- Node.js continues as dominant backend runtime
- Demand exists for BMad-Method integration (validated through community feedback)
- Expansion pack authors will contribute if plugin system is well-designed
- Cost tracking is accurate based on LLM provider usage data
- TypeScript adoption continues in Node.js ecosystem

---

## Risks & Open Questions

### Key Risks

- **API Changes:** Anthropic or OpenAI could change APIs, breaking integrations. *Mitigation: Abstract provider interface, version pinning, automated testing against APIs*
- **Cost Overruns:** Users could exceed budgets despite tracking. *Mitigation: Hard limits, clear documentation, pre-execution estimates*
- **Session Complexity:** Pause/resume may be fragile with complex workflows. *Mitigation: Comprehensive state management, extensive testing, clear error messages*
- **Adoption Challenges:** Developers may prefer building custom solutions. *Mitigation: Exceptional documentation, starter templates, showcase applications*
- **Expansion Pack Quality:** Low-quality community agents could hurt reputation. *Mitigation: Optional certification program, community reviews, clear guidelines*

### Open Questions

- Should the library support streaming responses in MVP, or defer to Phase 2?
- How do we handle agent versioning if core agents evolve?
- What's the optimal session state format for persistence (JSON, binary, other)?
- Should we provide a default in-memory storage option for testing/demos?
- How do we handle multi-step workflows that span multiple agents (e.g., Analyst → PM → Architect)?
- What level of backward compatibility should we promise (semver strict)?
- Should cost limits be hard errors or warnings with bypass options?

### Areas Needing Further Research

- **Optimal state persistence format:** Research efficient serialization for session state
- **Provider pricing updates:** Monitor LLM provider pricing changes and update cost calculations
- **Serverless compatibility:** Test thoroughly on AWS Lambda, Google Cloud Functions, Vercel
- **Expansion pack discovery:** Research NPM package discovery patterns (keywords, org namespaces)
- **Session security:** Research best practices for storing sensitive session data
- **Concurrent session management:** Test resource usage with 50+ concurrent sessions

---

## Appendices

### A. Research Summary

**(To be populated based on prior analysis)**

Key findings from BMad-Method CLI analysis:
- Agent system uses markdown-based definitions with YAML frontmatter
- Templates are YAML files with section-based structure
- Tasks are markdown workflows with elicitation steps
- Core agents: PM, PO, Architect, Dev, QA, SM, Analyst, UX Expert
- Tool system mirrors Claude Code's tool set (Read, Write, Edit, Bash, Grep, Glob, etc.)

Competitive analysis:
- **Langchain/LangGraph:** Generic agent frameworks, not domain-specific
- **Vercel AI SDK:** Streaming-focused, no BMad-specific features
- **Cursor/v0.dev:** Closed ecosystems, not embeddable
- **Gap:** No existing SDK for BMad-Method integration

### B. Stakeholder Input

Primary stakeholder: BMad-Method community and potential integrators

Feedback themes (expected):
- Need for production-ready cost management
- Desire for flexible storage options
- Request for comprehensive TypeScript support
- Interest in expansion pack ecosystem

### C. References

- BMad-Method CLI repository: [Internal reference]
- Anthropic API documentation: https://docs.anthropic.com
- Google Cloud Storage SDK: https://cloud.google.com/nodejs/docs/reference/storage/latest
- Similar projects: Langchain, Vercel AI SDK, LangGraph

---

## Next Steps

### Immediate Actions

1. **Validate with BMad community:** Share this brief for feedback on priorities and scope
2. **Technical spike:** Prototype session pause/resume mechanism with Anthropic API
3. **Storage prototype:** Test GCS integration for document persistence
4. **Cost calculation validation:** Verify cost tracking accuracy against actual API bills
5. **Create PRD:** Transition to Product Manager (PM) agent to create detailed PRD

### PM Handoff

This Project Brief provides the full context for **BMad Client Library**. Please start in 'PRD Generation Mode', review the brief thoroughly to work with the user to create the PRD section by section as the template indicates, asking for any necessary clarification or suggesting improvements.

---

**Document Version:** 1.0
**Created:** 2025-10-31
**Author:** Mary (Business Analyst)
