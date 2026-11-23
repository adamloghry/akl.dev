#!/usr/bin/env node
// Print the WKD file name for an email address.
// WKD name = z-base-32( SHA-1( lowercase(local-part) ) ), always 32 characters.
// Usage: node wkd-hash.mjs akl@akl.dev
import { createHash } from "node:crypto";

const ZB32 = "ybndrfg8ejkmcpqxot1uwisza345h769";

export function wkdHash(address) {
  const at = address.lastIndexOf("@");
  if (at < 1) throw new Error(`not an email address: ${address}`);
  const local = address.slice(0, at).toLowerCase();
  const digest = createHash("sha1").update(local, "utf8").digest();
  let bits = "";
  for (const byte of digest) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += ZB32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const address = process.argv[2];
  if (!address) {
    console.error("usage: wkd-hash.mjs <email-address>");
    process.exit(2);
  }
  console.log(wkdHash(address));
}
