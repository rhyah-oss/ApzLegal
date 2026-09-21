---
name: Knowledge base governance
description: Durable rules for the APZ Legal knowledge base module (approval workflow, versioning, AI indexing).
---

- Lifecycle: uploaded → pending_approval → approved | rejected; archived is terminal. AI availability is a *derived* fact: `availableToAi = status === "approved" && aiIndexStatus === "indexed"` — never store it, always derive.
- **Why:** two separate axes (editorial approval vs AI indexing) must never drift; a stored boolean rotted in an earlier design discussion.
- All status transitions use atomic conditional UPDATEs (`WHERE id = ? AND status = <expected>`); a 0-row update means a concurrent transition → return 409 with the current status. Never read-then-write.
- Editing ANY governed field (title, content, type, category, tags) of an *approved* item must snapshot the prior version, bump `version`, reset to pending_approval, and clear the AI index. Title/content-only checks are insufficient — a reviewer flagged this.
- Decisions (approve/reject) AND archive are partner/managing_partner/admin only, enforced server-side; there is no `super_admin` role in this app — the roles are admin, partner, managing_partner, associate_attorney, legal_secretary. UI role lists must match the backend `REVIEWER_ROLES` exactly.
- Rejection requires a note; approval triggers indexing synchronously (retrieval is ILIKE term search, so "indexing" completes inline — indexing/indexed states + audit events are still recorded distinctly).
- Research retrieval filter: `status='approved' AND ai_index_status='indexed'` — archiving or re-editing removes content from AI reach immediately.
- Audit actions: knowledge_uploaded / knowledge_submitted_for_review / knowledge_edited / knowledge_approved / knowledge_rejected / knowledge_indexed / knowledge_archived (entityType "knowledge").
- **How to apply:** any new governed content module (or changes here) should copy this pattern: derived availability, atomic guards, snapshot-on-any-edit, server-side role gating mirrored in UI.
