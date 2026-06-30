# Product Roadmap — Lexora AI

**Strategy:** Private deployment first, multi-tenant-capable architecture  
**Stack & phases:** [MASTER-INSTRUCTION-2.md](./MASTER-INSTRUCTION-2.md)  
**First deliverable:** Professional UI shell with mock data ✅

---

## Phase Overview

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| **1** | UI Shell & Screens | Desktop product with mock data | ✅ Complete |
| **2** | Core Data Model & Auth | Drizzle, Better Auth, real CRUD | Next |
| **3** | Document Storage & Ingestion | MinIO, upload, parsing pipeline | Planned |
| **4** | Search Foundation | OpenSearch + Qdrant hybrid search | Planned |
| **5** | Legal AI Engine | LiteLLM, LangGraph, matter-aware chat | Planned |
| **6** | Citation Engine | Extract, verify, human approval | Planned |
| **7** | Email Discovery | Mock → Gmail/M365, approval send | Planned |
| **8** | Workflow & Approvals | Templates, inbox, audit trail | Planned |
| **9** | Time & Billing | Rates, timers, invoices | Planned |
| **10** | Private Deployment | Docker, Caddy, monitoring, backups | Partial ✅ |
| **11** | Advanced Legal Intelligence | Neo4j graph, chronologies, evidence maps | Planned |
| **12** | Hosted Multi-Tenant | Optional SaaS edition | Planned |

---

## Phase 1 — Professional UI Shell ✅

**Exit criteria:** Clickable product demo suitable for law firm stakeholder review — **met**.

### Deliverables

- [x] Next.js App Router project (`apps/web`)
- [x] Tailwind + Cursor density overrides (pill controls, 1px borders, compressed type)
- [x] Monochrome light mode primary; dark mode scaffold
- [x] Application shell: thin header/footer, collapsible sidebar, resizable panes
- [x] Layout persistence (localStorage)
- [x] Command palette (⌘K)
- [x] All 13 navigation modules with routes
- [x] Login, Dashboard, Matters, Matter workspace (3-pane), Legal AI + citations
- [x] Research, Documents, Email discovery, Workflows, Billing, Calendar, Tasks, Templates
- [x] Admin console (7 sections), Audit logs
- [x] SA legal mock data
- [x] Deployed: https://lexora.apztdg.com (Caddy TLS)

### Not in Phase 1

- Real auth, database, API, AI inference, file upload

---

## Phase 2 — Core Data Model & Auth

- Drizzle schema covering all domains in [DATA-MODEL.md](./DATA-MODEL.md)
- Better Auth: email/password, organisations, roles
- Firm, users, permissions, matters, clients
- Audit log write path
- Admin user management
- Replace mock fixtures with API routes
- User layout/theme preferences in DB

---

## Phase 3 — Document Storage & Ingestion

- MinIO upload pipeline (shared bucket `lexora` on apztdg.com)
- Document metadata in PostgreSQL
- Folder tree per matter
- Worker queue (BullMQ + Redis DB 3)
- Parsing pipeline structure
- OCR placeholder
- **Later:** Unstructured (parse), PaddleOCR (OCR), Tesseract (fallback)
- Document viewer in UI (Monaco / PDF)
- **Later:** Lexical rich editor for drafting

---

## Phase 4 — Search Foundation

- OpenSearch index per deployment (dedicated container on shared host)
- Qdrant embedding pipeline (`lexora_*` collections)
- Chunking strategy for legal documents
- Embeddings: BGE-M3 or Qwen via Ollama
- Hybrid search UI (keyword + semantic)
- Research module live

---

## Phase 5 — Legal AI Engine

- LiteLLM gateway (abstraction over Ollama, future cloud models)
- LangGraph worker service (`apps/agent`)
- Specialist agents: Research, Matter, Drafting (minimum viable set)
- AI sessions + messages in PostgreSQL
- Matter-aware chat with retrieval from Phase 4
- Source-aware responses (no direct provider calls from web app)

**Agents (full set — Phase 5–11):** Research, Citation, Matter, Contract Review, Drafting, Discovery, Litigation, Compliance.

---

## Phase 6 — Citation Engine

- SA citation extraction (Acts, cases, neutral citations)
- Citation Agent (LangGraph)
- Claim ↔ chunk linking
- Full verification status model (Verified, Partially Verified, Source Not Found, etc.)
- Human approve/reject/re-check
- Citation pack export per matter

---

## Phase 7 — Email Discovery

- Email schema (threads, messages, attachments)
- Mock mailbox → Gmail API + Microsoft Graph
- Thread UI (Phase 1 mock → live)
- Matter linking, attachment → MinIO
- Timeline generation, AI thread summary
- Draft reply with **approval gate before send**
- Full email audit trail

---

## Phase 8 — Workflow & Approvals

- Internal workflow engine (not n8n-dependent)
- Templates: document, email, opinion, contract, billing, matter review
- Status model: Draft → Submitted → In Review → Changes Requested → Approved/Rejected → Sent/Filed → Archived
- Approval inbox, reviewer comments, status history
- In-app notifications
- Immutable audit on every transition

---

## Phase 9 — Time & Billing

- Rate tables: user, role, matter
- Timer + manual + AI-suggested entries (approval required)
- Link to matter, client, task, document, email, AI session
- Billable vs non-billable
- Matter billing summary, invoice preparation
- CSV/accounting export (later)

---

## Phase 10 — Private Deployment Packaging

**Partially complete on apztdg.com.**

| Item | Status |
|------|--------|
| Docker Compose (`name: lexora`) | ✅ |
| Caddy TLS (`lexora.apztdg.com`) | ✅ |
| `scripts/provision.sh` (Postgres, Redis, MinIO, Qdrant) | ✅ |
| `scripts/deploy.sh` | ✅ |
| `/api/health` | ✅ |
| Backup scripts | Planned |
| OpenSearch container | Planned |
| LiteLLM container | Planned |
| LangGraph worker container | Planned |
| Loki log aggregation | Planned |
| Grafana dashboards for Lexora | Planned |
| Private deployment runbook | Planned |

---

## Phase 11 — Advanced Legal Intelligence

- **Matter Brain** — unified matter context for all agents
- **Neo4j** entity/citation relationship graph
- Chronology builder
- Issue map, relationship map, evidence map
- Discovery Agent + Litigation Agent full implementation
- Advanced research workflows

---

## Phase 12 — Optional Hosted Multi-Tenant

Only after private deployments are proven.

- Row-level security / tenant isolation
- Firm provisioning API
- Subdomain tenancy (`{firm}.lexora.ai`)
- Billing plans, central admin
- Deployment automation
- Optional SaaS hosting

---

## Build Order & Dependencies

```
Phase 1 ✅ UI Shell
    ↓
Phase 2 Auth/DB ──→ Phase 3 Docs ──→ Phase 4 Search
                                          ↓
                                    Phase 5 AI Engine
                                          ↓
                                    Phase 6 Citations
                                          ↓
              Phase 7 Email ←── Phase 8 Workflows
                      ↓
              Phase 9 Billing
                      ↓
              Phase 10 Deploy (partial ✅)
                      ↓
              Phase 11 Neo4j / Matter Brain
                      ↓
              Phase 12 SaaS (optional)
```

---

## Cursor Build Rules

From [MASTER-INSTRUCTION-2.md §12](./MASTER-INSTRUCTION-2.md#12-cursor-build-behaviour):

- Do not skip phases
- Do not build AI before UI shell is stable
- Mock data only in Phase 1
- Matter-centric + citation-first always
- Use `-p lexora` for Docker Compose on shared host

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Shared Ollama contention | `AI_MAX_CONCURRENCY=1`; LiteLLM queue |
| Docker project name collision | `name: lexora` in compose |
| Citation accuracy | Human verification; never auto-verify |
| Scope creep | Strict phase gates |
| OpenSearch/Neo4j RAM | Dedicated containers; tier sizing docs |

---

## Success Criteria by Phase

| Phase | Lawyer can… |
|-------|-------------|
| 1 ✅ | Navigate full product shell; understand workflow |
| 2 | Log in; create matter with real persistence |
| 3 | Upload and view documents on a matter |
| 4 | Search firm corpus (keyword + semantic) |
| 5 | Ask AI question; see retrieved sources |
| 6 | Approve/reject citations; export citation pack |
| 7 | Import emails; approve AI draft before send |
| 8 | Route document through approval workflow |
| 9 | Capture time; generate billing summary |
| 10 | Run firm deployment on dedicated VM with monitoring |
| 11 | View matter chronology, issue map, entity graph |
| 12 | Onboard as hosted tenant (optional) |
