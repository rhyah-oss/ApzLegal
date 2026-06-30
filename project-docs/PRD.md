# Product Requirements Document — Lexora AI

**Version:** 0.1 (Draft)  
**Status:** Pre-development  
**Last updated:** 2026-06-12

---

## 1. Product Vision

Lexora AI is a professional Legal AI platform for **South African law firms**. It combines matter management, document discovery, email review, legal research, AI-assisted drafting, citation verification, workflows, time tracking, and billing in a single desktop-grade application.

The platform must behave like a **legal work assistant**, not a casual chatbot. Every AI output is traceable, citable, and subject to human review before external use.

### 1.1 Deployment Philosophy

| Priority | Approach |
|----------|----------|
| **First** | Private deployment per law firm — full isolation |
| **Later** | Optional hosted multi-tenant SaaS edition |

Each private deployment includes:

- Dedicated PostgreSQL database
- Dedicated document storage (MinIO / S3-compatible)
- Dedicated vector database (Qdrant)
- Dedicated full-text search (OpenSearch)
- Dedicated email connectors
- Dedicated audit logs and backups
- Dedicated AI model configuration
- Dedicated domain or subdomain

Architecture must remain **multi-tenant-capable** so a hosted edition can be added without rewrite.

### 1.2 Target Users

| Persona | Primary needs |
|---------|---------------|
| Partner | Matter oversight, approvals, billing review |
| Attorney | Drafting, research, matter work, time capture |
| Candidate Attorney | Supervised drafting, research, task execution |
| Paralegal | Document prep, discovery, filing support |
| Secretary | Calendar, correspondence, document management |
| Billing Admin | Time approval, invoicing, rate management |
| Compliance Officer | Audit logs, retention, access review |
| Firm Admin | Users, roles, connectors, AI settings |
| External Counsel | Limited matter access |
| Client Viewer | Read-only matter visibility (optional) |

---

## 2. Product Goals

### 2.1 Must Have (Phase 1 — UI Shell)

- Desktop-style application shell (Cursor-inspired)
- Resizable panes with persistent layout
- Monochrome light mode (primary); dark mode scaffold
- All 13 primary navigation modules with mock data
- Matter workspace with multi-pane layout
- Mock Legal AI chat with citation panel
- Mock document, email, workflow, billing, admin screens

### 2.2 Must Have (Production)

- Source-backed AI answers with verification status
- Citation engine with approval workflow
- Matter-level and document-level permissions
- Complete audit trail
- Human approval before email send
- South African jurisdiction awareness
- Private deployment packaging

### 2.3 Must Not

- Silently invent legal authorities
- Send emails without human approval
- Leak data across firm boundaries
- Present unverified AI claims as verified

---

## 3. Primary Navigation Modules

| # | Module | Description |
|---|--------|-------------|
| 1 | Dashboard | Firm activity, deadlines, approvals queue, recent matters |
| 2 | Matters | Matter list, filters, create/open matter |
| 3 | Legal AI | Matter-aware AI chat with citations |
| 4 | Research | Legislation, case law, internal corpus search |
| 5 | Documents | Upload, review, versioning, folders |
| 6 | Email Discovery | Mailbox connect, import, thread review, draft replies |
| 7 | Workflows | Approval queues, status tracking, escalation |
| 8 | Time & Billing | Time entries, rates, invoices, matter summaries |
| 9 | Calendar | Deadlines, hearings, meetings |
| 10 | Tasks | Matter-linked tasks, assignments, due dates |
| 11 | Templates | Legal document templates |
| 12 | Admin | Firm configuration, users, AI, connectors |
| 13 | Audit Logs | Immutable action history |

---

## 4. Application Shell

### 4.1 Layout Regions

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (thin, fixed) — logo, breadcrumbs, search, user menu │
├──────┬──────────────────────────────────────────┬───────────┤
│      │                                          │           │
│ SIDE │         MAIN WORK AREA                   │  CONTEXT  │
│ BAR  │    (tabs, resizable split panes)         │   PANEL   │
│      │                                          │           │
├──────┴──────────────────────────────────────────┴───────────┤
│ FOOTER (thin, fixed) — status, sync, matter context chip    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Shell Requirements

- Fixed thin header and footer (see [UI-UX-SPEC.md](./UI-UX-SPEC.md))
- Collapsible left sidebar (icon-only collapsed state)
- Resizable right context panel
- Resizable main work area with horizontal and vertical splits
- Tabbed workspace within main area
- Command palette (`Cmd/Ctrl+K`)
- Keyboard shortcuts for navigation and pane focus
- Persistent user layout preferences (localStorage → DB in Phase 2)

---

## 5. Dashboard

**Purpose:** At-a-glance firm activity.

**Contents (mock → live):**

- Matters requiring attention
- Pending approvals (documents, emails, opinions, time)
- Upcoming deadlines (7 / 30 days)
- Recent AI sessions
- Unbilled time summary
- Quick actions: New matter, New time entry, Open Legal AI

---

## 6. Matter Workspace

The Matter Workspace is the **heart of the platform**.

### 6.1 Matter Data Model (functional)

Each matter includes:

- Matter summary (reference, title, status, practice area)
- Parties (clients, opponents, third parties)
- Assigned lawyers and roles
- Documents (folder tree, versions)
- Emails (threads linked to matter)
- Notes
- Tasks and deadlines
- Time entries
- Billing records
- AI chats linked to matter
- Research history
- Citation packs
- Approval history
- Audit trail

### 6.2 Multi-Pane Layout

| Pane | Position | Resizable | Contents |
|------|----------|-----------|----------|
| Matter nav | Left | Yes | Folders, emails, tasks, timeline |
| Main content | Centre | Yes | Document, email, chat, research |
| Context | Right | Yes | AI assistant, citations, facts, risks, approvals |

All three panes must resize independently. Minimum widths enforced to prevent collapse.

---

## 7. Legal AI Engine

### 7.1 Behaviour Rules

The Legal AI is a **legal work assistant**, not a general chatbot.

Every answer must support:

| Field | Requirement |
|-------|-------------|
| Source references | Linked to corpus chunks |
| Confidence level | Low / Medium / High |
| Citation status | Verified / Unverified / Not found |
| Paragraph references | Where applicable |
| Verification label | Visible in UI |
| Incomplete material warning | When corpus is insufficient |
| Matter context | Scoped to active matter when set |
| Jurisdiction | South Africa default; configurable |
| Human review | Required before external use |

### 7.2 Hard Rule — No Invented Authorities

If no source is found in the available corpus, the UI must display:

> **Source not found in the available corpus.**

The AI must not silently fabricate case names, statute sections, or citations.

### 7.3 Technical Direction (later phases)

- LangGraph for stateful agent orchestration
- Ollama for local models (private deployment)
- Qdrant for vector retrieval
- OpenSearch for full-text legal search
- Optional LiteLLM for external model routing

---

## 8. Citation Engine

Dedicated citation subsystem — not an afterthought.

### 8.1 Capabilities

- Extract citations from judgments, legislation, uploaded documents
- Identify legislation references, case references, paragraph/page refs
- Link AI claims to source chunks
- Show citation confidence
- Flag unsupported claims
- Lawyer actions: Approve / Reject / Re-check
- Generate citation pack per matter

### 8.2 Citation Panel (beside AI answers)

Each citation displays:

| Element | Description |
|---------|-------------|
| Source title | Document or authority name |
| Document type | Judgment, statute, contract, email, etc. |
| Reference | Paragraph, section, or page |
| Excerpt | Quoted source text |
| Confidence | Score 0–100 |
| Verification status | Verified / Pending / Rejected |
| Open source | Button to open full document at reference |

---

## 9. Email Discovery

First-class module — not a bolt-on.

### 9.1 MVP Scope

- Architecture and UI complete
- Connectors mocked (Gmail, Microsoft 365 designed for later)

### 9.2 Features

- Connect mailbox
- Import selected folders
- Link emails to matters
- Extract attachments into document store
- Identify parties
- Correspondence timeline
- Deadline and undertaking extraction
- Thread summarisation
- Draft replies (AI-assisted)
- **Human approval required before send**
- Audit every email action

### 9.3 Hard Rule

AI may draft emails. A human **must approve** before sending.

---

## 10. Workflow and Approvals

### 10.1 Workflow Types

- Document approval
- Email approval
- Legal opinion approval
- Contract review approval
- Billing approval
- Task assignment and escalation

### 10.2 Status Model

```
Draft → In Review → Changes Requested → Approved → Sent / Filed → Archived
```

### 10.3 Workflow Record

- Reviewer comments
- Status history (immutable append)
- Due dates
- Escalation rules
- Linked entity (document, email, opinion, time entry)

---

## 11. Time Management and Billing

### 11.1 Rate Types

- User hourly rates
- Role rates
- Matter-specific rates

### 11.2 Time Entry Types

- Manual entry
- Timer-based entry
- AI-suggested entry (requires approval)

### 11.3 Linkage

Time entries link to: matter, client, task, document, email, AI session.

### 11.4 Billing

- Billable vs non-billable
- Approval of time entries
- Invoice preparation
- Matter billing summary
- Export to accounting (future)

---

## 12. Research Module

- Full-text search (OpenSearch) across legislation, judgments, firm corpus
- Vector search (Qdrant) for semantic retrieval
- Research history per matter
- Save results to matter
- Export to citation pack

**Jurisdiction default:** South Africa (Constitution, Acts, regulations, SA case law).

---

## 13. Admin Console

| Section | Configuration |
|---------|---------------|
| Users | CRUD, invite, deactivate |
| Roles & permissions | RBAC matrix |
| Matters | Bulk admin, archive |
| Billing rates | User, role, matter overrides |
| AI model settings | Ollama models, timeouts, concurrency |
| Email connectors | OAuth credentials, sync schedule |
| Document retention | Policies per matter type |
| Audit logs | Search, export |
| Workflow templates | Reusable approval flows |
| Firm branding | Logo, name (private deployment) |
| Backup settings | Schedule, destination |
| Deployment health | Service status, disk, model availability |

---

## 14. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Pane resize < 16ms; list virtualisation for 10k+ documents |
| Accessibility | Keyboard navigation; focus rings; ARIA on interactive controls |
| Responsiveness | Desktop-first; minimum 1280×720 |
| Resizability | All primary panes independently resizable |
| Persistence | Layout preferences survive refresh |
| Security | See [SECURITY.md](./SECURITY.md) |
| Audit | All sensitive actions logged immutably |
| Localisation | English (SA) first; Afrikaans later |

---

## 15. Phase 1 Acceptance Criteria

Phase 1 is complete when:

- [ ] Next.js app runs locally with App Router + TypeScript strict
- [ ] Cursor-style shell: thin header, thin footer, pill controls, 1px borders
- [ ] Monochrome light mode implemented per UI spec
- [ ] Left sidebar, resizable main area, resizable right panel
- [ ] All 13 nav modules reachable with mock data
- [ ] Matter workspace with three resizable panes
- [ ] Mock Legal AI chat with citation panel
- [ ] Mock email discovery, workflow, billing, admin screens
- [ ] Command palette functional (navigation only)
- [ ] Layout preferences persist in localStorage
- [ ] No backend required beyond static mock JSON

---

## 16. Out of Scope (Phase 1)

- Real authentication (Better Auth — Phase 2)
- Database schema and migrations (Phase 2)
- Document ingestion (Phase 3)
- RAG / search (Phase 4)
- Citation verification engine (Phase 5)
- Email connectors (Phase 6)
- Production deployment (Phase 9)

---

## 17. Success Metrics (Post-Launch)

| Metric | Target |
|--------|--------|
| Time to open matter workspace | < 2s |
| AI answer with citations | 100% show verification status |
| Unsupported claims flagged | 100% when no source |
| Email send without approval | 0 (blocked by system) |
| Cross-firm data leakage | 0 |
| Lawyer NPS (pilot firms) | ≥ 40 |
