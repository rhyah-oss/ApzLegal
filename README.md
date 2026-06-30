# Lexora AI

Private Legal AI platform for South African law firms.

## Live (apztdg.com)

**https://lexora.apztdg.com** — TLS via Caddy, shared platform resources.

## Quick start (local dev)

```bash
cd apps/web
npm install
npm run dev
```

## Deploy to shared server

```bash
bash scripts/provision.sh   # Postgres, Redis, MinIO, Qdrant (once)
bash scripts/deploy.sh      # Build, start container, Caddy TLS
```

- App: [http://localhost:3000](http://localhost:3000)
- Login: [http://localhost:3000/login](http://localhost:3000/login)

## Repository structure

```
apz-legal-ai/
├── apps/web/          # Next.js Phase 1 UI shell
└── project-docs/      # PRD, architecture, UI spec, roadmap
```

## Phase 1 status

Phase 1 delivers a Cursor-style desktop UI shell with mock SA legal data across all 13 modules. See [project-docs/ROADMAP.md](project-docs/ROADMAP.md).

## Documentation

Full project documentation: [project-docs/README.md](project-docs/README.md)
