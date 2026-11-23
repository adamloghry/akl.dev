// Tests for scripts/verify-identity.mjs against throwaway keys in a temp site root.
// Run: node --test scripts/verify-identity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as openpgp from 'openpgp';
import { wkdHash } from './wkd-hash.mjs';

const script = fileURLToPath(new URL('./verify-identity.mjs', import.meta.url));
const DAY = 86400;
const iso = days => new Date(Date.now() + days * DAY * 1000).toISOString().slice(0, 10);

// A key shaped like the real one: Ed25519 primary, signing and encryption subkeys that expire.
const key = await openpgp.generateKey({
  type: 'ecc', curve: 'ed25519Legacy', format: 'object',
  userIDs: [{ name: 'Test Person', email: 'akl@akl.dev' }, { name: 'Test Person', email: 'adam@loghry.org' }],
  keyExpirationTime: 5 * 365 * DAY,
  subkeys: [{ sign: true, keyExpirationTime: 2 * 365 * DAY }, { keyExpirationTime: 2 * 365 * DAY }],
});
// A key shaped like the owner's real one: made by a mail provider, one address at the provider's
// domain, a primary that signs, an encryption subkey, and no expiry anywhere.
const hosted = await openpgp.generateKey({ type: 'ecc', curve: 'ed25519Legacy', format: 'object', userIDs: [{ name: 'adamloghry@pm.me', email: 'adamloghry@pm.me' }] });
const other = await openpgp.generateKey({ type: 'ecc', curve: 'ed25519Legacy', format: 'object', userIDs: [{ email: 'akl@akl.dev' }] });

const manifestText = ({ expires = iso(365), fingerprint, emails = ['akl@akl.dev', 'adam@loghry.org'] } = {}) =>
  ['Identity manifest', '', `Issued: ${iso(0)}`, `Expires: ${expires}`, '', `Fingerprint: ${fingerprint}`, ...emails.map(e => `Email: ${e}`), ''].join('\n');

async function site({ manifest = {}, signer, security = `Contact: mailto:adam@loghry.org\nExpires: ${iso(300)}T00:00:00Z\nEncryption: https://akl.dev/pgp.asc\n`, withKey = true, wkd = true, foreign = false, use = key } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'identity-test-'));
  const wk = join(root, 'public', '.well-known');
  await mkdir(join(wk, 'openpgpkey', 'hu'), { recursive: true });
  if (security !== null) await writeFile(join(wk, 'security.txt'), security);
  if (!withKey) return root;
  const pub = use.publicKey;
  await writeFile(join(root, 'public', 'pgp.asc'), pub.armor());
  if (use === hosted) await rm(join(wk, 'openpgpkey'), { recursive: true });
  else if (wkd) await writeFile(join(wk, 'openpgpkey', 'hu', wkdHash('akl@akl.dev')), pub.write());
  if (use !== hosted) await writeFile(join(wk, 'openpgpkey', 'policy'), '');
  if (foreign) {
    await mkdir(join(wk, 'openpgpkey', 'loghry.org', 'hu'), { recursive: true });
    await writeFile(join(wk, 'openpgpkey', 'loghry.org', 'hu', wkdHash('adam@loghry.org')), pub.write());
    await writeFile(join(wk, 'openpgpkey', 'loghry.org', 'policy'), '');
  }
  const message = await openpgp.createCleartextMessage({ text: manifestText({ fingerprint: pub.getFingerprint().toUpperCase(), ...manifest }) });
  await writeFile(join(root, 'public', 'identity.txt'), await openpgp.sign({ message, signingKeys: signer ?? use.privateKey }));
  return root;
}

function run(root, env = {}) {
  const r = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8', env: { ...process.env, IDENTITY_PENDING: '', ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const data = async root => JSON.parse(await readFile(join(root, 'src', 'data', 'identity.json'), 'utf8'));

test('a consistent key, manifest and WKD tree passes and writes identity.json', async t => {
  const root = await site(); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  const d = await data(root);
  assert.equal(d.pending, false);
  assert.equal(d.email, 'akl@akl.dev');
  assert.equal(d.fingerprint, key.publicKey.getFingerprint().toUpperCase());
  assert.equal(d.fingerprintGrouped.split(' ').length, 10);
  // Both addresses are on the key; only the site's own domain gets a WKD file here.
  assert.deepEqual(d.addresses, [{ address: 'akl@akl.dev', wkd: true }, { address: 'adam@loghry.org', wkd: false }]);
  assert.equal(d.subkeys.length, 2);
  assert.equal(d.manifest.expires, iso(365));
  assert.equal(d.allowedSigners, false);
});

test('a provider-held key passes: one outside address, no expiry, no WKD tree', async t => {
  const root = await site({ use: hosted, manifest: { emails: ['adamloghry@pm.me'] } }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  const d = await data(root);
  assert.equal(d.email, 'adamloghry@pm.me');
  assert.deepEqual(d.addresses, [{ address: 'adamloghry@pm.me', wkd: false }]);
  assert.equal(d.primaryExpires, null);
  assert.deepEqual(d.subkeys.map(s => s.expires), [null]);
});

test('a key with no address at this domain must not ship a WKD tree', async t => {
  const root = await site({ use: hosted, manifest: { emails: ['adamloghry@pm.me'] } }); t.after(() => rm(root, { recursive: true }));
  await mkdir(join(root, 'public', '.well-known', 'openpgpkey'), { recursive: true });
  await writeFile(join(root, 'public', '.well-known', 'openpgpkey', 'policy'), '');
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /unexpected public\/\.well-known\/openpgpkey\/policy/);
});

test('a manifest without an Email line fails', async t => {
  const root = await site({ manifest: { emails: [] } }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /no Email: line/);
});

test('pending: no key and IDENTITY_PENDING=1 passes with {"pending": true}', async t => {
  const root = await site({ withKey: false }); t.after(() => rm(root, { recursive: true }));
  const r = run(root, { IDENTITY_PENDING: '1' });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(await data(root), { pending: true });
});

test('pending still fails on an expiring security.txt', async t => {
  const root = await site({ withKey: false, security: `Contact: mailto:a@b.c\nExpires: ${iso(10)}T00:00:00Z\n` }); t.after(() => rm(root, { recursive: true }));
  const r = run(root, { IDENTITY_PENDING: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /security\.txt: expires in/);
});

test('no key and no IDENTITY_PENDING fails', async t => {
  const root = await site({ withKey: false }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /pgp\.asc is missing/);
});

test('IDENTITY_PENDING=1 left set after the key is published fails', async t => {
  const root = await site(); t.after(() => rm(root, { recursive: true }));
  const r = run(root, { IDENTITY_PENDING: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /remove IDENTITY_PENDING/);
});

test('a manifest that expires within 30 days fails', async t => {
  const root = await site({ manifest: { expires: iso(7) } }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /identity\.txt: expires in/);
});

test('a manifest signed by another key fails', async t => {
  const root = await site({ signer: other.privateKey }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /signature does not verify/);
});

test('a manifest edited after signing fails', async t => {
  const root = await site(); t.after(() => rm(root, { recursive: true }));
  const p = join(root, 'public', 'identity.txt');
  await writeFile(p, (await readFile(p, 'utf8')).replace('Identity manifest', 'Identity manifest!'));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /signature does not verify/);
});

test('a manifest naming a different fingerprint or an address not on the key fails', async t => {
  const root = await site({ manifest: { fingerprint: 'A'.repeat(40), emails: ['someone@example.org'] } }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /does not match pgp\.asc/);
  assert.match(r.out, /someone@example\.org is not a user ID/);
});

test('an akl.dev address on the key without its WKD file fails', async t => {
  const root = await site({ wkd: false }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /WKD akl@akl\.dev: cannot read/);
});

test('WKD files for another domain are refused: that domain serves its own', async t => {
  const root = await site({ foreign: true }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /unexpected public\/\.well-known\/openpgpkey\/loghry\.org/);
  assert.match(r.out, /akl\.dev addresses only/);
});

test('security.txt without an Encryption line fails once the key is published', async t => {
  const root = await site({ security: `Contact: mailto:adam@loghry.org\nExpires: ${iso(300)}T00:00:00Z\n` }); t.after(() => rm(root, { recursive: true }));
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /Encryption: https:\/\/akl\.dev\/pgp\.asc/);
});

test('allowed_signers with an unfilled placeholder fails; a filled one is reported', async t => {
  const root = await site(); t.after(() => rm(root, { recursive: true }));
  const p = join(root, 'public', 'allowed_signers');
  await writeFile(p, 'akl@akl.dev namespaces="git" <SSH-PUBLIC-KEY-LINE>\n');
  assert.match(run(root).out, /allowed_signers: unfilled/);
  await writeFile(p, 'akl@akl.dev namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample\n');
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.equal((await data(root)).allowedSigners, true);
});
