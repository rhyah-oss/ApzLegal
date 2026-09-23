-- Review diagnostic results before applying. Never delete or rewrite orphan rows.
-- NOT VALID preserves legacy rows while enforcing integrity on new writes.
BEGIN;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
ALTER TABLE matters ADD CONSTRAINT matters_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
ALTER TABLE documents ADD CONSTRAINT documents_matter_fk FOREIGN KEY (matter_id) REFERENCES matters(id) NOT VALID;
ALTER TABLE fica_documents ADD CONSTRAINT fica_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS matters_client_idx ON matters(client_id);
CREATE INDEX IF NOT EXISTS documents_matter_idx ON documents(matter_id);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id);
-- Fails and rolls back if existing duplicates require an approved resolution.
CREATE UNIQUE INDEX IF NOT EXISTS fica_client_type_unique ON fica_documents(client_id,type);
COMMIT;
