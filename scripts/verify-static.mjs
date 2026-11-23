// No-browser acceptance checks against dist/ and the sources. Run by `npm run verify` before the
// Playwright suite. IDs extend docs/handoff/docs/09-acceptance-criteria.md.
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
let fails = 0;
const ok = (id, cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + id + '  ' + msg); if (!cond) fails++; };
const decode = s => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// AC-META-6: Bluesky handle fallback file holds a real DID, not the placeholder.
const did = (await read('dist/.well-known/atproto-did')).trim();
ok('AC-META-6', /^did:plc:[a-z2-7]{24}$/.test(did), `atproto-did is a did:plc (${did})`);

// AC-PERF-1: only the latin 400/500 subsets of IBM Plex Mono ship.
const fonts = (await readdir(new URL('dist/_astro/', root))).filter(f => /^ibm-plex-mono-.*\.woff2?$/.test(f));
ok('AC-PERF-1', fonts.length > 0 && fonts.every(f => /^ibm-plex-mono-latin-(400|500)-normal\./.test(f)),
  `font files latin 400/500 only (${fonts.length}: ${fonts.join(', ')})`);

// AC-COPY-3: the markdown twin carries the page's role, bio and every link target.
const src = await read('src/pages/index.astro');
const md = await read('public/index.html.md');
const role = decode(src.match(/class="role">([^<]+)</)?.[1] ?? '');
const bio = decode(src.match(/class="bio">([^<]+)</)?.[1] ?? '');
// The pgp link to /keys is rendered only once the key is published, so the twin lists it only then.
const identity = JSON.parse(await read('src/data/identity.json'));
const links = [...src.replace(/<!--[\s\S]*?-->/g, '').matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/^mailto:/, '')).filter(l => l !== '/keys' || !identity.pending);
const absent = [role, bio, ...links].filter(s => !md.includes(s.replace(/\.$/, '')));
const stray = identity.pending && md.includes('/keys');
ok('AC-COPY-3', links.length === (identity.pending ? 8 : 9) && absent.length === 0 && !stray, 'index.html.md in sync with index.astro' + (absent.length ? ' (missing: ' + absent.join(' | ') + ')' : '') + (stray ? ' (lists /keys while the key is pending)' : ''));

// AC-DEPLOY-1: the Worker config Cloudflare's Workers Builds deploys with. `wrangler preview` (every non-trunk branch)
// refuses to run without a `previews` block, and 404-page is what serves 404.html for unknown paths.
const wr = JSON.parse(await read('wrangler.json'));
ok('AC-DEPLOY-1', wr.name === 'akl-dev' && wr.assets?.directory === './dist' && wr.assets?.not_found_handling === '404-page' && typeof wr.previews === 'object' && wr.previews !== null
  && /^\d{4}-\d\d-\d\d$/.test(wr.compatibility_date ?? ''), 'wrangler.json: Worker akl-dev serves ./dist with the 404 page and has a previews block');

// AC-NAV-3: webfinger for akl@akl.dev hands off to hachyderm.
const redirects = await read('dist/_redirects');
ok('AC-NAV-3', /^\/\.well-known\/webfinger\s+https:\/\/hachyderm\.io\/\.well-known\/webfinger\?resource=acct:akl@hachyderm\.io\s+302$/m.test(redirects), 'webfinger redirect present');

// AC-NAV-4: the email link does not reveal the address on hover/focus (owner, overrides D13).
const page = await read('dist/index.html');
ok('AC-NAV-4', page.includes('href="mailto:adam@loghry.org"') && !/class="addr"/.test(page), 'email link has no hover address reveal');

// AC-ID-*: keys and identity (docs/design.md section 6). `identity` is what the prebuild check wrote from
// public/pgp.asc and the signed manifest, so these compare the built site against the published files.
const exists = p => readFile(new URL(p, root)).then(() => true, () => false);
const keysPage = await read('dist/keys.html');
const pages = { 'index.html': page, '404.html': await read('dist/404.html'), 'keys.html': keysPage };
// AC-ID-1: every page carries the rel="me" links (Mastodon checks https://akl.dev/keys) and, once published, the key link.
const me = ['https://hachyderm.io/@akl', 'https://github.com/adamloghry', 'https://bsky.app/profile/did:plc:u2hotgrxdf5rr3zqjubs2wsb'];
for (const [f, h] of Object.entries(pages)) {
  const head = h.slice(0, h.indexOf('</head>'));
  ok('AC-ID-1 ' + f, me.every(u => head.includes(`<link rel="me" href="${u}">`)) && head.includes('rel="pgpkey"') === !identity.pending
    && h.includes('id="foot-key"') === !identity.pending, 'rel="me" links in <head>; rel="pgpkey" and the footer fingerprint only once the key is published');
}
// AC-ID-2: the published state of the pages matches the published files.
if (identity.pending) {
  ok('AC-ID-2', keysPage.includes('id="keys-pending"') && !page.includes('href="/keys"') && !(await exists('dist/pgp.asc')) && /name="robots" content="noindex"/.test(keysPage),
    'key pending: /keys shows the notice and is noindex, the landing page does not link to it, no pgp.asc ships');
} else {
  const wkd = 'dist/.well-known/openpgpkey/', served = identity.addresses.filter(a => a.wkd).length;
  const files = ['dist/pgp.asc', 'dist/identity.txt', ...(served ? [wkd + 'policy'] : []), ...(identity.allowedSigners ? ['dist/allowed_signers'] : [])];
  const missing = []; for (const f of files) if (!(await exists(f))) missing.push(f);
  const tree = (await readdir(new URL(wkd, root), { recursive: true }).catch(() => [])).filter(f => f !== 'hu' && f !== 'policy');
  ok('AC-ID-2 files', missing.length === 0 && tree.length === served && tree.every(f => /^hu\/[a-z0-9]{32}$/.test(f)),
    `key and manifest are in dist/, with exactly one WKD file per akl.dev address on the key (${served})` + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : '') + ` [openpgpkey: ${tree.join(', ')}]`);
  ok('AC-ID-2 page', keysPage.includes(identity.fingerprintGrouped) && keysPage.includes(identity.manifest.issued) && keysPage.includes(identity.manifest.expires)
    && ['/pgp.asc', '/identity.txt'].every(u => keysPage.includes(`href="${u}"`)) && me.every(u => keysPage.includes(`<a rel="me" href="${u}"`))
    && keysPage.includes('/pgp.asc | gpg --import') && keysPage.includes('gpg --verify') && keysPage.includes(`<li>${identity.email}</li>`) && (keysPage.match(/<svg class="fpr-trees"[^>]*>.*?<\/svg>/s)?.[0].match(/M/g) ?? []).length === 40 && /<svg class="qr"[^>]*aria-label="[^"]*[0-9A-F]{4}"/.test(keysPage) && !/name="robots" content="noindex"/.test(keysPage),
    '/keys shows the fingerprint (text and 40-tree drawing), the manifest dates, downloads, verify commands, the mail address, rel="me" account links and the QR code');
  ok('AC-ID-2 links', page.includes('href="/keys"') && page.includes(identity.fingerprintGrouped.split(' ').slice(-4).join(' ')), 'landing page links pgp to /keys and the footer shows the last 16 hex characters');
}
// AC-ID-3: response headers for the identity files (the live curl checks are the proof; this guards the rules).
const blocks = Object.fromEntries((await read('dist/_headers')).split(/\n(?=\S)/).map(b => [b.split('\n')[0].trim(), b]));
ok('AC-ID-3', ['/.well-known/openpgpkey/*', '/pgp.asc', '/identity.txt'].every(p => /Access-Control-Allow-Origin: \*/.test(blocks[p] ?? ''))
  && /Content-Type: application\/octet-stream/.test(blocks['/.well-known/openpgpkey/*'] ?? '') && /Content-Type: application\/pgp-keys/.test(blocks['/pgp.asc'] ?? '')
  && /Content-Type: text\/plain; charset=utf-8/.test(blocks['/identity.txt'] ?? ''), '_headers: CORS and content types for WKD, pgp.asc and identity.txt');
// AC-ID-4: the retired domain appears nowhere in the shipped site, except as an address that is on the key itself
// or one the owner listed as a commit address in allowed_signers (old commits carry it).
{ const hits = [], known = identity.pending ? [] : identity.addresses.map(a => a.address);
  for (const l of (await read('dist/allowed_signers').catch(() => '')).split('\n')) if (l.trim() && !l.startsWith('#')) known.push(...l.split(' ')[0].toLowerCase().split(','));
  const walk = async dir => { for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (e.isDirectory()) { await walk(dir + e.name + '/'); continue; }
    let text = (await readFile(new URL(dir + e.name, root))).toString('latin1').toLowerCase();
    for (const a of known) text = text.replaceAll(a, '');
    if (text.includes('akl.io')) hits.push(dir + e.name);
  } };
  await walk('dist/');
  ok('AC-ID-4', hits.length === 0, 'no mention of akl.io in dist/' + (hits.length ? ' (' + hits.join(', ') + ')' : '')); }

// AC-REF-1: the shipped forest generator and stylesheet are byte-identical to the handoff reference.
for (const [a, b] of [['src/scripts/forest.js', 'docs/handoff/reference/forest.js'], ['src/styles/global.css', 'docs/handoff/reference/theme.css']]) {
  const [x, y] = await Promise.all([readFile(new URL(a, root)), readFile(new URL(b, root))]);
  ok('AC-REF-1', x.equals(y), `${a} is byte-identical to ${b}`);
}

// AC-PNW-6: the Seattle touch rolls (src/scripts/seattle.ts; Node strips its types) behave as documented over ten years of dates.
{ const { snowDay, mistMorning, crowsHour, decide, P_SASQUATCH } = await import(new URL('src/scripts/seattle.ts', root));
  const Q = s => new URLSearchParams(s);
  let winter = 0, snow = 0, offSeason = 0, firstSnow = null, misty = 0, mistLate = 0, days = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2036, 0, 1); t += 864e5) {
    const D = new Date(t), now = { y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), h: 12 };
    const isWinter = now.m === 12 || now.m <= 2; if (isWinter) winter++;
    if (snowDay(now)) { snow++; if (!isWinter) offSeason++; firstSnow ??= now; }
    days++; if (mistMorning({ ...now, h: 8.5 })) { misty++; if (mistMorning({ ...now, h: 11 })) mistLate++; }
  }
  ok('AC-PNW-6 snow', offSeason === 0 && snow / winter > 0.04 && snow / winter < 0.13, `snow only Dec to Feb, on ${(100 * snow / winter).toFixed(1)}% of winter days (${snow} in 10 years)`);
  const auto = decide(firstSnow, 1, true, Q('')), forced = decide(firstSnow, 1, true, Q('rain=on'));
  ok('AC-PNW-6 snow vs rain', auto.snow && !auto.rain && !auto.mountain && forced.rain && !forced.snow, 'a snow day replaces rain and hides the mountain; an explicit ?rain=on wins');
  const july = { y: 2026, m: 7, d: 15, h: 12 }, noon = decide(july, 1, false, Q('')), wet = decide(july, 1, true, Q(''));
  ok('AC-PNW-6 clock', noon.mountain && !wet.mountain && !noon.crows && !noon.owl && !noon.mist && !noon.snow && crowsHour({ ...july, h: 20.5 }) && !crowsHour({ ...july, h: 21.6 })
    && decide({ ...july, h: 23 }, 1, false, Q('')).owl && !mistMorning({ y: 2026, m: 11, d: 3, h: 14 }),
    'dry noon shows only the mountain; rain hides it; crows fly around sunset; the owl is out at night; no mist after morning');
  ok('AC-PNW-6 mist', misty / days > 0.2 && misty / days < 0.5 && mistLate === 0, `mist on ${(100 * misty / days).toFixed(0)}% of mornings at 08:30, and never still there at 11:00`);
  let squatch = 0; const N = 40000; for (let i = 0; i < N; i++) if (decide(july, i * 2654435761 >>> 0, false, Q('')).sasquatch) squatch++;
  ok('AC-PNW-6 sasquatch', squatch / N > P_SASQUATCH / 2 && squatch / N < P_SASQUATCH * 2, `sasquatch on about 1 visit in ${Math.round(N / squatch)}`);
}

if (fails) { console.log(`\n${fails} static check(s) FAILED`); process.exit(1); }
console.log('\nstatic checks passed');
