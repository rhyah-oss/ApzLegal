# Cursor Master Instruction — Lexora AI (South African Legal AI Platform)

> **Instruction 1** — product vision, UI/UX, modules.  
> **Instruction 2:** [MASTER-INSTRUCTION-2.md](./MASTER-INSTRUCTION-2.md) — full stack, agents, 12-phase plan.  
> Supplementary: [PRD](./PRD.md), [UI-UX-SPEC](./UI-UX-SPEC.md), [ARCHITECTURE](./ARCHITECTURE.md)

---

You are building a professional, private-deployment Legal AI platform for South African law firms.

The platform must feel like an ultra-modern desktop application, similar in polish to ChatGPT, **Cursor**, Linear and modern legal-tech platforms. It must support resizable panes, movable panels, matter workspaces, legal AI chat, citation verification, document discovery, email review, time tracking, billing, workflows and approval controls.

---

## 1. Product Name

**Lexora AI** (working name — renameable later)

---

## 2. Core Deployment Philosophy

Build for **private law-firm deployments first**.

Each law firm runs its own isolated deployment with:

- its own PostgreSQL database
- its own document storage
- its own vector database
- its own OpenSearch index
- its own email connectors
- its own audit logs
- its own AI model configuration
- its own backups
- its own domain or subdomain

Do **not** design the first version as shared SaaS only.

Keep architecture **multi-tenant-capable** for a future hosted edition.

---

## 3. Recommended Stack

### Frontend

- Next.js App Router
- React + TypeScript strict mode
- Tailwind CSS + shadcn/ui + Radix UI
- TanStack Query + TanStack Table
- Zustand for local UI state
- react-resizable-panels
- Monaco Editor (document review)
- TipTap (rich legal drafting)

### Backend

- Next.js server actions / API routes
- Separate worker services for heavy processing
- PostgreSQL + Drizzle ORM
- Redis (queues, rate limits, sessions)
- MinIO (S3-compatible documents)
- Qdrant (vector search)
- OpenSearch (full-text legal search)
- LangGraph (AI agent orchestration)
- Ollama (local models)
- LiteLLM (optional external routing later)

### Auth

**Better Auth** — email/password, passkeys later, 2FA later, organisations, roles, matter permissions, approval permissions.

### Reverse Proxy

**Caddy** — HTTPS, routing for web app, API, admin tools.

---

## 4. UI/UX Direction

The interface must feel like a **desktop application**, not a website.

### Mandatory Visual Rules (Phase 1)

These override generic "legal-tech palette" guidance for the first build:

| Rule | Specification |
|------|---------------|
| **Shape language** | Pill-shaped tabs, buttons, chips, search bar |
| **Borders** | 1px solid borders everywhere — panel edges, dividers, cards |
| **Header** | Thin fixed bar, 28–32px — never grows |
| **Footer** | Thin fixed bar, 22–24px — status, matter context chip |
| **Typography** | Cursor-compressed: 10–13px body, see [UI-UX-SPEC.md](./UI-UX-SPEC.md) |
| **Light mode** | **Monochrome only** — shades of grey, black, white. No accent colours in Phase 1 |
| **Resizability** | All primary panes independently resizable; layout persists |
| **Density** | Tight row heights (28px), minimal padding, maximum information |

Also required:

- Collapsible left sidebar
- Resizable right context panel
- Tabbed workspace
- Command palette (`Cmd/Ctrl+K`)
- Keyboard shortcuts
- Persistent layout preferences
- Dark mode scaffold (light mode is primary polish target)

Avoid: bright neon, heavy gradients, cartoon styling, excessive animation, cluttered dashboards.

Full tokens: [UI-UX-SPEC.md](./UI-UX-SPEC.md)

---

## 5. Main Navigation (13 Modules)

1. Dashboard
2. Matters
3. Legal AI
4. Research
5. Documents
6. Email Discovery
7. Workflows
8. Time & Billing
9. Calendar
10. Tasks
11. Templates
12. Admin
13. Audit Logs

---

## 6. Matter Workspace

Heart of the platform. Each matter has: summary, parties, lawyers, documents, emails, notes, tasks, deadlines, time entries, billing, AI chats, research history, citation packs, approvals, audit trail.

**Three-pane layout:**

| Left | Centre | Right |
|------|--------|-------|
| Matter nav, folders, emails, tasks, timeline | Selected document, email, AI chat, research | AI assistant, citations, facts, risks, approvals |

All panes resizable.

---

## 7. Legal AI Engine

Not a casual chatbot — a **legal work assistant**.

Every answer supports:

- source references
- confidence level
- citation status
- paragraph references
- verified / unverified label
- warning when corpus incomplete
- matter context awareness
- South African jurisdiction awareness
- human review before external use

**Hard rule:** Do not silently invent legal authorities.

If no source found, display:

> **Source not found in the available corpus.**

---

## 8. Citation Engine

Dedicated subsystem:

- Extract SA legal citations
- Link AI claims to source chunks
- Confidence scoring
- Flag unsupported claims
- Lawyer: Approve / Reject / Re-check
- Citation pack per matter

Citation panel beside AI answers showing: title, type, reference, excerpt, confidence, verification status, open source button.

---

## 9. Email Discovery

First-class module. MVP: architecture + UI (connectors mocked).

Features: connect mailbox, import folders, link to matters, attachments, parties, timeline, deadline extraction, thread summary, draft replies.

**Hard rule:** AI may draft; human **must approve** before send. Audit every action.

---

## 10. Workflow & Approvals

Document, email, opinion, contract, billing approvals. Task assignment, escalation, due dates, reviewer comments, status history.

Statuses: `Draft → In Review → Changes Requested → Approved → Sent / Filed → Archived`

---

## 11. Time & Billing

User/role/matter rates. Manual + timer + AI-suggested entries. Billable flag. Approval. Invoice prep. Matter summary. Accounting export later.

Link entries to: matter, client, task, document, email, AI session.

---

## 12. Security Model

RBAC + matter-level + document-level permissions. Audit logs. Session management. Encryption at rest. Private deployment defaults. No cross-firm leakage.

Roles: Firm Owner, Firm Admin, Partner, Attorney, Candidate Attorney, Paralegal, Secretary, Billing Admin, Compliance Officer, External Counsel, Client Viewer, System Admin.

Details: [SECURITY.md](./SECURITY.md)

---

## 13. Admin Console

Users, roles, permissions, matters, billing rates, AI settings, email connectors, retention, audit logs, workflow templates, branding, backups, deployment health.

---

## 14. Initial Pages (Build Order)

**Phase 1 only — UI shell with mock data. No full AI engine yet.**

1. App shell (header, footer, sidebar, resizable panes)
2. Login screen
3. Dashboard
4. Matters list
5. Matter workspace
6. Legal AI screen + citation panel
7. Document review screen
8. Email discovery screen
9. Workflow approvals screen
10. Time and billing screen
11. Admin console

Use mock data. Goal: beautiful, professional, realistic clickable product shell.

---

## 15. Visual Style Summary

**Phase 1 primary:** Monochrome light mode

- Background: `#fafafa` / warm off-white
- Panels: `#ffffff`
- Borders: `#e5e5e5` (1px)
- Text: `#171717` charcoal
- No colour accents until Phase 2+

Dark mode (scaffold): near-black background, dark slate panels, soft white text.

---

## 16. First Deliverable Checklist

Working Next.js app with:

- [ ] Cursor-style shell (pill controls, thin header/footer, 1px borders)
- [ ] Monochrome light mode
- [ ] Fully resizable panes with persistence
- [ ] Compressed Cursor-like typography
- [ ] Left sidebar + top bar + context panel
- [ ] Dark/light toggle (dark = scaffold)
- [ ] Mock matters, AI chat, citations, documents, email, workflows, time, admin

**First milestone = convincing product shell, not backend completeness.**

---

## 17. Build Phases

| Phase | Focus |
|-------|-------|
| 1 | UI shell and screens |
| 2 | Database schema and auth |
| 3 | Document ingestion |
| 4 | Search + RAG |
| 5 | Citation verification engine |
| 6 | Email discovery |
| 7 | Workflows and approvals |
| 8 | Time and billing |
| 9 | Private deployment packaging |
| 10 | Optional hosted multi-tenant |

Full detail: [ROADMAP.md](./ROADMAP.md)

---

## 18. Platform Constraints (APZ Shared Server)

When developing on `apztdg.com`:

- Join `infra_shared` + `ai-models_default` Docker networks
- Provision dedicated Postgres DB, Redis DB 3+, MinIO bucket, Qdrant `lexora_*` collections
- Use loopback port (e.g. 8100) + Caddy subdomain
- Do not disrupt ApzAnalyse, shared infra, or existing Qdrant collections
- Ollama is shared — limit concurrency

Details: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## References

- [Better Auth](https://www.better-auth.com/docs)
- [Caddy reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [LangGraph](https://github.com/langchain-ai/langgraph)
