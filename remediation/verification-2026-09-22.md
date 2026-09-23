# APZ Legal remediation continuation — 22 September 2026

Authoritative plan: `attached_assets/APZ_Legal_Consolidated_Bug_Remediation_Updated_Demo_Accounts.docx`, read in full before changes.

Reviewed **20 section-level findings (A–T)**: A intentionally retained, B and C completed previously, and 17 remaining findings D–T. The repository already contained extensive uncommitted remediation implementations when this continuation began. Those changes are distinguished from the additions below. This is **not a declaration of production readiness or complete end-to-end verification**.

## Changes made during this continuation

| File | Finding | Targeted change and verification |
|---|---|---|
| `artifacts/api-server/src/routes/provider-operations.ts` | I | Reject staff-session requests for `provider_confirmed` before reading or updating operations, including replay-shaped requests. A supplied request/event ID is not proof of provider origin. Five role tests verify rejection. Existing failed-operation handling and retry remain. |
| `artifacts/apz-legal/src/pages/ai/index.tsx` | R | Accept nullable sources already allowed by the API contract. Frontend typecheck passes. |
| `artifacts/apz-legal/src/components/ai/AiOutputView.tsx` | R | Handle omitted chunk counts and apply the existing source deduplicator to the detail view. Deduplication unit tests and frontend typecheck pass; visual review remains manual. |
| `artifacts/api-server/src/lib/metrics.ts` | T | Add a fixed, PII-free research provider failure counter. Tests verify private access, output and labels. |
| `artifacts/api-server/src/routes/research.ts` | T | Count research AI exceptions even when internal results are returned successfully. The existing H authorization change is preserved. Live provider-failure injection remains manual. |
| `scripts/src/remediation-api.test.ts` | I/N/P | Add provider confirmation, Graph clientState, ingestion source, promotion transaction-boundary and excessive reporting-range tests. |
| `scripts/src/remediation-workflows.test.ts` | D/E/F | Add actual route-handler tests for all eight seeded demo identities through session creation and `/auth/me`; compliant/review-required/blocked matter creation; missing-client rejection. |
| `scripts/src/remediation-operations.test.ts` | Q/S/T | Add rejected async action, security header and private metrics tests. |
| `remediation/operations.md` | T | Document the new research failure metric. |
| `remediation/verification-2026-09-22.md` | D–T verification | This finding-by-finding report and remaining acceptance work. |

No other intentional changes were introduced during this continuation. The broad build reordered a generated mockup registry; that incidental change was removed after the build. No packages were upgraded during this continuation.

## Finding checklist

“Already resolved / verified” below describes the specific local behavior tested, not deployed acceptance. Database persistence is mocked in route tests; no test result below proves live database constraints, provider connectivity or browser behavior.

| Section | Result | Evidence and outstanding verification |
|---|---|---|
| A | Intentionally retained | Demo accounts, helpers and quick sign-in retained. No implementation change. |
| B | **COMPLETED previously — not reimplemented** | Storage code/configuration untouched. Existing storage configuration tests ran as part of the unit suite. No deployed upload/download claim is made. |
| C | **COMPLETED previously — not reimplemented** | Backup and Git recovery implementation untouched. No backup, restore, commit or remote operation performed. |
| D | Already resolved / verified for seeded identities | All eight actual dev-login route selections produce sessions resolving to the selected `/auth/me` identity. Existing restricted-role and mismatch tests pass. Existing account provisioning behavior is preserved; no shared administrator fallback was added. Deployed browser sign-in still requires QA. |
| E | Already resolved / verified locally | Existing API requires `compliant` before creation; UI eligibility/copy agrees. Repository evidence: `attached_assets/Pasted-PROMPT-3-FICA-Compliance-Implement-or-improve-the-APZ-L_1785327602728.txt`, “AUTOMATED COMPLIANCE BLOCKING”, explicitly says missing/expired/rejected critical requirements block matter creation. Tests verify success proceeds into the existing conflict workflow and both review-required and blocked clients receive 409 without writes. No FICA rule changed. |
| F | Implementation present; API/error mapping verified | Missing-client API rejection and safe 409 messages pass. Existing form uses a required positive client ID, FormMessage, FormControl ARIA and the select ref for focus. Inline display/focus and successful browser submission remain manual. |
| G | Already resolved / verified locally | Shared document-by-ID middleware covers read/update, versions, status, AI assist, citation verification, submit/decision/approve, signature request/sign/certificate and archive. Tests verify three restricted roles are denied before content access and assigned/broad roles retain access. End-to-end route mounting and document lifecycle remain staging QA. |
| H | Denial behavior already resolved / verified | Tests reject missing/unassigned matter research before retrieval with the same 404 response. Successful live vector retrieval and source isolation remain unverified. |
| I | Outstanding confirmation defect fixed and verified locally; integration verification pending | Staff sessions cannot forge provider confirmation, including privileged roles. Graph subscription creation transmits the supplied persisted state; webhook tests cover handshake and mixed valid/malformed/forged/unknown items. Existing SQL predicates and renewal code inspected. Valid provider confirmation needs a trusted adapter; none was invented or enabled. Microsoft reconnect/sync/disconnect and subscription recreation require staging. |
| J | Already resolved / verified locally | Exact CORS policy, disallowed origins, session clearing, single redirect and auth/provider-expiry exclusions pass unit tests. Reverse-proxy origins and browser expiry remain manual. |
| K | Review-only preparation present; data work pending | Exact-ID read-only inventory script and backup/dependency review instructions already exist. Script syntax passes. No manifest of verified QA-owned live IDs was supplied, and no database inventory or deletion was run. Names alone remain insufficient evidence. Dependency inventory is not a complete deletion plan. |
| L | Implementation present; partial local verification | Task ownership/invalid payloads, invoice/appointment denial and visitor validation pass. Existing FICA/client-access checks, compliance role/schema/audit and FICA uniqueness code inspected. Positive/negative FICA and compliance workflows, today/upcoming appointment lists, and concurrent FICA registration still need database-backed QA. |
| M | Implementation/migration preparation present; runtime verification blocked | Sequence-based invoice numbering, staged orphan diagnostics/FKs/indexes and cosine IVFFlat definitions exist. No PostgreSQL tooling/disposable database was established. Migrations, live index comparison, orphan/duplicate diagnostics and invoice concurrency have not been executed. Do not treat this item as fixed in production. |
| N | Existing controls verified with mocked persistence | Tests reject missing/forged adapter credentials and forbidden matter linkage, accept authenticated duplicate delivery, deny non-author promotion, and verify document/attachment/audit writes use one transaction with no commit on simulated audit failure. Real PostgreSQL rollback, first-time provider ingestion and attachment flow remain manual. |
| O | Permitted abstraction/planning phase verified | Existing field inventory and versioned AES-GCM abstraction retained. Roundtrip/randomization, retained-key, wrong-key/context/version and plaintext rejection tests pass. No persisted field was encrypted; rollout requires approved searchable-field migration and key management. |
| P | Implementation present; partial verification | Page defaults/caps/navigation, later-page failure handling and excessive productivity range tests pass. Existing global-list SQL bounds and batched matters/documents/tasks enrichment inspected. Real before/after query measurements, large-list browser behavior and broader nested-list coverage remain outstanding; no performance improvement is claimed from measurement. |
| Q | Implementation present; partial verification | Existing async wrapper catches rejected actions in tests. Error boundary, toast delay and stream-reference-before-recorder setup inspected. Browser render recovery and microphone constructor/start failure, cancellation and unmount require manual tests. |
| R | Outstanding type/source handling corrected; visual QA pending | Frontend typecheck now passes. Existing presentation tests cover legacy retrieval blocks, normal prompts, repeated sources and empty lists. Detail view now also deduplicates. No prompts, ranking or stored history changed. No screenshots/browser acceptance performed. |
| S | Dependency audit/header helpers verified; deployed checks pending | Production dependency audit reports no known vulnerabilities. Header tests verify MIME/frame/HSTS and configured report-only/enforced CSP behavior. Existing OpenAPI session schemes and webhook/compliance coverage inspected; full route/spec coverage is not certified. Production CSP compatibility and deployed headers remain manual. |
| T | Monitoring gap addressed; operational activation pending | Fixed-label HTTP metrics/credential guard already exist; research failures now have a separate counter. Tests pass. Existing scrape/alerts and CI workflow inspected. Prometheus tooling is unavailable; no host scrape, alert delivery or GitHub CI run performed. |

## Executed checks

| Check | Result |
|---|---|
| Initial `pnpm test:unit` | Sandbox denied the tsx IPC socket. Rerun with approved escalation passed all original 66 tests. |
| Final `pnpm test:unit` | **PASS: 95 tests, 0 failed, 0 skipped**, including 29 tests added here. An intermediate run exposed a test-only GET/POST selector mistake; corrected and rerun successfully. |
| `pnpm --filter @workspace/apz-legal exec tsc -p tsconfig.json --noEmit --pretty false` | **PASS** after targeted Section R fixes. |
| Final `pnpm typecheck` | **FAIL**. Libraries, scripts and APZ frontend complete; unrelated mockup type errors prevent workspace success. |
| Independent API-server typecheck | **FAIL** at `src/lib/retrieval-service.ts:111`: nullable `DocumentSubtype` passed to a `string \| undefined` field. Existing, unchanged source; not altered merely to pass verification. |
| Independent mockup-sandbox typecheck | **FAIL** in existing InkBrass/InkBrassDark component tuple inference/render types. Unrelated source left unchanged. |
| `PORT=18593 BASE_PATH=/ pnpm -r --if-present run build` | **PASS**, run both before and after targeted changes. API server, APZ frontend and mockup builds completed. Builds do not supersede the failed typechecks. |
| `pnpm audit --prod --audit-level=moderate` | Initial sandbox DNS failure; rerun with approved network access **PASS: no known vulnerabilities found**. |
| `node --check scripts/qa-cleanup-dry-run.mjs` | **PASS**; syntax only, no connection or cleanup. |
| `git diff --check` | **PASS**. |
| Full tracked diff plus existing untracked remediation review | Reviewed for finding scope; original working-tree changes retained. |

The live regression/browser scripts were not run: they create/mutate records and no isolated test deployment/database was established. There is no claim of real-browser, live-provider, database migration, concurrent-invoice, restore-drill or deployed-header success.

## Preservation and release blockers

The original `auth.ts`, `login.tsx`, `devAccounts.ts`, `dev-login.test.ts` and `test-cases/` files remain byte-for-byte unchanged from the start snapshot. All other existing files were retained; only the scoped additions identified above were made. Sections B/C were not rewritten. No push, deployment, migration, production modification, destructive database command or cleanup was executed.

Workspace typecheck remains a release blocker. The unrelated API and mockup errors need separately scoped resolution before the existing CI can be green. No private data or configured secrets belong in this report.

Remaining deployment/configuration work is documented in `operations.md`, `migrations.md`, `qa-cleanup.md` and `sensitive-data-plan.md`:

1. Provision a disposable staging database and application; run migrations in documented order after backup/restore checks. Verify live indexes, duplicate/orphan handling, concurrent invoice numbers and FICA registration. Do not blindly push schema.
2. Configure trusted origins, browser storage origins and ingestion adapter credentials through secure deployment configuration. Recreate Microsoft subscriptions and test valid/invalid callbacks. Review CSP violations before enforcement.
3. Configure private metrics access, Prometheus scraping and alert delivery; validate rules with promtool. Run CI once unrelated type errors are resolved.
4. Browser-test all eight demo identities and restricted access; required-client focus/messages; client-to-matter FICA outcomes; document lifecycle and cross-matter denial; research citations; expired sessions; calendar/settings/email errors; media cleanup; clean AI history with multiple/duplicate/no sources.
5. Measure matters/documents/tasks queries and large-list behavior. Exercise PostgreSQL promotion rollback and first-time trusted email ingestion. Confirm trusted-provider signature flow when an adapter is available.
6. Supply verified QA record IDs for a read-only cleanup inventory. Obtain separate approval before any data cleanup or encryption migration. Retain audit evidence.
7. Retest deployed document/FICA/knowledge uploads and downloads through the completed B implementation, and verify scheduled backups/restore readiness through the completed C implementation, without reimplementing either.

The local fixes above are reviewable; remaining database, browser, provider and host acceptance work is explicitly outstanding.
