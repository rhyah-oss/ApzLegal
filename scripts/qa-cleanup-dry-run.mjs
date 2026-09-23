// K: review-only inventory. No deletion implementation and no broad text matching.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Client } = require('pg');
const manifestPath = process.argv[2];
if (!manifestPath || process.argv.some(arg => arg === '--delete')) throw new Error('Provide an explicit QA identifier manifest; deletion is not supported.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const allowed = new Set(['clients', 'matters', 'documents', 'tasks', 'invoices']);
for (const [table, ids] of Object.entries(manifest)) {
  if (!allowed.has(table) || !Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid QA manifest');
}
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  for (const [table, ids] of Object.entries(manifest)) {
    const rows = await client.query(`SELECT id FROM ${table} WHERE id = ANY($1::int[]) ORDER BY id`, [ids]);
    console.log(JSON.stringify({ table, count: rows.rowCount, ids: rows.rows.map(row => row.id) }));
  }
  const matterIds = manifest.matters ?? [];
  for (const table of ['documents', 'tasks', 'time_entries', 'invoices', 'emails', 'research_records', 'ai_conversations', 'conflicts', 'provider_operations', 'document_chunks']) {
    const rows = await client.query(`SELECT id FROM ${table} WHERE matter_id = ANY($1::int[]) ORDER BY id`, [matterIds]);
    console.log(JSON.stringify({ dependencyOf: 'matters', table, count: rows.rowCount, ids: rows.rows.map(row => row.id) }));
  }
  for (const table of ['matters', 'fica_documents', 'related_parties', 'compliance_events', 'invoices', 'appointments', 'visitors']) {
    const rows = await client.query(`SELECT id FROM ${table} WHERE client_id = ANY($1::int[]) ORDER BY id`, [manifest.clients ?? []]);
    console.log(JSON.stringify({ dependencyOf: 'clients', table, count: rows.rowCount, ids: rows.rows.map(row => row.id) }));
  }
  await client.query('ROLLBACK');
} finally { await client.end(); }
