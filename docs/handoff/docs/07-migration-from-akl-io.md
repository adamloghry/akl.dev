# 07 — Migration from the current akl.io

The owner will supply the akl.io source; this is what to do with it. The new site is new — nothing is ported by default. This list is what to **keep**, what to **move**, and what to **retire**, based on the live akl.io at hand-off.

## 1. Inventory of the live akl.io (2026-10-31)

| element | on akl.io today | new site |
|---|---|---|
| H1 `ADAM K. LOGHRY`, "Engineer in Seattle" | yes | **kept** (H1 identical; role line replaced by the new copy) |
| `<title>Adam Loghry</title>` | yes | **kept** |
| meta description "…an engineer living and working in Seattle." | yes | **replaced** with the new role line; same shape |
| OG/Twitter meta + `images/og.png` | yes | **replaced**; new `og.png` generated from the forest |
| `meta color-scheme: dark`, `theme-color #14303c` | dark-only | **replaced** by `light dark` + two theme-colors |
| mail (Cloudflare-obfuscated) | yes | **kept** (`akl@akl.io`; obfuscation optional) |
| signal `signal.me/#u/akl.07` | yes | **kept** |
| mastodon `hachyderm.io/@akl` | yes | **kept**, now with `rel="me"` |
| bluesky `bsky.app/profile/akl.io` | yes | **changed** to `akl.dev` (handle migration, docs/04 §4) |
| linkedin `/in/adamloghry` | yes | **kept** |
| github `adamloghry` | yes | **kept** |
| other projects and toys | yes | **move to akl.run** |
| ASCII banners ("ADAM", "AKL") | yes | **retire** (the forest is the ornament now) |
| `~akl/well-known.txt` | yes | **retire**; handles live in `humans.txt`; keys, if wanted, go in `/.well-known/` |
| JSON-LD | none | **added** |
| robots / sitemap / humans / llms / agents / security.txt | none visible | **added** |

## 2. What to ask the source for

When the akl.io source arrives, look for and carry over only:
- The exact `og.png` dimensions/crop if there's a reason to keep continuity — otherwise regenerate.
- Any `_headers`/`_redirects`/Workers logic (e.g. email obfuscation settings, caching) that should survive.
- The 404 page, if there is one. The new site ships a minimal `src/pages/404.astro` (same shell, "no such path", forest); merge anything worth keeping.

## 3. Cutover (also in docs/04 §7)

1. Deploy akl.dev and verify.
2. Switch the Bluesky handle; update the Mastodon profile field.
3. 301 `www.akl.dev` → apex; 301 `akl.io`/`www` and `adamloghry.com`/`www` → `akl.dev` (path-preserving).
4. Google Search Console change-of-address from akl.io.
5. Leave the old akl.io repo in place, archived; delete the old Pages project after a week.

Email on akl.io is untouched throughout: only A/AAAA/CNAME for `@` and `www` change (to proxied placeholders); MX/SPF/DKIM/DMARC are not edited.

## 4. Phase 2: `/notes`

- Astro content collection at `src/content/notes/*.md`; route `src/pages/notes/[...slug].astro`; index at `/notes/`.
- Uncomment the `writing` row in `index.astro` → `<a href="/notes/">notes</a>` plus the two most recent titles (the row grows left-to-right, like the others).
- Add `@astrojs/rss` → `/rss.xml`; link it in `<head>`; mention it in `llms.txt` under a new `## Notes` section; consider `llms-full.txt`.
- `verify.mjs`: flip `AC-NAV-2` to assert the row exists; add a check that every note has a markdown twin reachable at `<url>.md` (the llms.txt convention) — Astro can emit it from the same collection.
- POSSE to Bluesky/Mastodon is out of scope for the landing page.

## 5. Phase 2: colophon link

Wrap the hash in `Colophon.astro` with the commit URL on 16384.dev. Keep the visible text identical so the design doesn't move.
