# Phase 1 validation

With the configured `artifacts/api-server: API Server` and `artifacts/apz-legal: web` workflows running, run:

```bash
pnpm test:phase1
```

The command regenerates the OpenAPI clients, typechecks the API and web packages, builds the web artifact, runs the persisted-data API journeys, and verifies that the critical UI routes are served by the live Vite app. It does not use mocked API success responses or live vendor credentials.

For a different local port, set `APZ_API_URL` and/or `APZ_WEB_URL` before running the command.