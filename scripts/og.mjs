// Render /og.png (1200×630) from the built site with Playwright. Run after `astro build`:  npm run og
// Deterministic seed so the OG image is stable across builds; rain off; light theme.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveStaticFile } from './static-file.mjs';
const dist = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = createServer(async (req, res) => {
  try {
    const file = await resolveStaticFile(dist, req.url);
    if (!file) { res.statusCode = 404; res.end(); return; }
    const b = await readFile(file);
    res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
    res.end(b);
  } catch { res.statusCode = 404; res.end(); }
}).listen(0, '127.0.0.1');
await once(srv, 'listening');
const port = srv.address().port;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' })).newPage();
await p.goto(`http://127.0.0.1:${port}/?seed=1107&rain=off&moon=off`);
await p.addStyleTag({ content: '.forest,.forest *{animation-delay:-200s !important}' });
await p.waitForTimeout(800);
await p.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await b.close(); srv.close();
console.log('wrote public/og.png');
