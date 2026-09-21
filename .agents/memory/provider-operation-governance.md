---
name: Provider operation governance
description: Vendor-neutral email and signing handoffs use durable, idempotent provider operations.
---

Provider operations are the source of truth for outbound handoff state: queued is persisted intent, provider_confirmed is provider acceptance, failed is actionable, and only a separate signed evidence action means the client signature is recorded.

**Why:** Treating a queued or provider-confirmed request as delivered or signed would create a misleading legal record, while retries and duplicate callbacks can otherwise create duplicate outbound actions.

**How to apply:** Require reviewed Matter context before email queueing, persist provider request/event identifiers, accept only guarded queued-to-terminal transitions, make repeated events harmless, and retry failed attempts by creating a deterministic child operation.