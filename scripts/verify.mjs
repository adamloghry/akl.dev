// Acceptance checks against the built site (dist/). Run:  npm run build && npm run verify
// Exits non-zero on any failure. Mirrors docs/09-acceptance-criteria.md (AC-* ids in the output).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { inlineScriptHashes } from '../integrations/csp-hashes.mjs';
const dist = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain', '.json': 'application/json', '.xml': 'application/xml', '.md': 'text/markdown' };
const headersFile = await readFile(join(dist, '_headers'), 'utf8');
const csp = (headersFile.split(/\n(?=\S)/).find(b => b.startsWith('/*')) || '')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('Content-Security-Policy:'))?.slice('Content-Security-Policy:'.length).trim() || '';
const srv = createServer(async (req, res) => {
  let p = req.url.split('?')[0]; if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(dist, p)); res.setHeader('content-type', types[extname(p)] || 'application/octet-stream'); if (csp) res.setHeader('content-security-policy', csp); res.end(b); } catch { res.statusCode = 404; res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (id, cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + id + '  ' + msg); if (!cond) fails++; };

// files that must exist in dist
for (const f of ['robots.txt', 'humans.txt', 'llms.txt', 'index.html.md', 'agents.txt', 'agents.json', 'site.webmanifest', 'favicon.svg', 'og.png', 'sitemap-index.xml', '_headers', '.well-known/security.txt', '.well-known/atproto-did']) {
  let e = true; try { await access(join(dist, f)); } catch { e = false; } ok('AC-META-1', e, 'dist/' + f + ' exists');
}
const html = await readFile(join(dist, 'index.html'), 'utf8');
ok('AC-META-2', /application\/ld\+json/.test(html) && /"@type":"Person"/.test(html), 'JSON-LD Person present');
ok('AC-META-3', (html.match(/rel="me"/g) || []).length >= 3, '>=3 rel="me" links');
ok('AC-META-4', /name="color-scheme" content="light dark"/.test(html), 'color-scheme light dark');
ok('AC-META-5', /rel="alternate" type="text\/markdown"/.test(html) && /rel="describedby" href="\/llms.txt"/.test(html), 'llms.txt discovery links');
ok('AC-COPY-1', /ADAM K\. LOGHRY|Adam K\. Loghry/.test(html), 'name has the middle initial');
ok('AC-COPY-2', /EC2 Network Security/.test(html), 'bio text current');
ok('AC-NAV-1', ['signal.me/#u/akl.07', 'mailto:akl@akl.io', 'bsky.app/profile/did:plc:u2hotgrxdf5rr3zqjubs2wsb', 'hachyderm.io/@akl', 'linkedin.com/in/adamloghry', 'github.com/adamloghry', '16384.dev', 'akl.run'].every(u => html.includes(u)), 'all 8 links present');
ok('AC-NAV-2', !/\/notes/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no writing row yet (comment only)');
for (const f of ['index.html', '404.html']) {
  const h = await readFile(join(dist, f), 'utf8');
  const missing = inlineScriptHashes(h).filter(x => !csp.includes(x));
  ok('AC-CSP-1 ' + f, csp !== '' && !csp.includes("'unsafe-inline'") && !csp.includes("'inline-script-hashes'") && missing.length === 0,
    'CSP strict and covers every inline script' + (missing.length ? ' (missing ' + missing.join(' ') + ')' : ''));
  ok('AC-CSP-3 ' + f, !/<style[\s>]/i.test(h) && !/\sstyle\s*=/i.test(h), 'no <style> or style="" in emitted HTML');
}

const b = await chromium.launch();
async function page(w, h, scheme, q = '', reduced = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline'))); });
  await p.goto(base + '/?seed=1107' + q); await p.waitForTimeout(500); return { p, ctx, errs };
}
for (const [w, h, scheme, label] of [[1440, 900, 'light', 'desktop-light'], [1280, 720, 'dark', 'laptop-dark'], [390, 844, 'light', 'phone-light'], [390, 844, 'dark', 'phone-dark'],
  [844, 390, 'light', 'phone-landscape'], [320, 568, 'dark', 'phone-small']]) {
  const { p, ctx, errs } = await page(w, h, scheme, '&rain=on&moon=on');
  const r = await p.evaluate(() => {
    const main = document.querySelector('main').getBoundingClientRect();
    const trees = [...document.querySelectorAll('.tree:not(.still)')].filter(t => parseFloat(getComputedStyle(t).opacity) > 0.2); // ignore giants (watermark)
    const topOfForest = Math.min(...trees.map(t => t.getBoundingClientRect().top));
    const btn = document.getElementById('theme').getBoundingClientRect();
    const links = [...document.querySelectorAll('.rows a')].map(a => a.getBoundingClientRect().height);
    return { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, treeCount: document.querySelectorAll('.tree').length, rain: document.querySelectorAll('.drop').length,
      mainBottom: main.bottom, topOfForest, toggle: [btn.width, btn.height, btn.top, btn.right], minLink: Math.min(...links), moon: getComputedStyle(document.getElementById('moon')).display,
      footInfo: getComputedStyle(document.getElementById('foot-info')).display, forestPos: getComputedStyle(document.getElementById('forest')).position };
  });
  ok('AC-JS-1 ' + label, errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  const v = await p.evaluate(() => window.__csp);
  ok('AC-CSP-2 ' + label, v.length === 0, 'no CSP violations' + (v.length ? ': ' + v.join(' | ') : ''));
  ok('AC-FOREST-1 ' + label, r.treeCount > 250, `stand built (${r.treeCount} elements)`);
  ok('AC-FOREST-2 ' + label, r.topOfForest >= r.mainBottom - 8, `near layer below text (forest top ${Math.round(r.topOfForest)} ≥ main bottom ${Math.round(r.mainBottom)})`);
  ok('AC-FOREST-3 ' + label, r.forestPos === 'fixed', 'forest is position:fixed');
  ok('AC-RAIN-1 ' + label, r.rain === 70, 'rain=on yields 70 drops');
  ok('AC-MOON-1 ' + label, (scheme === 'dark') === (r.moon === 'block'), 'moon only in dark (moon=on)');
  ok('AC-LAYOUT-1 ' + label, !r.overflowX, 'no horizontal overflow');
  ok('AC-A11Y-1 ' + label, r.toggle[0] >= 44 && r.toggle[1] >= 44, 'toggle ≥44×44');
  ok('AC-A11Y-2 ' + label, r.minLink >= 24, `link targets ≥24px (min ${Math.round(r.minLink)})`);
  ok('AC-FOOT-1 ' + label, r.footInfo === 'none', 'build info collapsed by default');
  if (w < 600) ok('AC-LAYOUT-2 ' + label, r.toggle[2] <= 12 && r.toggle[3] >= w - 12, 'phone: toggle in top-right corner');
  await p.click('#foot-btn');
  ok('AC-FOOT-2 ' + label, await p.evaluate(() => getComputedStyle(document.getElementById('foot-info')).display !== 'none'), 'hammer reveals build info');
  await p.click('#theme');
  ok('AC-THEME-1 ' + label, await p.evaluate(() => document.documentElement.getAttribute('data-theme') !== null && localStorage.getItem('theme') !== null), 'toggle sets data-theme + localStorage');
  await ctx.close();
}
{ const { p, ctx } = await page(1440, 900, 'light', '&rain=on', true);
  ok('AC-MOTION-1', await p.evaluate(() => getComputedStyle(document.querySelector('.rain')).display === 'none'), 'reduced motion hides rain');
  await ctx.close(); }
{ const { p, ctx } = await page(1440, 900, 'light');
  const rainAuto = await p.evaluate(() => document.querySelectorAll('.drop').length);
  ok('AC-RAIN-2', rainAuto === 0 || rainAuto === 70, 'rain auto resolves to all-or-nothing (' + rainAuto + ')');
  await ctx.close(); }
await b.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
