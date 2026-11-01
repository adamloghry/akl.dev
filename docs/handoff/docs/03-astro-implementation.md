# 03 — Astro implementation

The `astro/` folder is a complete project. It builds and passes `verify.mjs` at hand-off. Astro 5, static output, no adapter (Cloudflare Pages serves `dist/` as plain files).

## 1. Layout

```
astro/
  astro.config.mjs        site: https://akl.dev, output static, @astrojs/sitemap
  package.json            astro, @astrojs/sitemap, @fontsource/ibm-plex-mono; dev: playwright
  src/
    layouts/Base.astro    <head>: meta, canonical, color-scheme, theme-color ×2, OG, icons, manifest,
                          sitemap link, llms.txt discovery links, rel=me ×3, theme-before-paint (is:inline), JSON-LD
    pages/index.astro     the page body (markup only)
    components/Forest.astro       containers + <script> that seeds and builds; QA query params
    components/ThemeToggle.astro  button + script; dispatches `themechange`
    components/Colophon.astro     hammer + build date/hash resolved in frontmatter at build time
    scripts/forest.js     the generator (framework-free ES module)
    styles/global.css     tokens + all styles
  public/                 copied verbatim to dist/ (see docs/05)
  scripts/og.mjs          render og.png from dist/ (Playwright)
  scripts/verify.mjs      acceptance checks against dist/ (Playwright)
```

## 2. Build-time values

`Colophon.astro` frontmatter runs at build:
- `built` = today's ISO date.
- `hash` = `process.env.CF_PAGES_COMMIT_SHA` (set by Cloudflare Pages) → else `git rev-parse --short HEAD` → else `dev`.

Phase 2: `<a href={`https://16384.dev/<repo>/commit/${hash}`}>` around the hash once the forge serves commit pages. Keep the text identical.

## 3. Scripts and bundling

Astro hoists component `<script>` blocks into one module per page (`dist/_astro/*.js`, ~9 KB, 3.9 KB gzip, `type="module"`, deferred). `forest.js` is imported, not inlined, so it stays a clean module for reuse. The theme script in `Base.astro` is `is:inline` on purpose — it must run before first paint to avoid a flash of the wrong theme.

Component scripts run once per page and use `getElementById`; there is exactly one of each component per page. If you ever render two Forests, switch to `data-*` attributes and `querySelectorAll`.

## 4. Fonts

`@fontsource/ibm-plex-mono` 400 and 500 are imported in `Base.astro`; Astro emits the `@font-face` rules and copies the `.woff2` files to `/_astro/` with hashed names (immutable cache via `_headers`). The fontsource import brings all subsets; if you want only latin, import `@fontsource/ibm-plex-mono/latin-400.css` and `latin-500.css` instead (saves ~150 KB of files that are never requested anyway — browsers only fetch the subset they need, so this is optional).

`fitStand()` re-runs after `document.fonts.ready` because the metric fallback may change `<main>`'s height by a line.

## 5. Commands

```
npm install
npm run dev          # http://localhost:4321  (?seed=1107&rain=on&moon=on for a fixed stand)
npm run build        # → dist/
npm run og           # regenerate public/og.png from dist/ (then rebuild to include it)
npm run verify       # acceptance checks against dist/ (exit 1 on failure)
```
`verify` and `og` need Chromium: `npx playwright install chromium` once.

## 6. Cloudflare Pages settings

- Framework preset: Astro. Build command `npm run build`. Output directory `dist`. Node 20+.
- Production branch: `main`. Preview deployments on PRs are fine; they get `*.pages.dev` URLs and the canonical still points at `akl.dev` (correct).
- Env vars: none required. `CF_PAGES_COMMIT_SHA` is provided automatically.

## 7. Adding the `writing` row later

In `index.astro` the row is present as an HTML comment. Uncomment and point at `/notes/` (or wherever). `verify.mjs` has a check (`AC-NAV-2`) that asserts there is **no** `/notes` link today; flip it to assert presence when you add the row. Astro content collections are the obvious way to do `/notes`; nothing on this page constrains that choice.
