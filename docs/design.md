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
- **Density follows width (owner decision, 2026-11-10; changes handoff 02 "fixed counts").** The
  handoff's 291 elements are spread over the stand's layout width (`innerWidth / --fs`), which is
  ~1940px at the 1440x900 and 1920x1080 designs (~150 elements per 1000px) but 3840px on a 4K
  window (76 per 1000px). `Forest.astro` now fits first, then builds from a copy of
  `DEFAULT_CONFIG` whose layer counts are multiplied by `clamp(layoutWidth / 1950, 1, 3)`: never
  fewer than the handoff's counts, so phones are unchanged; a 3840x1100 window gets 561 elements
  (tall windows scale the stand up instead, see the next entry: 2560x1440 keeps 291, 4K gets 382).
  Wide-and-short windows whose stand is scaled down (1280x720, phone landscape) also gain up to a
  third. Rain sits outside the scaled stand, so its 70 drops scale by `clamp(innerWidth / 1440, 1, 3)`.
  The rain is topped up or trimmed to the new count on every fit, never restarted (drop i is the
  same whatever the count), so the sky does not empty on a resize.
  A resize that moves the density by more than 20% rebuilds the stand from the same seed; the
  stand's `--age` (seconds since load) is subtracted from every grow delay in `overrides.css`, so
  a rebuilt stand resumes where the page is instead of regrowing. `forest.js` is untouched
  (AC-REF-1). Same seed and same density still give the same stand; `?seed=` screenshots are
  comparable only at the same viewport. `AC-FOREST-6`, `AC-FOREST-7`, `AC-RAIN-3`.
- **Stand scales up on tall windows (owner request, 2026-11-10; changes the handoff `fitStand` cap
  of 1).** The handoff caps the stand's scale at `--fs = 1`, so on a 2560x1440 or 4K window the
  forest filled only the bottom third and left an empty band between the text and the treetops.
  `src/scripts/fit.ts` copies `fitStand` exactly (same 0.35 floor, same sink below the viewport,
  same `--fs`) but caps it at **1.5**, and `Forest.astro` calls it instead. 1.5 is roughly where
  2560x1440 fits on its own (1.54), so that size keeps the design's gap under the text. A 4K window
  still has room above the stand; higher caps made the strokes read heavy. Windows at or below
  1920x1080 fit below 1 and are unchanged (1440x900 stays 0.741). Density follows automatically:
  the layout width is `innerWidth / --fs`, so a scaled-up stand gets fewer extra trees.
  `AC-FOREST-9`. `AC-FOREST-6` resizes to 3840x1100, where `--fs` stays about 1. `AC-FOREST-4`
  screenshots the viewport clipped to the ridge, because a scaled stand overhangs the viewport by a
  fraction of a pixel and the element screenshot then came back blank.
- **Resize keeps the stand (owner request, 2026-11-10).** `buildForest` draws every layer from one
  seeded stream, so when a resize changed the density, a different count in one layer shifted every
  later random number and the whole stand reshuffled (201 of 291 elements moved going from 1440x900
  to 3840x1100). `src/scripts/stand.ts` exports `buildStand(stand, seed, cfg)`, which calls the
  unchanged `buildForest` once per layer with that layer alone (every other layer at `count: 0`, so
  it keeps its index, colour `--l{li}` and grow stagger) and a per-layer seed: murmur3 `fmix32` of
  the seed, plus `(li + 1) * 0x9e3779b9`, mixed again. Each layer's elements come from its own
  stream in order, so growing a count only appends and shrinking only drops from the end. Each call
  draws a ridge and only the first is kept. A given `?seed=` now yields a different stand than the
  handoff's reference screenshots; the same seed and density still give the same stand.
  `AC-FOREST-8`.
- **Gust sweeps left to right (owner request, 2026-11-10; changes handoff 02 sections 5 and 7).**
  The handoff's gust skews the whole `.forest` (38 s cycle, 6 s delay), which on a wide window
  reads as the picture tilting. `.forest` no longer animates. Each swaying tree (120px and up, not
  `.calm` or `.still`) leans on the individual `rotate` property to the same keyframe rhythm
  (`gust-lean`, up to 1.6 degrees, crowns to the right as with wind from the left). Its delay grows
  with its x position: `src/scripts/gust.ts` sets `--gx` = left% x window width / 800 px/s after
  each build, so the front crosses 1440px in 1.8 s and a 4K window in 4.8 s. `.rain` keeps the
  handoff's skew, positioned to fill `.forest` and delayed to mid-sweep. All gust delays subtract
  `--age`, so a resize rebuild keeps the wind's phase; the rain box is never rebuilt, so its skew
  does not. `--gx` is refreshed on every fit, since the crossing time follows the window width. Trees under 120px do not lean: their tips
  would move under 2px, and leaning every wrapper measured 2.4 to 2.7x the per-frame style work at
  3840 and 5120px wide (software rendering; not measured on a GPU). `AC-GUST-1`, `AC-GUST-2`.
- **Hidden tabs pause the looping motion (owner request, 2026-11-10).** `src/scripts/pause.ts`
  sets `.tab-hidden` on `#forest` and `#moon` at load and on every `visibilitychange` while the
  document is hidden. `overrides.css` then pauses only the infinite animations: sway and gust lean
  on the trees, the rain and its skew, the moon drift (and the crows, flakes and owl blink below).
  They repeat, so resuming mid-cycle is invisible. The one-shot grow-in and ridge reveal keep
  running, so a page opened in a background tab is fully grown when the reader arrives and the
  stand's `--age` stays accurate. The rule is `!important` because the gust rule's `animation`
  shorthand is more specific and would reset the play state. The saving is small: browsers already
  stop painting hidden tabs. `AC-PAUSE-1`.
- **Seattle touches (owner decision, 2026-11-10; replaces the fireflies and extends the snow idea
  in handoff 02 section 7).** `src/scripts/seattle.ts` adds six things beside the unmodified
  forest, all decided like the rain from the Seattle clock and seeded rolls, with no network:
  - *The mountain is out*: a wireframe Rainier (Little Tahoma on its left shoulder) behind every
    tree, summit above the far and mid layers, on days with no rain and no snow.
  - *Crows at dusk*: 5 to 9 small flapping crows (3 to 5 under 600px wide) cross right to left,
    repeating, from an hour before the month's mean sunset to 0.4 h after. They keep to the band
    above the name so nothing flaps behind the text. Hidden under reduced motion.
  - *Morning mist*: three bands of the page colour between the mid layer and the logs, from half
    an hour before sunrise to 10:30, on a date roll by month (0.6 in January, 0.05 in July).
  - *Night owl*: at Seattle night, one owl drawn inside the svg of one of the first five near
    conifers or snags, at the top of the trunk, so it grows and sways with the tree and stays on
    the same tree through a resize. It blinks.
  - *Sasquatch*: on about 1 visit in 200 (a roll on the visit seed), 35 s in, a faint figure
    walks 22% of the stand behind the mid trees over 48 s, following the ground line, fades out
    and is removed. Its x is a percentage of the stand, like the trees. Under reduced motion it
    stands still instead.
  - *Snow*: December to February, on a date roll of 1 in 12 (about 7 days a winter), slow flakes
    replace the rain and the mountain is hidden. An explicit `?rain=on` beats an automatic snow
    day, so rain checks hold all year.
  Day rolls use the date with a per-touch salt, so every visitor sees the same day and the rolls
  are independent of the rain roll. QA overrides: `?snow= ?mountain= ?crows= ?mist= ?owl=
  ?sasquatch=` (`on|off`). Stand-level pieces are re-added after each density rebuild and their
  fades subtract `--age`. Styles are in `overrides.css`. `AC-PNW-1` to `AC-PNW-5` (browser),
  `AC-PNW-6` (rolls over ten years of dates, in `verify-static.mjs`). `AC-FOREST-10` covers a
  resize that does not rebuild the stand.
- **Copy (owner, 2026-11-01).** 16384.dev is described only as a "self-hosted forge" (no provenance
  claim yet). akl.run is "toys & experiments" everywhere, matching the visible link text.
- **Role line (owner, 2026-11-11; overrides the role copy in handoff D12).** "Senior Staff SRE and
  SRE lead for GKE, based in Seattle" on the page, in `index.html.md` and in `llms.txt`. The
  GitHub profile README spells out Google Kubernetes Engine; the site uses the short form.
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
