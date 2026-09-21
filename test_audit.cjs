const pg = require('/home/ubuntu/apz-legal-ai-replit/node_modules/.pnpm/pg@8.22.0/node_modules/pg');

const API = 'http://127.0.0.1:3002/api';
const DB = 'postgresql://apz_legal_replit:apz_legal_replit_pass@127.0.0.1:5432/apz_legal_replit';
const pool = new pg.Pool({ connectionString: DB });
let cookie = '';

async function api(path, opts = {}) {
  const headers = { ...(opts.body ? { 'content-type': 'application/json' } : {}), cookie };
  if (opts.auth) headers['authorization'] = 'Bearer ' + opts.auth;
  const r = await fetch(`${API}${path}`, { ...opts, headers, redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let body = null;
  try { body = JSON.parse(await r.text()); } catch {}
  return { status: r.status, body };
}

(async () => {
  const before = await pool.query('SELECT (SELECT COUNT(*) FROM research_records) AS research, (SELECT COUNT(*) FROM ai_conversations) AS ai, (SELECT COUNT(*) FROM audit_logs) AS audit');
  console.log('COUNTS BEFORE:', before.rows[0]);

  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@apzlegal.co.za', password: 'password123' }) });
  console.log('LOGIN:', login.status, login.body?.user?.role, '| cookie set?', !!cookie);
  const token = cookie.split('=')[1];

  const matters = await api('/matters', { auth: token });
  console.log('MATTERS count:', Array.isArray(matters.body) ? matters.body.length : 'ERR'+matters.status);
  console.log('MATTER[0]:', JSON.stringify(matters.body[0]).slice(0,200));

  const kb = await api('/knowledge', { auth: token });
  console.log('KNOWLEDGE count:', Array.isArray(kb.body) ? kb.body.length : 'ERR');
  for (const k of (kb.body||[])) {
    console.log('  KB id='+k.id, 'status='+k.status, 'aiIndex='+k.aiIndexStatus, 'content_len='+(k.content?k.content.length:0), 'content='+JSON.stringify(k.content).slice(0,80));
  }
  const matterId = matters.body[0].id;

  const t0 = Date.now();
  const resA = await api('/research/query', { method: 'POST', auth: token, body: JSON.stringify({ matterId, query: 'test content for knowledge base', sources: ['knowledge_base'] }) });
  const dtA = Date.now() - t0;
  console.log('\n=== RESEARCH TEST A (query matches KB keyword) ===');
  console.log('status:', resA.status, 'elapsed_ms:', dtA);
  console.log('ai_status:', resA.body?.aiStatus, 'model:', resA.body?.model);
  console.log('internal_results:', JSON.stringify(resA.body?.internalResults));
  console.log('ai_summary:', JSON.stringify(resA.body?.aiSummary).slice(0,400));
  console.log('citations:', resA.body?.citations);

  const t1 = Date.now();
  const resB = await api('/research/query', { method: 'POST', auth: token, body: JSON.stringify({ matterId, query: 'commercial lease notice period South Africa', sources: ['knowledge_base'] }) });
  const dtB = Date.now() - t1;
  console.log('\n=== RESEARCH TEST B (query NOT in KB) ===');
  console.log('status:', resB.status, 'elapsed_ms:', dtB);
  console.log('ai_status:', resB.body?.aiStatus);
  console.log('internal_results count:', (resB.body?.internalResults||[]).length, 'results:', JSON.stringify(resB.body?.internalResults));
  console.log('ai_summary:', JSON.stringify(resB.body?.aiSummary).slice(0,400));
  console.log('citations:', resB.body?.citations);

  const t2 = Date.now();
  const gen = await api('/ai/generate', { method: 'POST', auth: token, body: JSON.stringify({ workflow: 'summarise_matter', matterId, instructions: 'Summarise the matter briefly.', params: { query: 'Summarise the matter briefly.' } }) });
  const dtG = Date.now() - t2;
  console.log('\n=== AI GENERATE TEST (summarise_matter) ===');
  console.log('status:', gen.status, 'elapsed_ms:', dtG, 'model:', gen.body?.model);
  console.log('query (prompt sent to LLM):', JSON.stringify(gen.body?.query).slice(0,900));
  console.log('response:', JSON.stringify(gen.body?.response).slice(0,400));
  console.log('citations:', gen.body?.citations, 'confidence:', gen.body?.confidenceScore);

  const createdResearch = await pool.query('SELECT id, query, sources_requested, ai_status, LENGTH(ai_summary) AS summ_len, citations, internal_results FROM research_records ORDER BY id DESC LIMIT 2');
  console.log('\n=== DB: latest research records ===');
  for (const r of createdResearch.rows) {
    console.log('id='+r.id, 'query='+r.query, 'ai_status='+r.ai_status, 'summ_len='+r.summ_len, 'citations='+JSON.stringify(r.citations));
    console.log('  internal_results:', JSON.stringify(r.internal_results));
  }
  const createdAi = await pool.query('SELECT id, workflow, model, query FROM ai_conversations ORDER BY id DESC LIMIT 1');
  console.log('\n=== DB: latest ai conversation ===');
  for (const r of createdAi.rows) {
    console.log('id='+r.id, 'workflow='+r.workflow, 'model='+r.model, 'query_len='+r.query.length, 'query='+JSON.stringify(r.query).slice(0,800));
  }
  const after = await pool.query('SELECT (SELECT COUNT(*) FROM research_records) AS research, (SELECT COUNT(*) FROM ai_conversations) AS ai, (SELECT COUNT(*) FROM audit_logs) AS audit');
  console.log('\nCOUNTS AFTER:', after.rows[0]);
  await pool.end();
})();
