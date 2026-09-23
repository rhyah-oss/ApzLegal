-- READ ONLY. Run against a staging clone first; no data is repaired here.
SELECT 'sessions.user_id' AS relationship, s.id FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL;
SELECT 'matters.client_id' AS relationship, m.id FROM matters m LEFT JOIN clients c ON c.id=m.client_id WHERE c.id IS NULL;
SELECT 'documents.matter_id' AS relationship, d.id FROM documents d LEFT JOIN matters m ON m.id=d.matter_id WHERE m.id IS NULL;
SELECT 'fica_documents.client_id' AS relationship, d.id FROM fica_documents d LEFT JOIN clients c ON c.id=d.client_id WHERE c.id IS NULL;
SELECT client_id, type, count(*) AS duplicates, array_agg(id ORDER BY id) AS ids FROM fica_documents GROUP BY client_id,type HAVING count(*) > 1;
SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE tablename IN ('document_chunks','knowledge_chunks','sessions','matters','documents','fica_documents','audit_logs');
