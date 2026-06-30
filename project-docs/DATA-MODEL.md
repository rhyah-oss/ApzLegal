# Data Model — Lexora AI

**ORM:** Drizzle  
**Tenancy key:** `organisation_id` on all firm-scoped tables  
**Phase:** Schema design for Phase 2; mock types in Phase 1

---

## 1. Entity Relationship Overview

```
Organisation (firm)
  ├── User (via membership)
  ├── Matter
  │     ├── Party
  │     ├── Document
  │     ├── EmailThread
  │     ├── Note
  │     ├── Task
  │     ├── TimeEntry
  │     ├── AiSession
  │     │     └── AiMessage
  │     │           └── CitationLink
  │     ├── CitationPack
  │     ├── WorkflowInstance
  │     └── ResearchQuery
  ├── Client
  ├── BillingRate
  ├── WorkflowTemplate
  ├── AuditLog
  └── FirmSettings
```

---

## 2. Core Entities

### 2.1 Organisation

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | Firm name |
| slug | text unique | URL-safe |
| jurisdiction | text | Default `ZA` |
| settings | jsonb | Branding, retention, AI config |
| created_at | timestamptz | |

### 2.2 User & Membership

Users managed by Better Auth. Extension table:

**organisation_members**

| Column | Type |
|--------|------|
| id | uuid PK |
| organisation_id | uuid FK |
| user_id | uuid FK |
| role | enum (firm roles) |
| hourly_rate_cents | int nullable |
| is_active | boolean |

### 2.3 Matter

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organisation_id | uuid FK | |
| reference | text | e.g. `2024/1234` |
| title | text | |
| status | enum | Open, Pending, Closed, Archived |
| practice_area | text | Litigation, Commercial, etc. |
| lead_user_id | uuid FK | |
| client_id | uuid FK nullable | |
| summary | text | |
| opened_at | date | |
| closed_at | date nullable | |

**matter_assignments** — many-to-many user ↔ matter with role on matter.

### 2.4 Party

| Column | Type |
|--------|------|
| id | uuid PK |
| matter_id | uuid FK |
| name | text |
| role | enum | Client, Opponent, Third Party, Witness |
| contact_json | jsonb |

### 2.5 Document

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| matter_id | uuid FK | |
| folder_path | text | Virtual path |
| filename | text | |
| mime_type | text | |
| storage_key | text | MinIO object key |
| size_bytes | bigint | |
| version | int | |
| uploaded_by | uuid FK | |
| checksum | text | SHA-256 |
| extracted_text | text nullable | For search |
| created_at | timestamptz | |

**document_chunks** — for RAG (Phase 4):

| Column | Type |
|--------|------|
| id | uuid PK |
| document_id | uuid FK |
| chunk_index | int |
| content | text |
| qdrant_point_id | text |
| page_ref | text nullable |

### 2.6 Email

**email_threads**

| Column | Type |
|--------|------|
| id | uuid PK |
| matter_id | uuid FK nullable |
| subject | text |
| external_thread_id | text |
| mailbox_connection_id | uuid FK |

**email_messages**

| Column | Type |
|--------|------|
| id | uuid PK |
| thread_id | uuid FK |
| from_address | text |
| to_addresses | jsonb |
| sent_at | timestamptz |
| body_text | text |
| body_html | text nullable |
| storage_key | text nullable |
| is_draft | boolean |
| draft_source | enum | Human, AI |
| approval_status | enum | Draft, Pending, Approved, Sent |

### 2.7 AI Session & Citations

**ai_sessions**

| Column | Type |
|--------|------|
| id | uuid PK |
| matter_id | uuid FK nullable |
| user_id | uuid FK |
| title | text |
| model | text |
| created_at | timestamptz |

**ai_messages**

| Column | Type |
|--------|------|
| id | uuid PK |
| session_id | uuid FK |
| role | enum | user, assistant, system |
| content | text |
| confidence | enum nullable | low, medium, high |
| corpus_warning | boolean | Incomplete material flag |

**citation_links**

| Column | Type |
|--------|------|
| id | uuid PK |
| message_id | uuid FK |
| source_type | enum | judgment, statute, document, email |
| source_id | uuid nullable |
| source_title | text |
| reference | text | ¶12, s5(1), p3 |
| excerpt | text |
| confidence_score | int | 0–100 |
| verification_status | enum | pending, verified, rejected, not_found |
| verified_by | uuid FK nullable |
| verified_at | timestamptz nullable |

**citation_packs**

| Column | Type |
|--------|------|
| id | uuid PK |
| matter_id | uuid FK |
| name | text |
| citation_ids | uuid[] |
| exported_at | timestamptz nullable |

### 2.8 Workflow

**workflow_templates**

| Column | Type |
|--------|------|
| id | uuid PK |
| organisation_id | uuid FK |
| name | text |
| entity_type | enum |
| steps_json | jsonb |

**workflow_instances**

| Column | Type |
|--------|------|
| id | uuid PK |
| template_id | uuid FK |
| entity_type | text |
| entity_id | uuid |
| status | enum |
| assigned_to | uuid FK nullable |
| due_at | timestamptz nullable |

**workflow_events** — immutable append-only status history.

### 2.9 Time & Billing

**time_entries**

| Column | Type |
|--------|------|
| id | uuid PK |
| matter_id | uuid FK |
| user_id | uuid FK |
| description | text |
| duration_minutes | int |
| rate_cents | int |
| billable | boolean |
| status | enum | Draft, Submitted, Approved, Invoiced |
| linked_document_id | uuid nullable |
| linked_email_id | uuid nullable |
| linked_ai_session_id | uuid nullable |
| entry_date | date |

**invoices** — Phase 8.

### 2.10 Audit Log

See [SECURITY.md](./SECURITY.md#8-audit-logging). No updates or deletes.

---

## 3. Enums (Summary)

```typescript
MatterStatus = 'open' | 'pending' | 'closed' | 'archived'
VerificationStatus = 'pending' | 'verified' | 'rejected' | 'not_found'
WorkflowStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'sent' | 'filed' | 'archived'
TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'invoiced'
FirmRole = 'firm_owner' | 'firm_admin' | 'partner' | 'attorney' | ...
```

---

## 4. Indexing Strategy

| Table | Index |
|-------|-------|
| matters | `(organisation_id, status)`, `(reference)` |
| documents | `(matter_id, folder_path)` |
| audit_logs | `(organisation_id, created_at DESC)` |
| time_entries | `(matter_id, entry_date)` |
| citation_links | `(message_id)`, `(verification_status)` |

Full-text: OpenSearch indices synchronised from `documents.extracted_text`, `email_messages.body_text`, legal corpus.

Vectors: Qdrant points from `document_chunks.content` embeddings.

---

## 5. Mock Data Types (Phase 1)

TypeScript interfaces in `apps/web/src/types/` mirroring above entities with simplified fields for UI shell development. No database required until Phase 2.
