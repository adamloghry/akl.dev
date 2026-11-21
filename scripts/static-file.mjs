import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const within = (root, file) => {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};

// Resolve a request only to a real file in dist. Check both the lexical path and its
// real path so encoded parent segments and symlinks cannot escape the served tree.
export async function readStaticFile(dist, requestUrl) {
  const raw = requestUrl?.split('?')[0] ?? '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;

  let pathname;
  try { pathname = decodeURIComponent(raw); } catch { return null; }
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';

  const root = await realpath(dist);
  const file = resolve(root, '.' + pathname);
  if (!within(root, file)) return null;
  const actual = await realpath(file);
  if (!within(root, actual)) return null;
  return readFile(actual);
}
