# akl.dev owner runbook

Manual steps the owner does by hand: GitHub, Cloudflare Pages and DNS, Bluesky, Mastodon, Google Search Console. Work top to bottom. Tick each box and write the date next to it. The `AC-*` ids refer to `docs/handoff/docs/09-acceptance-criteria.md` §B.

## 1. GitHub

- [ ] `gh auth switch -u adamloghry` (gh's active account may be a different one). date: ____
- [ ] Create the **public** repo `adamloghry/akl.dev` (empty: no README, no .gitignore, no licence): `gh repo create adamloghry/akl.dev --public`. date: ____
- [ ] `origin` is already set to `https://github.com/adamloghry/akl.dev.git` in the local checkout (check with `git remote -v`); `git push -u origin trunk`. date: ____
- [ ] Repo Settings → Branches → default branch set to `trunk`. date: ____
- [ ] Install the Renovate GitHub app on `adamloghry/akl.dev`. date: ____

## 2. Cloudflare Pages

- [ ] Create a Pages project from the GitHub repo `adamloghry/akl.dev`. date: ____
- [ ] Preset `Astro`; build command `npm clean-install && npm run build`; build output directory `dist`. date: ____
- [ ] Production branch: **`trunk`**. date: ____
- [ ] Node version comes from `.node-version` (no env var needed). date: ____
- [ ] Confirm the first build log shows the Node major from `.node-version`, and a line `… inline script hash(es) written to _headers` from `csp-hashes`. If the build image cannot install Node 26, set Pages env `NODE_VERSION=24` (or move `.node-version` and the flake to 24, as the spec allows), rebuild, and confirm the same log line. date: ____

## 3. akl.dev zone settings (Cloudflare dashboard)

Zone `akl.dev` → SSL/TLS, Speed, Caching, Scrape Shield, Bots and Email settings as listed. Values from `docs/handoff/docs/04-cloudflare-and-domains.md` §2.

- [ ] SSL/TLS mode: **Full (strict)**. Pages has a valid origin cert. date: ____
- [ ] Always Use HTTPS: **on**. Belt and braces; `.dev` is HSTS-preloaded in browsers anyway. date: ____
- [ ] HSTS: **on**, `max-age=31536000; includeSubDomains` (preload not needed: whole `.dev` TLD is preloaded). date: ____
- [ ] Minimum TLS: **1.2**. date: ____
- [ ] Brotli: **on** (default). date: ____
- [ ] Early Hints: **on**; harmless. No preload `Link` headers are emitted today, so nothing is hinted. date: ____
- [ ] Rocket Loader: **off**. It rewrites/defers scripts and would break the before-paint theme script and the module import. date: ____
- [ ] Auto Minify: **n/a**. Cloudflare removed Auto Minify in Aug 2024; nothing to do. date: ____
- [ ] Email Address Obfuscation: **off**. It injects `/cdn-cgi/scripts/…/email-decode.min.js`, an extra script the strict CSP does allow (`'self'`), but it rewrites the mailto and breaks `AC-NAV-1` live. (Handoff 04 §2 allowed either; this runbook fixes it to off.) date: ____
- [ ] Web Analytics / Browser Insights: **off**. If turned on instead, add `https://static.cloudflareinsights.com` to `script-src` and `connect-src` in the `_headers` CSP. date: ____
- [ ] Bot Fight Mode: **off**. It injects a challenge script into HTML; it interferes with CSP and with agents reading llms.txt. date: ____

## 4. Custom domains

- [ ] Pages project → Custom domains → add `akl.dev`. date: ____
- [ ] Pages project → Custom domains → add `www.akl.dev`. Cloudflare writes the proxied CNAME records. date: ____
- [ ] Verify `https://<project>.pages.dev/` and `https://akl.dev/` both serve the page; then `https://akl.dev/.well-known/security.txt` returns `text/plain`. date: ____
- [ ] Zone `akl.dev` → Rules → Redirect Rules → Create → Dynamic. Name: `redirect www to apex`. When: `(http.host eq "www.akl.dev")`. Expression: `concat("https://akl.dev", http.request.uri.path)`. Status `301`. Preserve query string: **on**. date: ____
- [ ] AC-DOM-1: `https://www.akl.dev/x?y=1` → 301 → `https://akl.dev/x?y=1`. date: ____

Note: the `www.akl.dev` rule is the same shape as the old-domain rules in §7 and preserves the query string, which the check above verifies.

## 5. Live checks on akl.dev

Run against the deployed site `https://akl.dev`. Use `?seed=1107` for reproducibility on the behaviour checks.

### Behaviour (real browser)

- [ ] AC-LIVE-1: Trees grow from the ground over ~1 minute; skyline first, giants last; nothing pops in instantly (except under reduced motion). The ground line draws on left to right over ~14 s and ends at the right edge of the window, including on the widest monitor to hand. date: ____
- [ ] AC-LIVE-2: Trees sway continuously with varied periods; a gust visibly leans the whole stand about every 38 s and the rain slants with it. date: ____
- [ ] AC-LIVE-2b: Seattle touches, forced with `?rain=off&mountain=on&crows=on&mist=on&owl=on&sasquatch=on` (then `?snow=on`): the mountain sits behind the trees, crows cross the sky, mist drifts through the mid trees, an owl blinks on a near treetop, a figure walks behind the mid trees about 35 s in; with `?snow=on` flakes fall and there is no rain or mountain. date: ____
- [ ] AC-LIVE-3: Scrolling moves the text; the forest stays put (desktop and phone). date: ____
- [ ] AC-LIVE-4: Theme follows the OS with no override; the toggle overrides; reload keeps the override; clearing `localStorage.theme` returns to following the OS. No flash of wrong theme on reload. date: ____
- [ ] AC-LIVE-5: At Seattle night, dark mode shows the crescent moon upper-right; in light mode it never shows. date: ____
- [ ] AC-LIVE-6: Hovering or keyboard-focusing `email` does not reveal the address or shift the contact row; the link opens a `mailto:akl@akl.io` (owner override of D13, `docs/design.md` section 3). date: ____
- [ ] AC-LIVE-7: Tab order: toggle → signal → email → bluesky → mastodon → linkedin → github → 16384.dev → toys → hammer. Focus ring visible on each. date: ____
- [ ] AC-LIVE-8: Print preview: no forest, URLs shown after link text, colophon visible. date: ____
- [ ] AC-LIVE-9: iOS Safari: forest sits under the text at load; rotating the phone re-fits. date: ____
- [ ] AC-LIVE-10: Lighthouse (mobile): Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100. date: ____

### Metadata (curl and validators)

- [ ] AC-LIVE-11: `curl -I https://akl.dev/` shows the security headers from `_headers` and a `Link: </llms.txt>; rel="describedby"` header. date: ____
- [ ] AC-LIVE-12: `https://akl.dev/robots.txt`, `/sitemap-index.xml`, `/llms.txt`, `/index.html.md`, `/agents.txt`, `/agents.json`, `/humans.txt`, `/.well-known/security.txt` all return 200 with sensible content types (`text/plain`, `application/xml`, `text/markdown` or `text/plain`, `application/json`). date: ____
- [ ] `curl -I https://akl.dev/.well-known/atproto-did` shows `content-type: text/plain`. date: ____
- [ ] AC-LIVE-13: `https://validator.schema.org/` accepts the page's JSON-LD as a `Person`. date: ____
- [ ] AC-LIVE-14: An OG debugger (e.g. opengraph.xyz) shows title, description, 1200×630 image. date: ____
- [ ] AC-LIVE-15: `https://securityheaders.com` grade A or better. date: ____
- [ ] AC-LIVE-16 (webfinger): `curl -sI 'https://akl.dev/.well-known/webfinger?resource=acct:akl@akl.dev'` → 302 whose `Location` carries exactly one `resource=acct:akl@hachyderm.io`. date: ____
- [ ] Webfinger fallback, only if the Location duplicates `resource`: delete the `/.well-known/webfinger` line from `public/_redirects` and replace it with a zone Redirect Rule on `akl.dev`: path eq `"/.well-known/webfinger"` → static URL `https://hachyderm.io/.well-known/webfinger?resource=acct:akl@hachyderm.io`, status `302`, preserve query string **off**. Re-run the curl above. date: ____

## 6. Identity (Bluesky and Mastodon)

The site links Bluesky by DID (`bsky.app/profile/did:plc:u2hotgrxdf5rr3zqjubs2wsb`), which resolves whatever the handle is, and `llms.txt` names the handle `@akl.io`. **Switching the handle to `@akl.dev` is optional.** If you skip it, leave the four Bluesky items below undated. If you do switch, also change `Bluesky @akl.io` → `@akl.dev` in `public/llms.txt`; the links need no change. `/.well-known/atproto-did` ships either way, and it's harmless until the handle points at akl.dev.

- [ ] (optional) Bluesky app → Settings → Account → Handle → "I have my own domain". It shows the `did:plc:…` value; expected `did:plc:u2hotgrxdf5rr3zqjubs2wsb`. date: ____
- [ ] (optional) DNS on the `akl.dev` zone: `TXT  _atproto  "did=did:plc:u2hotgrxdf5rr3zqjubs2wsb"` (DNS only, not proxied). date: ____
- [ ] (optional) In the Bluesky app, switch the handle to `akl.dev` (Settings → Account → Handle → "I have my own domain" → Verify DNS Record). date: ____
- [ ] (optional) AC-DOM-4: `dig TXT _atproto.akl.dev` returns `did=did:plc:…`; Bluesky shows the handle `@akl.dev` verified. date: ____
- [ ] AC-DOM-5: Mastodon profile field for `https://akl.dev` shows as verified (green). Route: `hachyderm.io/@akl` → Edit profile → add a field with `https://akl.dev`. date: ____

## 7. Old domains (akl.io, then adamloghry.com)

Do akl.io first. Cloudflare Redirect Rules need a proxied DNS record for each hostname, even though no origin exists. The rule redirects before the placeholder is ever reached.

- [ ] Before any change, record the akl.io MX: `dig +short MX akl.io`. Output: ____________. date: ____
- [ ] akl.io zone, DNS: `A  @  192.0.2.1  proxied` (placeholder, RFC 5737 TEST-NET) and `A  www  192.0.2.1  proxied`. MX and TXT (SPF/DKIM/DMARC) records unchanged. date: ____
- [ ] akl.io zone → Rules → Redirect Rules → Create → Dynamic. Name: `redirect to akl.dev`. When: `(http.host eq "akl.io") or (http.host eq "www.akl.io")`. Expression: `concat("https://akl.dev", http.request.uri.path)`. Status `301`. Preserve query string: **on**. date: ____
- [ ] Run `dig +short MX akl.io` again; output matches the value recorded above. date: ____
- [ ] Send a test email to `akl@akl.io`; it arrives. date: ____
- [ ] AC-DOM-2: `https://akl.io/`, `https://www.akl.io/`, `https://adamloghry.com/`, `https://www.adamloghry.com/` → 301 → `https://akl.dev/` (path and query preserved). date: ____
- [ ] AC-DOM-3: `dig MX akl.io` unchanged before/after; a test email to `akl@akl.io` arrives. date: ____
- [ ] adamloghry.com zone, DNS: `A  @  192.0.2.1  proxied` and `A  www  192.0.2.1  proxied`. MX and TXT records unchanged. date: ____
- [ ] adamloghry.com zone → Redirect Rules → Create → Dynamic. Name: `redirect to akl.dev`. When: `(http.host eq "adamloghry.com") or (http.host eq "www.adamloghry.com")`. Expression: `concat("https://akl.dev", http.request.uri.path)`. Status `301`. Preserve query string: **on**. date: ____

Note: the rule expression must cover every hostname that has a proxied placeholder record. An unmatched hostname returns a Cloudflare 52x page.

## 8. Search engines

- [ ] Google Search Console: add a domain property `akl.dev`; verify by DNS TXT. date: ____
- [ ] Submit the sitemap `https://akl.dev/sitemap-index.xml`. date: ____
- [ ] In the akl.io property: Settings → Change of address → `akl.dev`. Do this once the 301s are live. Same for adamloghry.com if it was ever indexed. date: ____
- [ ] AC-DOM-6: Google Search Console: `akl.dev` property verified, sitemap submitted, change-of-address from `akl.io` recorded. date: ____
- [ ] Bing Webmaster Tools: import from Google Search Console. date: ____

## 9. Recurring

- [ ] security.txt renewal: `Expires: 2027-09-30` in `public/.well-known/security.txt`. Create a calendar reminder to renew before 2027-09-01; `Expires` must always be less than a year in the future. date: ____
- [ ] AC-DOM-7: `https://akl.dev/.well-known/security.txt` `Expires` is in the future (and a reminder exists to renew it). date: ____
- [ ] Playwright bump, after any `flake.lock` update: run `npm run pin-playwright` (needs nix; it reads nixpkgs' `playwright-driver.version`, runs `npm install --save-dev --save-exact playwright@<v>` and prints old -> new). `package.json` must show `"playwright": "<v>"`, exact with no caret. If a Renovate `flake.lock` PR fails `checks.playwright-pin`, check out that PR's branch, run `npm run pin-playwright`, and commit `package.json` and `package-lock.json`. date: ____

## 10. Decommission

- [ ] One week after cutover, with clean logs on `akl.dev`, delete the old akl.io Pages/Workers project. Keep the repo. date: ____
