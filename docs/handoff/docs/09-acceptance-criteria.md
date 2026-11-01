# 09 — Acceptance criteria

Two tiers. **Automated** criteria are implemented in `astro/scripts/verify.mjs` and must pass on `dist/` (`npm run build && npm run verify`). **Manual/live** criteria need the deployed site or external services. IDs are stable; reference them in commits and PRs.

Status at hand-off: all automated criteria pass (70 checks, 4 viewports). Manual criteria are unverified by definition.

## A. Automated (verify.mjs)

### Metadata
- **AC-META-1** These files exist in `dist/`: `robots.txt`, `humans.txt`, `llms.txt`, `index.html.md`, `agents.txt`, `agents.json`, `site.webmanifest`, `favicon.svg`, `og.png`, `sitemap-index.xml`, `_headers`, `.well-known/security.txt`, `.well-known/atproto-did`.
- **AC-META-2** `index.html` contains a JSON-LD block with `"@type":"Person"`.
- **AC-META-3** `index.html` has ≥ 3 `rel="me"` links.
- **AC-META-4** `<meta name="color-scheme" content="light dark">` present.
- **AC-META-5** `<link rel="alternate" type="text/markdown">` and `<link rel="describedby" href="/llms.txt">` present.

### Copy and links
- **AC-COPY-1** Name renders as `Adam K. Loghry` (uppercased by CSS).
- **AC-COPY-2** Bio contains `EC2 Network Security` (i.e. the current copy).
- **AC-NAV-1** All eight links present: `signal.me/#u/akl.07`, `mailto:akl@akl.io`, `bsky.app/profile/akl.dev`, `hachyderm.io/@akl`, `linkedin.com/in/adamloghry`, `github.com/adamloghry`, `16384.dev`, `akl.run`.
- **AC-NAV-2** No `/notes` link in rendered markup (writing row deferred). *Flip when /notes ships.*

### Per viewport — run at 1440×900 light, 1280×720 dark, 390×844 light, 390×844 dark, with `?seed=1107&rain=on&moon=on`
- **AC-JS-1** No uncaught page errors.
- **AC-FOREST-1** Stand built: > 250 forest elements.
- **AC-FOREST-2** Top of the forest (ignoring elements with opacity < 0.2, i.e. the giants) is at or below the bottom of `<main>` − 8 px, in the first viewport.
- **AC-FOREST-3** `.forest` is `position: fixed`.
- **AC-RAIN-1** With `rain=on`, exactly 70 drops.
- **AC-MOON-1** Moon displayed iff dark scheme (with `moon=on`).
- **AC-LAYOUT-1** No horizontal overflow (`scrollWidth ≤ clientWidth`).
- **AC-LAYOUT-2** (phone only) Toggle's top ≤ 12 px and right edge ≥ viewport − 12 px.
- **AC-A11Y-1** Toggle hit box ≥ 44×44.
- **AC-A11Y-2** Every row link's hit box ≥ 24 px tall.
- **AC-FOOT-1** `#foot-info` is `display: none` on load.
- **AC-FOOT-2** After clicking `#foot-btn`, `#foot-info` is visible.
- **AC-THEME-1** After clicking `#theme`, `html[data-theme]` is set and `localStorage.theme` is set.

### Motion and weather
- **AC-MOTION-1** With `prefers-reduced-motion: reduce`, `.rain` is `display: none`.
- **AC-RAIN-2** With no query override, drop count is 0 or 70 (climatology is all-or-nothing per day).

## B. Manual / live (deployed site)

### Behaviour (eyes on a real browser; use `?seed=1107` for reproducibility)
- **AC-LIVE-1** Trees grow from the ground over ~1 minute; skyline first, giants last; nothing pops in instantly (except under reduced motion).
- **AC-LIVE-2** Trees sway continuously with varied periods; a gust visibly leans the whole stand about every 38 s and the rain slants with it.
- **AC-LIVE-3** Scrolling moves the text; the forest stays put (desktop and phone).
- **AC-LIVE-4** Theme follows the OS with no override; the toggle overrides; reload keeps the override; clearing `localStorage.theme` returns to following the OS. No flash of wrong theme on reload.
- **AC-LIVE-5** At Seattle night, dark mode shows the crescent moon upper-right; in light mode it never shows.
- **AC-LIVE-6** Hovering or keyboard-focusing `email` reveals ` · akl@akl.io`.
- **AC-LIVE-7** Tab order: toggle → signal → email → bluesky → mastodon → linkedin → github → 16384.dev → toys → hammer. Focus ring visible on each.
- **AC-LIVE-8** Print preview: no forest, URLs shown after link text, colophon visible.
- **AC-LIVE-9** iOS Safari: forest sits under the text at load; rotating the phone re-fits.
- **AC-LIVE-10** Lighthouse (mobile): Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100.

### Metadata (curl / validators)
- **AC-LIVE-11** `curl -I https://akl.dev/` shows the security headers from `_headers` and a `Link: </llms.txt>; rel="describedby"` header.
- **AC-LIVE-12** `https://akl.dev/robots.txt`, `/sitemap-index.xml`, `/llms.txt`, `/index.html.md`, `/agents.txt`, `/agents.json`, `/humans.txt`, `/.well-known/security.txt` all return 200 with sensible content types (`text/plain`, `application/xml`, `text/markdown` or `text/plain`, `application/json`).
- **AC-LIVE-13** `https://validator.schema.org/` accepts the page's JSON-LD as a `Person`.
- **AC-LIVE-14** An OG debugger (e.g. opengraph.xyz) shows title, description, 1200×630 image.
- **AC-LIVE-15** `https://securityheaders.com` grade A or better.

### Domains and identity
- **AC-DOM-1** `https://www.akl.dev/x?y=1` → 301 → `https://akl.dev/x?y=1`.
- **AC-DOM-2** `https://akl.io/`, `https://www.akl.io/`, `https://adamloghry.com/`, `https://www.adamloghry.com/` → 301 → `https://akl.dev/` (path and query preserved).
- **AC-DOM-3** `dig MX akl.io` unchanged before/after; a test email to `akl@akl.io` arrives.
- **AC-DOM-4** `dig TXT _atproto.akl.dev` returns `did=did:plc:…`; Bluesky shows the handle `@akl.dev` verified.
- **AC-DOM-5** Mastodon profile field for `https://akl.dev` shows as verified (green).
- **AC-DOM-6** Google Search Console: `akl.dev` property verified, sitemap submitted, change-of-address from `akl.io` recorded.
- **AC-DOM-7** `https://akl.dev/.well-known/security.txt` `Expires` is in the future (and a reminder exists to renew it).

## C. Definition of done

A, all green on `dist/`; B, every item checked off by a human with the date next to it; `README.md` §5 "known gaps" updated to reflect anything still deferred.
