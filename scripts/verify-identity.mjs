#!/usr/bin/env node
// Build-time identity check for akl.dev. Runs before `astro build` (npm prebuild).
// Exits non-zero (failing the deploy) when any published identity artifact
// is missing, inconsistent, badly signed, or close to expiry.
//
// Checks:
//   1. public/pgp.asc parses, is not revoked or expired, and has at least one
//      valid user ID with an address
//   2. public/identity.txt is clearsigned by a signing key in pgp.asc
//   3. identity.txt "Fingerprint:" equals the primary fingerprint of pgp.asc,
//      and every "Email:" it lists is a user ID on the key
//   4. identity.txt "Expires:", security.txt "Expires:", and every key or
//      subkey expiry that is set are more than WARN_DAYS away; security.txt is
//      under a year out. A key without expiry is accepted (the owner's key is
//      managed by their mail provider and has none); the manifest's own
//      "Expires:" is then the yearly liveness signal.
//   5. every address on the key at this site's own domain has a WKD file under
//      the right hashed name holding the same key plus the policy file, and
//      the WKD tree holds nothing else. Other domains serve their own WKD, so
//      a key with no address at this domain must have no WKD tree at all.
//   6. security.txt points at the key, and public/allowed_signers (optional)
//      has no unfilled placeholder
// On success it writes src/data/identity.json for the pages to render.
//
// Usage: node scripts/verify-identity.mjs [--root .] [--domain akl.dev] [--warn-days 30]
//
// Before the key exists (scaffolding phase) set IDENTITY_PENDING=1: the script
// then checks security.txt only, warns, and writes {"pending": true} so the
// pages render a "not yet published" state. Once public/pgp.asc exists,
// IDENTITY_PENDING=1 is itself a failure: remove it in the change that adds the key.

import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as openpgp from "openpgp";
import { wkdHash } from "./wkd-hash.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const ROOT = args.root ?? ".";
const SITE_DOMAIN = (args.domain ?? "akl.dev").toLowerCase();
const WARN_DAYS = Number(args["warn-days"] ?? 30);
const PUBLIC = join(ROOT, "public");
const DAY = 86_400_000;
const PENDING = process.env.IDENTITY_PENDING === "1";

const failures = [];
const fail = (msg) => failures.push(msg);
const daysLeft = (date) => Math.floor((date.getTime() - Date.now()) / DAY);
const exists = (path) => access(path).then(() => true, () => false);

function checkExpiry(label, date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return fail(`${label}: no valid expiry date`);
  }
  const left = daysLeft(date);
  if (left < 0) fail(`${label}: expired ${-left} days ago`);
  else if (left < WARN_DAYS) fail(`${label}: expires in ${left} days (threshold ${WARN_DAYS})`);
}

// "Key: value" lines; repeated keys collect into arrays.
function parseFields(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    (fields[m[1].toLowerCase()] ??= []).push(m[2].trim());
  }
  return fields;
}

// Addresses of the user IDs that carry a valid, unrevoked self-certification.
async function liveEmails(key) {
  const out = new Set();
  for (const user of key.users) {
    const email = user.userID?.email?.toLowerCase();
    if (!email) continue;
    try {
      await user.verify();
      out.add(email);
    } catch {
      // revoked, expired or uncertified user ID: not an address of this key
    }
  }
  return [...out];
}

async function finish(data) {
  if (failures.length) {
    console.error("identity check FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  await mkdir(join(ROOT, "src", "data"), { recursive: true });
  await writeFile(join(ROOT, "src", "data", "identity.json"), JSON.stringify(data, null, 2) + "\n");
}

// --- security.txt (checked in every mode) -----------------------------------
let securityTxt = null;
try {
  securityTxt = parseFields(await readFile(join(PUBLIC, ".well-known", "security.txt"), "utf8"));
  const expires = new Date(securityTxt.expires?.[0]);
  checkExpiry("security.txt", expires);
  if (daysLeft(expires) > 366) fail("security.txt: Expires is more than a year out (RFC 9116 recommends under a year)");
} catch {
  fail("security.txt: missing at public/.well-known/security.txt");
}

// --- 1. public key -----------------------------------------------------------
const keyPresent = await exists(join(PUBLIC, "pgp.asc"));
if (!keyPresent && PENDING) {
  await finish({ pending: true });
  console.warn("identity check SKIPPED: public/pgp.asc absent and IDENTITY_PENDING=1");
  process.exit(0);
}
if (!keyPresent) {
  console.error("identity check FAILED:\n  - public/pgp.asc is missing (run scripts/export-identity.sh)");
  process.exit(1);
}
if (PENDING) fail("IDENTITY_PENDING=1 is set but public/pgp.asc exists: remove IDENTITY_PENDING (package.json prebuild and any CI or host setting)");

const armored = await readFile(join(PUBLIC, "pgp.asc"), "utf8");
const cert = await openpgp.readKey({ armoredKey: armored });
const fingerprint = cert.getFingerprint().toUpperCase();

if (await cert.isRevoked()) fail("pgp.asc: primary key is revoked");
const primaryExpiry = await cert.getExpirationTime();
if (primaryExpiry !== Infinity) checkExpiry("primary key", primaryExpiry);
const emails = await liveEmails(cert);
if (emails.length === 0) fail("pgp.asc: no valid user ID with an email address");

const subkeys = [];
for (const sub of cert.getSubkeys()) {
  const expiry = await sub.getExpirationTime();
  const id = sub.getKeyID().toHex().toUpperCase();
  subkeys.push({
    keyId: id,
    algorithm: sub.getAlgorithmInfo().curve ?? sub.getAlgorithmInfo().algorithm,
    expires: expiry === Infinity ? null : expiry.toISOString(),
  });
  if (expiry !== Infinity) checkExpiry(`subkey ${id}`, expiry);
}

// --- 2-4. signed manifest ----------------------------------------------------
let manifestText = "";
try {
  const manifestRaw = await readFile(join(PUBLIC, "identity.txt"), "utf8");
  const message = await openpgp.readCleartextMessage({ cleartextMessage: manifestRaw });
  const result = await openpgp.verify({ message, verificationKeys: cert });
  await result.signatures[0].verified; // throws when the signature is bad
  manifestText = message.getText();
} catch (err) {
  fail(`identity.txt: signature does not verify against pgp.asc (${err.message})`);
}

const manifest = parseFields(manifestText);
const claimed = (manifest.fingerprint?.[0] ?? "").replace(/\s+/g, "").toUpperCase();
if (manifestText && claimed !== fingerprint) {
  fail(`identity.txt: Fingerprint ${claimed || "(missing)"} does not match pgp.asc ${fingerprint}`);
}
if (manifestText) {
  checkExpiry("identity.txt", new Date(manifest.expires?.[0]));
  if (!manifest.issued?.[0]) fail("identity.txt: no Issued: line");
  if (!manifest.email?.length) fail("identity.txt: no Email: line");
  for (const listed of manifest.email ?? []) {
    if (!emails.includes(listed.toLowerCase())) fail(`identity.txt: Email ${listed} is not a user ID on the key`);
  }
}

// --- 5. WKD, for the addresses at this site's own domain only -----------------
// Addresses at other domains stay on the key and in the manifest, but their WKD
// belongs to the site that owns that domain; nothing for them is served here.
const wkdDir = join(PUBLIC, ".well-known", "openpgpkey");
const ascSubs = cert.getSubkeys().map((s) => s.getFingerprint()).sort().join();
const addresses = [];
const expected = new Set();
for (const address of emails) {
  const local = address.endsWith(`@${SITE_DOMAIN}`);
  addresses.push({ address, wkd: local });
  if (!local) continue;
  expected.add("policy").add("hu");
  const name = wkdHash(address);
  const shown = `public/.well-known/openpgpkey/hu/${name}`;
  expected.add(`hu/${name}`);
  try {
    const wkdCert = await openpgp.readKey({ binaryKey: await readFile(join(wkdDir, "hu", name)) });
    if (wkdCert.getFingerprint().toUpperCase() !== fingerprint) fail(`WKD ${address}: ${shown} has a different fingerprint than pgp.asc`);
    const wkdSubs = wkdCert.getSubkeys().map((s) => s.getFingerprint()).sort().join();
    if (wkdSubs !== ascSubs) fail(`WKD ${address}: subkeys differ from pgp.asc (re-export after any key change)`);
    if (!(await liveEmails(wkdCert)).includes(address)) fail(`WKD ${address}: ${shown} has no user ID for that address`);
  } catch (err) {
    fail(`WKD ${address}: cannot read ${shown} as a binary key (${err.message})`);
  }
}
if (expected.has("policy") && !(await exists(join(wkdDir, "policy")))) fail("WKD: policy file missing at public/.well-known/openpgpkey/policy (may be empty, must exist)");
for (const entry of await readdir(wkdDir, { recursive: true }).catch(() => [])) {
  const rel = entry.split(/[\\/]/).join("/");
  if (!expected.has(rel)) fail(`WKD: unexpected public/.well-known/openpgpkey/${rel} (this site serves keys for ${SITE_DOMAIN} addresses only)`);
}

// --- 6. files that point at the key -------------------------------------------
if (securityTxt && !(securityTxt.encryption ?? []).some((v) => v.endsWith("/pgp.asc"))) {
  fail("security.txt: add an 'Encryption: https://akl.dev/pgp.asc' line now that the key is published");
}
const signersPath = join(PUBLIC, "allowed_signers");
const allowedSigners = await exists(signersPath);
if (allowedSigners && /<[A-Z0-9_-]+>/.test(await readFile(signersPath, "utf8"))) {
  fail("allowed_signers: unfilled <PLACEHOLDER>");
}

// --- result ------------------------------------------------------------------
const data = {
  pending: false,
  fingerprint,
  fingerprintGrouped: fingerprint.replace(/(.{4})/g, "$1 ").trim(),
  // The address for encrypted mail: the first one the manifest lists.
  email: (manifest.email?.[0] ?? emails[0] ?? "").toLowerCase(),
  addresses,
  created: cert.getCreationTime().toISOString(),
  primaryExpires: primaryExpiry === Infinity ? null : primaryExpiry.toISOString(),
  subkeys,
  allowedSigners,
  manifest: {
    issued: manifest.issued?.[0] ?? null,
    expires: manifest.expires?.[0] ?? null,
    fields: manifest,
  },
  checkedAt: new Date().toISOString(),
};
await finish(data);
console.log(`identity check passed: ${data.fingerprintGrouped} (${emails.join(", ")})`);
