# APZ Legal — Complete Functional Audit Report

**Date:** 2026-09-02 · **Auditor:** Kilo functional audit (live, end-to-end)  
**App:** APZ Legal (new, from Replit export) · **Root:** /home/ubuntu/apz-legal-ai-replit  
**Runtime:** Docker (`apz-legal-web`) on `http://127.0.0.1:3002/api`, `NODE_ENV=production`  
**DB:** PostgreSQL via direct `127.0.0.1:5432` (verified)

---

## 1. APPLICATION OVERVIEW

**Architecture:** pnpm monorepo
- `lib/db` — database schema (27 tables, Drizzle ORM + PostgreSQL)
- `lib/api-spec` — OpenAPI contract (~98 paths)
- `lib/api-client-react` — generated React API client (real Orval fetch, **no mocking**)
- `lib/api-zod` — Zod validation schemas
- `artifacts/api-server` — Express API (routes + lib services)
- `artifacts/apz-legal` — React frontend (wouter routing, React Query)
- `artifacts/mockup-sandbox` — design Canvas app on :8081 (separate, not production UI)

**Routing:** 27 Express routers mounted at `/api/*` (routes/index.ts:28-50). Frontend SPA (wouter) with 23 routes, all mapping to real backend endpoints — **no orphaned pages**.

**User roles (10):** super_admin, admin, managing_partner, partner, associate_attorney, candidate_attorney, paralegal, secretary, compliance_officer, billing_officer. Role constants in `lib/permissions.ts`.

---

## 2. FUNCTIONALITY MATRIX

| Feature/Module | Status | Frontend | Backend | Database | Integration | Persistence | Notes |
|---|---|---|---|---|---|---|---|
| Authentication | PASS | SPA login page | auth.ts (scrypt+salt, timing-safe, 5-attempt lockout, token rotation) | sessions table (hashed) | HttpOnly+Secure+SameSite cookie | Verified logout/login cycle | |
| Clients | PASS | ClientsPage, ClientDetail | clients.ts (CRUD, search?q=, risk-score, FICA, related-parties, billing, activity) | 25+ DB ops verified | — | Persists across refresh/login | |
| Matters | PASS | MattersPage, MatterDetail | matters.ts (CRUD, conflict, status, export) | Verified | — | Persists | |
| Documents | PASS (governance) | DocumentDetail | documents.ts (full lifecycle + versions + signature certs) | 5 docs verified | — | Persists, HMAC-sealed evidence | **File upload PARTIAL** (see Storage) |
| Tasks | PASS | TasksPage | tasks.ts | Verified | — | Persists | |
| Conflicts | PASS | ConflictsPage | conflicts.ts (raise, review, dashboard) | 3 conflict records | — | Persists | |
| Time Entries | PASS | TimeTracking | time.ts | Verified | — | Persists | |
| Billing/Invoices | PASS | BillingPage | billing.ts (create, generate-from-time) | Verified | — | Persists | |
| Knowledge Base | PASS | KnowledgePage | knowledge.ts (versioned, governed approval) | Verified | DB term-search (not vector) | Persists | File upload broken (Storage) |
| AI Assistant | PASS (slow) | AiAssistant | ai.ts (Ollama qwen2.5:7b, generate, conversations) | 11 convos verified | Ollama (REAL) | Persists, audit-logged | No timeout; transcription 503 |
| Research | PASS (slow) | ResearchPage | research.ts (internal search + AI analysis) | 4 records verified | Ollama (REAL) | Persists, audit-logged | 94s-300s+ on complex queries |
| Audit Logs | PASS | AuditPage | audit.ts | Verified queryable | — | Persists | |
| Notifications | PASS | (UI toast?) | documents.ts (notifications, preferences) | Verified | — | Persists (read toggle) | |
| FICA | PASS | FicaPage | fica.ts (requirements, upload, verify/exp, dashboard, expiring) | Verified | — | Persists | File upload broken (Storage) |
| Appointments | PASS | CalendarPage | appointments.ts (CRUD + check-in auto-stamp) | Verified | — | Persists | |
| Visitors | PASS | (no frontend page) | visitors.ts (CRUD + auto check-in/out) | Verified (test created/deleted) | — | Persists | Frontend page may be missing* |
| Productivity | PASS | ProductivityPage | productivity.ts (timezone-aware analytics) | Verified | — | N/A (read-only) | Uses session TZ (not app TZ) |
| Workflows/Actions | PARTIAL | ActionsPage | workflows.ts (queue, decision) | Verified | — | Persists | **super_admin gap** (see Bugs) |
| Admin | PASS | AdminPage | admin.ts (users, connectors) | Verified | — | Persists | Connectors status inaccurate |
| Storage | BROKEN | All file UIs | storage.ts | — | MinIO/S3 (broken) | N/A | 500 — missing env vars |
| Email | PARTIAL | EmailPage | emails.ts | emails table | Email provider | — | Provider not connected (by design) |

*Visitor management has full backend but no dedicated SPA route — likely accessed via appointments or a shared scheduling UI.

---

## 3. WORKING (PASS)

- **Auth pipeline** — login, `/auth/me`, `/auth/logout`, session validation, role enforcement, lockout (5 attempts), token rotation. Cookie HttpOnly+Secure+SameSite.
- **Clients** — Create, list with `?search=`, get, patch, delete, compliance patch, FICA requirements, risk score, related parties (CRUD), documents, billing, activity timeline.
- **Matters** — Create (auto conflict check), update, submit, decision, status transitions, export (25KB JSON dossier), assignment.
- **Documents** — Full governance lifecycle: create → update → review → submit → decision/approve → send-signature → sign → archive. Document versions (snapshots on edit). **HMAC-SHA256-sealed signature certificates** with integrity verification. Citation tracking (`unverified`/`verified`/`none`). Export.
- **Tasks** — Create, list (with matter/project join), get, update, delete, status transitions.
- **Conflicts** — Raise (auto from onboarding), review, dashboard, assignment.
- **Time entries** — Create, list (multi-join), get, update, delete. Linked to matters.
- **Billing** — Invoices created, generated from time entries (201), listed, billed hours tracked.
- **Knowledge base** — Upload (text), submit → pending_approval, approve → approved + indexed (synchronous term-search), edit (version snapshot), archive. Role-governed (legal authors upload; partners approve).
- **AI** — `/ai/generate` (real Ollama qwen2.5:7b), conversation history, save-to-matter, review (low-risk auto-approved). Audit-logged. Output persists.
- **Research** — `/research/query` returns internal results + AI-assisted summary with honesty guardrails (no fabricated citations, confidence scores, verification labels). Internal search is live (term-based); external (case law, legislation) labeled Phase 1D.
- **Audit logs** — All actions logged with user, IP, details. Queryable.
- **Notifications** — Role-targeted + user-specific. Read toggle (ownership-enforced). Preferences (email/in-app toggles).
- **FICA** — Per-client-type requirements, document upload/register, verify/reject/expire (with state-transition guards), recompute, dashboard, expiring-soon, timeline, manual override.
- **Appointments** — CRUD, today/upcoming, role-scoped ownership (juniors can only modify own), auto-enrichment.
- **Visitors** — CRUD, today, date filter, auto check-in/checkout stamping, host/client/matter enrichment.
- **Productivity** — Timezone-aware (Johannesburg) analytics, role-scoped (juniors = self only, partners = firm), KPIs, trends, workload, health, insights.
- **Admin** — User creation (scrypt hash), role/status changes, self-deactivation guard, connectors catalogue.
- **Health** — `/api/healthz` → 200 (liveness probe, no auth).

---

## 4. PARTIALLY WORKING

### Storage / File Uploads (BROKEN INTEGRATION)
**Status:** 500 — **STORAGE_UNAVAILABLE**  
**Root cause:** `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` environment variables are **NOT set** in the container. Only `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` are configured.  
**Impact:** All file operations fail:
- `/storage/uploads/request-url` → 500
- `/storage/objects/...` → 500
- FICA document uploads (with fileObjectPath) → 500
- Document file uploads/references → 500
- Email attachment serving → 500
- Knowledge base file attachments → 500
- Frontend download links (`/api/storage${fileObjectPath}`) → 500  
MinIO bucket `apz-legal-replit` exists and credentials are valid, but uploads cannot proceed.

### AI Performance
- AI generation is **real** but slow: `/ai/generate` ~90-120s, `/research/query` ~94s (simple) to **300s+** (complex). No server-side timeout — requests hang indefinitely.
- AI transcription → **503** (no model configured for Ollama; `TRANSCRIPTION_MODEL=null`).

### Email Provider
- `/email/readiness` → `not_connected`. `EMAIL_INGESTION_ENABLED != true`. Ingestion endpoint returns 409. Provider operations queue (`POST /provider-operations/email`) works (queues with `not_connected` status) but emails never send. Retry endpoint correctly rejects non-failed operations (409).

---

## 5. MOCK / PLACEHOLDER

**None found.** All data sources are real:
- DB queries hit PostgreSQL directly (verified via direct connection + persistence across login/refresh).
- AI calls reach Ollama qwen2.5:7b (verified: generated content is contextual, matter-specific, persisted with model name + audit logs).
- No MSW, faker, or fake API in the client (`lib/api-client-react` uses real Orval fetch).
- No hardcoded responses in frontend (verified via API call tracing).

**Note:** The AI model is honest about its limitations — research output explicitly states "NO live access to case law or legislation databases" and flags unverified citations. This is transparency, not a mock.

---

## 6. MISSING / INCOMPLETE

| Gap | Status | Notes |
|---|---|---|
| Global document search | Missing | No `GET /documents?search=` endpoint; documents are only listed per-matter. Frontend calls `/api/storage${path}` for downloads (broken). |
| Live case law integration | Phase 1D | SAFLII/legislation not connected; research is AI-assisted only. |
| Email provider | Not connected | Microsoft 365/OAuth not configured. |
| Digital signing | Not connected | Provider not connected; `send-signature`/`sign` endpoints exist but provider operations queue as `not_connected`. |
| Transcription model | Unavailable | 503 with Ollama provider. |
| Visitors frontend page | Possibly missing | Full CRUD backend exists; no SPA route found (`/visitors` not in App.tsx). |
| `/actions` queue for super_admin | Broken | See Bugs #1. |

---

## 7. INTEGRATION ISSUES

| Integration | Status | Evidence |
|---|---|---|
| PostgreSQL | WORKING | Direct connection verified; all CRUD persists. |
| Ollama (AI) | WORKING | `qwen2.5:7b` reachable at `http://ollama:11434`; real generations verified (11 conversations, 4 research records). |
| MinIO/S3 storage | BROKEN | Bucket exists, credentials valid, but `PRIVATE_OBJECT_DIR` missing → 500 on all object operations. |
| Email (MS365) | NOT CONNECTED | `EMAIL_PROVIDER_CONNECTED != true`; ingestion disabled. |
| Digital signing | NOT CONNECTED | `signing`: `not_connected` per `/admin/connectors`. |
| Redis | ORPHANED | `REDIS_URL` configured in env but **zero `redis` imports/usages** in server code. |
| Qdrant (vector DB) | ORPHANED | Mentioned in deploy `.env.production` comments but **not used**; knowledge base uses PostgreSQL `ilike` term-search instead. |

---

## 8. SECURITY ISSUES

| Issue | Severity | Details |
|---|---|---|
| `/actions` queue bypasses super_admin | MEDIUM | `workflows.ts:11` defines `PARTNERS = ["partner","managing_partner","admin"]` — **missing `super_admin`**. The seeded admin IS `super_admin`, so partner-level actions (conflict review, invoice review) never appear. `PARTNER_ROLES` elsewhere includes `super_admin` — internal inconsistency. |
| `/api/healthz` auth-free | LOW | Liveness probe requires no auth (standard, but `/api/health` returns 401 which may confuse monitoring). |
| FICA document upsert without auth on GET | LOW | `/clients/:id/fica/requirements` and `/fica/dashboard` have no authentication check (GET-only, read-only — low risk). |
| Cookie Secure flag over HTTP | LOW | Cookie set `Secure` but app served over HTTP in this environment — browser won't send it (worked via curl with explicit cookie). In production over HTTPS this is correct. |

**RBAC verified (server-side):** Paralegal correctly receives 403 on conflict-review, provider-email, audit-logs API access. Productivity correctly scoped to self-only for junior roles. Matter access enforced (403 on other users' matters).

---

## 9. DATA / PERSISTENCE ISSUES

- **Storage files never persist** — all uploads return 500 (see Section 4). No file has ever been stored in the MinIO bucket (confirmed empty).
- **Document `fileObject_path` always NULL** for all 5 seeded documents (all AI-generated text, no uploaded files).
- **Knowledge base file attachments** cannot be uploaded (Storage 500) — text-only knowledge works.

---

## 10. ORPHANED / LEGACY FUNCTIONALITY

| Orphan | Details |
|---|---|
| Redis | Configured (`REDIS_URL=redis://redis:6379/3`) but no `redis` import anywhere in `src/`. |
| Qdrant | Referenced in deploy comments as the indexing backend, but knowledge search uses PostgreSQL `ilike`. No Qdrant containers or connections found. |
| `/api/approve` endpoint | RETIRED — returns 409. Frontend correctly uses `/decision` instead (matters.ts, documents.ts). |
| `objectAcl.ts` | ACL module exists but the ObjectStorageService is non-functional (Storage 500), making ACL unreachable. |
| `/matters/:id/export` | Exists in backend + frontend call (`[id].tsx:362`) — **not orphaned**, confirmed working (25KB JSON). |
| `/provider-operations/email` | Exists, used by provider-operations flow — **not orphaned**. |

---

## 11. UI/UX ISSUES

- **ActionsPage** calls `/api/actions` which returns an empty array for `super_admin` (due to the PARTNERS bug) — the UI shows "no pending actions" even when conflicts requiring review exist.
- **Frontend download links** (`/api/storage${fileObjectPath}`) will 500 for any document with a file path (none currently exist).
- **CalendarPage** uses server-local date for `/visitors/today` filtering (no timezone awareness) — inconsistent with the timezone-aware `/productivity` module.
- **SettingsPage** references `/api/auth/profile`, `/api/auth/password`, `/api/notification-preferences` — all confirmed wired (not orphaned).

---

## 12. END-TO-END WORKFLOW RESULTS

| Workflow | Result | Key Finding |
|---|---|---|
| Client → Matter (with conflict check) | PASS | Conflict false-negative on duplicate client (Bug #2) — both matters cleared. |
| Matter → Documents (governance) | PASS (25/25) | Full lifecycle: create→review→submit→approve→sign→archive→certificate. |
| Matter → Documents (file upload) | FAIL | 503 STORAGE_UNAVAILABLE (missing env). |
| Matter → AI → Document | PASS | AI generate → conversation → document link → review → approved. |
| Matter → Knowledge → AI | PASS | Knowledge approved+indexed → research finds it (internal search). |
| Matter → Time → Invoice | PASS | Time entry → invoice create (201) → generate (201) from billable hours. |
| Matter → Tasks | PASS | Task CRUD, status, assignment all persist. |
| Client → FICA → Matter | PARTIAL | FICA gate works (409 on non-compliant); document upload broken (Storage). |
| Matter → Conflict → Review → Approve | PASS | Conflicts raised, reviewed, approved. |
| Notification → Preference update | PASS | Preferences update + audit-logged. |
| Matter → Export | PASS | 25KB dossier JSON. |

---

## 13. PRIORITY

| Priority | Issues |
|---|---|
| **P0 — Critical** | 1. **Storage broken** (`PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS` missing) — affects FICA document uploads, file-based documents, email attachments, knowledge attachments. **No file operations work.** |
| **P1 — High** | 2. **`/actions` queue broken for super_admin** (`workflows.ts:11` missing `super_admin` from `PARTNERS`) — partners/admins see no action items. 3. **Onboarding conflict false-negative** (`matters.ts:74` bug) — duplicate-client conflicts not detected. 4. **`REDIS_URL` orphaned** — configured but unused (dead config). 5. **No AI server-side timeout** — requests can hang indefinitely on slow queries. |
| **P2 — Medium** | 6. **`/admin/connectors` inaccurate** — lists `app-storage` as `connected` when it actually returns 500. 7. **Document transcription unavailable** (503). 8. **No global document search** endpoint. |
| **P3 — Low** | 9. **`/api/healthz` unauthenticated** (acceptable, but `/api/health` misleads). 10. **Qdrant orphaned** in deploy config. 11. **Visitors frontend page** possibly missing. 12. **Redis container** running but unused (minor resource waste). |

---

## 14. FINAL SUMMARY

| Metric | Count |
|---|---|
| Endpoints discovered (OpenAPI) | 98 paths |
| Endpoints tested live | 50+ |
| Frontend routes | 23 |
| Database tables | 27 |
| User roles | 10 |
| **Fully working** | ~30 modules/endpoints |
| **Partially working** | Storage (7 endpoints), AI (slow/transcription), Email (provider) |
| **Broken** | Storage/file upload chain (P0) |
| **Bugs found** | 5 (2 logic, 1 config gap, 1 auth gap, 1 timeout) |
| **Orphaned** | Redis, Qdrant, `objectAcl.ts`, `/approve` (retired) |
| **Mocked/faked** | 0 — all AI, DB, and data flows verified real |
| **Security issues** | 1 medium (actions RBAC), 2 low |

### Critical P0 issue
**No file/document storage works.** Set `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` environment variables in the container to restore the entire file-upload/retrieval chain (FICA docs, governed documents, email attachments, knowledge attachments).

### Two confirmed logic bugs (P1)
1. `workflows.ts:11` — `PARTNERS` array omits `super_admin`, breaking the action queue for the seeded admin.
2. `matters.ts:74` — onboarding conflict check uses `eq(mattersTable.id, -matter.id)` which can never match an existing matter, producing false-negative conflict clearance.
