# Cursor Master Instruction 2 — Full Product Stack, Architecture & Phased Build Plan

> **Extends:** [MASTER-INSTRUCTION.md](./MASTER-INSTRUCTION.md) (Instruction 1 — product vision, UI/UX, modules)  
> **Status:** Canonical source of truth for stack, architecture, and build phases  
> **Product:** Lexora AI — South African Legal AI platform

---

This instruction defines the **actual product stack**, **OSS tools**, **system architecture**, and **phased implementation plan**. Apply it directly after Instruction 1.

---

## 1. Core Principle

Build a serious **private-deployment** Legal AI platform for South African law firms.

**Do not build a simple chatbot.**

The platform must combine:

- Legal AI chat
- Matter management
- Verified citations
- Document intelligence
- Email discovery
- Workflow approvals
- Time tracking
- Billing
- Audit logs
- Private deployment
- Optional future multi-tenancy

Each law firm must be able to run its **own isolated instance**.

---

## 2. Final Technology Stack

Use this stack unless there is a strong technical reason not to.

### 2.1 Frontend

| Tool | Purpose |
|------|---------|
| Next.js App Router | Application framework |
| React + TypeScript strict | UI layer |
| Tailwind CSS | Styling |
| shadcn/ui + Radix UI | Components |
| TanStack Query | Server state |
| TanStack Table | Data grids |
| React Resizable Panels | Pane layout |
| Zustand or Jotai | Local UI state |
| Monaco Editor | Code/legal drafting panes |
| Lexical | Rich legal document editing |

**Frontend goals:**

- Desktop-style application (see [UI-UX-SPEC.md](./UI-UX-SPEC.md))
- Resizable panes, dark/light mode, tabbed workspaces
- Matter workspace, citation side panel, document viewer
- Email discovery interface, workflow inbox, time and billing screens

**Phase 1 note:** UI shell is built. Lexical replaces TipTap from Instruction 1 when document editing is implemented (Phase 3+).

### 2.2 Backend

| Tool | Purpose |
|------|---------|
| Next.js API routes / server actions | Application functions |
| PostgreSQL | Primary relational data |
| Redis | Queues, caching, rate limits, sessions |
| MinIO | Document and file storage (S3-compatible) |
| Drizzle ORM or Prisma | Data access |
| Docker Compose | Local / private deployment |

**Backend must support:**

- Private firm deployment
- Matter permissions, user roles, audit logs
- Document metadata, AI sessions, citations
- Time entries, billing rates, workflow states, email records

**Preferred ORM:** Drizzle (see [ARCHITECTURE.md](./ARCHITECTURE.md))

### 2.3 Authentication and Access Control

**Better Auth** — [better-auth.com](https://www.better-auth.com/docs)

| Feature | Phase |
|---------|-------|
| Email/password login | Phase 2 |
| Organisation/firm structure | Phase 2 |
| Role-based permissions | Phase 2 |
| Matter-level access | Phase 2 |
| Session management | Phase 2 |
| 2FA / passkeys | Phase 2–3 |
| SSO | Phase 12+ |

**Roles:** Firm Owner, Firm Admin, Partner, Attorney, Candidate Attorney, Paralegal, Secretary, Billing Admin, Compliance Officer, External Counsel, Client Viewer, System Admin.

**Access checks required at:** firm, matter, document, workflow, billing, and admin levels.

See [SECURITY.md](./SECURITY.md) for permission matrix.

### 2.4 Infrastructure Stack

| Component | Role |
|-----------|------|
| Docker + Docker Compose | Container orchestration (private deployment) |
| Caddy | Reverse proxy, automatic HTTPS/TLS |
| PostgreSQL | Primary database |
| Redis | Cache, queues, sessions |
| MinIO | Object storage |
| Qdrant | Vector search |
| OpenSearch | Full-text legal search |
| Neo4j | Legal/entity relationship graph (Phase 11) |
| LangGraph worker | Stateful legal AI agents |
| LiteLLM | Model gateway abstraction |
| Ollama | Local model hosting |
| Grafana + Prometheus | Metrics (shared on apztdg.com) |
| Loki | Log aggregation (Phase 10+) |

**Caddy routes:** main web app, API services, object storage console (if exposed), monitoring (if exposed), admin tools (if exposed).

**Shared platform (apztdg.com):** Lexora joins `infra_shared` + `ai-models_default`; uses shared Postgres, Redis, MinIO, Qdrant, Ollama, Prometheus, Grafana. See [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## 3. Legal Knowledge Engine

Dedicated ingestion and retrieval subsystem.

### 3.1 Tools

| Tool | Role |
|------|------|
| Unstructured | Document parsing (PDF, DOCX, etc.) |
| PaddleOCR | Primary OCR |
| Tesseract | OCR fallback only |
| OpenSearch | Full-text index |
| Qdrant | Vector embeddings |
| Neo4j | Entity/citation relationship graph (Phase 11) |
| MinIO | Source file storage |
| PostgreSQL | Document metadata |

### 3.2 Supported Document Types

PDF, DOCX, emails, attachments, scanned documents, pleadings, contracts, judgments, legislation, practice directives, firm precedents.

### 3.3 Per-Document Storage

For every ingested document, persist:

- Source file (MinIO)
- Extracted text
- OCR text (if applicable)
- Chunks
- Embeddings (Qdrant)
- Full-text index (OpenSearch)
- Entities (Neo4j — Phase 11)
- Citations
- Matter links
- Audit history

---

## 4. AI Layer

### 4.1 Gateway and Models

| Component | Role |
|-----------|------|
| **LiteLLM** | Model gateway — all AI calls go through abstraction |
| **Ollama** | Local model hosting (private deployment default) |
| DeepSeek, Qwen | Primary local/cloud model families |
| BGE-M3 or Qwen embeddings | Vector embeddings |
| **LangGraph** | Legal AI agent orchestration |

**Rule:** The app must **not** talk directly to a single AI provider. All model calls go through an abstraction layer supporting:

- Local models (Ollama)
- Claude, OpenAI, Gemini (future)
- DeepSeek, Qwen (local and API)

**Shared server today:** Ollama at `http://ollama:11434/v1` with `AI_MAX_CONCURRENCY=1`.

### 4.2 Legal AI Agents (LangGraph)

Build around **specialist agents**:

| # | Agent | Responsibility |
|---|-------|----------------|
| 1 | **Research Agent** | Legislation, judgments, firm knowledge, matter files |
| 2 | **Citation Agent** | Verify citations; link claims to sources |
| 3 | **Matter Agent** | One matter: documents, emails, notes, tasks, timelines |
| 4 | **Contract Review Agent** | Risk, clauses, version comparison |
| 5 | **Drafting Agent** | Letters, opinions, affidavits, contracts, resolutions, emails |
| 6 | **Discovery Agent** | Email/doc review; chronologies; issue maps |
| 7 | **Litigation Agent** | Chronologies, fact summaries, pleadings, evidence maps |
| 8 | **Compliance Agent** | Policy/document/workflow compliance checks |

Agents run in a **separate worker service** (`apps/worker` or `apps/agent`), not in the Next.js request path.

---

## 5. Citation Verification Engine

**One of the most important modules.** Not an afterthought.

### 5.1 Hard Rule

The AI must **never silently invent legal sources**.

If no source is found, display:

> **Source not found in the available corpus.**

### 5.2 Every Legal Answer Must Show

- Source title
- Document type
- Paragraph/page reference
- Excerpt
- Confidence level
- Verification status
- Open source button

### 5.3 Citation Statuses

| Status | Meaning |
|--------|---------|
| Verified | Claim matches source |
| Partially Verified | Partial match |
| Source Found, Claim Not Confirmed | Source exists; claim unsupported |
| Source Not Found | No matching corpus entry |
| Human Approved | Lawyer approved |
| Rejected | Lawyer rejected |

Phase 1 UI implements mock citations with a subset of these statuses. Phase 6 implements the full engine.

---

## 6. Email Discovery and Approval

Core module — design with mocked connectors first (Phase 1 ✓, Phase 7 live).

**Later connectors:** Gmail API, Microsoft Graph.

**Capabilities:** import folders, link to matters, extract attachments, summarise threads, identify deadlines/undertakings, correspondence timeline, draft replies.

**Hard rule:** AI may draft emails; a **human must approve before sending**. Full audit trail.

---

## 7. Workflow Engine

Build **internal workflow first**. n8n may be used later for external automation — the product owns its legal workflow model.

**Workflow types:** email, document, legal opinion, contract review, billing approval, task escalation, matter review.

**Statuses:**

```
Draft → Submitted → In Review → Changes Requested → Approved / Rejected → Sent / Filed → Archived
```

Every workflow action must be **auditable**.

---

## 8. Time and Billing

Native module — not a bolt-on.

**Rates:** user, role, matter-specific.  
**Entry types:** timer, manual, AI-suggested (requires approval).  
**Linkage:** matter, client, task, document, email, AI session.  
**Outputs:** billing summaries, invoice preparation, accounting export (later).

---

## 9. Database Domains

Design PostgreSQL schema around these domains (see [DATA-MODEL.md](./DATA-MODEL.md)):

| Domain | Tables (conceptual) |
|--------|---------------------|
| Tenancy | firms, system_settings |
| Identity | users, roles, permissions |
| CRM | clients, parties |
| Matters | matters, matter_assignments |
| Documents | documents, document_chunks, document_embeddings |
| Citations | citations, citation_checks |
| AI | ai_sessions, ai_messages, model_settings |
| Email | emails, email_threads, attachments |
| Work | tasks, workflows, approvals |
| Billing | time_entries, billing_rates, invoices |
| Compliance | audit_logs |

All firm-scoped tables include `organisation_id` for future multi-tenancy.

---

## 10. Phase Plan

Build in logical phases. **Do not skip phases.**

| Phase | Name | Status |
|-------|------|--------|
| **1** | Professional UI Shell | ✅ Complete — [apps/web](../apps/web), live at https://lexora.apztdg.com |
| **2** | Core Data Model & Auth | Next |
| **3** | Document Storage & Ingestion | Planned |
| **4** | Search Foundation | Planned |
| **5** | Legal AI Engine | Planned |
| **6** | Citation Engine | Planned |
| **7** | Email Discovery | Planned |
| **8** | Workflow & Approvals | Planned |
| **9** | Time & Billing | Planned |
| **10** | Private Deployment Packaging | Partial — Docker/Caddy/provision scripts done |
| **11** | Advanced Legal Intelligence | Planned |
| **12** | Optional Hosted Multi-Tenant | Planned |

Full detail: [ROADMAP.md](./ROADMAP.md)

### Phase 1 — Professional UI Shell ✅

**Goal:** Convincing legal desktop-style application with mock data.

**Built:** app shell, sidebar, top bar, resizable panes, dark/light mode, dashboard, matters list, matter workspace (3-pane), Legal AI mock chat, citation panel, document/email/workflow/billing/admin/audit screens, SA legal mock data, command palette, deployed with Caddy TLS.

### Phase 2 — Core Data Model and Auth

PostgreSQL schema (Drizzle), Better Auth, firm/users/roles/permissions, matters/clients, audit logs, admin user management. Replace mock data with API.

### Phase 3 — Document Storage and Ingestion

MinIO upload, metadata, folders, matter linking, parsing pipeline structure, worker queue, OCR placeholder. Later: Unstructured, PaddleOCR.

### Phase 4 — Search Foundation

OpenSearch + Qdrant, chunking, embeddings pipeline, hybrid search UI.

### Phase 5 — Legal AI Engine

LiteLLM abstraction, Ollama connection, LangGraph worker, AI sessions, matter-aware chat, source-aware responses.

### Phase 6 — Citation Engine

Extraction, verification, claim-to-source linking, full citation panel, human approval, citation pack export.

### Phase 7 — Email Discovery

Mock mailbox → live Gmail/M365. Thread UI, matter linking, attachments, timeline, AI summary, draft reply, approval gate.

### Phase 8 — Workflow and Approvals

Templates, approval inbox, reviewer comments, status history, notifications, audit trail.

### Phase 9 — Time and Billing

Timer, manual entry, rates, summaries, approvals, invoice prep.

### Phase 10 — Private Deployment Packaging

Docker Compose, Caddy, env templates, backup scripts, health checks, monitoring (Grafana/Prometheus/Loki), deployment guide. **Partially complete** on apztdg.com.

### Phase 11 — Advanced Legal Intelligence

Matter Brain, Neo4j entity graph, chronology builder, issue map, relationship map, evidence map, advanced research workflows.

### Phase 12 — Optional Hosted Multi-Tenant

Tenant isolation, firm provisioning, billing plans, central admin — **only after private deployments work**.

---

## 11. Repository Structure (Target)

```
apz-legal-ai/
├── apps/
│   ├── web/                 # Next.js (Phase 1 ✅)
│   ├── worker/              # Ingestion, indexing jobs (Phase 3+)
│   └── agent/               # LangGraph agents (Phase 5+)
├── packages/
│   ├── db/                  # Drizzle schema + migrations (Phase 2)
│   ├── auth/                # Better Auth config (Phase 2)
│   ├── ai/                  # LiteLLM + agent types (Phase 5)
│   └── shared/              # Types, utils
├── deploy/
│   ├── docker-compose.yml   # Phase 10 (partial ✅)
│   ├── Dockerfile
│   └── caddy/
├── scripts/
│   ├── provision.sh         # Shared platform resources ✅
│   └── deploy.sh            # Build + Caddy TLS ✅
└── project-docs/            # This documentation
```

---

## 12. Cursor Build Behaviour

When building, follow these rules:

1. **Do not skip phases**
2. **Do not build AI before UI shell is stable** (Phase 1 complete)
3. **Do not hardcode fake architecture** that prevents real backend integration later
4. Use **clean folder structure** — separate components, services, data access, workers
5. **Mock data only in Phase 1** — replace with API/DB from Phase 2 onward
6. **Private deployment is the default assumption**
7. Add comments where future integrations connect (Unstructured, LiteLLM, Neo4j, etc.)
8. **Do not remove legal-specific concepts** to simplify the product
9. Always maintain **matter-centric design**
10. Always maintain **citation-first legal AI design**
11. **Docker Compose project name must be `lexora`** — never collide with other apps on shared host

---

## 13. Platform Constraints (apztdg.com)

When deploying on the shared platform:

| Resource | Lexora allocation |
|----------|-------------------|
| URL | https://lexora.apztdg.com |
| Port | 127.0.0.1:8100 |
| Postgres | DB `lexora` |
| Redis | Logical DB 3 |
| MinIO | Bucket `lexora` |
| Qdrant | `lexora_*` collections only |
| Ollama | Shared, concurrency=1 |
| Monitoring | Shared Grafana/Prometheus |

**Do not disrupt:** ApzAnalyse, shared infra, existing Qdrant `knowledge_*` collections.

---

## 14. Instruction Sequence for Cursor

```
Instruction 1 (MASTER-INSTRUCTION.md)
  → Product vision, UI/UX, modules, matter workspace, deployment philosophy

Instruction 2 (this document)
  → Full stack, knowledge engine, AI agents, database domains, 12-phase plan

Phase 2 next action
  → packages/db schema, Better Auth, replace mock data with API
```

---

## 15. References

- [Better Auth](https://www.better-auth.com/docs)
- [Caddy reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [LiteLLM](https://docs.litellm.ai/)
- [Unstructured](https://unstructured.io/)
- Instruction 1: [MASTER-INSTRUCTION.md](./MASTER-INSTRUCTION.md)
