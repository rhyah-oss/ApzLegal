---
name: Lexora AI backend setup
description: Auth, session, and DB details for the Lexora AI (formerly APZ Legal) app
---

# Lexora AI backend setup

**App name:** Lexora AI (rebranded from APZ Legal; artifact dir remains `artifacts/apz-legal`)

## Auth
- SHA256(password + "apz_legal_salt") via node:crypto
- Passwords seeded via PostgreSQL sha256()
- Session cookies via cookie-parser (`auth_token`)
- Default dev credentials: `admin@apzlegal.co.za` / `password123`

## Session / QueryClient
- QueryClient retry: false on 401/403 (prevents blank loading screen loops)
- On login success: `queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user)` before redirect

## API
- API server: Express 5, port 8080, prefix `/api`
- Frontend: Vite + React, port via `$PORT`, preview path `/`
- Orval codegen: `lib/api-client-react` (hooks/types), `lib/api-zod` (Zod schemas)
- `UserRole` not importable from `@workspace/api-client-react`; use `type UserRole = string` locally

**Why:** Session cookies + SHA256 was chosen for simplicity in Phase 1 (private deployment). JWT/Clerk were explicitly not used.
