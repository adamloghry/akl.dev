# 04 — Cloudflare Pages, DNS, and the domain takeover

End state: `https://akl.dev` is canonical. `www.akl.dev`, `akl.io`, `www.akl.io`, `adamloghry.com`, `www.adamloghry.com` all 301 to `https://akl.dev/<same path>`. Email on `akl.io` is untouched.

Assumption: all three zones are (or will be) on Cloudflare DNS. The current akl.io already uses Cloudflare (its email-obfuscation links are `/cdn-cgi/…`).

## 1. Pages project

1. Create a Pages project from the repo. Preset **Astro**, build `npm run build`, output `dist`, Node ≥ 20. Production branch `main`.
2. Custom domains → add `akl.dev` **and** `www.akl.dev`. Cloudflare writes the proxied `CNAME → <project>.pages.dev` records (apex uses CNAME flattening automatically).
3. Verify `https://<project>.pages.dev/` and `https://akl.dev/` both serve the page; then verify `https://akl.dev/.well-known/security.txt` returns `text/plain`.

## 2. Zone settings for akl.dev (Cloudflare dashboard)

| setting | value | why |
|---|---|---|
| SSL/TLS mode | Full (strict) | Pages has a valid origin cert |
| Always Use HTTPS | on | belt and braces; `.dev` is HSTS-preloaded in browsers anyway |
| HSTS | on, `max-age=31536000; includeSubDomains` (preload not needed: whole `.dev` TLD is preloaded) | |
| Minimum TLS | 1.2 | |
| Brotli | on (default) | |
| Early Hints | on | fonts and the module get `103` hints from `Link:` headers |
| **Rocket Loader** | **off** | it rewrites/defers scripts and would break the before-paint theme script and the module import |
| Auto Minify | off (Astro already minifies; CF minify can alter inline JSON-LD whitespace — harmless but pointless) | |
| Email Address Obfuscation | either. On: Cloudflare rewrites `mailto:akl@akl.io` into `/cdn-cgi/l/email-protection#…` and decodes client-side. Off: plain mailto. The owner is fine with either. | |
| Web Analytics / Browser Insights | off, or if on, add `https://static.cloudflareinsights.com` to `script-src` and `connect-src` in `_headers` CSP | |
| Bot Fight Mode | off (it injects a challenge script into HTML; interferes with CSP and with agents reading llms.txt) | |

## 3. Redirecting the old domains (path-preserving 301)

Do this per zone, **akl.io** and **adamloghry.com**, with zone-level Redirect Rules (Rules → Redirect Rules → Create → Dynamic). Rules run at the edge, so the zone needs *a proxied DNS record* for the hostnames even though no origin exists:

DNS (each old zone):
```
A     @     192.0.2.1    proxied    ; placeholder, RFC 5737 TEST-NET; never reached because the rule redirects first
A     www   192.0.2.1    proxied
MX    @     (unchanged — akl.io mail stays exactly as it is)
TXT   @     (SPF/DKIM/DMARC unchanged)
```
Rule:
```
Name:        redirect to akl.dev
When:        (http.host eq "akl.io") or (http.host eq "www.akl.io")        ; adamloghry.com: same shape
Then:        Dynamic redirect
Expression:  concat("https://akl.dev", http.request.uri.path)
Status:      301
Preserve query string: on
```
Why not `_redirects` in the Pages project: Pages `_redirects` cannot match on host. Why not Bulk Redirects: also fine (account-level, free tier allows it), but the per-zone rule keeps each domain self-describing. Pick one; don't do both.

`www.akl.dev → akl.dev`: same kind of rule on the akl.dev zone: `(http.host eq "www.akl.dev")` → `concat("https://akl.dev", http.request.uri.path)`.

The current akl.io has only `/`, so path preservation is cosmetic today; it matters the day `/notes/…` exists and someone types the old domain.

## 4. Bluesky handle `@akl.dev`

Two routes; **DNS is primary**, the file is a fallback.
1. Bluesky app → Settings → Account → Handle → "I have my own domain" → it shows `did:plc:…`.
2. DNS on akl.dev: `TXT  _atproto  "did=did:plc:…"` (DNS-only, not proxied — TXT can't be proxied anyway).
3. Optional fallback: put the DID in `public/.well-known/atproto-did` (file ships with a placeholder) and make sure it's served as `text/plain` (`_headers` already sets `Cache-Control`; add `Content-Type: text/plain` under that path if Cloudflare serves it as octet-stream — check with `curl -I`).
4. Verify in the app. The old `bsky.app/profile/akl.io` URL keeps resolving after the handle changes (it's the DID that's canonical).

## 5. Mastodon verification

`hachyderm.io/@akl` profile → Edit profile → add a field with `https://akl.dev`. The page's `<link rel="me" href="https://hachyderm.io/@akl">` and the `rel="me"` on the in-body link make the field turn green. Nothing else to do. (`webfinger` for `akl@akl.dev` → hachyderm is a separate, optional thing; see docs/05 §6.)

## 6. Search engines

- Google Search Console: add property `akl.dev` (domain property; verify by DNS TXT). Submit `https://akl.dev/sitemap-index.xml`.
- In the **akl.io** property, use *Settings → Change of address* → `akl.dev` once the 301s are live. Same for adamloghry.com if it was ever indexed.
- Bing Webmaster Tools: import from GSC.

## 7. Cutover order

1. Deploy Pages, attach `akl.dev` + `www`, run `docs/09` live checks against `https://akl.dev`.
2. Set Bluesky DID (DNS TXT) and switch the handle; update Mastodon profile field.
3. Add `www.akl.dev` redirect rule.
4. Add akl.io rules + placeholder A records. **Confirm `dig MX akl.io` is unchanged and a test mail still arrives.**
5. Add adamloghry.com rules.
6. GSC change-of-address.
7. Decommission the old akl.io Pages/Workers project *after* a week of clean logs (keep the repo).

## 8. Things that will bite

- A proxied placeholder record + an *unmatched* request (e.g. a hostname you forgot in the rule) returns a Cloudflare 52x page. The rule expression must cover every hostname that has a proxied record.
- `.dev` HSTS means `http://akl.dev` never works, even for `curl`. Test with `https://`.
- If Cloudflare's "Email Obfuscation" is on, `verify.mjs` run against the **live** site will fail `AC-NAV-1` (the `mailto:` is rewritten). Run `verify` against `dist/` (as designed), and check the live mailto by hand.
- Pages serves extension-less files (`.well-known/atproto-did`) with no content type by default. Add a `_headers` entry if Bluesky's resolver complains.
