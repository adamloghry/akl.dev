// csp-hashes — after `astro build`, hash every inline executable <script> in dist/**/*.html and
// write the hashes into dist/_headers in place of the 'inline-script-hashes' token. Keeps the CSP
// free of 'unsafe-inline' without hand-maintained hashes. JSON-LD is a data block, not executed,
// and is not subject to script-src, so it is skipped.
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = "'inline-script-hashes'";
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)(?![^>]*\btype="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi;

export function inlineScriptHashes(html) {
  return [...html.matchAll(INLINE_SCRIPT)]
    .filter(m => m[1].length > 0)
    .map(m => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
}

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

export default function cspHashes() {
  return {
    name: 'csp-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const hashes = new Set();
        for (const f of await htmlFiles(root)) for (const h of inlineScriptHashes(await readFile(f, 'utf8'))) hashes.add(h);
        if (hashes.size === 0) logger.warn('no inline scripts found; script-src is self only');
        const path = join(root, '_headers');
        const headers = await readFile(path, 'utf8');
        if (!headers.includes(TOKEN)) throw new Error(`csp-hashes: ${TOKEN} not found in _headers`);
        // replaceAll + guard: a string-pattern replace() swaps only the first occurrence, so a stray
        // token (e.g. in a comment) would silently leave the CSP line unsubstituted.
        const out = headers.replaceAll(TOKEN, [...hashes].sort().join(' '));
        if (out.includes(TOKEN)) throw new Error(`csp-hashes: ${TOKEN} still present after substitution`);
        await writeFile(path, out);
        logger.info(`${hashes.size} inline script hash(es) written to _headers`);
      },
    },
  };
}
