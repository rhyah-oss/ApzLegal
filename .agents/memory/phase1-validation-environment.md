---
name: Phase 1 validation environment
description: Standalone APZ Legal validation must mirror the artifact runtime environment.
---

The standalone Phase 1 validation command must provide both `PORT` and `BASE_PATH` when invoking the Vite build; the managed web workflow injects these values automatically, but a shell command does not.

**Why:** The APZ Legal Vite configuration intentionally fails fast when either artifact-routing value is missing, so an otherwise healthy build can look broken when run outside the managed workflow.

**How to apply:** Preserve the workflow's port and base path when running targeted web builds or validation locally; use environment overrides rather than weakening the Vite configuration.