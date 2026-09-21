---
name: APZ Legal UserRole import fix
description: Where UserRole and enum types live in the monorepo
---

## Rule
`UserRole` and all generated enum constants (ClientType, MatterStatus, etc.) live in `@workspace/api-zod` (via orval codegen into `lib/api-zod/src/generated/api.ts`), NOT in `@workspace/api-client-react`.

The react client package re-exports hooks and schema types from its own generated files, but does NOT re-export the Zod enum constants.

## How to apply
- Frontend files that need enum types: import from `@workspace/api-client-react` (which re-exports the generated api.schemas.ts types as TypeScript types)
- If a type is missing from api-client-react, define it locally as `type X = string` rather than importing from api-zod (avoids adding a cross-package dep from frontend artifact to server-side lib)

**Why:** The design subagent imported `UserRole` from api-client-react where it doesn't exist, causing a silent module resolution failure that blanked the entire React app.
