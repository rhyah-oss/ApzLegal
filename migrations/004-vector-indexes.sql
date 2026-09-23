-- Apply outside a transaction after comparing 001 diagnostics with the intended index definitions.
-- Build under new names; retain old indexes until a DBA reviews EXPLAIN plans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding_cosine ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_embedding_cosine ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
