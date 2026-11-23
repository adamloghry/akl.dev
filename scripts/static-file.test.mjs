import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readStaticFile, resolveStaticFile } from './static-file.mjs';

test('serves only files inside the static tree', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'akl-static-'));
  try {
    const dist = join(workspace, 'dist');
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), 'home');
    await writeFile(join(workspace, 'private.txt'), 'private');
    await symlink(join(workspace, 'private.txt'), join(dist, 'alias.txt'));

    assert.equal((await readStaticFile(dist, '/')).toString(), 'home');
    assert.equal((await readStaticFile(dist, '/index.html?seed=1')).toString(), 'home');
    for (const request of ['/../private.txt', '/%2e%2e/private.txt', '/%2e%2e%2fprivate.txt', '/alias.txt', '//other', '/%00']) {
      assert.equal(await readStaticFile(dist, request), null, request);
    }
    assert.equal((await readFile(join(workspace, 'private.txt'), 'utf8')), 'private');

    // Extensionless paths fall back to <path>.html, as on the production host; a real file wins.
    await writeFile(join(dist, 'keys.html'), 'keys');
    await writeFile(join(dist, 'allowed_signers'), 'signers');
    assert.equal((await readStaticFile(dist, '/keys')).toString(), 'keys');
    assert.ok((await resolveStaticFile(dist, '/keys')).endsWith('keys.html'));
    assert.equal((await readStaticFile(dist, '/allowed_signers')).toString(), 'signers');
    await assert.rejects(readStaticFile(dist, '/missing'));
    await assert.rejects(readStaticFile(dist, '/missing.css'));
    await symlink(join(workspace, 'private.txt'), join(dist, 'leak.html'));
    assert.equal(await readStaticFile(dist, '/leak'), null);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
