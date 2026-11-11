/**
 * seattle.ts: Seattle / PNW touches layered on the handoff forest (owner, docs/design.md section 3).
 *
 *   mountain   Rainier on the horizon on dry days ("the mountain is out")
 *   crows      the dusk commute to the roost, around sunset
 *   mist       low bands between the far and near layers on some mornings
 *   owl        one owl on a near treetop at night
 *   sasquatch  about 1 visit in 200, a faint figure walks behind the mid trees once
 *   snow       rare winter days, instead of rain
 *
 * Like the rain, every decision comes from the Seattle clock and seeded rolls: no network. forest.js is
 * not modified; this module adds elements beside what buildForest produced (the owl goes inside its tree's svg). All visuals are in
 * overrides.css. Day-level rolls (snow, mist) use the date so every visitor sees the same day.
 */
import { DEFAULT_CONFIG, mulberry, wxNight } from './forest.js';

export type Now = { y: number; m: number; d: number; h: number };
export type Touches = { snow: boolean; mountain: boolean; crows: boolean; mist: boolean; owl: boolean; sasquatch: boolean };

const NS = 'http://www.w3.org/2000/svg';
/** P(snow day) on a December to February date: about 7 days a winter. */
export const P_SNOW = 1 / 12;
/** P(misty morning) by month, Jan..Dec. */
export const P_MIST = [0.6, 0.5, 0.35, 0.25, 0.15, 0.1, 0.05, 0.1, 0.3, 0.55, 0.65, 0.6];
export const P_SASQUATCH = 1 / 200;
const MIST_UNTIL = 10.5, CROWS_BEFORE = 1, CROWS_AFTER = 0.4;
// Salts keep each roll independent of the rain roll, which uses the bare date.
const SALT = { snow: 0x534e4f57, mist: 0x4d495354, squatch: 0x53415351, owl: 0x4f574c21, crows: 0x43524f57, flakes: 0x464c414b };

const dayRoll = (now: Now, salt: number) => mulberry((now.y * 10000 + now.m * 100 + now.d) ^ salt)();
export const snowDay = (now: Now) => (now.m === 12 || now.m <= 2) && dayRoll(now, SALT.snow) < P_SNOW;
export const mistMorning = (now: Now, cfg = DEFAULT_CONFIG) =>
  now.h >= cfg.wx.sunrise[now.m - 1] - 0.5 && now.h < MIST_UNTIL && dayRoll(now, SALT.mist) < P_MIST[now.m - 1];
export const crowsHour = (now: Now, cfg = DEFAULT_CONFIG) => {
  const s = cfg.wx.sunset[now.m - 1];
  return now.h >= s - CROWS_BEFORE && now.h < s + CROWS_AFTER;
};

/**
 * What today's visit shows. `q` carries the QA overrides (?snow= ?mountain= ?crows= ?mist= ?owl= ?sasquatch=, on|off).
 * `rainOn` is the rain decision after its own override. Returns the touches and the final rain state: snow replaces
 * rain, except that an explicit ?rain=on wins over an automatic snow day.
 */
export function decide(now: Now, seed: number, rainOn: boolean, q: URLSearchParams): Touches & { rain: boolean } {
  const flag = (name: string, auto: boolean) => (q.has(name) ? q.get(name) !== 'off' : auto);
  const snow = flag('snow', snowDay(now) && !(q.has('rain') && rainOn));
  const rain = rainOn && !snow;
  return {
    rain, snow,
    mountain: flag('mountain', !rain && !snow),
    crows: flag('crows', crowsHour(now)),
    mist: flag('mist', mistMorning(now)),
    owl: flag('owl', wxNight(now)),
    sasquatch: flag('sasquatch', mulberry(seed ^ SALT.squatch)() < P_SASQUATCH),
  };
}

function svg(cls: string, viewBox: string, paths: [d: string, cls?: string][]) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', cls); s.setAttribute('viewBox', viewBox);
  for (const [d, c] of paths) s.appendChild(path(d, c));
  return s;
}
function path(d: string, cls?: string) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('vector-effect', 'non-scaling-stroke');
  if (cls) p.setAttribute('class', cls);
  return p;
}
/** First element of layer `li` in the stand (buildForest colours each element var(--l<li>)). */
const firstOfLayer = (stand: HTMLElement, li: number) =>
  [...stand.children].find((e) => (e.firstElementChild as SVGElement | null)?.style.color === `var(--l${li})`) ?? null;

/* ---------------- mountain ---------------- */
// Rainier as seen from Seattle: long north-east shoulder with Little Tahoma on the left, three-bump summit, steeper right.
const MOUNTAIN: [string, string?][] = [
  ['M0 300 L90 268 L170 236 L222 210 L246 176 L262 196 L300 168 L350 122 L395 80 L430 52 L452 38 Q470 28 490 31 Q505 24 522 30 Q540 30 556 45 L590 84 L640 134 L700 180 L770 224 L840 264 L900 300'],
  ['M452 38 L441 92 L412 142 M505 27 L515 82 L500 132 L520 192 M556 45 L575 112 L610 162', 'glacier'],
  ['M330 142 L372 152 L412 142 L452 160 L500 132 L548 158 L610 162 L650 144', 'glacier'],
];

/* ---------------- owl ---------------- */
// Local units are the tree's own px; (0,0) is the perch. Body is filled with the page colour so the trunk does not show through.
function owl(x: string, y: string) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'owl'); g.setAttribute('transform', `translate(${x} ${y})`);
  g.appendChild(path('M-5 0 Q-7.5 -8 -4.5 -13 L-5.5 -17.5 L-2 -14.5 Q0 -15.5 2 -14.5 L5.5 -17.5 L4.5 -13 Q7.5 -8 5 0 Z', 'owl-body'));
  g.appendChild(path('M0 -9.4 l-0.9 1.8 h1.8 Z M-2.5 0 v1.6 M2.5 0 v1.6 M-2.2 -4.5 q2.2 1.6 4.4 0'));
  const eyes = document.createElementNS(NS, 'g'); eyes.setAttribute('class', 'owl-eyes');
  eyes.appendChild(path('M-3.6 -11 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0 M0.8 -11 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0'));
  g.appendChild(eyes);
  return g;
}

/* ---------------- sasquatch ---------------- */
const SQUATCH: [string, string?][] = [
  ['M17 9 a5 6 0 1 0 10 0 a5 6 0 1 0 -10 0 M18 15 Q10 22 12 36 Q12 44 15 50 M26 15 Q31 24 28 38 Q27 45 24 50'],
  ['M15 50 Q12 62 8 72 L4 88 L0 90 M24 50 Q28 62 26 74 L30 88 L36 90 M26 20 Q34 30 33 44 L35 52 M16 20 Q8 32 7 46 L5 54'],
];
const SQUATCH_START = 35, SQUATCH_WALK = 48, SQUATCH_SPAN = 22, SQUATCH_GROUND = 44; // s, s, % of stand, px above the ridge

/**
 * Stand-level touches. Call after every buildForest(): the stand is emptied on a density rebuild.
 * `age` is seconds since page load (the stand's --age), so a rebuild neither replays nor repeats anything.
 */
export function dressStand(stand: HTMLElement, seed: number, t: Touches, age = 0, cfg = DEFAULT_CONFIG) {
  if (t.mountain) stand.prepend(svg('mountain', '0 0 900 300', MOUNTAIN));

  if (t.mist) {
    const rnd = mulberry(seed ^ SALT.mist), before = firstOfLayer(stand, 3); // in front of the far and mid trees, behind logs and near trees
    for (let i = 0; i < 3; i++) {
      const m = document.createElement('div'); m.className = 'mist';
      m.style.cssText = `bottom:${(50 + i * 70 + rnd() * 40).toFixed(0)}px;height:${(110 + rnd() * 70).toFixed(0)}px;--d:${(50 + rnd() * 40).toFixed(0)}s;--t:-${(rnd() * 40).toFixed(0)}s;--o:${(0.55 + rnd() * 0.3).toFixed(2)}`;
      stand.insertBefore(m, before);
    }
  }

  if (t.owl) {
    // Near-layer conifers and snags start "M0 0 Q cx cy x y": (x, y) is the top of the trunk. Choosing among the first
    // few keeps the same tree when a rebuild adds more.
    const perches = [...stand.querySelectorAll<SVGSVGElement>('.tw > svg')].filter((s) => s.style.color === 'var(--l4)')
      .map((s) => ({ s, top: s.firstElementChild?.getAttribute('d')?.match(/^M0 0 Q\S+ \S+ (\S+) (\S+)/) })).filter((p) => p.top).slice(0, 5);
    const pick = perches[Math.floor(mulberry(seed ^ SALT.owl)() * perches.length)];
    if (pick) { pick.s.appendChild(owl(pick.top![1], pick.top![2])); pick.s.classList.add('perch'); }
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (t.sasquatch && (still || age < SQUATCH_START + SQUATCH_WALK)) {
    const fig = document.createElement('div'); fig.className = 'squatch';
    fig.appendChild(svg('', '0 0 40 90', SQUATCH));
    stand.insertBefore(fig, firstOfLayer(stand, 2)); // behind the mid trees, in front of the far ones
    const x0 = 12 + mulberry(seed ^ SALT.squatch ^ 1)() * 54, R = cfg.ridge, n = 12;
    // x is a percentage of the stand, like the trees, so the walk stays on the ground line when the window is resized.
    const at = (i: number) => {
      const xp = x0 + SQUATCH_SPAN * i / n;
      return { left: xp.toFixed(2) + '%', transform: `translateY(${(-SQUATCH_GROUND - R.amp * (1 + Math.sin(xp / 100 * Math.PI * 2 * R.freq + R.phase))).toFixed(0)}px)` };
    };
    if (still) { Object.assign(fig.style, at(n / 2)); fig.classList.add('still'); }
    else fig.animate(Array.from({ length: n + 1 }, (_, i) => ({ ...at(i), opacity: i === 0 || i === n ? 0 : 0.5 })),
      { duration: SQUATCH_WALK * 1000, delay: (SQUATCH_START - age) * 1000, fill: 'both' })
      .finished.then(() => fig.remove(), () => {}); // gone once it has walked off; a rebuild cancels it (rejects) and re-adds it
  }
}

/**
 * Crows go behind the stand. Call once. They keep to the band above the name (the page's top padding is at least 13vh),
 * so nothing flaps behind the text, and a phone gets fewer of them.
 */
export function buildCrows(forest: HTMLElement, seed: number) {
  const rnd = mulberry(seed ^ SALT.crows), box = document.createElement('div'); box.className = 'crows';
  const small = innerWidth < 600, n = (small ? 3 : 5) + Math.floor(rnd() * (small ? 3 : 5));
  const cross = Math.max(18, innerWidth / 70); // seconds to cross: about 70 px/s, but never a dash across a narrow window
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'crow';
    c.style.cssText = `top:${(2 + rnd() * 9).toFixed(1)}vh;width:${(16 + rnd() * 12).toFixed(0)}px;--d:${(cross * (0.9 + rnd() * 0.3) / 0.6).toFixed(1)}s;--t:${(4 + i * 1.6 + rnd() * 3).toFixed(1)}s;--fd:${(0.34 + rnd() * 0.16).toFixed(2)}s`;
    c.appendChild(svg('', '0 0 18 8', [['M1 5 Q5 0 9 4 Q13 0 17 5 M9 4 v1.6']]));
    box.appendChild(c);
  }
  forest.prepend(box);
}

/** Appends `count` flakes to `box`, like buildRain. Flake i is the same whatever the count. */
export function buildSnow(box: ParentNode, seed: number, count: number) {
  const rnd = mulberry(seed ^ SALT.flakes);
  for (let i = 0; i < count; i++) {
    const size = 4 + rnd() * 4, dur = 9 + rnd() * 7;
    const f = svg('flake', '0 0 6 6', [['M3 0 v6 M0 3 h6 M1 1 l4 4 M5 1 l-4 4']]);
    f.style.cssText = `left:${(rnd() * 100).toFixed(2)}%;top:-${(20 + rnd() * 300).toFixed(0)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;--d:${dur.toFixed(1)}s;--t:-${(rnd() * dur).toFixed(1)}s;--dx:${(-30 + rnd() * 60).toFixed(0)}px`;
    box.appendChild(f);
  }
}
