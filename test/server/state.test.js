// Leaderboard API against the in-memory Redis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../support/fake-redis.js';
import { call } from '../support/api.js';

const redis = install();
const api = await import('../../api/state.js');

test('GET gives round 1 and no scores on a fresh store', async () => {
  const r = await call(api, 'GET', '/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.round.n, 1);
  assert.deepEqual(r.data.scores, []);
});

test('score keeps the best value per name and game', async () => {
  const a = await call(api, 'POST', '/api/state', { type: 'score', round: 1, game: 'slalom', name: 'Anna', score: 500 });
  assert.equal(a.status, 200);
  await call(api, 'POST', '/api/state', { type: 'score', round: 1, game: 'slalom', name: 'Anna', score: 300 });
  const r = await call(api, 'GET', '/api/state');
  const rec = r.data.scores.filter((x) => x.game === 'slalom');
  assert.equal(rec.length, 1);
  assert.equal(rec[0].score, 500);
});

test('out-of-range and unknown games are rejected', async () => {
  const a = await call(api, 'POST', '/api/state', { type: 'score', round: 1, game: 'slalom', name: 'Anna', score: -5 });
  assert.equal(a.status, 400);
  const b = await call(api, 'POST', '/api/state', { type: 'score', round: 1, game: 'nope', name: 'Anna', score: 5 });
  assert.equal(b.status, 400);
});

test('store failure answers 5xx, not a crash', async () => {
  redis.failNext(1);
  const r = await call(api, 'GET', '/api/state');
  assert.ok(r.status >= 500, `status ${r.status}`);
});

test('no store answers 503 no_store', async () => {
  redis.uninstall();
  const r = await call(api, 'GET', '/api/state');
  assert.equal(r.status, 503);
  assert.equal(r.data.error, 'no_store');
});
