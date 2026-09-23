# O — sensitive data at rest, phase one

No persisted values are transformed. The application currently needs plaintext for legal workflows and RAG, so enabling encryption without a coordinated migration is unsafe.

| Fields | Required uses | Planned treatment |
|---|---|---|
| clients.id_number, passport_number; related_parties.id_number, passport_no | Client editing, exact identity/conflict matching, compliance review and export | Versioned encrypted shadow columns; keyed blind indexes if exact matching is required. Separate index keys from encryption keys. |
| emails.body_text/body_html | Correspondence display, text matching and matter-link suggestions | Encrypted shadow columns; replace text search deliberately before cutover. |
| documents.content, document_versions.content | Editor, immutable version history, signature digest, extraction and AI context | Encrypt both current and historical content; decrypt within authorized service boundaries before hashing/indexing. |
| ai_conversations.query/response, research_records.query/ai_summary, retrieval_logs.query | History, review, audit, RAG diagnostics | Encrypt with record/field-bound authenticated context. Preserve immutable evidence and authorized export. |
| document_chunks.text, knowledge_chunks.text and embeddings | Semantic retrieval | Include in storage threat model: encrypting source documents alone does not protect their searchable derivatives. Retain encrypted-volume/database controls while evaluating a compatible search design. |

`field-encryption.ts` provides randomized AES-256-GCM envelopes with format version and key ID. Authenticated context must include table, immutable record ID and field name to prevent ciphertext substitution. It deliberately has no silent plaintext fallback. No API or log receives envelope errors containing data.

Operations: provision independently generated 32-byte keys through the deployment secret manager; load a keyring and active key ID through a future explicit adapter. Never reuse OAuth/session secrets. Keep old keys available for reads during rotation, restrict key access, and back up keys separately from database backups. Losing a key loses data.

Migration order: inventory exact-match consumers and exports; add nullable shadow columns in an explicit migration; deploy dual reads with an explicit legacy-state flag; backfill in bounded resumable batches in a staging clone; compare authorized reads, signatures, search and exports; enable encrypted writes; verify restore with both old/new keys; approve a separate plaintext-retirement migration. Rotation re-encrypts batches under the new key while retaining old-key reads. A failed batch must roll back; never overwrite the sole readable copy. Rollback uses retained columns and keys until verification is complete. No live migration is authorized or executed here.
