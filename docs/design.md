# akl.dev landing page — implementation design

**Date:** 2026-11-01 · **Status:** approved by owner

## Authority

The Claude Design handoff (`tmp/akl-dev-landing-handoff/`, committed as text under
`docs/handoff/`) is the spec for pixels, behaviour, copy, metadata and acceptance
criteria. Its README §2 decisions D1–D15 are settled. This document records only
the deltas from that handoff; where they conflict, this document wins.

## Deltas

### 1. Repo shape
- The handoff's `astro/` project is promoted to the repo root.
- `docs/handoff/` holds the handoff README, `docs/01–09` and `reference/{index.html,forest.js,theme.css}`
  (text only; `reference/` is the byte-identity anchor for `forest.js`/`global.css`). Screenshots,
  the zip and canvas exports stay in gitignored `tmp/` as the visual baseline.
- `AGENTS.md` is the agent/maintainer guide; `CLAUDE.md` contains `See [AGENTS.md](AGENTS.md).`
  (akl.io convention).

### 2. Toolchain (akl.io parity, without golden output)
- Astro **7.4.x** (handoff targeted 5). `@astrojs/sitemap` 3.7.x, `@astrojs/check` 0.9.x,
  TypeScript **6.x** (`@astrojs/check` peer range is `^5 || ^6`; TS 7 not yet supported),
  Playwright 1.64.x, `@fontsource/ibm-plex-mono` 5.3.x. All build-time deps.
- Node: `.node-version` = **26** (Active LTS since 2026-10-28) and the flake's
  `nodejs_26`, if nixpkgs-unstable provides it; otherwise 24 in both places.
  `engines.node` = `>=22.23.4` (Astro 7.4's floor).
- Nix flake (flake-parts + devenv + treefmt-nix), modelled on `../akl.io/flake.nix` minus
  `golden.nix`, the OG/image apps and the map tooling. Checks: `build`, `astro-check`, `treefmt`.
  Keep the `deploy` app (wrangler direct upload) for CI-less deploys.
- `renovate.json` copied from akl.io.
- GitHub Actions: `nix.yml` (as akl.io) and `verify.yml` (Node from `.node-version`,
  `npm ci`, `npm run build`, `npx playwright install --with-deps chromium`, `npm run verify`).
- Production branch **`trunk`**. Remote `github.com/adamloghry/akl.dev` (public,
  created by the owner). Cloudflare Pages Git integration builds with
  `npm clean-install && npm run build`, output `dist`.
- No golden snapshot: the colophon embeds build date + commit hash, so `index.html` is
  not byte-stable by design.

### 3. Hardening (closing handoff README §5 gaps)
- **Strict CSP.** `_headers` drops `'unsafe-inline'`:
  `script-src 'self' 'sha256-<theme-before-paint>'; style-src 'self'`. Requires
  `build.inlineStylesheets: 'never'`, no `style="…"` attributes or `<style>` in emitted HTML,
  and every inline executable script hashed: Astro inlines the small ThemeToggle/Colophon
  module scripts, so all inline executable scripts (theme-before-paint plus those two) are
  hashed - 3 hashes today. Runtime CSSOM writes in `forest.js` (`el.style.cssText`, `setProperty`) are
  not governed by `style-src` and stay. JSON-LD is a data block, not subject to `script-src`.
  - `AC-CSP-1`: verify recomputes SHA-256 of every inline executable script in
    `dist/**/*.html` and fails unless each hash appears in `_headers`' `script-src`.
  - `AC-CSP-2`: serve `dist/` with the CSP from `_headers` applied as a response header,
    load the page, and assert zero `securitypolicyviolation` events.
- **atproto-did.** Fill `public/.well-known/atproto-did` with the owner's real DID
  (resolved via the public `com.atproto.identity.resolveHandle?handle=akl.io`).
  `AC-META-6`: file matches `^did:plc:[a-z2-7]{24}$`.
- **Bluesky by DID (owner decision, 2026-11-01; overrides handoff D13 `@akl.dev`).** The handle is
  still `@akl.io`, and moving to `@akl.dev` is optional, so every Bluesky link uses
  `https://bsky.app/profile/did:plc:u2hotgrxdf5rr3zqjubs2wsb`, which resolves under any handle.
  `llms.txt` names the handle `@akl.io`. `AC-NAV-1` checks the DID URL.
- **No email reveal (owner decision, 2026-11-01; overrides handoff D13 "address revealed on
  hover/focus").** The reveal shifted the contact row on hover, so the `email` link carries no
  `.addr` span; it stays a plain `mailto:`. The `.mail .addr` rules in `global.css` stay (AC-REF-1)
  and match nothing. `AC-NAV-4`: no `class="addr"` in `dist/index.html`.
- **Ridge draw-on by clip-path (owner request, 2026-11-10; corrects handoff 01 "ridge: one path,
  `stroke-dasharray/offset` draw-on").** The ridge path has `vector-effect="non-scaling-stroke"`,
  so browsers measure its dashes in screen px, while `pathLength="1"` still normalises against the
  viewBox length (~1302 units). The line therefore stopped ~1300px in: 67% of a 1440px window, 51%
  of 2560px, in Chromium and Firefox alike. `src/styles/overrides.css` (imported after `global.css`
  in `Base.astro`) cancels the dash animation and reveals `.ridge` with an animated
  `clip-path: inset()` instead: same 14 s ease-out, left to right, independent of width.
  `global.css` and `forest.js` stay byte-identical (AC-REF-1); the dash rules and `pathLength` are
  inert. `AC-FOREST-4`: the finished ridge inks >98% of columns at 1440, 2560 and 3840px wide.
  `AC-FOREST-5`: the reveal is in progress half a second after load.
- **Copy (owner, 2026-11-01).** 16384.dev is described only as a "self-hosted forge" (no provenance
  claim yet). akl.run is "toys & experiments" everywhere, matching the visible link text.
- **Fonts.** Import only `@fontsource/ibm-plex-mono/latin-400.css` and `latin-500.css`.
  `AC-PERF-1`: no non-latin `ibm-plex-mono-*.woff2` in `dist/`.
- **webfinger.** `public/_redirects`:
  `/.well-known/webfinger  https://hachyderm.io/.well-known/webfinger?resource=acct:akl@hachyderm.io  302`.
  Live criterion `AC-LIVE-16`: `curl -sI 'https://akl.dev/.well-known/webfinger?resource=acct:akl@akl.dev'`
  → 302 whose `Location` carries exactly one `resource=acct:akl@hachyderm.io`. If Pages appends
  the original query and duplicates `resource`, replace the line with a zone Redirect Rule
  (runbook fallback).
- **Markdown twin sync.** `AC-COPY-3`: role line, bio and all eight link URLs in
  `index.astro` also appear in `public/index.html.md`.

### 4. Verification
- All 70 handoff checks stay green after the Astro 7 upgrade, plus the new checks above.
- Visual parity: screenshots from the new build at the handoff's viewports with
  `?seed=1107&rain=on&moon=on` are compared by eye against `tmp/…/screenshots/`.
- `astro check` clean; `nix flake check --impure` green.

### 5. Owner runbook (not automatable from here)
`docs/runbook.md`: create GitHub repo and push; connect Cloudflare Pages (production
branch `trunk`); zone settings (docs/handoff/04 §2); custom domains; `www`/akl.io/adamloghry.com
301 rules; Bluesky DNS TXT + handle switch; Mastodon field; Google Search Console; security.txt
renewal reminder; the manual `AC-LIVE-*` / `AC-DOM-*` checklist with date columns.

## Out of scope
`/notes`, the colophon commit link (Phase 2), akl.run content, per-visit OG images.
