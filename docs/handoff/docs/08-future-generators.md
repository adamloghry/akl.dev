# 08 — Porting to another generator (hollow or anything else)

The page has almost no framework surface. This is the inventory of what Astro does for it, so a different generator can do the same, and what is framework-free so it can be copied as-is.

## 1. Framework-free (copy verbatim)

| asset | where | notes |
|---|---|---|
| the page markup | `reference/index.html` `<body>` | plain HTML; the only "template variables" are the two colophon values |
| the stylesheet | `reference/theme.css` | plain CSS, custom properties, no preprocessor |
| the generator | `reference/forest.js` | ES module, no imports; also runs as a classic script if you wrap it (see `reference/index.html`, which inlines an IIFE version) |
| the three behaviour scripts | theme toggle, colophon disclosure, forest mount — each < 25 lines, in `reference/index.html` | |
| the before-paint theme script | 2 lines, must be inline in `<head>` | |
| `public/*` | all static | sitemap excepted (see §2) |

So a port is: emit this HTML with (a) `<head>` metadata, (b) font `@font-face` + files, (c) `built`/`hash` substituted, (d) a sitemap. That is the entire framework-dependent surface.

## 2. What Astro currently provides

| concern | Astro mechanism | replacement in a custom generator |
|---|---|---|
| `built` date, `hash` | component frontmatter at build (`process.env.CF_PAGES_COMMIT_SHA` → `git rev-parse`) | any template variable; in a content-addressed generator the natural value is **the output's own hash** (see §4) |
| fonts | `@fontsource/ibm-plex-mono` → `@font-face` CSS + hashed `.woff2` in `/_astro/` | vendor the two `.woff2` (latin 400/500, ~30 KB each) and write the two `@font-face` rules by hand; `font-display: swap`; preload them |
| CSS/JS bundling, hashing | Vite | not needed: one CSS file, one JS module; hash them yourself for immutable caching or inline both (≈14 KB total) |
| sitemap | `@astrojs/sitemap` | 12 lines of XML; one URL today |
| canonical / per-page meta | layout props | template |
| `is:inline` vs bundled scripts | Astro | just put the 2-line theme script inline and the rest in `<script type="module">` |
| `/notes` (future) | content collections, RSS integration | the generator's own content model; keep the `<url>.md` twin convention from llms.txt |

## 3. Invariants to preserve in any port (these are design decisions, not Astro artefacts)

1. Theme script runs **before first paint**, inline, in `<head>`.
2. Background colour on `html`, not `body` (negative-z forest paints under body backgrounds).
3. `<main>` is **not** positioned; forest is `position: fixed; z-index: -1`.
4. `fitStand()` runs after load, on resize (debounced), and after fonts load.
5. Per-visit random seed; `?seed`, `?rain`, `?moon` query overrides kept for QA.
6. No network calls from the page except its own assets.
7. `prefers-reduced-motion` handled in CSS, not JS.
8. The colophon text format `built YYYY-MM-DD · <hash>` and its collapsed-by-default disclosure.
9. All metadata files in docs/05, including the llms.txt discovery `<link>`s and the `Link:` header.

## 4. Notes specific to a content-addressed generator (hollow)

- The colophon hash is a natural fit: emit the **content hash of the built page** (or the Merkle root of the site) rather than the git SHA. Keep it 7+ chars, same visual width. Document which it is in `humans.txt`.
- Per-visit randomness is *runtime*, so content-addressing is unaffected: the built artifact is deterministic; only the browser's seed varies. If you ever want the build to be *fully* reproducible including the OG image, `og.mjs` already uses a fixed seed (1107).
- The two inline scripts (theme, JSON-LD) are byte-stable → CSP hashes can be computed at build and emitted in a `_headers` equivalent.
- If the generator renders through Rust and you want the forest server-side for `<noscript>` users, port `forest.js` 1:1 (it is pure functions over a PRNG and string concatenation; `mulberry32` is trivial in Rust) and emit a static `<svg>` of layers 0–1 as a no-JS fallback. Today, no-JS users get the text and no forest, which is acceptable.
- Nix: the only build inputs are Node (or nothing, for a hand-rolled generator), the two font files, and Playwright for `og`/`verify` (optional, CI-only).

## 5. Things that would be nice to carry into the generator's model

- A "page family" concept: landing page vs. note page share `<head>`, tokens, theme script, colophon; notes add a reading column. Keep the tokens file as the single source for both.
- The markdown twin (`<url>.md`) as a first-class output of every HTML page, not an afterthought.
- The acceptance checks in `verify.mjs` are generator-agnostic (they run against a directory of files via a tiny static server). Keep running them.
