/**
 * Research source selection — browser regression.
 *
 * Guards the source-selection contract:
 *   - sources default to SELECTED
 *   - a selected source deselects on the FIRST click (no invisible no-op state)
 *   - a deselected source reselects on the FIRST click
 *   - the submitted `sources` payload contains exactly the selected sources
 *   - with ZERO sources selected the CTA is disabled, a helper message shows,
 *     and NO request is sent (the backend treats a missing list as "all")
 *
 * All API traffic is mocked, so this needs only a served frontend:
 *
 *   # serve the built frontend
 *   npx serve artifacts/apz-legal/dist/public -l 18594     # or any static host
 *   PLAYWRIGHT_MODULE=playwright APZ_WEB_URL=http://127.0.0.1:18594 \
 *     node scripts/research-source-toggle-browser.mjs
 */
// Tolerate both ESM and CJS builds of playwright (a bare file path resolves CJS).
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
import assert from 'node:assert/strict';

const CHROME = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APZ_WEB_URL || 'http://127.0.0.1:18594';

const SOURCES = [
  { source: 'firm_precedents', label: 'Firm Precedents', kind: 'internal', live: true, availability: 'available' },
  { source: 'knowledge_base', label: 'Knowledge Base', kind: 'internal', live: true, availability: 'available' },
  { source: 'case_law', label: 'Case Law', kind: 'external', live: false, availability: 'Phase 1D — live integration not yet connected; results are AI-assisted and must be verified' },
  { source: 'legislation', label: 'Legislation', kind: 'external', live: false, availability: 'Phase 1D — live integration not yet connected; results are AI-assisted and must be verified' },
];

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Captured POST /api/research/query bodies. */
const submitted = [];

await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  let data = [];

  if (path === '/api/auth/me') data = { id: 1, name: 'Test Attorney', email: 'test@example.test', role: 'admin' };
  else if (path === '/api/matters') data = [{ id: 1, reference: 'APZ-2026-0014', title: 'Falcon' }];
  else if (path === '/api/research/sources') data = SOURCES;
  else if (path === '/api/research/query' && method === 'POST') {
    submitted.push(route.request().postDataJSON());
    data = { id: 501, matterId: 1, query: 'test', sourcesRequested: [], internalResults: [], citations: [], citationStatus: 'none', aiStatus: 'ok', aiSummary: 'ok', caseReferences: [], legislation: [], confidenceScore: 50, performedBy: 'Test Attorney', createdAt: new Date().toISOString(), savedToMatter: false };
  } else if (path.startsWith('/api/research/')) {
    data = { id: 501, matterId: 1, query: 'test', sourcesRequested: [], internalResults: [], citations: [], citationStatus: 'none', aiStatus: 'ok', aiSummary: 'ok', caseReferences: [], legislation: [], confidenceScore: 50, performedBy: 'Test Attorney', createdAt: new Date().toISOString(), savedToMatter: false };
  } else if (path === '/api/research') data = [];

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
});

const cards = () => page.locator('[role="checkbox"]');
const checkedStates = async () => page.$$eval('[role="checkbox"]', (els) => els.map((e) => e.getAttribute('aria-checked')));
const cardBorder = (i) => page.$$eval('[role="checkbox"]', (els, idx) => getComputedStyle(els[idx]).borderTopColor, i);

try {
  await page.goto(`${BASE}/research`);

  // ── 1. Initial state: all four sources selected ───────────────────────────
  await cards().first().waitFor();
  assert.equal(await cards().count(), 4, 'expected four source cards');
  assert.deepEqual(await checkedStates(), ['true', 'true', 'true', 'true'], 'all sources selected by default');
  const selectedBorder = await cardBorder(0);

  // ── 2. FIRST click deselects (the regression) ─────────────────────────────
  await cards().nth(0).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await checkedStates(), ['false', 'true', 'true', 'true'], 'first click must deselect');

  // ── 3. Visual state matches the logical state ─────────────────────────────
  const deselectedBorder = await cardBorder(0);
  assert.notEqual(deselectedBorder, selectedBorder, 'selected/deselected borders must differ');
  // The trailing selection indicator is the card's last child; the card also
  // contains the source icon, so scope the check to that indicator.
  const indicatorHasCheck = (i) =>
    page.$$eval('[role="checkbox"]', (els, idx) => !!els[idx].lastElementChild?.querySelector('svg'), i);
  assert.equal(await indicatorHasCheck(1), true, 'a selected card shows a check indicator');
  assert.equal(await indicatorHasCheck(0), false, 'a deselected card shows no check indicator');

  // ── 4. FIRST click reselects ──────────────────────────────────────────────
  await cards().nth(0).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await checkedStates(), ['true', 'true', 'true', 'true'], 'second click must reselect');

  // ── 5. Keyboard activation toggles ────────────────────────────────────────
  await cards().nth(0).focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  assert.equal((await checkedStates())[0], 'false', 'Space must deselect');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  assert.equal((await checkedStates())[0], 'true', 'Space must reselect');

  // ── 6. Independent multi-select ───────────────────────────────────────────
  await cards().nth(0).click();
  await cards().nth(2).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await checkedStates(), ['false', 'true', 'false', 'true'], 'independent deselection');
  await cards().nth(2).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await checkedStates(), ['false', 'true', 'true', 'true'], 'independent reselection');

  // ── 7. Re-render does not reset the selection ─────────────────────────────
  await page.locator('#research-question').fill('commercial lease termination');
  await page.waitForTimeout(150);
  assert.deepEqual(await checkedStates(), ['false', 'true', 'true', 'true'], 'selection survives re-render');

  // ── 8. Submission payload contains exactly the selected sources ───────────
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Falcon/ }).click();
  await page.getByRole('button', { name: /Run Research/ }).click();
  await page.waitForTimeout(400);

  assert.equal(submitted.length, 1, 'research was submitted once');
  const first = submitted[0];
  assert.equal(typeof first.matterId, 'number', 'matterId is a number');
  assert.equal(first.query, 'commercial lease termination', 'query forwarded');
  assert.deepEqual(
    [...first.sources].sort(),
    ['case_law', 'knowledge_base', 'legislation'],
    'deselected firm_precedents must NOT be sent',
  );

  // ── 9. A fresh composer sends every source again ─────────────────────────
  // Submitting opens the research record, which unmounts the composer; Close
  // returns to it (existing behaviour).
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await cards().first().waitFor();
  assert.deepEqual(await checkedStates(), ['true', 'true', 'true', 'true'], 'a fresh composer defaults to all selected');
  // A remounted composer also resets the matter selection, so re-choose it.
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Falcon/ }).click();
  await page.locator('#research-question').fill('commercial lease termination');
  await page.getByRole('button', { name: /Run Research/ }).click();
  await page.waitForTimeout(400);

  assert.equal(submitted.length, 2, 'second submission captured');
  assert.deepEqual(
    [...submitted[1].sources].sort(),
    ['case_law', 'firm_precedents', 'knowledge_base', 'legislation'],
    'all four sources sent when all selected',
  );

  // ── 10. ZERO SOURCES: cannot submit, no request, then single-source submit ─
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await cards().first().waitFor();
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Falcon/ }).click();
  await page.locator('#research-question').fill('zero source regression');

  for (let i = 0; i < 4; i++) await cards().nth(i).click();
  assert.deepEqual(await checkedStates(), ['false', 'false', 'false', 'false'], 'all four visually unchecked');

  const runButton = page.getByRole('button', { name: /Run Research/ });
  assert.equal(await runButton.isDisabled(), true, 'Run Research disabled with zero sources');
  await page.getByTestId('research-sources-error').waitFor();
  assert.match(await page.getByTestId('research-sources-error').innerText(), /Select at least one research source/i);

  const before = submitted.length;
  await runButton.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  assert.equal(submitted.length, before, 'no request is sent with zero sources selected');

  // Choosing a single source re-enables the CTA and sends exactly that source.
  await cards().nth(2).click();
  assert.deepEqual(await checkedStates(), ['false', 'false', 'true', 'false'], 'single source selected');
  assert.equal(await page.getByTestId('research-sources-error').count(), 0, 'helper message clears');
  assert.equal(await runButton.isDisabled(), false, 'Run Research enabled with one source');

  await runButton.click();
  await page.waitForTimeout(400);
  assert.equal(submitted.length, before + 1, 'single-source submission captured');
  assert.deepEqual(submitted[submitted.length - 1].sources, ['case_law'], 'payload contains exactly the one visible source');

  assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
  console.log('PASS  one-click deselect, one-click reselect, keyboard toggle, stable selection, exact payload, zero-source guard');
  await browser.close();
} catch (err) {
  console.error('FAIL ', err.message);
  try {
    const diag = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[role="checkbox"]')];
      const el = els[0];
      const r = el?.getBoundingClientRect();
      const top = el ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return {
        count: els.length,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        elementAtCentre: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : null,
        style: el ? { display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility, pointerEvents: getComputedStyle(el).pointerEvents } : null,
      };
    });
    console.error('diagnostics:', JSON.stringify(diag));
    await page.screenshot({ path: '/tmp/research-toggle-failure.png' });
  } catch { /* ignore */ }
  await browser.close();
  process.exit(1);
}
