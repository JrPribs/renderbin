/**
 * Smoke test: starts the server, exercises the core flow, and exits.
 * Usage: node test/smoke.js
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = 4567; // avoid clashing with dev server
const BASE = `http://localhost:${PORT}`;

let server;
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function run() {
  // Start server
  console.log('Starting server...');
  server = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) { ready = true; break; }
    } catch {}
    await sleep(200);
  }

  if (!ready) {
    console.error('Server failed to start');
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}\n`);

  // --- Tests ---

  // 1. Homepage loads
  console.log('Homepage:');
  const homeRes = await fetch(BASE);
  assert(homeRes.status === 200, 'GET / returns 200');
  const homeBody = await homeRes.text();
  assert(homeBody.includes('RenderBin'), 'Homepage contains "RenderBin"');
  assert(homeBody.includes('editor'), 'Homepage contains editor div');

  // 2. Create HTML paste
  console.log('\nCreate HTML paste:');
  const htmlContent = '<h1>Test</h1><p>Hello world</p>';
  const createHtmlRes = await fetch(`${BASE}/api/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: htmlContent, format: 'html' }),
  });
  assert(createHtmlRes.status === 201, 'POST /api/paste returns 201');
  const htmlPaste = await createHtmlRes.json();
  assert(typeof htmlPaste.id === 'string' && htmlPaste.id.length === 8, 'Paste ID is 8 chars');
  assert(htmlPaste.url.startsWith('/p/'), 'Paste URL starts with /p/');

  // 3. Preview page
  console.log('\nHTML preview:');
  const previewRes = await fetch(`${BASE}${htmlPaste.url}`);
  assert(previewRes.status === 200, `GET ${htmlPaste.url} returns 200`);
  const previewBody = await previewRes.text();
  assert(previewBody.includes('preview-bar'), 'Preview page has preview bar');
  assert(previewBody.includes('HTML'), 'Preview page shows HTML format label');

  // 4. Raw view
  console.log('\nHTML raw view:');
  const rawRes = await fetch(`${BASE}/raw/${htmlPaste.id}`);
  assert(rawRes.status === 200, `GET /raw/${htmlPaste.id} returns 200`);
  const rawBody = await rawRes.text();
  assert(rawBody.includes('&lt;h1&gt;Test&lt;/h1&gt;'), 'Raw view shows escaped HTML');

  // 5. API get paste
  console.log('\nAPI get paste:');
  const apiRes = await fetch(`${BASE}/api/paste/${htmlPaste.id}`);
  assert(apiRes.status === 200, `GET /api/paste/${htmlPaste.id} returns 200`);
  const apiData = await apiRes.json();
  assert(apiData.content === htmlContent, 'API returns original content');
  assert(apiData.format === 'html', 'API returns correct format');

  // 6. Create Markdown paste
  console.log('\nCreate Markdown paste:');
  const mdContent = '# Hello\n\nThis is **bold** text.';
  const createMdRes = await fetch(`${BASE}/api/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: mdContent, format: 'markdown' }),
  });
  assert(createMdRes.status === 201, 'POST markdown paste returns 201');
  const mdPaste = await createMdRes.json();

  const mdPreviewRes = await fetch(`${BASE}${mdPaste.url}`);
  assert(mdPreviewRes.status === 200, 'Markdown preview returns 200');
  const mdPreviewBody = await mdPreviewRes.text();
  assert(mdPreviewBody.includes('markdown-body'), 'Markdown preview has markdown-body div');

  // 7. SEO pages
  console.log('\nSEO pages:');
  const htmlViewerRes = await fetch(`${BASE}/html-viewer`);
  assert(htmlViewerRes.status === 200, 'GET /html-viewer returns 200');
  const mdViewerRes = await fetch(`${BASE}/markdown-viewer`);
  assert(mdViewerRes.status === 200, 'GET /markdown-viewer returns 200');

  // 8. 404 for missing paste
  console.log('\nError handling:');
  const notFoundRes = await fetch(`${BASE}/p/nonexist`);
  assert(notFoundRes.status === 404, 'GET /p/nonexist returns 404');

  // 9. Validation
  const emptyRes = await fetch(`${BASE}/api/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '', format: 'html' }),
  });
  assert(emptyRes.status === 400, 'Empty content returns 400');

  const badFormatRes = await fetch(`${BASE}/api/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'test', format: 'xml' }),
  });
  assert(badFormatRes.status === 400, 'Invalid format returns 400');

  // 10. robots.txt
  console.log('\nMisc:');
  const robotsRes = await fetch(`${BASE}/robots.txt`);
  assert(robotsRes.status === 200, 'GET /robots.txt returns 200');

  // --- Summary ---
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(() => {
    if (server) server.kill();
  });
