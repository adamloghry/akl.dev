# 06 — Accessibility and performance

## 1. What is in place (and verified by `verify.mjs` or screenshots)

| area | implementation | evidence |
|---|---|---|
| Landmarks | `<main>`, `<header>`, `<nav aria-label="Contact and projects">`, `<footer>`; single `<h1>` | markup |
| Decorative layers | forest, rain, moon: `aria-hidden="true"`, `pointer-events: none`; separators `aria-hidden` | markup |
| Theme toggle | real `<button>`, 44×44, `aria-label` flips with state, `aria-pressed`, visible `:focus-visible` ring (2 px currentColor, offset 3) | AC-A11Y-1, screenshot 09 |
| Hammer | `<button aria-expanded aria-controls="foot-info">`, label flips | AC-FOOT-1/2 |
| Links | ≥36 px hit boxes via inline-block padding (WCAG 2.5.8 target size ≥24) | AC-A11Y-2 |
| Email reveal | on `:hover` **and** `:focus-visible` (keyboard users get it too) | screenshot 08 |
| Contrast | text 15:1 light / 13:1 dark; muted 6.3:1 / 6.1:1; colophon no longer uses opacity (which had dropped it to 3.3:1) | tokens, §01 |
| Motion | `prefers-reduced-motion: reduce` → all forest animations jump to end, rain removed, moon static | AC-MOTION-1, screenshot 12 |
| Colour not sole cue | depth layers differ in lightness, not hue alone; the toggle is an icon + label, not a colour | design |
| Zoom / reflow | fluid layout, no fixed widths except the 680 px max; at 400 % zoom (≈360 px) rows wrap and the label column tightens | screenshot 03 |
| Print | forest/toggle hidden, link URLs printed after anchor text, colophon inline, white background | screenshot 13 |
| Language | `<html lang="en">` | markup |
| No horizontal overflow at 390 | | AC-LAYOUT-1 |

## 2. Known limitations

- The forest is purely decorative and conveys nothing, so there is no text alternative — correct per WCAG 1.1.1 (decorative).
- Rain crosses the text column at 0.22/0.30 opacity. It passes contrast (the text's own contrast is unaffected by what's behind it at that alpha) but a reader with attention sensitivity may prefer it off: reduced-motion removes it entirely, and `?rain=off` exists. If feedback says it's distracting, confine it (`.rain{top:45%}`) rather than dimming it.
- The gust skews the whole stand; under `prefers-reduced-motion` it is frozen. There is no separate "less motion" tier.

## 3. Checks to keep running

- `npm run verify` after every change (layout, a11y, behaviour, metadata).
- Lighthouse (Chrome DevTools) at hand-off on the built site: expect Performance ≈100, Accessibility 100, Best Practices 100, SEO 100. The only things that can drag performance are the fonts (preloaded via fontsource CSS; ~30 KB latin woff2 ×2) and the forest paint on first frame.
- axe DevTools or `@axe-core/playwright` once if you touch markup. There are no known violations.
- Real-device check on an iPhone with Safari: `position: fixed` + `100vh` behave; the toolbar collapse changes `innerHeight`, which triggers `fitStand` on resize — expected.

## 4. Performance budget

| metric | budget | at hand-off |
|---|---|---|
| HTML | < 12 KB | ~8 KB |
| JS (gzip) | < 6 KB | 3.9 KB |
| CSS | < 8 KB | ~5 KB (inlined by Astro when small) |
| fonts fetched | 2 files, < 60 KB | 2 × ~15–30 KB latin woff2 |
| requests on first load | ≤ 6 | html, css (if not inlined), js, 2 fonts, favicon |
| DOM nodes | < 1,000 | ~700 |
| LCP | < 1.0 s on 4G | text paints before the forest is built (script is deferred) |
| CLS | 0 | the forest is fixed and behind; fonts use metric-compatible fallback (fontsource) |
| long tasks | none > 50 ms | forest build 15–25 ms |

No third-party requests at all. If Cloudflare Web Analytics is enabled later, that adds one.
