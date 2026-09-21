---
name: AI governance workflow
description: Rules for the governed AI assistant (workflows, risk, review, save-to-matter) in APZ Legal
---
# AI governance workflow

- Risk classification is fixed server-side per workflow (AI_WORKFLOWS map); the client can never choose or change risk. **Why:** PRD forbids user-influenced risk; reviewer flagged client-controlled risk as a governance bypass.
- Every AI run requires a matterId (400 MATTER_REQUIRED). Metadata must be honest: confidence/citations may be null → UI renders "Unavailable", never invents values. Confidence is stored 0–100; do NOT multiply by 100 in the UI (caused a 9100% display bug once).
- High-risk outputs cannot be saved to a matter while review is pending (409 REVIEW_REQUIRED); override decisions require a note (400 otherwise); review is one-shot (409 ALREADY_REVIEWED).
- Save-to-matter must be race-safe: inside the transaction, first claim the AI row with a conditional UPDATE (`documentId IS NULL`), only then insert the document; losers get 409 ALREADY_SAVED. **Why:** architect review found a double-save race that created duplicate governed documents.
- Saved outputs enter document governance at draft (never approved), contentOrigin ai_generated, or ai_assisted when the attorney edited the content before saving.
- ALL /ai routes (reads included) require auth — reviewer flagged unauthenticated GET /ai/conversations as a data-exposure gap.
- LLM errors (e.g. OpenAI 429 quota) must surface verbatim as AI_GENERATION_FAILED — no silent fallback or fabricated output.
- /audit-logs supports `matterId` which aggregates matter + its documents' + its AI outputs' audit entries; the matter Audit tab uses it.
- Legal research follows the same pattern (research_records table, /research routes): matter-bound, source-labelled (internal live vs external "Phase 1D — AI-assisted, not live"), AI failure must not block internal results (aiStatus ok|unavailable|failed + aiError), citations always start unverified, save-to-matter is a race-safe conditional UPDATE, audits use entityType "research" and are included in the matter audit aggregation and timeline (performed at createdAt, saved at savedAt — distinct events).
- The firm uses a firm-wide access model: any authenticated staff member can read all matters/research/audit data. Reviewers may flag missing matter-level ACL — that is a deliberate product decision, not an oversight; don't add per-matter authorization without the user asking.
- **How to apply:** any new AI workflow or mutation must go through the same requireUser + audit + honest-metadata pattern; never add a route that lets AI content skip the document lifecycle.
