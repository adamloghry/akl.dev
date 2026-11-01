/**
 * forest.js — the akl.dev wireframe forest.
 *
 * Framework-free ES module. No DOM assumptions beyond: a container for the
 * stand, a container for the rain, and (optionally) a moon element.
 * Everything visual is CSS (see global.css): this module only produces
 * geometry (SVG path strings) and per-element CSS custom properties.
 *
 * Exports
 *   DEFAULT_CONFIG            – the shipped stand (ridge, layers, timing)
 *   mulberry(seed)            – deterministic PRNG, 32-bit
 *   buildForest(el, seed, cfg)– fills `el` with one stand (ridge + trees)
 *   buildRain(el, seed, cfg)  – fills `el` with drops
 *   fitStand(el, mainEl, cfg) – sets --fs so the stand fits under the text
 *   seattleNow()              – {y,m,d,h} in America/Los_Angeles, no network
 *   wxRain(now, cfg)          – climatology: should it rain today?
 *   wxNight(now, cfg)         – sun table: is it night in Seattle?
 *   randomSeed()              – crypto-random 32-bit seed (falls back to time)
 *
 * Porting notes (for a non-Astro generator): see docs/08-future-generators.md.
 */

export const DEFAULT_CONFIG = {
  ridge: { amp: 40, freq: 1.4, phase: 0.6 },
  rain: { count: 70, durMin: 1.4, durMax: 2.6 },
  wx: {
    // Seattle: P(measurable rain on a given day) by month, Jan..Dec. Climatology, not forecast.
    pRain: [0.62, 0.55, 0.55, 0.45, 0.32, 0.26, 0.10, 0.12, 0.26, 0.48, 0.64, 0.66],
    // Mean sunrise / sunset, local clock hours, Jan..Dec (DST already folded in).
    sunrise: [7.9, 7.3, 7.3, 6.3, 5.6, 5.2, 5.4, 6.0, 6.7, 7.4, 7.2, 7.8],
    sunset: [16.7, 17.5, 19.3, 20.0, 20.6, 21.1, 21.0, 20.3, 19.3, 18.2, 16.6, 16.3]
  },
  // growth timing (seconds)
  delayMin: 1, delayMax: 48, durMin: 10, durMax: 22, layerStagger: 5,
  // tallest near tree + its base, px at scale 1 — used by fitStand()
  forestHeight: 620,
  // back → front. li (layer index) selects --l0..--l7 in CSS.
  layers: [
    { kind: 'trees', count: 90, hMin: 30,  hMax: 80,  baseMin: 60, baseMax: 96, opacity: 0.14, stroke: 0.5,  detail: false, mix: { fir: 6, hemlock: 3, spruce: 1 } },
    { kind: 'trees', count: 56, hMin: 70,  hMax: 150, baseMin: 36, baseMax: 66, opacity: 0.24, stroke: 0.6,  detail: false, mix: { fir: 5, hemlock: 3, spruce: 1, cedar: 1 } },
    { kind: 'trees', count: 28, hMin: 150, hMax: 280, baseMin: 12, baseMax: 36, opacity: 0.38, stroke: 0.85, detail: true,  mix: { fir: 4, hemlock: 2, cedar: 2, spruce: 1, snag: 1, broadleaf: 1 } },
    { kind: 'logs',  count: 4,  hMin: 80,  hMax: 180, baseMin: 0,  baseMax: 8,  opacity: 0.5,  stroke: 0.9 },
    { kind: 'trees', count: 10, hMin: 320, hMax: 520, baseMin: -2, baseMax: 10, opacity: 0.6,  stroke: 1.15, detail: true,  mix: { fir: 4, hemlock: 2, cedar: 3, spruce: 1, snag: 1, broadleaf: 2 } },
    { kind: 'ferns', count: 30, hMin: 18,  hMax: 46,  baseMin: -2, baseMax: 6,  opacity: 0.55, stroke: 0.9 },
    { kind: 'grass', count: 70, hMin: 6,   hMax: 16,  baseMin: -2, baseMax: 10, opacity: 0.45, stroke: 0.7 },
    { kind: 'trees', count: 3,  hMin: 560, hMax: 700, baseMin: -4, baseMax: 2,  opacity: 0.12, stroke: 1.0,  detail: true,  mix: { fir: 3, cedar: 2 } }
  ]
};

const NS = 'http://www.w3.org/2000/svg';
const f1 = (n) => n.toFixed(1);

/** mulberry32: small, fast, good enough; identical sequence for identical seed. */
export function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function qpt(x0, y0, cx, cy, x1, y1, t) { const u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; }

/* ---------------- species ----------------
 * All return { d: <svg path>, maxW: half-width, h: height }.
 * Local coordinates: origin at the base of the trunk, +y is DOWN (SVG), so the crown is at y = -h.
 */
const SPECIES = {
  fir:     { wf: 0.20, tier: 13, droop: 0.45, upl: 0.08, top: 'point' },                       // Douglas-fir: drooping whorls, pointed leader
  hemlock: { wf: 0.19, tier: 10, droop: 0.65, upl: 0.0,  top: 'droop' },                       // western hemlock: fine tiers, nodding top
  cedar:   { wf: 0.30, tier: 12, droop: 0.55, upl: 0.0,  top: 'point', jcurve: true, flare: true }, // western red cedar: J-curved sweeping branches, fluted base
  spruce:  { wf: 0.22, tier: 11, droop: 0.12, upl: 0.15, top: 'point', comb: true }            // Sitka/noble: stiff near-horizontal branches, comb needles
};

export function conifer(kind, h, rnd, detail) {
  const K = SPECIES[kind];
  const maxW = h * (K.wf + rnd() * 0.08) * (0.85 + rnd() * 0.3);
  const lean = (rnd() - 0.5) * h * 0.08;                       // trunk curve, ±4% of height
  const tx = (f) => 2 * (1 - f) * f * (lean * 0.4) + f * f * lean; // trunk x at fraction f of height
  let d = 'M0 0 Q' + f1(lean * 0.4) + ' ' + f1(-h * 0.5) + ' ' + f1(lean) + ' ' + f1(-h);
  if (K.flare) d += ' M' + f1(-maxW * 0.07) + ' 0 Q' + f1(-maxW * 0.02) + ' ' + f1(-h * 0.12) + ' 0 ' + f1(-h * 0.3) + ' M' + f1(maxW * 0.07) + ' 0 Q' + f1(maxW * 0.02) + ' ' + f1(-h * 0.12) + ' 0 ' + f1(-h * 0.3);
  const n = Math.max(6, Math.round(h / K.tier)), start = K.flare ? 0.06 : 0.12;
  for (let k = 0; k < n; k++) {
    const f = k / n, y = -(h * start + h * (0.88 - start) * f), x0 = tx(-y / h), base = maxW * Math.pow(1 - f, 0.85);
    for (const s of [-1, 1]) {
      if (rnd() < 0.07) continue;                               // missing branch
      const w = base * (0.7 + 0.6 * rnd());                     // per-side length jitter → asymmetry
      if (w < 2) continue;
      const droop = w * (K.droop * (1 - f) + 0.05), lift = -w * K.upl * (0.3 + f);
      let cx, cy, ex, ey;
      if (K.jcurve) { cx = x0 + s * w * 0.45; cy = y + droop; ex = x0 + s * w; ey = y + droop * 0.45; }
      else { cx = x0 + s * w * 0.55; cy = y + droop * 0.25; ex = x0 + s * w; ey = y + droop + lift; }
      d += ' M' + f1(x0) + ' ' + f1(y) + ' Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(ex) + ' ' + f1(ey);
      if (detail && w > 14) {                                   // needle ticks along the branch
        const m = K.comb ? 3 : 2;
        for (let j = 1; j <= m; j++) {
          const p = qpt(x0, y, cx, cy, ex, ey, j / (m + 1)), tl = w * (K.comb ? 0.14 : 0.2) * (0.7 + 0.6 * rnd());
          d += ' M' + f1(p[0]) + ' ' + f1(p[1]) + ' l' + f1(s * tl * 0.35) + ' ' + f1(tl);
          if (K.comb) d += ' M' + f1(p[0]) + ' ' + f1(p[1]) + ' l' + f1(s * tl * 0.35) + ' ' + f1(-tl * 0.6);
        }
      }
    }
  }
  if (K.top === 'droop') { const s = rnd() < 0.5 ? -1 : 1; d += ' M' + f1(lean) + ' ' + f1(-h * 0.94) + ' Q' + f1(lean + s * h * 0.02) + ' ' + f1(-h * 1.01) + ' ' + f1(lean + s * h * 0.05) + ' ' + f1(-h * 0.97); }
  return { d, maxW: maxW + Math.abs(lean), h };
}
export function snag(h, rnd) {
  const lean = (rnd() - 0.5) * h * 0.1, top = -h * (0.55 + rnd() * 0.35), maxW = h * 0.12;
  let d = 'M0 0 Q' + f1(lean * 0.4) + ' ' + f1(top * 0.5) + ' ' + f1(lean) + ' ' + f1(top) + ' l' + f1(h * 0.02) + ' ' + f1(h * 0.03);
  const stubs = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < stubs; i++) { const f = 0.3 + rnd() * 0.6, s = rnd() < 0.5 ? -1 : 1, w = maxW * (0.4 + rnd() * 0.8); d += ' M' + f1(lean * f) + ' ' + f1(top * f) + ' l' + f1(s * w) + ' ' + f1(w * 0.25 * (rnd() - 0.3)); }
  return { d, maxW: maxW + Math.abs(lean), h };
}
export function broadleaf(h, rnd) {
  let d = '', maxW = 0;
  const seg = (x, y, ang, len, depth) => {
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    const cx = (x + nx) / 2 + Math.cos(ang + Math.PI / 2) * len * (rnd() - 0.5) * 0.3, cy = (y + ny) / 2 + Math.sin(ang + Math.PI / 2) * len * (rnd() - 0.5) * 0.3;
    d += ' M' + f1(x) + ' ' + f1(y) + ' Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(nx) + ' ' + f1(ny);
    maxW = Math.max(maxW, Math.abs(nx));
    if (depth === 0) return;
    const k = 2 + (rnd() < 0.35 ? 1 : 0);
    for (let i = 0; i < k; i++) { const da = (rnd() - 0.5) * 1.0 + (i === 0 ? -0.38 : i === 1 ? 0.38 : 0); seg(nx, ny, ang + da, len * (0.62 + rnd() * 0.18), depth - 1); }
  };
  seg(0, 0, -Math.PI / 2 + (rnd() - 0.5) * 0.2, h * 0.32, 5);
  return { d, maxW, h };
}
export function fern(sz, rnd) {
  let d = ''; const k = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) {
    const a = -Math.PI * (0.1 + 0.8 * (i + rnd() * 0.6) / k), len = sz * (0.6 + rnd() * 0.5);
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len, cx = ex * 0.5 - Math.sin(a) * len * 0.18, cy = ey * 0.5 + Math.cos(a) * len * 0.18;
    d += ' M0 0 Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(ex) + ' ' + f1(ey);
    for (let j = 1; j <= 3; j++) { const p = qpt(0, 0, cx, cy, ex, ey, j / 4), tl = len * 0.13; d += ' M' + f1(p[0]) + ' ' + f1(p[1]) + ' l' + f1(Math.cos(a + 1.2) * tl) + ' ' + f1(Math.sin(a + 1.2) * tl) + ' M' + f1(p[0]) + ' ' + f1(p[1]) + ' l' + f1(Math.cos(a - 1.2) * tl) + ' ' + f1(Math.sin(a - 1.2) * tl); }
  }
  return { d, maxW: sz * 1.15, h: sz * 1.15 };
}
export function grass(sz, rnd) {
  let d = ''; const k = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, len = sz * (0.5 + rnd() * 0.6); d += ' M0 0 Q' + f1(Math.cos(a) * len * 0.5) + ' ' + f1(Math.sin(a) * len * 0.5 - len * 0.1) + ' ' + f1(Math.cos(a) * len) + ' ' + f1(Math.sin(a) * len); }
  return { d, maxW: sz, h: sz };
}
export function log(len, rnd) {
  const th = len * 0.08 + 3, sag = (rnd() - 0.5) * len * 0.1;
  let d = 'M' + f1(-len / 2) + ' ' + f1(-th) + ' Q0 ' + f1(-th + sag) + ' ' + f1(len / 2) + ' ' + f1(-th * 0.8);
  d += ' M' + f1(-len / 2) + ' 0 Q0 ' + f1(sag) + ' ' + f1(len / 2) + ' ' + f1(-th * 0.1);
  d += ' M' + f1(-len / 2) + ' ' + f1(-th) + ' l0 ' + f1(th) + ' M' + f1(len * 0.1) + ' ' + f1(-th) + ' l' + f1(th * 0.6) + ' ' + f1(-th * 1.3);
  return { d, maxW: len / 2 + th, h: th * 2.5 };
}
function pick(mix, rnd) { let tot = 0; for (const k in mix) tot += mix[k]; let r = rnd() * tot; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return 'fir'; }

/* ---------------- Seattle clock & climatology (no network) ---------------- */
export function seattleNow() {
  let y = 2026, m = 1, d = 1, h = 12;
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const g = (t) => parseInt(p.find((x) => x.type === t).value, 10);
    y = g('year'); m = g('month'); d = g('day'); h = (g('hour') % 24) + g('minute') / 60;
  } catch (e) { /* keep defaults */ }
  return { y, m, d, h };
}
export function wxRain(now, cfg = DEFAULT_CONFIG) { return mulberry(now.y * 10000 + now.m * 100 + now.d)() < cfg.wx.pRain[now.m - 1]; }
export function wxNight(now, cfg = DEFAULT_CONFIG) { return now.h < cfg.wx.sunrise[now.m - 1] || now.h >= cfg.wx.sunset[now.m - 1]; }
export function randomSeed() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return Date.now() >>> 0; } }

/* ---------------- builders ---------------- */
function el(name, attrs) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

/** Fill `stand` (an absolutely positioned box, bottom-anchored) with ridge + trees. Returns element count. */
export function buildForest(stand, seed, cfg = DEFAULT_CONFIG) {
  const rnd = mulberry(seed), frag = document.createDocumentFragment();
  const R = cfg.ridge, H = R.amp * 2 + 12; let rd = '';
  for (let x = 0; x <= 1280; x += 32) { const yfb = R.amp * (1 + Math.sin(x / 1280 * Math.PI * 2 * R.freq + R.phase)) + 2; rd += (x === 0 ? 'M' : ' L') + x + ' ' + (H - yfb).toFixed(1); }
  const ridge = el('svg', { class: 'ridge', viewBox: '0 0 1280 ' + H, preserveAspectRatio: 'none' });
  ridge.style.height = H + 'px'; ridge.style.color = 'var(--l4)';
  ridge.appendChild(el('path', { d: rd, fill: 'none', stroke: 'currentColor', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke', pathLength: '1' }));
  frag.appendChild(ridge);
  let count = 1;
  cfg.layers.forEach((L, li) => {
    for (let i = 0; i < L.count; i++) {
      const size = L.hMin + rnd() * (L.hMax - L.hMin); let g;
      if (L.kind === 'ferns') g = fern(size, rnd);
      else if (L.kind === 'grass') g = grass(size, rnd);
      else if (L.kind === 'logs') g = log(size, rnd);
      else { const sp = pick(L.mix, rnd); g = sp === 'snag' ? snag(size, rnd) : sp === 'broadleaf' ? broadleaf(size, rnd) : conifer(sp, size, rnd, L.detail); }
      const xp = rnd() * 100;
      const bottom = L.baseMin + rnd() * (L.baseMax - L.baseMin) + R.amp * (1 + Math.sin(xp / 100 * Math.PI * 2 * R.freq + R.phase));
      const delay = cfg.delayMin + rnd() * (cfg.delayMax - cfg.delayMin) + li * cfg.layerStagger;
      const dur = (cfg.durMin + rnd() * (cfg.durMax - cfg.durMin)) * (L.kind === 'trees' ? (0.6 + g.h / 500) : 0.6);
      const pad = 6, W = g.maxW * 2 + pad * 2, Hh = g.h + pad * 2;
      const amp = L.kind === 'ferns' ? 1.4 : L.kind === 'grass' ? 1.0 : (g.h > 400 ? 0.3 : g.h > 200 ? 0.5 : 0.8);
      // Sway under ~120px moves the tip < 1.5px: invisible, but each swaying box costs main-thread style work every frame, so those stay calm.
      const still = L.kind === 'logs' ? ' still' : '';
      const wrap = document.createElement('div'); wrap.className = 'tw' + still; // carries position + grow, so sway runs on the svg root (compositor), not on inner <g>
      const svg = el('svg', { class: 'tree' + still + (still || g.h >= 120 ? '' : ' calm'), viewBox: f1(-g.maxW - pad) + ' ' + f1(-g.h - pad) + ' ' + f1(W) + ' ' + f1(Hh) });
      wrap.style.cssText = 'left:' + xp.toFixed(2) + '%;bottom:' + bottom.toFixed(0) + 'px;width:' + W.toFixed(0) + 'px;height:' + Hh.toFixed(0) + 'px;margin-left:' + (-W / 2).toFixed(0) + 'px;--d:' + f1(dur) + 's;--t:' + f1(delay) + 's;--sd:' + f1(5 + rnd() * 8 + g.h / 60) + 's;--st:' + f1(rnd() * 8) + 's;--amp:' + amp + 'deg';
      svg.style.cssText = 'color:var(--l' + li + ');opacity:calc(' + L.opacity + ' + var(--boost))';
      svg.appendChild(el('path', { d: g.d, fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': String(L.stroke) }));
      wrap.appendChild(svg); frag.appendChild(wrap); count++;
    }
  });
  stand.appendChild(frag);
  return count;
}

/** Fill `box` with falling drops. Call only when it should rain. */
export function buildRain(box, seed, cfg = DEFAULT_CONFIG) {
  const rnd = mulberry(seed), frag = document.createDocumentFragment(), Rn = cfg.rain;
  for (let i = 0; i < Rn.count; i++) {
    const len = 10 + rnd() * 10, dur = Rn.durMin + rnd() * (Rn.durMax - Rn.durMin);
    const svg = el('svg', { class: 'drop', viewBox: '0 0 4 20', preserveAspectRatio: 'none' });
    svg.style.cssText = 'left:' + (rnd() * 100).toFixed(2) + '%;top:-' + (24 + rnd() * 300).toFixed(0) + 'px;width:4px;height:' + len.toFixed(0) + 'px;color:var(--l1);--d:' + dur.toFixed(2) + 's;--t:' + (rnd() * 3).toFixed(2) + 's';
    svg.appendChild(el('path', { d: 'M3 0 L1 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '0.9', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    frag.appendChild(svg);
  }
  box.appendChild(frag);
}

/** Scale the stand so the near layer stays below the text in the first viewport. */
export function fitStand(stand, mainEl, cfg = DEFAULT_CONFIG) {
  const mb = mainEl.getBoundingClientRect();
  const avail = window.innerHeight - (mb.bottom + window.scrollY) - 24;
  const fs = Math.max(0.35, Math.min(1, avail / cfg.forestHeight));
  stand.style.setProperty('--fs', fs.toFixed(3));
  // At the scale floor the stand can still be taller than the room under the text: sink it below the
  // viewport (.forest clips) so near trees never cross the text; only the faint giants may pass behind it.
  stand.style.bottom = Math.min(0, avail - fs * cfg.forestHeight).toFixed(0) + 'px';
  return fs;
}
