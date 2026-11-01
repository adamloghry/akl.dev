# akl.dev — landing page hand-off

**Status:** design final · reference implementation verified · ready to implement
**Date:** 2026-10-31 (rev 2: projects domain is akl.run) · **Owner:** Adam K. Loghry (akl@akl.io)
**Target:** Astro 5 static site on Cloudflare Pages at `https://akl.dev`, with `akl.io` and `adamloghry.com` redirecting to it.

This README is the authority. Where any other file in this bundle disagrees with it, this README wins; where this README is silent, `reference/index.html` is the behavioural source of truth (it is the page, standalone, and it is what the screenshots were taken from after being ported into `astro/`).

---

## 0. What this is, in one paragraph

A one-page professional front door in the "seasoned engineering leader" register: monospace, label/value rows, no sales copy, no hero. Behind the text a wireframe Pacific-Northwest forest grows from the ground over about a minute, sways, gusts, and — on days the Seattle climatology says so — it rains. In dark mode at Seattle night a thin crescent moon hangs upper-right. The forest is **generated per visit from a seeded PRNG** (the owner wants every load to be a different stand) and is anchored to the viewport, so the text scrolls over a stationary wood. The page is light by default on light-OS, dark on dark-OS, with a sun/moon override that persists. It is accessible, printable, phone-first, and carries the full metadata set for a domain that will absorb two others.

---

## 1. Bundle map

```
README.md                      ← you are here (authority)
docs/
  01-design-spec.md            layout, type, colour tokens, copy, behaviours
  02-forest-generator.md       the algorithm: species, layers, timing, physics of "alive"
  03-astro-implementation.md   project layout, components, build-time values, fonts
  04-cloudflare-and-domains.md Pages deploy, DNS, 301s from akl.io / adamloghry.com, Bluesky handle, HSTS
  05-well-known-and-metadata.md robots, sitemap, humans, llms, agents, security.txt, JSON-LD, OG, manifest
  06-accessibility-performance.md what was checked, what to keep checking, budgets
  07-migration-from-akl-io.md  what to carry from the current site, what to retire, cutover order
  08-future-generators.md      how to port to a non-Astro generator (e.g. hollow) without losing anything
  09-acceptance-criteria.md    the testable list; `npm run verify` implements most of it
reference/
  index.html                   standalone, zero-dependency page: the behavioural spec
  forest.js                    the generator as an ES module (identical to astro/src/scripts/forest.js)
  theme.css                    the stylesheet (identical to astro/src/styles/global.css)
astro/                         a complete, building Astro 5 project (npm install && npm run build)
  src/{layouts,pages,components,scripts,styles}/
  public/                      robots, humans, llms, agents, manifest, icons, og, _headers, _redirects, .well-known/
  scripts/og.mjs               renders public/og.png from the built site
  scripts/verify.mjs           acceptance checks (Playwright) — 70 checks, all passing at hand-off
screenshots/                   16 PNGs from the built Astro site (see §4)
canvas-export/                 the two winning design-canvas artboards (W01 light, W02 dark), for provenance
```

---

## 2. Decisions that are settled (do not relitigate without the owner)

| # | Decision | Why |
|---|---|---|
| D1 | Layout **L07**: uppercase mono name, muted role line, one-sentence bio, two label/value rows (`contact`, `projects`). No `writing` row until `/notes` exists. | Chosen from 20 variants; terse, scans in 3 s, grows by adding rows. |
| D2 | Forest **F06 "Ridge"** model with F05's larger near trees: trees stand on a rolling ground line; seven depth layers + floor. | "Feels more real." |
| D3 | **Random seed per visit.** Not build-time rendered. | Owner explicitly likes the randomness. `?seed=N` exists for QA only. |
| D4 | Theme: **system default**, sun/moon override stored in `localStorage`, applied before first paint. | |
| D5 | **No network calls** for weather or time. Rain = Seattle monthly climatology seeded by the Seattle date. Moon = Seattle sunrise/sunset table, dark mode only. | Zero dependencies, zero failure modes, honest about being a model. |
| D6 | Forest is `position: fixed` behind the text; the text scrolls, the wood doesn't. | |
| D7 | Near trees must **never cross the text**: the stand scales to the space under `<main>` in the first viewport (`fitStand`). Only the three "giants" (opacity 0.12) may pass behind text. | "As long as it never distracts from the text." |
| D8 | Mobile only: theme toggle in the page's top-right corner. Desktop: beside the name. | |
| D9 | Build info (`built YYYY-MM-DD · <hash>`) collapsed behind a hammer icon **at every width**; click reveals. Scrolls with the page (it's a colophon, not chrome). Phase 2: hash links to the commit on 16384.dev. | |
| D10 | Label for the code row is **`projects`**; third entry is **`toys & experiments`** → akl.run. | |
| D11 | Name renders **ADAM K. LOGHRY**; `<title>` stays "Adam Loghry". | Matches current akl.io. |
| D12 | Copy (verbatim): role "Senior Staff SRE & SRE Lead at Google Kubernetes Engine in Seattle"; bio "18+ years in infrastructure at Google (Ads, GCE, GKE) and Amazon (Linux, IAM, EC2 Network Security)." | |
| D13 | Links: signal `https://signal.me/#u/akl.07`, email `akl@akl.io` (plain `mailto:`, address revealed on hover/focus; Cloudflare's email obfuscation is also fine), bluesky `@akl.dev`, mastodon `hachyderm.io/@akl`, linkedin `/in/adamloghry`, github `adamloghry`, `16384.dev`, `akl.run`. | |
| D14 | Fonts self-hosted (`@fontsource/ibm-plex-mono` 400/500). No Google Fonts request in production. | |
| D15 | Other projects and toys on the current akl.io move to **akl.run**, not here; its ASCII banner is retired. | |

---

## 3. How to use this bundle

**Implementer (human or agent):**
1. Read this README, then `docs/09-acceptance-criteria.md`.
2. `cd astro && npm install && npm run build && npm run verify` — it must pass before you change anything. (`verify` needs Playwright's Chromium: `npx playwright install chromium`.)
3. Make changes; keep `verify` green; add a check for anything new.
4. Deploy per `docs/04`. Then run the **manual** criteria in `docs/09` (DNS, redirects, Bluesky, Mastodon verification) — those can't run locally.

**Reviewer:** compare `screenshots/` to a deployed URL at the same viewports. Same seed: append `?seed=1107&rain=on&moon=on`.

**Future-generator author:** read `docs/08` first; everything you need to keep is in `reference/`.

---

## 4. Screenshots (all from the built Astro site, seed 1107)

| file | what it proves |
|---|---|
| `01-desktop-light.png` | 1440×900 light, rain on. Forest ends below the links. |
| `02-desktop-dark-night.png` | 1440×900 dark, rain + moon. |
| `03-phone-light.png` / `04-phone-dark-night.png` | 390×844. Toggle in the corner; label column tightened; forest scaled to ~0.45. |
| `05-phone-light-scrolled.png` | Scrolled 220 px: text moved, forest didn't. |
| `06`/`07-*-hammer-open.png` | Build line revealed, desktop and phone. |
| `08-desktop-light-email-hover.png` | Address reveals on hover. |
| `09-desktop-dark-focus-ring.png` | Keyboard focus ring on a link. |
| `10-laptop-1280x720-light.png` | The short-viewport case: stand scaled (~0.5) so it still clears the text. |
| `11-tablet-820x1180-dark.png` | Tablet. |
| `12-reduced-motion-light.png` | `prefers-reduced-motion`: fully grown, no rain. |
| `13-print-emulation.png` | Print: no forest, URLs after link text, colophon inline. |
| `14-dry-day-no-rain-light.png` | What a dry day looks like. |
| `15-mid-growth-t+8s.png` | ~8 s in: most trees haven't started; growth is staggered to ~50 s. |
| `16-og-image-1200x630.png` | `public/og.png` as generated by `scripts/og.mjs`. |

---

## 5. Known gaps and deliberate deferrals

- ~~**`/.well-known/atproto-did`** holds a placeholder.~~ **Closed:** holds the real `did:plc:u2hotgrxdf5rr3zqjubs2wsb` (AC-META-6).
- **Colophon hash is not a link yet** — Phase 2 when 16384.dev serves commit pages.
- **No `writing` row** — the markup is present as an HTML comment in `index.astro`; uncomment when `/notes` ships (`docs/07` §4).
- ~~**CSP uses `'unsafe-inline'`**.~~ **Closed:** strict CSP with per-build SHA-256 script hashes (`integrations/csp-hashes.mjs`); no `'unsafe-inline'`.
- ~~**`webfinger`** for `akl@akl.dev` → hachyderm is not implemented.~~ **Closed (pending live check):** a `_redirects` rule handles it; verify AC-LIVE-16 after deploy.
- ~~**Latin-only fonts.**~~ **Closed:** only latin 400/500 woff/woff2 are emitted (AC-PERF-1).
- **OG image** is a static PNG regenerated by `npm run og`; it is not per-visit random (it can't be).
- Gust is a whole-stand skew, not a left-to-right sweep. Good enough; `docs/02` §7 describes the upgrade if wanted.

---

## 6. Changelog of the design session (for provenance)

20 directions → L07 chosen → forest explorations (plotter / depth / stand / night / sketch / ridge / succession / canopy) → generator v2 (six species, understory, skyline) → v3 (aerial-perspective palettes, tinted grounds, floor) → winner W01/W02 → copy + links → gusts, climatology rain, night moon, colophon → mobile/a11y pass (fit-to-space, 44 px targets, focus rings, landmarks, print) → fixed forest, corner toggle, hammer → four-viewport verification → this bundle.
