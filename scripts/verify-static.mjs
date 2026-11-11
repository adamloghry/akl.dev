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
const links = [...src.replace(/<!--[\s\S]*?-->/g, '').matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/^mailto:/, ''));
const absent = [role, bio, ...links].filter(s => !md.includes(s.replace(/\.$/, '')));
ok('AC-COPY-3', links.length === 8 && absent.length === 0, 'index.html.md in sync with index.astro' + (absent.length ? ' (missing: ' + absent.join(' | ') + ')' : ''));

// AC-NAV-3: webfinger for akl@akl.dev hands off to hachyderm.
const redirects = await read('dist/_redirects');
ok('AC-NAV-3', /^\/\.well-known\/webfinger\s+https:\/\/hachyderm\.io\/\.well-known\/webfinger\?resource=acct:akl@hachyderm\.io\s+302$/m.test(redirects), 'webfinger redirect present');

// AC-NAV-4: the email link does not reveal the address on hover/focus (owner, overrides D13).
const page = await read('dist/index.html');
ok('AC-NAV-4', page.includes('href="mailto:akl@akl.io"') && !/class="addr"/.test(page), 'email link has no hover address reveal');

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
