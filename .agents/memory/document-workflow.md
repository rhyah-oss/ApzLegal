---
name: Document governance workflow
description: Rules for APZ Legal's governed document lifecycle, approval, versioning, notifications.
---

# Document governance workflow

- Document lifecycle: draft → ai_assist → review → partner_approval → client_signing → archived. Backward/lateral draft-phase moves only via the status endpoint's transition map; forward moves only via workflow endpoints (submit, decision, send-signature, sign, archive).
- **Approval only via the decision endpoint** (decision values: `approve | reject | request_changes` — NOT the legacy approvalStatus values `approved/rejected/changes_requested`; a past bug sent the wrong set from the UI). Legacy approve endpoint returns 409.
- **Why:** governance requirement — a document must never reach approved/signed/archived outside the partner-gated workflow; the code reviewer flagged direct writes and missing auth as bypasses.
- **How to apply:** every state-mutating document route must require an authenticated user; partner decision restricted to partner|managing_partner|admin (keep frontend role list in sync — frontend once used `super_admin` and broke the contract). Document update + version snapshot must run inside one DB transaction so version history stays immutable/complete.
- Notifications are user- or role-targeted; mark-as-read must verify the notification is addressed to the caller (IDOR fix).
- Binary document metadata must be copied into every immutable version snapshot alongside text content.

**Why:** A governed document’s file can change independently of its text, and version history must identify the exact retrievable artifact that was reviewed.

**How to apply:** When adding or changing document file fields, update the document-version schema, snapshot writer, generated contract, and regression assertions together.
