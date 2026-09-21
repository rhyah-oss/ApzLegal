---
name: Private governed-file access
description: Storage download authorization must account for every persisted governed file record.
---

Private object download authorization must resolve the requested path against each supported governed record type, including matter documents, FICA documents, and knowledge/template items, before serving bytes or writing the access audit event.

**Why:** A path-only object endpoint can otherwise expose an uploaded file that is valid in storage but not linked to the route's originally checked record type.

**How to apply:** When adding a new private upload flow, add its persisted object-path field to the authorization lookup and access-audit entity mapping at the same time.