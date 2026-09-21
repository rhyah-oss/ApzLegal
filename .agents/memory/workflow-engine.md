---
name: Workflow engine
description: Design rules for the central workflow layer (projection engine, action queue, governed billing lifecycle).
---

- The workflow engine is a **projection, not persisted state**: definitions live in code (`workflow-engine.ts`, 5 firm workflows) and live instances are derived on read from each module's own status fields. **Why:** module routes already enforce all gates server-side; persisting parallel workflow state would inevitably drift.
- Central action queue (`GET /actions`) is role-aware and also derived on read — partners see review/approval items (conflicts, document approvals, knowledge reviews, invoice reviews, FICA verifications); others see only their own items. Frontend "My Actions" page + sidebar badge consume it.
- Governed invoice lifecycle: draft → pending_review → approved → sent → paid (overdue from sent). Status can NEVER change via PATCH; only workflow endpoints (submit/decision/send/mark-paid) with atomic status-guarded UPDATEs. Reject requires a note. Decisions are partner|managing_partner|admin (same REVIEWER_ROLES everywhere — no super_admin).
- Invoice generation from unbilled time is transactional: SELECT ... FOR UPDATE on unbilled entries + billed-flag flip + insert in one transaction; 409 NO_UNBILLED_TIME when empty.
- Matter approval/activation is double-gated: conflict gate (existing) AND FICA gate (client complianceStatus "blocked" → 409 FICA_BLOCKED), both in the matters status route.
- Projection subtleties that were review findings once: invoice `approved` projects to the billing_review step (ready-to-send, NOT invoice_sent); matter `approved` projects to the approval-granted step, `active` to the final step — don't collapse adjacent states.
- **How to apply:** any new governed lifecycle should get a definition in workflow-engine.ts, a projection branch, and action-queue entries — never its own persisted workflow table.
