// Property-based browser check of the built site. Run after `npm run build`.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { readStaticFile } from './static-file.mjs';

const dist = new URL('../dist/', import.meta.url).pathname;
await readFile(join(dist, 'index.html'));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = createServer(async (req, res) => {
  try {
    const b = await readStaticFile(dist, req.url);
    if (!b) { res.statusCode = 404; res.end(); return; }
    const path = req.url.split('?')[0];
    res.setHeader('content-type', types[extname(path.endsWith('/') ? path + 'index.html' : path)] || 'application/octet-stream');
    res.end(b);
  } catch { res.statusCode = 404; res.end(); }
}).listen(0, '127.0.0.1');
await once(srv, 'listening');

try {
  await mkdir('tmp', { recursive: true });
  const traceDir = await mkdtemp('tmp/bombadil-');
  const chrome = process.env.CHROME || chromium.executablePath();
  const args = ['browser', 'test', '--headless', '--exit-on-violation', '--time-limit', process.env.BOMBADIL_TIME_LIMIT || '30s', '--output-path', join(traceDir, 'trace.bin')];
  if (process.env.CI) args.push('--no-sandbox');
  args.push(`http://127.0.0.1:${srv.address().port}`, 'bombadil/specification.ts');
  console.log(`Bombadil trace: ${traceDir}/trace.bin`);
  const child = spawn('node_modules/.bin/bombadil', args, { env: { ...process.env, CHROME: chrome }, stdio: 'inherit' });
  const [code, signal] = await once(child, 'exit');
  if (signal) throw new Error(`Bombadil stopped by ${signal}`);
  process.exitCode = code;
} finally {
  srv.close();
}
