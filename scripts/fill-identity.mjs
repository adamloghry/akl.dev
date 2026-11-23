#!/usr/bin/env node
// Fill or update "Key: value" lines of the identity manifest source
// (identity/identity.src.txt). Used by scripts/identity-setup.sh; also handy
// for the yearly renewal, because it replaces a line whatever its old value.
//
// Usage: node scripts/fill-identity.mjs [--file identity/identity.src.txt]
//          [--set Key=Value]... [--drop Key]... [--emails a@x,b@y]
//
//   --set Key=Value   replace the value of the first "Key:" line (the line must exist)
//   --drop Key        delete every "Key:" line
//   --emails a,b      replace the block of "Email:" lines with these, in this order

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const lineOf = (key) => new RegExp(`^${key.replace(/[^A-Za-z0-9-]/g, "")}:(\\s|$)`);

export function fillManifest(text, { set = {}, drop = [], emails = null } = {}) {
  let lines = text.split("\n");

  for (const [key, value] of Object.entries(set)) {
    if (/[\r\n]/.test(value)) throw new Error(`${key}: value must be a single line`);
    const at = lines.findIndex((l) => lineOf(key).test(l));
    if (at === -1) throw new Error(`no "${key}:" line in the manifest; add it by hand first`);
    lines[at] = `${key}: ${value}`;
  }

  for (const key of drop) lines = lines.filter((l) => !lineOf(key).test(l));

  if (emails) {
    const at = lines.findIndex((l) => lineOf("Email").test(l));
    if (at === -1) throw new Error('no "Email:" line in the manifest; add one by hand first');
    const rest = lines.filter((l) => !lineOf("Email").test(l));
    rest.splice(at, 0, ...emails.map((e) => `Email: ${e}`));
    lines = rest;
  }

  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opts = { set: {}, drop: [], emails: null };
  let file = "identity/identity.src.txt";
  const argv = process.argv.slice(2);
  try {
    for (let i = 0; i < argv.length; i += 2) {
      const [flag, value] = [argv[i], argv[i + 1]];
      if (value === undefined) throw new Error(`${flag}: missing value`);
      if (flag === "--file") file = value;
      else if (flag === "--drop") opts.drop.push(value);
      else if (flag === "--emails") opts.emails = value.split(",").map((e) => e.trim()).filter(Boolean);
      else if (flag === "--set") {
        const eq = value.indexOf("=");
        if (eq < 1) throw new Error(`--set wants Key=Value, got "${value}"`);
        opts.set[value.slice(0, eq)] = value.slice(eq + 1);
      } else throw new Error(`unknown option ${flag}`);
    }
    await writeFile(file, fillManifest(await readFile(file, "utf8"), opts));
  } catch (err) {
    console.error(`fill-identity: ${err.message}`);
    process.exit(1);
  }
}
