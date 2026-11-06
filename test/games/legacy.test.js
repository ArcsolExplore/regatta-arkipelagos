// Behaviour checks written while the newer games were built (bots, solvability, dt drift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../support/load.js';

for (const f of ['extra_test.cjs', 'more_test.cjs']) {
  test(`legacy ${f}`, () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'test/games/legacy', f)], { encoding: 'utf8' });
    assert.match(out, /ALL OK/, out.split('\n').filter((l) => /FAIL/.test(l)).join('\n'));
  });
}
