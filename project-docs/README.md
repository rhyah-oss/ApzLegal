# Lexora AI — Project Documentation

**Working product name:** Lexora AI (renameable)  
**Repository:** `apz-legal-ai`  
**Target market:** South African law firms  
**Deployment model:** Private per-firm first; multi-tenant-capable architecture underneath

---

## Document Index

| Document | Purpose |
|----------|---------|
| [PRD.md](./PRD.md) | Product Requirements Document — vision, users, modules, acceptance criteria |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, stack, services, integration points |
| [UI-UX-SPEC.md](./UI-UX-SPEC.md) | Cursor-inspired desktop UI — typography, layout, components, resizable panes |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Private deployment model, Caddy, per-firm isolation, platform integration |
| [SECURITY.md](./SECURITY.md) | RBAC, matter permissions, audit, compliance requirements |
| [DATA-MODEL.md](./DATA-MODEL.md) | Core entities, relationships, tenancy boundaries |
| [ROADMAP.md](./ROADMAP.md) | 12-phase delivery plan (Phase 1 ✅, Phase 10 partial) |
| [MASTER-INSTRUCTION.md](./MASTER-INSTRUCTION.md) | Cursor Instruction 1 — product vision, UI/UX, modules |
| [MASTER-INSTRUCTION-2.md](./MASTER-INSTRUCTION-2.md) | Cursor Instruction 2 — full stack, agents, phased build plan |

---

## Executive Summary

Lexora AI is a professional Legal AI platform designed for **private deployment per law firm**. Each firm runs an isolated instance with its own database, document store, vector index, search index, email connectors, AI configuration, audit logs, and backups.

The first milestone — **Phase 1 UI shell** — is complete and live at https://lexora.apztdg.com. Phase 2 (database + Better Auth) is next. See [MASTER-INSTRUCTION-2.md](./MASTER-INSTRUCTION-2.md) for the full 12-phase plan.

### Design North Star

The application must feel like **Cursor** or **Linear** — not a marketing website:

- Pill-shaped controls, tabs, and chips
- Thin header and footer (fixed height)
- 1px borders, monochrome light mode (grey / black / white)
- Extremely tight, compressed typography
- Fully resizable panes with persistent layout preferences

### Platform Context (APZ Shared Server)

When deployed on the shared `apztdg.com` platform, Lexora AI must:

- Join existing Docker networks (`infra_shared`, `ai-models_default`) only when appropriate
- Provision dedicated Postgres DB, Redis logical DB, MinIO bucket, and Qdrant collections
- Not disrupt live services (ApzAnalyse, shared infra, Ollama, Qdrant)
- Use Caddy for HTTPS routing to a dedicated loopback port

See [DEPLOYMENT.md](./DEPLOYMENT.md) for resource allocation on the shared host.

---

## Quick Links

- **Phase 1 deliverable:** UI shell + mock screens → [ROADMAP.md#phase-1](./ROADMAP.md#phase-1-ui-shell--screens)
- **Matter workspace spec:** [PRD.md#matter-workspace](./PRD.md#6-matter-workspace)
- **Citation engine rules:** [PRD.md#citation-engine](./PRD.md#8-citation-engine)
- **Typography & spacing:** [UI-UX-SPEC.md](./UI-UX-SPEC.md)
