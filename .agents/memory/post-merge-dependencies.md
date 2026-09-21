---
name: Post-merge dependency consistency
description: Keep the pnpm workspace catalog and lockfile aligned for post-merge setup.
---

Whenever the workspace catalog changes or a merge brings in a catalog configuration from another branch, regenerate and commit the pnpm lockfile before relying on the frozen post-merge install.

**Why:** The automatic post-merge script deliberately uses a frozen install. A catalog mismatch causes setup to stop before database synchronization and workflow reconciliation can run.

**How to apply:** Run a non-frozen workspace install once to synchronize the lockfile, verify a subsequent frozen install succeeds, and retain the frozen install in the post-merge script.