import { readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const within = (root, file) => {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};

// Resolve a request only to a real file in dist. Check both the lexical path and its
// real path so encoded parent segments and symlinks cannot escape the served tree.
// Like the production host, a path without an extension that names no file falls back
// to <path>.html (so /keys serves keys.html). Returns the real path, or null.
export async function resolveStaticFile(dist, requestUrl) {
  const raw = requestUrl?.split('?')[0] ?? '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;

  let pathname;
  try { pathname = decodeURIComponent(raw); } catch { return null; }
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';

  const root = await realpath(dist);
  const file = resolve(root, '.' + pathname);
  if (!within(root, file)) return null;
  let actual;
  try { actual = await realpath(file); } catch (err) {
    if (err.code !== 'ENOENT' || extname(file) !== '') throw err;
    actual = await realpath(file + '.html');
  }
  if (!within(root, actual)) return null;
  return actual;
}

export async function readStaticFile(dist, requestUrl) {
  const actual = await resolveStaticFile(dist, requestUrl);
  return actual && readFile(actual);
}
