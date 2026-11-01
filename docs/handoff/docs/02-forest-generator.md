# 02 — The forest generator

Code: `reference/forest.js` (≡ `astro/src/scripts/forest.js`). ~200 lines, no dependencies, no DOM assumptions beyond three containers. This document is the "why"; the code is the "what".

## 1. Model

A stand is a list of **layers**, back to front. Each layer has a count, a height range, a ground-offset range, an opacity, a stroke weight, a detail flag, and (for trees) a species mix. Every element is one `<svg>` with one `<path>`, absolutely positioned by `left:%` (fluid) and `bottom:px` (its root), sized in px (so geometry never stretches), and coloured via `color: var(--lN)` so the theme can repaint ~300 elements by flipping tokens.

Depth is conveyed by four things at once: **opacity** (0.14 → 0.6), **stroke** (0.5 → 1.15), **detail** (needle ticks only on mid/near), and **hue** (far layers take the sky colour — real aerial perspective). Remove any one and it reads as "small trees in front".

```
li  kind   count  h (px)    base (px)  opacity  stroke  detail  mix
0   trees   90    30–80     60–96      .14      .5      no      fir6 hem3 spr1          skyline
1   trees   56    70–150    36–66      .24      .6      no      fir5 hem3 spr1 ced1     far
2   trees   28    150–280   12–36      .38      .85     yes     fir4 hem2 ced2 spr1 snag1 bl1   mid
3   logs     4    80–180    0–8        .5       .9      —       —
4   trees   10    320–520   −2–10      .6       1.15    yes     fir4 hem2 ced3 spr1 snag1 bl2   near
5   ferns   30    18–46     −2–6       .55      .9      —       —
6   grass   70    6–16      −2–10      .45      .7      —       —
7   trees    3    560–700   −4–2       .12      1.0     yes     fir3 ced2                giants (watermark)
```
Ground offsets are **added to the ridge**: `bottom += amp·(1 + sin(2π·freq·x + phase))` with amp 40, freq 1.4, phase 0.6 — a rolling ground line that the drawn `.ridge` path matches exactly.

## 2. Species (what makes them read as PNW)

All species return a path in local coordinates: origin at the base of the trunk, crown at `y = −h`.

- **Douglas-fir** `fir` — half-width 0.20h, tiers every 13 px, branches droop 0.45·(1−f) (lower branches sag most), slight up-lift at the top, pointed leader.
- **Western hemlock** `hemlock` — finer tiers (10 px), heavier droop (0.65), and the signature **nodding top**: a short curve off the leader.
- **Western red cedar** `cedar` — wide (0.30h), branches are **J-curves** (sweep down, tip up), trunk has a **fluted flare** at the base, tiers start lower.
- **Spruce** `spruce` — stiff near-horizontal branches (droop 0.12, lift 0.15) with **comb** needle ticks both sides.
- **Snag** — bare trunk, broken top (55–90 % of h) with a jag, 3–6 stub branches.
- **Broadleaf** — recursive L-system (depth 5, 2–3 children, angle ±0.38 rad ± jitter, length ×0.62–0.80). Alder/maple in the understory, leafless (wireframe reads better bare).
- **Fern** — 5–8 fronds radiating over a 0.8π fan, each with 3 pairs of pinnae ticks.
- **Grass/duff** — 3–5 short curved blades.
- **Log** — two parallel sagging lines, a cut end, a stub branch. Logs don't grow or sway.

Per-tree variation, all from the seeded PRNG: aspect ±15 %, trunk lean ±4 % of h (quadratic curve, branches follow it), each branch's length drawn independently per side (asymmetry), 7 % of branches missing, needle tick lengths ±30 %. No two trees are alike; no two loads are alike.

## 3. Determinism and seeding

`mulberry32`. Same seed ⇒ identical stand, byte for byte — which is what makes `?seed=1107` screenshots reproducible and lets `verify.mjs` assert counts. Production seed: `crypto.getRandomValues` (fallback `Date.now()`). Rain uses `seed ^ 0x9e3779b9` so it is independent of the stand.

The **date** seeds the rain decision: `mulberry(YYYYMMDD)() < pRain[month]`. Same answer all day for everyone, Seattle-day-aligned.

## 4. Seattle without a network

```
pRain   [.62 .55 .55 .45 .32 .26 .10 .12 .26 .48 .64 .66]   P(measurable rain), Jan..Dec
sunrise [7.9 7.3 7.3 6.3 5.6 5.2 5.4 6.0 6.7 7.4 7.2 7.8]   local clock hours, monthly mean
sunset  [16.7 17.5 19.3 20.0 20.6 21.1 21.0 20.3 19.3 18.2 16.6 16.3]
```
Local Seattle time comes from `Intl.DateTimeFormat(…, { timeZone: 'America/Los_Angeles' })` — correct for any visitor's clock. Monthly resolution means dusk can be off by ~20 min near the equinoxes; acceptable. These are a *model* of Seattle, which is more honest than a weather API nobody will verify and cannot fail.

## 5. Timing (the "slowly growing" brief)

Growth delay is uniform 1–48 s plus 5 s per layer index (so the skyline comes in first, the giants last), duration 10–22 s scaled by `0.6 + h/500` (big trees take longer). The page is empty of trees at t=0 and full at about t≈75 s. Sway periods are 5–13 s + h/60, phases random, so nothing beats in sync. The gust cycle is 38 s with a 6 s initial delay.

## 6. Performance

~300 `<svg>` elements, ~290 paths, each with 2 CSS animations (grow once + sway infinite). Measured: build 15–25 ms on a laptop, paint cost dominated by the near layer's needle ticks. Rain adds 70 elements with a transform animation. On a 2019 phone this is comfortably 60 fps because every animation is `transform`/`opacity` (compositor-only). If you ever need headroom: drop `grass` (70 elements for little visual gain), or render layers 0–1 into one `<svg>` (they never sway individually anyway).

Memory for the geometry strings is ~250 KB; nothing is retained after the DOM is built.

## 7. Upgrades considered and not done

- **Gust propagation left→right**: split `.stand` into 4 vertical bands, same `gust` keyframes with `animation-delay` stepped by 0.6 s. Nice, cheap; not done because the skew already reads as wind and the bands would need their own `--fs` handling.
- **Seasonal snow**: same particle system as rain, white, slower, with `translateX` wobble; Dec–Feb by the Seattle date. Owner said skip for now.
- **Fireflies** in dark mode: 4–5 2-px points fading in/out among the near trees. Tasteful at that count; not done.
- **Build-time rendering** (static SVG): rejected because the owner wants per-visit randomness.

## 8. Tuning knobs (one number each)

| want | change |
|---|---|
| calmer forest | `layers[4].count` 10→6, `layers[7].count` 3→0 |
| rain less noticeable | `rain.count` 70→40, or confine with `.rain{top:40%}` |
| forest further from text | `forestHeight` 620→700 (scales smaller) |
| darker light-mode trees | `--boost` .10→.15 |
| longer "arrival" | `delayMax` 48→90 |
| no gust | remove the `animation` on `.forest` |
