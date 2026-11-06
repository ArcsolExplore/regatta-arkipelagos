// Error contract, request checks and the round-1 server fixes that don't need protocol v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../support/fake-redis.js';
import { call } from '../support/api.js';
import { cleanName } from '../../api/_shared.js';

const redis = install();
const state = await import('../../api/state.js');
const room = await import('../../api/room.js');

test('every response carries t1 <= t2, serverNow and build', async () => {
  for (const r of [await call(state, 'GET', '/api/state'), await call(room, 'GET', '/api/room?code=ZZZZ'), await call(state, 'POST', '/api/state', { type: 'nope' })]) {
    assert.ok(Number.isFinite(r.data.t1) && r.data.t1 <= r.data.t2, JSON.stringify(r.data));
    assert.equal(r.data.serverNow, r.data.t2);
    assert.equal(typeof r.data.build, 'string');
  }
});

test('text/plain posts are refused (no cross-site form posts)', async () => {
  const r = await call(state, 'POST', '/api/state', JSON.stringify({ type: 'round', expect: 1 }), { 'content-type': 'text/plain' });
  assert.equal(r.status, 415);
  const g = await call(state, 'GET', '/api/state');
  assert.equal(g.data.round.n, 1, 'round unchanged');
});

test('a foreign Origin is refused, same origin and no origin work', async () => {
  const body = { type: 'score', round: 1, game: 'fyr', name: 'Bo', score: 10 };
  assert.equal((await call(state, 'POST', '/api/state', body, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(state, 'POST', '/api/state', body, { origin: 'https://app.test' })).status, 200);
  assert.equal((await call(state, 'POST', '/api/state', body)).status, 200);
});

test('store failures map to 502 / 503 store_quota and are logged', async () => {
  const logged = []; const orig = console.error; console.error = (l) => logged.push(l);
  try {
    redis.failNext(1, 'http500');
    assert.equal((await call(state, 'GET', '/api/state')).status, 502);
    redis.failNext(1, 'quota');
    const q = await call(state, 'GET', '/api/state');
    assert.equal(q.status, 503); assert.equal(q.data.error, 'store_quota');
  } finally { console.error = orig; }
  assert.equal(logged.length, 2);
  assert.match(logged[0], /store_error/);
  assert.doesNotMatch(logged.join('\n'), /Bo|tok/);
});

test('a hanging store gives up within ~3 s', async () => {
  redis.failNext(1, 'hang');
  const t0 = Date.now();
  const keep = setInterval(() => {}, 100); // AbortSignal.timeout does not keep Node alive by itself
  const r = await call(state, 'GET', '/api/state').finally(() => clearInterval(keep));
  assert.equal(r.status, 502);
  assert.ok(Date.now() - t0 < 3600);
});

test('cleanName strips bidi/zero-width/controls and keeps 20 code points', () => {
  assert.equal(cleanName('‮anna'), 'anna');
  assert.equal(cleanName('An​na'), 'Anna');
  assert.equal(cleanName('<b>Kalle</b>'), 'bKalle/b');
  assert.equal(Array.from(cleanName('😀'.repeat(25))).length, 20);
  assert.equal(cleanName('  Åsa   Öberg '), 'Åsa Öberg');
});

async function mkRoom(game, names) {
  const c = await call(room, 'POST', '/api/room', { action: 'create', game, name: names[0] });
  const ps = [{ tok: c.data.tok, pid: c.data.pid }];
  for (const n of names.slice(1)) { const j = await call(room, 'POST', '/api/room', { action: 'join', code: c.data.code, name: n }); ps.push({ tok: j.data.tok, pid: j.data.pid }); }
  return { code: c.data.code, ps };
}

test('rejections are 409 with the room included', async () => {
  const { code, ps } = await mkRoom('start', ['A']);
  const r = await call(room, 'POST', '/api/room', { action: 'start', code, tok: ps[0].tok, expect: 5 });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'race_changed'); assert.ok(r.data.room);
});

test('Sjöslaget: a player who joins mid-game sees no fleet and cannot fire (R1-SRV-1)', async () => {
  const { code, ps } = await mkRoom('sjo', ['R', 'B']);
  await call(room, 'POST', '/api/room', { action: 'start', code, tok: ps[0].tok, expect: 0 });
  const late = await call(room, 'POST', '/api/room', { action: 'join', code, name: 'Sen' });
  assert.deepEqual(late.data.room.ships, {});
  const fire = await call(room, 'POST', '/api/room', { action: 'fire', code, tok: late.data.tok, race: 1, n: 0, cell: 1 });
  assert.equal(fire.status, 409); assert.equal(fire.data.error, 'not_racing');
});

test('Startlinjen: a late tap stamped 2.5 s in the past is clamped to 1.5 s', async () => {
  const { code, ps } = await mkRoom('start', ['A', 'B']);
  const st = await call(room, 'POST', '/api/room', { action: 'start', code, tok: ps[0].tok, expect: 0 });
  const now = Date.now();
  const r = await call(room, 'POST', '/api/room', { action: 'tap', code, tok: ps[0].tok, race: 1, at: now - 2500 });
  assert.ok(Math.abs(r.data.mine.ms - (now - 1500 - st.data.room.gunAt)) < 100, JSON.stringify(r.data.mine));
  const again = await call(room, 'POST', '/api/room', { action: 'tap', code, tok: ps[0].tok, race: 1, at: now });
  assert.equal(again.data.first, false); assert.equal(again.data.mine.ms, r.data.mine.ms, 'repeat returns the stored tap');
});

test('a failed start does not leave the room locked (R1-SRV-10)', async () => {
  const { code, ps } = await mkRoom('start', ['A']);
  // Fail the meta write only (the second pipeline of the start action).
  let n = 0; const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).includes('fake-redis') && /"SET","ra:room:[A-Z]+:meta"/.test(init.body) && n++ === 0) return new Response('down', { status: 500 }); return real(u, init); };
  try {
    const a = await call(room, 'POST', '/api/room', { action: 'start', code, tok: ps[0].tok, expect: 0 });
    assert.equal(a.status, 502);
  } finally { globalThis.fetch = real; }
  const b = await call(room, 'POST', '/api/room', { action: 'start', code, tok: ps[0].tok, expect: 0 });
  assert.equal(b.status, 200); assert.equal(b.data.room.race, 1);
});

test('/api/health reports the store', async () => {
  const health = await import('../../api/health.js');
  const ok = await call(health, 'GET', '/api/health');
  assert.equal(ok.status, 200); assert.equal(ok.data.store, 'ok');
  redis.failNext(1, 'quota');
  const q = await call(health, 'GET', '/api/health');
  assert.equal(q.status, 503); assert.equal(q.data.store, 'quota');
  assert.equal((await call(health, 'GET', '/api/health?shallow=1')).status, 200);
});

test('/api/log accepts 10 reports a minute and strips room codes and tokens', async () => {
  const log = await import('../../api/log.js');
  const lines = []; const orig = console.error; console.error = (l) => lines.push(l);
  const statuses = [];
  try {
    for (let i = 0; i < 11; i++) statuses.push((await call(log, 'POST', '/api/log', { kind: 'engine', msg: 'boom', path: '/#rum-ABCD?tok=abc123' }, { 'x-real-ip': '1.2.3.4' })).status);
  } finally { console.error = orig; }
  assert.deepEqual(statuses, [...Array(10).fill(204), 429]);
  assert.doesNotMatch(lines[0], /ABCD|abc123/);
});
