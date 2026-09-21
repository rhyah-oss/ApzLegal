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
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@apzlegal.co.za', password: 'password123' }) });
  const token = cookie.split('=')[1];

  // Re-run research to capture ai_error
  const matters = await api('/matters', { auth: token });
  const matterId = matters.body[0].id;
  const res = await api('/research/query', { method: 'POST', auth: token, body: JSON.stringify({ matterId, query: 'test content for knowledge base', sources: ['knowledge_base'] }) });
  console.log('RESEARCH STATUS:', res.status);
  console.log('ai_status:', res.body?.aiStatus);
  console.log('ai_error:', JSON.stringify(res.body?.aiError));
  console.log('model:', res.body?.model);
  console.log('internal_results count:', (res.body?.internalResults||[]).length);

  // Also generate to capture its error
  const gen = await api('/ai/generate', { method: 'POST', auth: token, body: JSON.stringify({ workflow: 'summarise_matter', matterId, instructions: 'Summarise', params: { query: 'Summarise' } }) });
  console.log('\nGENERATE STATUS:', gen.status);
  console.log('error:', JSON.stringify(gen.body?.error));
  console.log('code:', gen.body?.code);

  // Try hitting Ollama directly via the API server's perspective — check if server can reach it
  // by attempting a direct Ollama call from node
  const ollamaRes = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen2.5:7b', prompt: 'hello', stream: false }),
    signal: AbortSignal.timeout(8000),
  });
  console.log('\nDIRECT OLLAMA STATUS:', ollamaRes.status);

  await pool.end();
})();
