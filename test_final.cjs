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

  // Login
  const login = await api('/auth/login', { method:'POST', body: JSON.stringify({email:'admin@apzlegal.co.za',password:'password123'}) });
  const token = cookie.split('=')[1];
  console.log(`[${ts()}] LOGIN OK`);

  const matters = await api('/matters', { auth: token });
  const matterId = matters.body[0].id;

  // Verify chunks + embeddings exist
  const chunksResult = await pool.query('SELECT COUNT(*) AS cnt, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS emb FROM knowledge_chunks WHERE knowledge_item_id=8');
  console.log(`[${ts()}] KB#8 chunks: ${chunksResult.rows[0]?.cnt} total, ${chunksResult.rows[0]?.emb} with embeddings`);

  // Verify semantic search works from DB
  const embedResp = await fetch('http://127.0.0.1:11434/api/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'APZ Legal confidentiality policy retention periods' })
  });
  const embedData = await embedResp.json();
  const embeddingStr = '[' + embedData.embedding.join(',') + ']';
  const searchResult = await pool.query(
    `SELECT id, chunk_index, LEFT(text,100) AS snippet, 1 - (embedding <=> $1::vector) AS similarity FROM knowledge_chunks WHERE indexing_status='indexed' ORDER BY embedding <=> $1::vector LIMIT 3`,
    [embeddingStr]
  );
  console.log(`[${ts()}] Semantic search results:`);
  for (const r of searchResult.rows) {
    console.log(`  id=${r.id} chunk=${r.chunk_index} sim=${r.similarity.toFixed(4)} text="${r.snippet.trim()}"`);
  }

  // RESEARCH TEST: semantic retrieval
  console.log(`\n[${ts()}] === TEST A: Research with semantic retrieval ===`);
  const t0 = Date.now();
  const resA = await api('/research/query', { 
    method:'POST', auth: token, 
    body: JSON.stringify({ matterId, query: 'APZ Legal confidentiality policy retention periods', sources: ['knowledge_base'] }),
  });
  console.log(`  [${ts()}] status: ${resA.status} elapsed: ${Date.now()-t0}ms`);
  console.log(`  ai_status: ${resA.body?.aiStatus}`);
  console.log(`  internal_results: ${(resA.body?.internalResults || []).length} items`);
  console.log(`  ai_summary: ${JSON.stringify(resA.body?.aiSummary).slice(0, 400)}`);
  if (resA.body?.aiError) console.log(`  ai_error: ${resA.body.aiError}`);

  // TEST B: no match query
  console.log(`\n[${ts()}] === TEST B: No match query ===`);
  const t1 = Date.now();
  const resB = await api('/research/query', { 
    method:'POST', auth: token, 
    body: JSON.stringify({ matterId, query: 'quantum entanglement commercial lease', sources: ['knowledge_base'] }),
  });
  console.log(`  [${ts()}] status: ${resB.status} elapsed: ${Date.now()-t1}ms`);
  console.log(`  internal_results: ${(resB.body?.internalResults || []).length} items`);
  console.log(`  ai_summary: ${JSON.stringify(resB.body?.aiSummary).slice(0, 300)}`);

  // Retrieval logs
  const rlResult = await pool.query('SELECT id, matter_id, retrieval_mode, chunks_retrieved, model, latency_ms FROM retrieval_logs ORDER BY id DESC LIMIT 5');
  console.log(`\n[${ts()}] RETRIEVAL LOGS:`);
  for (const r of rlResult.rows) {
    console.log(`  id=${r.id} matter=${r.matter_id} mode=${r.retrieval_mode} chunks=${r.chunks_retrieved} model=${r.model} latency=${r.latency_ms}ms`);
  }

  const after = await pool.query('SELECT (SELECT COUNT(*) FROM research_records) AS research, (SELECT COUNT(*) FROM retrieval_logs) AS rl, (SELECT COUNT(*) FROM knowledge_chunks WHERE embedding IS NOT NULL) AS kc_with_emb');
  console.log(`\n[${ts()}] FINAL COUNTS:`, after.rows[0]);
  await pool.end();
  console.log(`\n[${ts()}] === EVALUATION COMPLETE ===`);
})();
