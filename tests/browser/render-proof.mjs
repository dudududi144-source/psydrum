// P2 render proof — run the device through a REAL OfflineAudioContext in
// Chromium (Playwright) and assert the rendered audio is sane. This is the
// layer the bun tests cannot reach (no WebAudio in bun): the actual WebAudio
// node graph, rendered by a real browser engine.
//
// Flow: serve the repo over a local static server -> load render-test.html ->
// the page builds the device on an OfflineAudioContext, triggers kick/snare/
// hat, renders, measures rms/peak/NaN -> reports via window.__result.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) { res.statusCode = 403; res.end('forbidden'); return; }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.statusCode = 404; res.end('not found: ' + urlPath); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(filePath));
  } catch (e) {
    res.statusCode = 500; res.end(String(e));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = 'http://127.0.0.1:' + port + '/tests/browser/render-test.html';

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (msg) => logs.push('[' + msg.type() + '] ' + msg.text()));
page.on('pageerror', (err) => logs.push('[pageerror] ' + String(err)));
page.on('requestfailed', (req) => logs.push('[requestfailed] ' + req.url()));

let exitCode = 0;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__result !== undefined, { timeout: 30000 });
  const result = await page.evaluate(() => window.__result);
  console.log('[render-proof] page logs:');
  for (const l of logs) console.log('  ' + l);
  console.log('[render-proof] result: ' + JSON.stringify(result));
  if (!result || result.ok !== true) {
    console.error('[render-proof] FAILED');
    exitCode = 1;
  } else {
    console.log(
      '[render-proof] PASSED — real-audio render sane: ' +
      'kick rms=' + result.kick.rms.toFixed(4) + ' peak=' + result.kick.peak.toFixed(4) +
      ' | snare rms=' + result.snare.rms.toFixed(4) +
      ' | hat rms=' + result.hat.rms.toFixed(4)
    );
  }
} catch (e) {
  console.error('[render-proof] ERROR: ' + String((e && e.stack) || e));
  console.error('[render-proof] page logs:');
  for (const l of logs) console.error('  ' + l);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
