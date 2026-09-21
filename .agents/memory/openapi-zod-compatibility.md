---
name: OpenAPI Zod generator compatibility
description: Contract authoring constraints for the workspace's Orval/Zod generation pipeline.
---

Use named reusable component schemas for request bodies instead of inline request-body objects. Use explicit object properties and a regex pattern for email validation rather than free-form objects or the OpenAPI `email` format. For HTTP query dates, use plain ISO-date strings and validate the calendar value at the route boundary rather than declaring `format: date`.

**Why:** The pinned Zod 3 runtime does not provide the newer `zod.email()` or `zod.looseObject()` helpers emitted by the generator. In split-output mode, an inline request body can also generate a type name that collides with the runtime validator export. Orval emits `zod.date()` for `format: date` query parameters even though Express supplies query values as strings, causing every normal URL date to fail validation.

**How to apply:** When adding an API body, define it under `components/schemas` and reference it from the operation. Give all response objects explicit properties, and represent URLs as strings rather than `format: uri` when the generated Zod validator must compile against Zod 3. For query dates, keep the generated type as a string and validate both `YYYY-MM-DD` shape and real calendar validity in the server route. Run API code generation and workspace typechecking immediately after contract changes.
