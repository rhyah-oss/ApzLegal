# System Architecture — Lexora AI

**Version:** 0.2  
**Deployment default:** Private per law firm  
**Multi-tenant:** Capable, not default  
**Stack authority:** [MASTER-INSTRUCTION-2.md](./MASTER-INSTRUCTION-2.md)

---

## 1. Architecture Overview

```
                         ┌─────────────────────────────────┐
                         │           Caddy (:443)          │
                         │  TLS, routing, rate limits      │
                         └───────────────┬─────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
     ┌────────────────┐        ┌─────────────────┐       ┌─────────────────┐
     │  Next.js Web   │        │  Worker Service │       │  Admin / Ops    │
     │  App (SSR/API) │        │  (background)   │       │  (optional)     │
     └───────┬────────┘        └────────┬────────┘       └─────────────────┘
             │                          │
             └────────────┬─────────────┘
                          │
    ┌─────────────────────┼─────────────────────┬──────────────────┐
    ▼                     ▼                     ▼                  ▼
┌─────────┐        ┌───────────┐        ┌───────────┐     ┌────────────┐
│PostgreSQL│        │   Redis   │        │   MinIO   │     │  Qdrant    │
│ (Drizzle)│        │queues/cache│       │ documents │     │  vectors   │
└─────────┘        └───────────┘        └───────────┘     └────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
       ┌────────────┐          ┌────────────┐     ┌────────────┐
       │ OpenSearch │          │   Ollama   │     │   Neo4j    │
       │ full-text  │          │  LLM/embed │     │  entities  │
       └────────────┘          └────────────┘     └────────────┘
                                      │                 Phase 11
                              ┌───────┴───────┐
                              ▼               ▼
                        ┌──────────┐   ┌──────────┐
                        │LangGraph │   │ LiteLLM  │
                        │ 8 agents │   │ gateway  │
                        └──────────┘   └──────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
             Unstructured          PaddleOCR
             (parse Phase 3)      (OCR Phase 3)
```

---

## 2. Technology Stack

### 2.1 Frontend

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 15+ App Router | SSR + API routes + server actions |
| Language | TypeScript (strict) | `strict: true` in tsconfig |
| Styling | Tailwind CSS | Design tokens in UI spec |
| Components | shadcn/ui + Radix | Density overrides |
| Data fetching | TanStack Query | Server state |
| Tables | TanStack Table | Virtualised rows |
| Local UI state | Zustand | Layout, pane sizes, ephemeral UI |
| Resizable panes | react-resizable-panels | Persistent layout |
| Code editor | Monaco Editor | Document review / drafting |
| Rich text | Lexical | Legal document editing (Phase 3+) |

### 2.2 Backend

| Layer | Choice | Notes |
|-------|--------|-------|
| App server | Next.js | Server actions + Route Handlers |
| ORM | Drizzle ORM | Type-safe, migration-friendly |
| Auth | Better Auth | Orgs, roles, 2FA/passkeys later |
| Job queue | BullMQ + Redis | Ingestion, indexing, email sync |
| Workers | Separate Node process(es) | Heavy CPU/IO off main thread |

### 2.3 Data Stores (Per Deployment)

| Store | Purpose | Isolation |
|-------|---------|-----------|
| PostgreSQL | Relational data, auth, audit metadata | Dedicated DB per firm deployment |
| Redis | Sessions, queues, rate limits | Dedicated logical DB or instance |
| MinIO | Document blobs, exports | Dedicated bucket |
| Qdrant | Vector embeddings | Dedicated collections prefix |
| OpenSearch | Full-text legal search | Dedicated index prefix |

| OpenSearch | Full-text legal search | Dedicated index prefix |
| Neo4j | Entity/citation graph | Phase 11 — dedicated instance |

### 2.4 Legal Knowledge Engine (Phase 3–4)

| Component | Role | Phase |
|-----------|------|-------|
| Unstructured | PDF/DOCX/email parsing | 3 |
| PaddleOCR | Primary OCR | 3 |
| Tesseract | OCR fallback | 3 |
| Worker + BullMQ | Ingestion queue | 3 |

Per document: source file, extracted text, OCR text, chunks, embeddings, full-text index, entities, citations, matter links, audit history.

### 2.5 AI Layer

| Component | Role |
|-----------|------|
| **LiteLLM** | Model gateway — **all** AI calls route here (Phase 5) |
| Ollama | Local LLM + embeddings (default private deployment) |
| DeepSeek / Qwen | Primary model families |
| BGE-M3 / Qwen embed | Embedding models |
| LangGraph | Eight specialist legal agents |
| Citation service | Claim ↔ chunk linking, verification |

**Rule:** Web app never calls Ollama/OpenAI/Anthropic directly — always via LiteLLM abstraction.

### 2.6 Legal AI Agents (LangGraph)

| Agent | Phase |
|-------|-------|
| Research | 5 |
| Citation | 6 |
| Matter | 5 |
| Contract Review | 5–11 |
| Drafting | 5 |
| Discovery | 7–11 |
| Litigation | 11 |
| Compliance | 11 |

### 2.7 Observability Stack

| Tool | Role | apztdg.com |
|------|------|------------|
| Prometheus | Metrics | Shared `infra-prometheus` |
| Grafana | Dashboards | Shared `infra-grafana` |
| Loki | Log aggregation | Phase 10 — add to Lexora stack |
| Audit log table | Compliance | PostgreSQL (Phase 2) |

---

## 3. Service Boundaries

### 3.1 Web Application (`lexora-web`)

- UI rendering (RSC + client components)
- Auth session (Better Auth)
- CRUD API for matters, documents, tasks, billing
- Workflow state transitions
- AI chat UI (streams responses from agent service)

### 3.2 Worker Service (`lexora-worker`)

- Document ingestion pipeline (extract, chunk, embed)
- OpenSearch indexing
- Email sync jobs (Gmail / M365)
- Citation extraction batch jobs
- Backup jobs
- AI batch tasks (summarisation, deadline extraction)

### 3.3 Agent Service (`lexora-agent`) — Phase 4+

- LangGraph graphs for legal Q&A, drafting, research
- Retrieves from Qdrant + OpenSearch
- Returns structured response + citations + confidence
- Never persists without audit log entry

Can run as worker subprocess or separate container.

---

## 4. Multi-Tenancy Model

### 4.1 Private Deployment (Default)

One deployment = one firm = one of everything:

```
firm-a.lexora.client.com
  └── postgres: lexora_firm_a
  └── minio bucket: firm-a-docs
  └── qdrant prefix: firm_a_*
  └── opensearch prefix: firm_a_*
```

No shared database across firms in this mode.

### 4.2 Hosted Multi-Tenant (Future)

Same codebase; tenancy via:

- `organisation_id` on all tenant-scoped tables
- Row-level security in PostgreSQL
- Collection/index prefix per org
- Subdomain → org resolution

Design tables with `organisation_id` from Phase 2 even for private deployments (single org per instance).

---

## 5. Integration Points

### 5.1 Email (Phase 6)

| Provider | Protocol | Scope |
|----------|----------|-------|
| Gmail | OAuth 2.0 + Gmail API | Read, draft, send (approved) |
| Microsoft 365 | OAuth 2.0 + Graph API | Same |

Tokens stored encrypted in PostgreSQL. Sync via worker cron.

### 5.2 Accounting Export (Future)

- CSV / API export of approved invoices
- Integrations: Sage, Xero (SA market research required)

### 5.3 External Legal Corpora (Future)

- SAFLII, government gazette feeds
- Licensed databases (negotiated per firm)

---

## 6. AI Request Flow

```
User question (matter-scoped)
        │
        ▼
┌───────────────────┐
│  LangGraph Agent  │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
 Qdrant     OpenSearch
 (semantic)  (keyword)
    │           │
    └─────┬─────┘
          ▼
   Retrieved chunks
          │
          ▼
   Ollama generation
          │
          ▼
 Citation linker ──► verification status
          │
          ▼
 Structured response → UI + audit log
```

---

## 7. Citation Verification Pipeline

1. **Extract** — regex + NLP for SA citations (Acts, sections, case names, neutral citations)
2. **Resolve** — match against OpenSearch / internal corpus
3. **Link** — map AI claim spans to chunk IDs
4. **Score** — confidence based on match quality
5. **Label** — Verified / Partially Verified / Source Not Found / Human Approved / Rejected
6. **Human review** — lawyer approve / reject / re-check
7. **Pack** — export citation pack for matter

---

## 8. Workflow Engine

Lightweight state machine (Phase 7):

- `workflow_templates` — reusable definitions
- `workflow_instances` — bound to entity (document, email, etc.)
- `workflow_events` — immutable status transitions
- Notifications via in-app queue (email notifications later)

Statuses: `Draft → Submitted → In Review → Changes Requested → Approved / Rejected → Sent / Filed → Archived`

---

## 9. Observability

| Tool | Usage |
|------|-------|
| Structured logging | JSON logs from web + worker |
| Audit log table | User actions (compliance) |
| Prometheus metrics | Shared infra + Lexora-specific dashboards (Phase 10) |
| Loki | Centralised logs (Phase 10) |
| Health endpoint | `/api/health` — extend with DB, Redis, MinIO, Qdrant, Ollama checks |

---

## 10. APZ Shared Platform Integration

When co-located on `apztdg.com` (development/staging):

| Resource | Lexora allocation |
|----------|-------------------|
| URL | https://lexora.apztdg.com |
| Docker project | `lexora` (never default `deploy`) |
| Docker networks | `infra_shared`, `ai-models_default`, `lexora_internal` |
| Postgres | DB `lexora` |
| Redis | Logical DB 3 |
| MinIO | Bucket `lexora` |
| Qdrant | `lexora_*` collections |
| Ollama | Shared — `AI_MAX_CONCURRENCY=1` |
| Monitoring | Shared Prometheus/Grafana |
| Port | `127.0.0.1:8100` |

**Do not modify** ApzAnalyse, shared infra containers, or existing Qdrant collections.

OpenSearch is **not** on shared platform today — add as dedicated container per Lexora deployment.

---

## 11. Directory Structure (Planned)

```
apz-legal-ai/
├── project-docs/          # This documentation
├── apps/
│   ├── web/               # Next.js application (Phase 1 ✅)
│   ├── worker/            # Ingestion, indexing (Phase 3+)
│   └── agent/             # LangGraph agents (Phase 5+)
├── packages/
│   ├── db/                # Drizzle schema + migrations
│   ├── auth/              # Better Auth config
│   ├── ai/                # LangGraph agents
│   └── shared/            # Types, utils
├── deploy/
│   ├── docker-compose.yml # Private deployment stack
│   ├── Caddyfile.snippet
│   └── .env.example
└── scripts/
    ├── seed-mock.ts
    └── provision-firm.sh
```

---

## 12. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Private deployment first | Law firm data sensitivity, SA POPIA alignment |
| Drizzle over Prisma | Lighter runtime, SQL control for audit queries |
| Separate worker | Document ingestion must not block UI |
| LangGraph | Long-running, checkpointed agent workflows |
| Ollama default | Air-gapped private deployments |
| Better Auth | Org model, 2FA/passkeys roadmap |
| Caddy edge | Auto TLS, simple reverse proxy |
| Monochrome UI Phase 1 | Cursor-like professional density |
