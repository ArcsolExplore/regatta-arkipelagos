import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGames, seeded } from '../support/load.js';
import { runGame, fuzzPolicy, idlePolicy, hashJSON } from '../support/sim.js';
import { SOLO, inRange, SERVER_GAMES, APP_RANGE } from '../support/rules.js';

const { G } = loadGames();
// Longest a game may run without the player doing anything sensible (game seconds).
const T_MAX = { kryss: 425, slalom: 60, fortoj: 120, parkera: 900, navigator: 185, fyr: 200, tamp: 140, grill: 62, mas: 62, svall: 62, lots: 186 };
// Known open bugs (R1-LOG2-4/5, no time limit in Kryssbanan). Remove an entry when its fix lands.
const KNOWN_FUZZ = { kryss: 'no time limit', navigator: 'no end condition (R1-LOG2-5)', lots: 'no end condition (R1-LOG2-5)' };
const KNOWN_IDLE = { ...KNOWN_FUZZ, fyr: 'waits forever (R1-LOG2-4)', tamp: 'waits forever for a throw' };

test('registry: every solo game is loaded and ranged on server and client', () => {
  for (const id of SOLO) {
    assert.ok(G[id], `${id} loaded`);
    assert.equal(G[id].id, id);
    assert.ok(SERVER_GAMES[id], `${id} on server`);
    assert.deepEqual(APP_RANGE[id], [SERVER_GAMES[id].min, SERVER_GAMES[id].max], `${id} client range = server range`);
  }
});

for (const id of SOLO) {
  const g = G[id];
  test(`${id}: random play never throws, ends in time, valid score`, { todo: KNOWN_FUZZ[id] }, () => {
    for (const seed of [1, 22, 333]) {
      for (const frameDt of [1 / 30, 1 / 60, 1 / 144]) {
        const { res, t } = runGame(g, seed, fuzzPolicy(g, seed), { frameDt, maxT: T_MAX[id], draw: frameDt === 1 / 30 });
        assert.ok(res, `${id} seed ${seed} dt ${frameDt.toFixed(4)} ended (ran ${t.toFixed(1)} s)`);
        assert.ok(inRange(id, res.score), `${id} score ${res.score} in range`);
        assert.equal(typeof res.title, 'string');
      }
    }
  });
  test(`${id}: idle player reaches a result`, { todo: KNOWN_IDLE[id] }, () => {
    const { res, t } = runGame(g, 7, idlePolicy(g), { maxT: T_MAX[id] });
    assert.ok(res, `${id} idle ended (ran ${t.toFixed(1)} s)`);
  });
  test(`${id}: create(seed) is deterministic and gameplay ignores Math.random`, () => {
    assert.equal(hashJSON(g.create(5)), hashJSON(g.create(5)));
    const a = loadGames({ random: seeded(1) }).G[id], b = loadGames({ random: seeded(2) }).G[id];
    const ra = runGame(a, 9, fuzzPolicy(a, 9), { maxT: 30 }), rb = runGame(b, 9, fuzzPolicy(b, 9), { maxT: 30 });
    assert.equal(ra.steps, rb.steps);
    assert.deepEqual(ra.res && ra.res.score, rb.res && rb.res.score);
  });
}
