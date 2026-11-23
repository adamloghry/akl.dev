import { test } from "node:test";
import assert from "node:assert/strict";
import { fillManifest } from "./fill-identity.mjs";

const SRC = [
  "Issued: <YYYY-MM-DD>",
  "",
  "Fingerprint: <FINGERPRINT-40-HEX-NO-SPACES>",
  "Email: akl@akl.dev",
  "Email: old@example.org",
  "",
  "SSH-Signing: <SSH-PUBLIC-KEY-LINE>",
  "Age: <AGE-RECIPIENT>",
  "",
].join("\n");

test("set replaces a placeholder and, on a second run, a real value", () => {
  const once = fillManifest(SRC, { set: { Issued: "2026-11-21", "SSH-Signing": "ssh-ed25519 AAAA=x" } });
  assert.match(once, /^Issued: 2026-11-21$/m);
  assert.match(once, /^SSH-Signing: ssh-ed25519 AAAA=x$/m);
  const twice = fillManifest(once, { set: { Issued: "2027-11-21" } });
  assert.match(twice, /^Issued: 2027-11-21$/m);
  assert.doesNotMatch(twice, /2026-11-21/);
});

test("drop removes the line and nothing else", () => {
  const out = fillManifest(SRC, { drop: ["Age"] });
  assert.doesNotMatch(out, /^Age:/m);
  assert.equal(out.split("\n").length, SRC.split("\n").length - 1);
});

test("emails replaces the block in place and in order", () => {
  const out = fillManifest(SRC, { emails: ["akl@akl.dev", "adam@loghry.org", "akl@akl.io"] });
  const lines = out.split("\n");
  assert.deepEqual(lines.slice(3, 6), ["Email: akl@akl.dev", "Email: adam@loghry.org", "Email: akl@akl.io"]);
  assert.doesNotMatch(out, /old@example\.org/);
  assert.equal(lines[2], "Fingerprint: <FINGERPRINT-40-HEX-NO-SPACES>");
});

test("a missing line or a multi-line value is an error", () => {
  assert.throws(() => fillManifest(SRC, { set: { Signal: "x" } }), /no "Signal:" line/);
  assert.throws(() => fillManifest(SRC, { set: { Issued: "a\nEmail: evil@example.org" } }), /single line/);
});

test("a key name does not match a longer key that starts the same", () => {
  const out = fillManifest("SSH-Signing: a\nSSH: b\n", { set: { SSH: "c" } });
  assert.equal(out, "SSH-Signing: a\nSSH: c\n");
});
