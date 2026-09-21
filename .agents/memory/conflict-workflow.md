---
name: Conflict checking workflow
description: Design rules for the mandatory conflict-check gating in APZ Legal
---

# Conflict checking workflow

- Matter gating is a **whitelist**: only `cleared` or `approved` latest conflict statuses allow approve/activate; every other status (pending, further_review, legacy `flagged`, unknown) blocks. Never blacklist statuses; `pending`/`further_review` and `rejected` block with 409 + code (CONFLICT_CHECK_REQUIRED / CONFLICT_REVIEW_PENDING / CONFLICT_REJECTED). Blocked attempts are audit-logged.
- **Why (security):** two bypasses were found in review and must not regress: (1) `/conflicts/check` with a `matterId` must derive the client name from the matter's client record, never from caller input (forged clean scans); (2) partner review only affects the matter if the reviewed record is the *latest* conflict record for that matter (stale approvals must not override newer scans).
- Only roles `partner`, `managing_partner`, `admin` may review; decisions map approve→approved, reject→rejected (+ matter riskFlag), request_further_review→further_review.
- Cleared scans (no flags) pass without partner review; any flag requires partner review.
- **How to apply:** any new endpoint that can change matter status must repeat the conflict gate; any change to conflict statuses must update both the gate and the OpenAPI enums (then `pnpm --filter @workspace/api-spec run codegen`).

## Lifecycle enforcement (matter workspace redesign)
- All matter status writes must go through the shared validator in the api-server lifecycle lib (`checkTransition` / `tryTransitionMatter` in `src/lib/matter-lifecycle.ts`). Never write `matters.status` directly in a route — the code reviewer flagged conflict-route direct writes as a gating bypass.
- **Why:** the transition matrix (lead→conflict_check→approved→active→review→completed→closed→archived) plus the `riskLevel=compliance_blocked` freeze must hold globally, including system-driven transitions from conflict scans/reviews.
- **How to apply:** any new endpoint that changes matter status imports the lifecycle lib; blocked attempts return 409 with codes INVALID_TRANSITION / COMPLIANCE_BLOCKED and are audit-logged via blockTransition.
