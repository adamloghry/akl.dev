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
// AC-FOREST-4: the finished ridge line reaches both edges at every width (owner, overrides the handoff's dash draw-on,
// which stopped ~1300px in on wide screens). Trees and the colophon are hidden so only the ridge leaves ink in the strip.
for (const [w, h] of [[1440, 900], [2560, 1440], [3840, 2160]]) {
  const { p, ctx } = await page(w, h, 'light', '&rain=off&moon=off', true);
  await p.evaluate(() => { for (const e of document.querySelectorAll('.tw,.foot')) e.style.display = 'none'; });
  // Clip to the ridge's box inside the viewport: a stand scaled past 1 (AC-FOREST-9) overhangs it by a sub-pixel, and an element
  // screenshot then captures beyond the viewport, where the fixed layer comes out blank.
  const clip = await p.evaluate(() => { const r = document.querySelector('.ridge').getBoundingClientRect(); return { x: 0, y: r.top, width: innerWidth, height: Math.min(innerHeight, r.bottom) - r.top }; });
  const shot = (await p.screenshot({ clip })).toString('base64');
  const q = await ctx.newPage(); // about:blank: no CSP, so the data: image can be decoded onto a canvas
  const cover = await q.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let cols = 0;
    for (let x = 0; x < c.width; x++) for (let y = 0; y < c.height; y++) {
      const i = (y * c.width + x) * 4;
      if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 12) { cols++; break; }
    }
    return cols / c.width;
  }, shot);
  ok(`AC-FOREST-4 ${w}x${h}`, cover > 0.98, `ridge spans the viewport (${Math.round(cover * 100)}% of columns inked)`);
  await ctx.close();
}
// AC-FOREST-9: a tall window scales the stand past the handoff's cap of 1 (owner, src/scripts/fit.ts), up to MAX_FS, to fill the
// band under the text, and the near layer stays below the text (AC-FOREST-2's measurement on the fully grown stand, in dark,
// where --boost does not lift the giants past the opacity filter). The 1440x900 design keeps its scale.
{ const MAX_FS = 1.5; // keep in step with src/scripts/fit.ts
  const fit = async (w, h) => { const { p, ctx } = await page(w, h, 'dark', '&rain=off&moon=off', true);
    const r = await p.evaluate(() => {
      const trees = [...document.querySelectorAll('.tree:not(.still)')].filter(t => parseFloat(getComputedStyle(t).opacity) > 0.2);
      return { fs: parseFloat(document.getElementById('stand').style.getPropertyValue('--fs')), mainBottom: document.querySelector('main').getBoundingClientRect().bottom,
        topOfForest: Math.min(...trees.map(t => t.getBoundingClientRect().top)) };
    });
    await ctx.close(); return r; };
  const t = await fit(3840, 2160), d = await fit(1440, 900);
  ok('AC-FOREST-9 3840x2160', t.fs > 1 && t.fs <= MAX_FS && t.topOfForest >= t.mainBottom - 8,
    `tall window scales the stand up (--fs ${t.fs}, cap ${MAX_FS}), near layer below text (forest top ${Math.round(t.topOfForest)} ≥ main bottom ${Math.round(t.mainBottom)})`);
  ok('AC-FOREST-9 1440x900', d.fs === 0.741, `design viewport keeps its scale (--fs ${d.fs})`);
}
// AC-GUST-1: the gust sweeps left to right (owner): each swaying tree leans on its own, delayed in proportion to its
// x position, instead of the handoff's skew of the whole .forest. Logs never move. AC-GUST-2: reduced motion ends upright.
{ const { p, ctx } = await page(1440, 900, 'light', '&rain=on');
  const g = await p.evaluate(() => {
    const lean = e => e.getAnimations().find(a => a.animationName === 'gust-lean');
    const trees = [...document.querySelectorAll('.stand .tree')].filter(lean)
      .map(t => [parseFloat(t.parentElement.style.left), lean(t).effect.getTiming().delay]).sort((a, b) => a[0] - b[0]);
    const logs = [...document.querySelectorAll('.stand .tw.still, .stand .tw.still .tree')];
    return { n: trees.length, mono: trees.every((t, i) => i === 0 || t[1] >= trees[i - 1][1]), span: trees.length ? trees.at(-1)[1] - trees[0][1] : 0,
      forest: document.getElementById('forest').getAnimations().map(a => a.animationName), logs: logs.length, logAnims: logs.reduce((s, e) => s + e.getAnimations().length, 0) };
  });
  ok('AC-GUST-1', g.n > 20 && g.mono && g.span > 1000 && g.forest.length === 0 && g.logs > 0 && g.logAnims === 0,
    `gust delay rises with x across ${g.n} trees (${Math.round(g.span)}ms left to right), .forest runs [${g.forest}], ${g.logAnims} animations on ${g.logs} log elements`);
  await ctx.close(); }
{ const { p, ctx } = await page(1440, 900, 'light', '&rain=off', true);
  const r = await p.evaluate(() => [...new Set([...document.querySelectorAll('.stand .tree')].map(t => getComputedStyle(t).rotate))]);
  ok('AC-GUST-2', r.every(v => v === 'none' || parseFloat(v) === 0), `reduced motion: trees upright after load (rotate ${r.join(', ')})`);
  await ctx.close(); }
// AC-FOREST-6 / AC-RAIN-3: density follows width (owner). The design width keeps the handoff's 291 elements and 70 drops;
// a wide stand gets proportionally more, so elements per 1000px of stand stay near the design's ~150. 3840x1100 is wide but
// short, so --fs stays ~1 and width alone sets the density (a tall 4K window scales the stand up instead, AC-FOREST-9).
// AC-FOREST-7: a resize that changes the density rebuilds the stand already grown (--age), not from the ground.
{ const { p, ctx } = await page(1440, 900, 'light', '&rain=on');
  const stat = () => p.evaluate(() => { const s = document.getElementById('stand');
    return { n: s.querySelectorAll('.tw').length, ridges: s.querySelectorAll('.ridge').length, drops: document.querySelectorAll('.drop').length,
      per: s.querySelectorAll('.tw').length / (innerWidth / parseFloat(getComputedStyle(s).getPropertyValue('--fs'))) * 1000, age: parseFloat(s.style.getPropertyValue('--age')) }; });
  const a = await stat();
  ok('AC-FOREST-6 1440x900', a.n === 291 && a.drops === 70, `design width keeps the handoff counts (${a.n} elements, ${a.drops} drops)`);
  await p.setViewportSize({ width: 3840, height: 1100 }); await p.waitForTimeout(400);
  const z = await stat();
  ok('AC-FOREST-6 3840x1100', z.n > 291 * 1.8 && Math.abs(z.per / a.per - 1) < 0.1, `wide stand keeps the design density (${z.n} elements, ${Math.round(z.per)} vs ${Math.round(a.per)} per 1000px)`);
  ok('AC-RAIN-3', z.drops === Math.round(70 * 3840 / 1440), `rain scales with window width (${z.drops} drops)`);
  ok('AC-FOREST-7', z.ridges === 1 && z.age > 0, `resize rebuilds one stand, aged ${z.age}s so it does not regrow`);
  await ctx.close(); }
// AC-FOREST-8: a density rebuild keeps every existing element (same left and path) and only adds; same seed and viewport
// give the same stand. Each layer draws from its own seeded stream (src/scripts/stand.ts), so counts do not reshuffle it.
{ const sigs = p => p.evaluate(() => [...document.querySelectorAll('#stand .tw')].map(w => w.style.left + ' ' + w.querySelector('path').getAttribute('d')));
  const { p, ctx } = await page(1440, 900, 'light', '&rain=off');
  const a = await sigs(p);
  const { p: p2, ctx: ctx2 } = await page(1440, 900, 'light', '&rain=off');
  const a2 = await sigs(p2); await ctx2.close();
  ok('AC-FOREST-8 determinism', a.length > 0 && a.length === a2.length && a.every((s, i) => s === a2[i]), `same seed and viewport give the same stand (${a.length} elements)`);
  await p.setViewportSize({ width: 3840, height: 1100 }); await p.waitForTimeout(400);
  const z = await sigs(p), zs = new Set(z), lost = a.filter(s => !zs.has(s)).length;
  ok('AC-FOREST-8 resize', z.length > a.length && lost === 0, `wider rebuild keeps every element and adds more (${a.length} -> ${z.length}, ${lost} lost)`);
  await ctx.close(); }
{ const { p, ctx } = await page(1440, 900, 'light'); // motion allowed: half a second in, the ridge is still drawing on
  const clip = await p.evaluate(() => getComputedStyle(document.querySelector('.ridge')).clipPath);
  const right = parseFloat(clip.match(/^inset\(\S+ (\S+)/)?.[1] ?? '0');
  ok('AC-FOREST-5', right > 0 && right < 100, `ridge draws on left to right (clip-path ${clip} at 0.5s)`);
  await ctx.close(); }
{ const { p, ctx } = await page(1440, 900, 'light', '&rain=on', true);
  ok('AC-MOTION-1', await p.evaluate(() => getComputedStyle(document.querySelector('.rain')).display === 'none'), 'reduced motion hides rain');
  await ctx.close(); }
{ const { p, ctx } = await page(1440, 900, 'light');
  const rainAuto = await p.evaluate(() => document.querySelectorAll('.drop').length);
  ok('AC-RAIN-2', rainAuto === 0 || rainAuto === 70, 'rain auto resolves to all-or-nothing (' + rainAuto + ')');
  await ctx.close(); }
// AC-PAUSE-1: while the document is hidden the infinite animations (sway, rain, gust, moon drift) pause and the one-shot
// grow-in keeps running; on return they all run again. visibilityState is faked: Playwright pages are always visible.
{ const { p, ctx } = await page(1440, 900, 'dark', '&rain=on&moon=on');
  const states = (hidden) => p.evaluate(h => {
    for (const [k, v] of [['visibilityState', h ? 'hidden' : 'visible'], ['hidden', h]]) Object.defineProperty(document, k, { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
    // A swaying tree runs two animations (sway, gust lean), so its play state is a list: collapse it to the distinct values.
    const s = sel => [...new Set(getComputedStyle(document.querySelector(sel)).animationPlayState.split(', '))].join('+');
    return { tree: s('.tree:not(.still):not(.calm)'), drop: s('.drop'), rain: s('#rain'), moon: s('#moon'), grow: s('.tw:not(.still)') };
  }, hidden);
  const h = await states(true), v = await states(false);
  ok('AC-PAUSE-1 hidden', h.tree === 'paused' && h.drop === 'paused' && h.rain === 'paused' && h.moon === 'paused' && h.grow === 'running', `hidden pauses the loops, not the grow-in (${JSON.stringify(h)})`);
  ok('AC-PAUSE-1 visible', Object.values(v).every(x => x === 'running'), `visible resumes them (${JSON.stringify(v)})`);
  await ctx.close(); }
await b.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
