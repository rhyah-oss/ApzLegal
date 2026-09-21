const pg = require('/home/ubuntu/apz-legal-ai-replit/node_modules/.pnpm/pg@8.22.0/node_modules/pg');
const pool = new pg.Pool({ connectionString: 'postgresql://apz_legal_replit:apz_legal_replit_pass@127.0.0.1:5432/apz_legal_replit' });
const API = 'http://127.0.0.1:3002/api';
let cookie = '';
async function api(path, opts={}) {
  const headers = { ...(opts.body ? {'content-type':'application/json'} : {}), cookie };
  if (opts.auth) headers['authorization'] = 'Bearer ' + opts.auth;
  const r = await fetch(`${API}${path}`, { ...opts, headers, redirect:'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let body = null;
  try { body = JSON.parse(await r.text()); } catch {}
  return { status: r.status, body };
}
function ts() { return new Date().toISOString().slice(11,19); }

(async () => {
  console.log(`[${ts()}] === APZ LEGAL RAG EVALUATION ===\n`);

  const before = await pool.query('SELECT (SELECT COUNT(*) FROM knowledge_items) AS kb, (SELECT COUNT(*) FROM knowledge_chunks) AS kc, (SELECT COUNT(*) FROM document_chunks) AS dc, (SELECT COUNT(*) FROM research_records) AS research, (SELECT COUNT(*) FROM ai_conversations) AS ai');
  console.log('BASELINE:', before.rows[0]);

  const login = await api('/auth/login', { method:'POST', body: JSON.stringify({email:'admin@apzlegal.co.za',password:'password123'}) });
  const token = cookie.split('=')[1];
  console.log(`[${ts()}] LOGIN OK`);

  const matters = await api('/matters', { auth: token });
  const matterId = matters.body[0].id;

  // Use the newly created KB item (id=8)
  const kbId = 8;

  // Check final chunk state
  const finalChunksResult = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN indexing_status=\'indexed\' THEN 1 ELSE 0 END) AS indexed FROM knowledge_chunks WHERE knowledge_item_id=$1', [kbId]);
  console.log(`[${ts()}] CHUNKS: total=${finalChunksResult.rows[0]?.total} indexed=${finalChunksResult.rows[0]?.indexed}`);

  // Check embedding presence
  const embResult = await pool.query('SELECT id, chunk_index, LENGTH(text) AS text_len, embedding IS NOT NULL AS has_embedding FROM knowledge_chunks WHERE knowledge_item_id=$1 LIMIT 3', [kbId]);
  console.log(`[${ts()}] SAMPLE CHUNKS:`);
  for (const r of embResult.rows) {
    console.log(`  id=${r.id} chunk=${r.chunk_index} text_len=${r.text_len} has_embedding=${r.has_embedding}`);
  }

  // RESEARCH TEST A: semantic retrieval
  console.log(`\n[${ts()}] === TEST A: Semantic Retrieval ===`);
  const t0 = Date.now();
  const resA = await api('/research/query', { method:'POST', auth: token, body: JSON.stringify({ matterId, query: 'APZ Legal confidentiality policy retention periods', sources: ['knowledge_base'] }) });
  const dtA = Date.now() - t0;
  console.log(`  status: ${resA.status} elapsed: ${dtA}ms`);
  console.log(`  ai_status: ${resA.body?.aiStatus}`);
  console.log(`  internal_results: ${(resA.body?.internalResults || []).length} items`);
  if (resA.body?.internalResults?.length > 0) {
    console.log(`  first result: ${JSON.stringify(resA.body.internalResults[0]).slice(0,200)}`);
  }
  console.log(`  ai_summary: ${JSON.stringify(resA.body?.aiSummary).slice(0,300)}`);

  // RESEARCH TEST B: paraphrased query
  console.log(`\n[${ts()}] === TEST B: Paraphrased Query ===`);
  const t1 = Date.now();
  const resB = await api('/research/query', { method:'POST', auth: token, body: JSON.stringify({ matterId, query: 'how long must client files be kept APZ', sources: ['knowledge_base'] }) });
  const dtB = Date.now() - t1;
  console.log(`  status: ${resB.status} elapsed: ${dtB}ms`);
  console.log(`  internal_results: ${(resB.body?.internalResults || []).length} items`);
  console.log(`  ai_summary: ${JSON.stringify(resB.body?.aiSummary).slice(0,300)}`);

  // RESEARCH TEST C: no match
  console.log(`\n[${ts()}] === TEST C: No Match Query ===`);
  const t2 = Date.now();
  const resC = await api('/research/query', { method:'POST', auth: token, body: JSON.stringify({ matterId, query: 'quantum entanglement commercial lease notice period', sources: ['knowledge_base'] }) });
  const dtC = Date.now() - t2;
  console.log(`  status: ${resC.status} elapsed: ${dtC}ms`);
  console.log(`  internal_results: ${(resC.body?.internalResults || []).length} items`);
  console.log(`  ai_summary: ${JSON.stringify(resC.body?.aiSummary).slice(0,300)}`);

  // AI GENERATE TEST
  console.log(`\n[${ts()}] === TEST D: AI Generate with RAG ===`);
  const t3 = Date.now();
  const gen = await api('/ai/generate', { method:'POST', auth: token, body: JSON.stringify({ workflow: 'summarise_matter', matterId, instructions: 'Summarise the firm confidentiality policy from the knowledge base.', params: { query: 'Summarise the firm confidentiality policy.' } }) });
  const dtG = Date.now() - t3;
  console.log(`  status: ${gen.status} elapsed: ${dtG}ms model: ${gen.body?.model}`);
  console.log(`  retrievalMode: ${gen.body?.retrievalMode}`);
  console.log(`  chunksRetrieved: ${gen.body?.chunksRetrieved}`);
  console.log(`  sourcesUsed: ${JSON.stringify(gen.body?.sourcesUsed).slice(0,300)}`);
  console.log(`  response: ${JSON.stringify(gen.body?.response).slice(0,400)}`);
  console.log(`  citations: ${JSON.stringify(gen.body?.citations).slice(0,200)}`);

  // DB state after tests
  const after = await pool.query('SELECT (SELECT COUNT(*) FROM research_records) AS research, (SELECT COUNT(*) FROM ai_conversations) AS ai, (SELECT COUNT(*) FROM retrieval_logs) AS rl, (SELECT COUNT(*) FROM knowledge_chunks) AS kc, (SELECT COUNT(*) FROM document_chunks) AS dc');
  console.log(`\n[${ts()}] === FINAL COUNTS ===`);
  console.log(after.rows[0]);

  // Retrieval logs
  const rlResult = await pool.query('SELECT id, user_id, matter_id, retrieval_mode, chunks_retrieved, model, latency_ms FROM retrieval_logs ORDER BY id DESC LIMIT 5');
  console.log('\nRETRIEVAL LOGS:');
  for (const r of rlResult.rows) {
    console.log(`  id=${r.id} user=${r.user_id} matter=${r.matter_id} mode=${r.retrieval_mode} chunks=${r.chunks_retrieved} model=${r.model} latency=${r.latency_ms}ms`);
  }

  await pool.end();
  console.log(`\n[${ts()}] === EVALUATION COMPLETE ===`);
})();
