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

// AC-REF-1: the shipped forest generator and stylesheet are byte-identical to the handoff reference.
for (const [a, b] of [['src/scripts/forest.js', 'docs/handoff/reference/forest.js'], ['src/styles/global.css', 'docs/handoff/reference/theme.css']]) {
  const [x, y] = await Promise.all([readFile(new URL(a, root)), readFile(new URL(b, root))]);
  ok('AC-REF-1', x.equals(y), `${a} is byte-identical to ${b}`);
}

if (fails) { console.log(`\n${fails} static check(s) FAILED`); process.exit(1); }
console.log('\nstatic checks passed');
