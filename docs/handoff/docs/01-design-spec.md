# 01 — Design spec

Source of truth for pixels: `reference/index.html` + `reference/theme.css`. This document explains the numbers.

## 1. Register

The page is designed to be read by a recruiter, a peer, or a future collaborator in under five seconds, and to be *remembered* for the forest, not the copy. Every element competes with the one thing the reader must encode ("serious person, serious systems"), so: no hero, no CTA, no cards, no icons in the content, no gradients. The forest is the only ornament and it stays below the text.

## 2. Layout

- Root `.page`: `position: relative; min-height: max(100vh, 720px); padding: clamp(72px, 13vh, 160px) 24px 96px`.
- `<main>`: `max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 48px`. **Not positioned** (it must stay static so the mobile toggle can anchor to `.page` and so the negative-z forest paints beneath it — see §7).
- Header row `.head`: flex, space-between, `align-items: flex-start`, gap 16. Left: `<header>` (h1 + role). Right: the toggle button.
- Bio paragraph `.bio`: `max-width: 58ch; text-wrap: pretty`.
- Rows `<nav class="rows">`: CSS grid `minmax(96px,128px) 1fr`, column-gap 24, row-gap 14, `padding-top: 32px; border-top: 1px solid var(--rule)`. Each row = `<span class="k">label</span><span class="v">links…</span>`; `.v` is `flex; flex-wrap: wrap; gap: 4px 12px`, separators are `·` spans with `aria-hidden`.
- Colophon `<footer class="foot">`: `position: absolute; right: 14px; bottom: 10px`, 12 px, translucent backdrop (`color-mix(in srgb, var(--bg) 78%, transparent)`), radius 3.
- Phone (`max-width: 600px`): rows grid becomes `72px 1fr`, column-gap 16; toggle becomes `position: absolute; top: 10px; right: 10px` relative to `.page`.

## 3. Type

IBM Plex Mono, weights 400 and 500, self-hosted. Fallback stack: `ui-monospace, 'SF Mono', Menlo, monospace`.

| element | size | weight | other |
|---|---|---|---|
| body | 15px / 1.65 | 400 | `-webkit-font-smoothing: antialiased` |
| h1 | 15px | 500 | uppercase, `letter-spacing: .08em` |
| role | 15px | 400 | colour `--muted` |
| bio | 15px | 400 | |
| row labels | 15px | 400 | `--muted` |
| links | 15px | 400 | underline, `text-underline-offset: 3px`, underline colour = muted at 55%; hover → currentColor |
| colophon | 12px | 400 | `--muted`, `letter-spacing: .04em` |

Links are `display: inline-block; padding: 6px 0; margin: -6px 0` to get ≥36 px hit boxes without changing the visual rhythm.

## 4. Colour tokens

```
light                       dark
--bg     #f6f5ec            #0f110e      (warm-olive paper / near-black green)
--fg     #1a1a1a            #d9d9d3
--muted  #5c5c58 (6.3:1)    #8e8e87 (6.1:1)
--rule   #e0ded2            #2a2b29
forest, far → near (aerial perspective: distant = cooler/lighter)
--l0  #b0b09c   #363a30     skyline
--l1  #95977f   #4d5243     far (also rain colour)
--l2  #6f7360   #6a705c     mid
--l3  #7a6a52   #6e6250     logs (brown)
--l4  #4c5440   #a39e94     near (also ridge line)
--l5  #5c6a4c   #8a9478     ferns
--l6  #7d8266   #6e735e     grass/duff
--l7  #565d48   #878d78     giants
--boost  .10                0            added to every layer's opacity on light (pale grounds wash out thin strokes)
--rain-op .22               .30
```
All text/ground pairs are ≥ 6:1. Colours that must be told apart (layers) also differ in lightness, not hue alone. `theme-color` meta = `--bg` per scheme.

## 5. Theme mechanics

`:root` holds light tokens. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…dark…} }` and `:root[data-theme="dark"] {…dark…}`. A 2-line inline script in `<head>` sets `data-theme` from `localStorage` before first paint. The toggle flips `data-theme`, writes `localStorage.theme`, updates `aria-pressed`/`aria-label`, and dispatches `themechange` on `document` (the moon listens). `color-scheme` is set on `:root` per theme so form controls and scrollbars follow.

## 6. Behaviours (what "alive" means here)

| behaviour | mechanism | numbers |
|---|---|---|
| growth | each tree `<svg>` animates `transform: scaleY(0→1)` from its base | duration 10–22 s × (0.6 + h/500); delay 1–48 s + 5 s per layer |
| sway | inner `<g>` rotates ±`--amp` about the base, alternate, infinite | amp 0.3° (h>400) / 0.5° (h>200) / 0.8° (small) / 1.4° ferns / 1.0° grass; period 5–13 s + h/60 |
| gust | the whole `.forest` skews X about the ground line | 38 s cycle: 0→−1.6° at 66 %, −0.5° at 71 %, −1.1° at 75 %, 0 by 86 % |
| rain | 70 drops, 10–20 px, slant −14 px per fall, `translateY(100vh+80px)` | 1.4–2.6 s per pass, staggered 0–3 s, infinite; colour `--l1` at `--rain-op` |
| ridge | one path, `stroke-dasharray/offset` draw-on | 14 s |
| moon | fixed, right 20 %, top 22 px, 40 px, opacity .55, `translateX` drift | 24 px per hour, alternate |
| reduced motion | `.forest, .forest *, .moon { animation-duration: .01s; iteration-count: 1 }`, `.rain { display: none }` | instant fully-grown forest, no rain |

Rain is on when `wxRain()` says so (climatology, §02), moon when dark **and** `wxNight()`. Query overrides `?rain=on|off&moon=on|off&seed=N` are for QA and screenshots.

## 7. Stacking (why the forest is `z-index: -1`)

The forest is `position: fixed; inset: 0; z-index: -1`. Negative z paints after the root background but before in-flow blocks, so the text (static `<main>`) is above it with no z-index games — and the mobile toggle (`position: absolute` inside `.page`) can anchor to the page because `<main>` is not positioned. The one trap: a negative-z layer also paints **under `body`'s background** (backgrounds of in-flow blocks paint later). So the ground colour lives on `html`, and `body` is transparent. Keep it that way.

## 8. Fit-to-space (why the forest never hits the text)

`fitStand()` measures `window.innerHeight − main.bottom − 24` and sets `--fs = clamp(0.35, avail / 620, 1)` on `.stand`. `.stand` is `width: calc(100%/var(--fs)); left: calc((1 − 1/var(--fs)) * 50%); transform: scale(var(--fs))` from the bottom centre, so a scaled stand still spans the full width. 620 = tallest near tree (520) + max base (≈100). The giants (560–700 px) intentionally exceed the budget at opacity 0.12; `verify.mjs` ignores elements under 0.2 opacity when asserting "forest below text". Runs on load, resize (debounced 80 ms) and after fonts load.

## 9. Copy (verbatim)

- h1: `Adam K. Loghry` (rendered uppercase by CSS)
- role: `Senior Staff SRE & SRE Lead at Google Kubernetes Engine in Seattle`
- bio: `18+ years in infrastructure at Google (Ads, GCE, GKE) and Amazon (Linux, IAM, EC2 Network Security).`
- rows: `contact` → signal · email · bluesky · mastodon · linkedin; `projects` → github · 16384.dev · toys & experiments
- colophon: `built YYYY-MM-DD · <7-char hash>`
- toggle labels: `Switch to dark mode` / `Switch to light mode`; hammer: `Show build info` / `Hide build info`
