// Golden outcomes: scripted (seeded) random play must give exactly the same results.
// A failure means game outcomes changed. If that is intended, bump the game's logic
// version and run: UPDATE_GOLDEN=1 node --test test/games/golden.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGames, seeded, ROOT } from '../support/load.js';
import { runGame, fuzzPolicy, hashJSON } from '../support/sim.js';
import { SOLO } from '../support/rules.js';

const FILE = path.join(ROOT, 'test/fixtures/golden.json');
const update = !!process.env.UPDATE_GOLDEN;
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const now = {};

for (const id of SOLO) {
  test(`golden ${id}`, () => {
    const { G } = loadGames({ random: seeded(99) });
    const g = G[id];
    now[id] = [3, 44].map((seed) => {
      const { res, t, steps } = runGame(g, seed, fuzzPolicy(g, seed), { frameDt: 1 / 60, maxT: 90 });
      return { seed, init: hashJSON(g.create(seed)), steps, t: Math.round(t * 1000), res: res && { score: res.score, title: res.title, detail: res.detail || '' } };
    });
    if (!update) assert.deepEqual(now[id], old[id], `${id} outcomes changed`);
  });
}

test('golden file written', { skip: !update }, () => {
  fs.writeFileSync(FILE, JSON.stringify({ ...old, ...now }, null, 1) + '\n');
});
