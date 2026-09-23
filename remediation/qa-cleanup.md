# K — review-only QA cleanup

Run `node scripts/qa-cleanup-dry-run.mjs /secure/path/qa-identifiers.json` against an explicitly selected staging database. The manifest maps allowed table names to exact numeric IDs, for example `{"clients":[],"matters":[]}`. Obtain IDs from a recorded test run and verify their provenance; do not infer test ownership from names. The existing regression scripts create dynamically named records and do not provide a trustworthy fixed ID manifest. No live records have been inspected or selected here.

The script opens a read-only transaction and reports IDs/counts plus direct client/matter dependencies. It cannot delete. Review document versions, attachment links, provider operations and immutable audit/compliance events before approving any cleanup; the inventory is not a complete deletion plan. Labels such as Test Client, Audit QA, DEBUG and RAG TEST alone cannot distinguish real data safely.

Before any later approved cleanup, take and restore-test a backup using the previously implemented Section C process. Prefer existing archival/status mechanisms for governed records; retain audit evidence. Obtain explicit approval for the exact manifest and dependency plan, take before/after counts, and verify unrelated IDs are unchanged. Never execute a broad text-based DELETE.
