// profile-forest.mjs: the akl.dev stand as two static, self-animating SVGs for the GitHub profile README
// (github.com/adamloghry/adamloghry): forest.svg for light themes, forest-dark.svg for dark.
//
// Geometry comes from the shipped generator (src/scripts/forest.js, untouched) through the same per-layer streams as
// src/scripts/stand.ts, so `--seed N --density K` is the stand akl.dev/?seed=N draws at a window K * 1950px wide
// (Forest.astro's REF_STAND_W). Colours and opacities are the light and dark tokens from src/styles/global.css; the
// two files differ only in their stroke colours and opacities.
//
// GitHub serves README images as <img>, so the SVG cannot run script: growth, sway, the ridge draw-on and rain are
// CSS animations in the SVG's own <style>, with the same prefers-reduced-motion fallback as the page.
//
//   npm run profile-forest -- [--seed N] [--density K] [--out DIR]         write DIR/forest.svg and DIR/forest-dark.svg
//   npm run profile-forest -- --search COUNT [--density K]                 score seeds 1..COUNT, print the best ten
// DIR defaults to tmp/profile (gitignored); copy both files into the profile repo.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_CONFIG as CFG, mulberry, conifer, snag, broadleaf, fern, grass, log } from '../src/scripts/forest.js';
import { layerSeed } from '../src/scripts/stand.ts';

const { values: opt } = parseArgs({ options: {
  // The shipped banner: seed 593 scored best of 1..800 at density 1.5 (437 plants, ~83 KB gzipped per file).
  seed: { type: 'string', default: '593' }, density: { type: 'string', default: '1.5' },
  out: { type: 'string', default: 'tmp/profile' }, search: { type: 'string' },
} });

const W = 840, H = 300, S = 0.4;    // README banner box; S maps stand px to banner px (W / S = 2100 stand px wide)
const RAIN = 70;                     // the page's rain count at any window narrower than 1440px (rainK clamps at 1)
const TIME = { delay: 0.1, dur: 0.25 }; // the page grows over ~80s; a README visit is short, so compress to ~10s

// --l0..--l7, --boost and --rain-op for each theme, read from the shipped stylesheet so the banner follows the page.
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):([^;}]+)/g)].map((m) => [m[1], m[2].trim()]));
const THEMES = {
  light: tokens(css.match(/:root\{([^}]*)\}/)[1]),
  dark: tokens(css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/)[1]),
};

// forest.js keeps pick() private; this is a copy, so the species stream matches the page draw for draw.
function pick(mix, rnd) { let tot = 0; for (const k in mix) tot += mix[k]; let r = rnd() * tot; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return 'fir'; }
const ridgeAt = (xp) => CFG.ridge.amp * (1 + Math.sin(xp / 100 * Math.PI * 2 * CFG.ridge.freq + CFG.ridge.phase));
const int = (d) => d.replace(/-?\d+(\.\d+)?/g, (n) => String(Math.round(+n) || 0)); // 1 stand px = 0.4 banner px
const n1 = (v) => String(+v.toFixed(1));

/** One layer's items, drawing random numbers in exactly buildForest's order. */
function layer(seed, li, count) {
  const L = CFG.layers[li], rnd = mulberry(layerSeed(seed, li)), out = [];
  for (let i = 0; i < count; i++) {
    const size = L.hMin + rnd() * (L.hMax - L.hMin);
    let g, kind = L.kind;
    if (L.kind === 'ferns') g = fern(size, rnd);
    else if (L.kind === 'grass') g = grass(size, rnd);
    else if (L.kind === 'logs') g = log(size, rnd);
    else { kind = pick(L.mix, rnd); g = kind === 'snag' ? snag(size, rnd) : kind === 'broadleaf' ? broadleaf(size, rnd) : conifer(kind, size, rnd, L.detail); }
    const xp = rnd() * 100;
    const bottom = L.baseMin + rnd() * (L.baseMax - L.baseMin) + ridgeAt(xp);
    const delay = CFG.delayMin + rnd() * (CFG.delayMax - CFG.delayMin) + li * CFG.layerStagger;
    const dur = (CFG.durMin + rnd() * (CFG.durMax - CFG.durMin)) * (L.kind === 'trees' ? (0.6 + g.h / 500) : 0.6);
    const amp = L.kind === 'ferns' ? 1.4 : L.kind === 'grass' ? 1.0 : (g.h > 400 ? 0.3 : g.h > 200 ? 0.5 : 0.8);
    const sd = 5 + rnd() * 8 + g.h / 60, st = rnd() * 8;
    const sway = L.kind !== 'logs' && g.h >= 120; // the page's .calm/.still rule: short things and logs hold still
    out.push({ kind, h: g.h, d: g.d, x: xp / 100 * W, y: H - bottom * S, delay, dur, amp, sd, st, sway });
  }
  return out;
}

function stand(seed, k) {
  return CFG.layers.map((L, li) => layer(seed, li, Math.round(L.count * k)));
}

function rain(seed) {
  const rnd = mulberry(seed ^ 0x9e3779b9), out = []; // buildRain's stream and draw order
  for (let i = 0; i < RAIN; i++) {
    const len = 10 + rnd() * 10, dur = CFG.rain.durMin + rnd() * (CFG.rain.durMax - CFG.rain.durMin);
    const x = rnd() * W + 3, top = -(24 + rnd() * 300), t = rnd() * 3; // the page's drop is "M3 0 L1 20" in a 4px box
    out.push(`<path class="p" style="--d:${dur.toFixed(2)}s;--t:${t.toFixed(2)}s" d="M${n1(x)} ${n1(top)} l-2 ${n1(len)}"/>`);
  }
  return out.join('');
}

const STYLE = `<style>
.g{transform-box:fill-box;transform-origin:50% 100%;animation:grow var(--d) cubic-bezier(.2,.6,.2,1) var(--t) both}
.s{transform-box:fill-box;transform-origin:50% 100%;animation:sway var(--sd) ease-in-out var(--st) infinite alternate}
.r{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 6s ease-out forwards}
.p{animation:fall var(--d) linear var(--t) infinite}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes sway{from{transform:rotate(calc(var(--a) * -1))}to{transform:rotate(var(--a))}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes fall{from{transform:translate(0,0)}to{transform:translate(-14px,340px)}}
@media (prefers-reduced-motion:reduce){.g,.s,.r{animation:none;stroke-dashoffset:0}.p{display:none}}
</style>`;

function svg(layers, seed, theme) {
  const T = THEMES[theme], boost = +T.boost, op = (v) => String(+(v).toFixed(2));
  let ridge = '';
  for (let x = 0; x <= W; x += 20) ridge += (x ? ' L' : 'M') + x + ' ' + n1(H - S * (ridgeAt(x / W * 100) + 2));
  const parts = [`<path class="r" d="${ridge}" pathLength="1" fill="none" stroke="${T.l4}" stroke-opacity=".55" stroke-width="1"/>`];
  layers.forEach((items, li) => {
    const L = CFG.layers[li];
    parts.push(`<g fill="none" stroke="${T['l' + li]}" stroke-opacity="${op(L.opacity + boost)}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${L.stroke}">`);
    for (const it of items) {
      const sway = it.sway ? ` class="s" style="--sd:${n1(it.sd)}s;--st:${n1(it.st)}s;--a:${it.amp}deg"` : '';
      parts.push(`<g transform="translate(${n1(it.x)} ${n1(it.y)}) scale(${S})"><g class="g" style="--d:${n1(it.dur * TIME.dur)}s;--t:${n1(it.delay * TIME.delay)}s"><path${sway} vector-effect="non-scaling-stroke" d="${int(it.d)}"/></g></g>`);
    }
    parts.push('</g>');
  });
  parts.push(`<g stroke="${T.l1}" stroke-opacity="${T['rain-op']}" stroke-width=".9" stroke-linecap="round">${rain(seed)}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}${parts.join('')}</svg>\n`;
}

/** Higher is more interesting: a varied near stand spread across the banner, giants apart, logs on show, small file. */
function score(layers) {
  const near = layers[4], mid = layers[2], giants = layers[7], logs = layers[3];
  const kinds = new Set([...near, ...mid].map((t) => t.kind));
  const xs = near.map((t) => t.x).sort((a, b) => a - b);
  const gaps = [xs[0], ...xs.slice(1).map((x, i) => x - xs[i]), W - xs.at(-1)];
  const close = xs.slice(1).filter((x, i) => x - xs[i] < 24).length;
  const gx = giants.map((t) => t.x).sort((a, b) => a - b);
  const giantGap = Math.min(...gx.slice(1).map((x, i) => x - gx[i]));
  const shownLogs = logs.filter((t) => t.x > 40 && t.x < W - 40).length;
  const bytes = layers.flat().reduce((n, t) => n + int(t.d).length + 120, 0);
  return kinds.size
    + (near.some((t) => t.kind === 'broadleaf') ? 1 : 0) + (near.some((t) => t.kind === 'snag') ? 0.5 : 0)
    + (near.some((t) => t.kind === 'cedar') ? 0.5 : 0)
    - Math.max(0, Math.max(...gaps) / W - 0.16) * 20 - close * 0.5
    + Math.min(giantGap, 240) / 120 + Math.min(shownLogs, 3) * 0.3
    - Math.max(0, bytes - 340e3) / 20e3;
}

const k = +opt.density;
if (opt.search) {
  const ranked = [];
  for (let seed = 1; seed <= +opt.search; seed++) ranked.push([score(stand(seed, k)), seed]);
  ranked.sort((a, b) => b[0] - a[0]);
  for (const [s, seed] of ranked.slice(0, 10)) console.log(`seed ${seed}\tscore ${s.toFixed(2)}`);
} else {
  const seed = +opt.seed >>> 0, layers = stand(seed, k);
  mkdirSync(opt.out, { recursive: true });
  for (const [theme, file] of [['light', 'forest.svg'], ['dark', 'forest-dark.svg']]) {
    const text = svg(layers, seed, theme);
    writeFileSync(`${opt.out}/${file}`, text);
    console.log(`${opt.out}/${file}\t${(text.length / 1024).toFixed(0)} KB\t${layers.flat().length} plants\tseed ${seed}\tdensity ${k}`);
  }
}
