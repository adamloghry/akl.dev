# AGENTS.md

Landing page at https://akl.dev. Astro 7 static site (SSG), one page plus a
404, deployed to Cloudflare Pages. `npm run build` (or `nix build`) produces
`dist/`; there is no server-side runtime. The visual and behavioural authority
is `docs/handoff/README.md` (decisions D1-D15 are settled; do not change copy,
links, tokens, layout or forest behaviour without the owner).

## Layout

- `src/pages/index.astro` - the page. `src/pages/404.astro` - the 404.
- `src/layouts/Base.astro` - head, meta, JSON-LD, theme-before-paint script,
  self-hosted IBM Plex Mono (latin 400/500 only) via `@fontsource`.
- `src/components/` - `Forest.astro`, `ThemeToggle.astro`, `Colophon.astro`.
- `src/scripts/forest.js` - the forest, rain, moon and wind. Byte-identical to
  `docs/handoff/reference/forest.js`; do not edit or reformat.
- `src/styles/global.css` - the design. Byte-identical to
  `docs/handoff/reference/theme.css`; do not edit or reformat.
- `src/components/Forest.astro` also owns density: it scales the layer and rain
  counts with width by passing a derived config to `forest.js`, and rebuilds
  the stand on a large resize (`docs/design.md` section 3).
- `src/scripts/{fit,stand,gust,pause}.ts` - owner deltas that wrap the
  unmodified `forest.js`: the taller fit cap, per-layer seeding (so a resize
  does not reshuffle trees), the left-to-right gust delays, and pausing loops in
  hidden tabs. New forest behaviour goes in a module like these, not in
  `forest.js`.
- `src/scripts/seattle.ts` - the Seattle touches: Rainier on dry days, crows
  at dusk, morning mist, a night owl, a rare sasquatch, rare winter snow. Each
  has a `?name=on|off` override (`docs/design.md` section 3).
- `src/styles/overrides.css` - owner-approved CSS deltas from the handoff
  (the ridge draw-on, the stand's `--age`, the gust, pausing, the Seattle
  touches). Imported after `global.css`; a correction to the design goes here, with a note in `docs/design.md` and a check in `verify.mjs`.
- `public/` - served verbatim: `_headers` (security headers and CSP),
  `_redirects` (webfinger handoff to hachyderm), `index.html.md` (markdown twin
  of the page), `llms.txt`, `agents.txt`, `agents.json`, `humans.txt`,
  `robots.txt`, `site.webmanifest`, favicons, `og.png`, and `.well-known/`
  (`atproto-did`, `security.txt`).
- `integrations/csp-hashes.mjs` - build hook: hashes every inline executable
  `<script>` in `dist/**/*.html` and writes the hashes into `dist/_headers`.
- `scripts/verify-static.mjs` - no-browser checks (AC-META-6, AC-PERF-1,
  AC-COPY-3, AC-NAV-3). `scripts/verify.mjs` - Playwright acceptance suite
  (includes AC-CSP-*). `scripts/og.mjs` - regenerates `public/og.png`
  (`npm run og`). `scripts/profile-forest.mjs` - writes the GitHub profile README banner
  (`forest.svg`, `forest-dark.svg`) from `forest.js` and the theme tokens (`npm run profile-forest`).
- `wrangler.json`, `flake.nix`, `flake.lock`, `nix/treefmt.nix`, `.envrc`, `.node-version`,
  `renovate.json`, `.github/workflows/{nix,verify}.yml`.
- `docs/handoff/` - the design handoff (README, docs 01-09, `reference/`). Do
  not edit `docs/` or `reference/` (only README section 5 tracks known gaps).
  `docs/runbook.md` - the owner's deploy and cutover checklist.
  `docs/design.md` - the design spec (deltas from the handoff).
- `.superpowers/` and `tmp/` are scratch (agent notes, design-tool material).
  They are never shipped and never committed. `.claude/worktrees/` is gitignored
  too; never `git add` the `.claude/` directory.
- `dist/` - build output (gitignored).

## Dev environment

Nix flake using devenv; plain Node also works.

- `nix develop --impure` enters the shell (`--impure` is needed by devenv).
  `.envrc` runs `use flake . --impure`, so `direnv allow` does it on `cd`.
- Shell helpers: `dev`, `build`, `verify` wrap `npm run dev|build|verify`.
- Without nix: `npm ci && npm run dev` with Node `>=22.23.4` (`engines`).
  `.node-version` is `26` and the flake uses the same major.
- Playwright browsers come from Nix (`PLAYWRIGHT_BROWSERS_PATH` is set by the
  shell; no browser download). So the npm `playwright` version is pinned
  **exactly** (no caret) to nixpkgs `playwright-driver.version` (currently
  1.64.1). Renovate is disabled for it in `renovate.json`. After any
  `flake.lock` update, re-pin it with `npm run pin-playwright` (needs nix; see `docs/runbook.md` section 9).
  `checks.playwright-pin` enforces this: a Renovate `flake.lock` PR that moves
  `playwright-driver` now fails `nix.yml`; fix it by running `npm run pin-playwright` on that PR's branch and committing the result.
- `nix build` builds `dist/` into `result/` via `importNpmLock` against
  `package-lock.json`.
- `nix flake check --impure --no-update-lock-file` runs `build`, `astro-check`
  and `treefmt`. The devShell installs a pre-commit hook that runs `treefmt`;
  if a commit aborts with "files were modified by this hook", re-`git add` and
  commit again. treefmt formats json/yaml/nix only, never shipped bytes.
- TypeScript stays on `^6.0.3` (`@astrojs/check` peer range). All npm packages
  are `devDependencies`.

## Verify

`npm run verify` = `verify-static.mjs` then `verify.mjs`; run `npm run build`
first. Expect `static checks passed` and `all checks passed`. `npm run check`
is `astro check` (expect 0 errors). Checks are keyed by acceptance-criterion ids
(AC-...) from the spec. Anything new you add to the page gets a check, in
`verify-static.mjs` if it needs no browser, else in `verify.mjs`.

## CSP

Headers live in `public/_headers`, never in `<meta http-equiv>`. There is no
`'unsafe-inline'` anywhere.

- `script-src` carries the quoted placeholder token `'inline-script-hashes'`.
  That token appears only on the CSP line of `public/_headers`. Every build
  replaces it with the SHA-256 hashes of the inline scripts (theme bootstrap,
  ThemeToggle, Colophon). Hashes are regenerated each build; never hand-edit or
  commit them. The build fails if the token is missing or survives.
- JSON-LD is a data block and is not hashed.
- No `<style>` and no `style=""` in markup (`style-src 'self'`; `AC-CSP-3`
  checks the emitted HTML). CSSOM writes from JS (`element.style.x = ...`, as
  forest.js does) are fine.
- Adding a fetch target needs an explicit `connect-src`; the page makes no
  third-party requests.

## Deploy

- Production is a Cloudflare **Worker serving static assets** (Workers Builds
  Git integration, Worker `akl-dev`), not a Pages project, though `_headers`
  and `_redirects` work the same. It runs `npm clean-install && npm run build`
  outside nix, then `npx wrangler deploy` on `trunk` and `npx wrangler preview`
  on any other branch. Its Node comes from `.node-version`; keep it in step
  with the flake's Node major. Never push from an agent unless the owner asks.
- `wrangler.json` is that Worker's config: `name` must stay `akl-dev`,
  `assets.directory` is `./dist`, `not_found_handling: "404-page"` serves
  `404.html` for unknown paths, and the `previews` block (empty is fine) is
  required by `wrangler preview`; without it every branch build fails at the
  deploy step (`AC-DEPLOY-1`). `docs/runbook.md` section 2 and
  `nix run .#deploy` still describe Pages and predate this.
- `nix run .#deploy` uploads `result/` (or `dist/`) with wrangler, bypassing the
  Git integration. Needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_PROJECT_NAME`. It passes `--branch` = the current git branch, so
  only `trunk` is production; from any other branch it creates a Pages preview.
- Cutover, DNS, identity, old-domain redirects and recurring chores are in
  `docs/runbook.md`.

## Conventions

- Copy changes must also update `public/index.html.md` (AC-COPY-3). Keep
  `llms.txt` and `humans.txt` consistent.
- `public/.well-known/security.txt` `Expires` must stay under a year ahead;
  renew before 2027-09-01.
- Bluesky is linked by DID (`bsky.app/profile/did:plc:u2hotgrxdf5rr3zqjubs2wsb`)
  in the page, `rel="me"`, JSON-LD and `index.html.md`, because the handle is
  still `@akl.io` and switching to `@akl.dev` is optional. Don't "fix" these
  links back to a handle URL; only `llms.txt` names the handle.
- `atproto-did` holds the real `did:plc`; webfinger for `akl@akl.dev` is a
  `_redirects` rule to hachyderm (live check AC-LIVE-16 pending deploy).
