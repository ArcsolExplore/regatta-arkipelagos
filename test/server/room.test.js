// Room API (Startlinjen, Dragkampen, Sjöslaget) against the in-memory Redis. Uses real time (~15 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../support/fake-redis.js';
import { call } from '../support/api.js';

const redis = install();
const roomApi = await import('../../api/room.js');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const post = async (b) => { const r = await call(roomApi, 'POST', '/api/room', b); return { s: r.status, d: r.data }; };
const get = async (code, tok) => { const r = await call(roomApi, 'GET', `/api/room?code=${code}&tok=${tok}`); return { s: r.status, d: r.data }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('room protocol end to end', { timeout: 60000 }, async () => {
async function room(game, names) {
  const c = await post({ action: 'create', game, name: names[0] });
  const ps = [{ name: names[0], tok: c.d.tok, pid: c.d.pid }];
  for (const n of names.slice(1)) { const j = await post({ action: 'join', code: c.d.code, name: n }); ps.push({ name: n, tok: j.d.tok, pid: j.d.pid }); }
  return { code: c.d.code, ps };
}
// ---- Startlinjen
{
  const { code, ps } = await room('start', ['Anna', 'Bo', 'Cia']);
  const re = await post({ action: 'join', code, name: 'Anna B', tok: ps[0].tok });
  ok(re.d.pid === ps[0].pid && re.d.room.players.length === 3, 'rejoin with token keeps same player');
  const [a, b] = await Promise.all([post({ action: 'start', code, tok: ps[0].tok, expect: 0 }), post({ action: 'start', code, tok: ps[1].tok, expect: 0 })]);
  ok(a.d.room.race === 1 && b.d.room.race === 1, 'two simultaneous starts give one race');
  const gun = a.d.room.gunAt;
  const early = await post({ action: 'tap', code, tok: ps[0].tok, race: 1, at: Date.now() });
  ok(early.d.mine.ocs === true, 'tap before gun = OCS');
  const dup = await post({ action: 'tap', code, tok: ps[0].tok, race: 1, at: gun + 100 });
  ok(dup.d.first === false, 'second tap ignored');
  ok(dup.d.room.results.find((r) => r.id === ps[0].pid).ocs === true && dup.d.room.results.find((r) => r.id === ps[0].pid), 'own result visible');
  await sleep(gun - Date.now() + 50);
  const t1 = await post({ action: 'tap', code, tok: ps[1].tok, race: 1, at: gun + 180 });
  ok(t1.d.mine.ms === 180 && !t1.d.room.over, 'valid start 180 ms, race not over yet');
  const other = t1.d.room.results.find((r) => r.id === ps[0].pid);
  ok(other && other.ms === undefined, 'others hidden before race is over');
  const t2 = await post({ action: 'tap', code, tok: ps[2].tok, race: 1, at: gun + 90 });
  ok(t2.d.room.over && t2.d.room.results.every((r) => 'ms' in r), 'all tapped -> over, results revealed');
  const cheat = await post({ action: 'tap', code, tok: ps[2].tok, race: 1, at: gun - 999999 });
  ok(cheat.d.first === false, 'no retap');
}
// ---- Dragkampen
{
  const { code, ps } = await room('drag', ['A', 'B', 'C', 'D', 'E']);
  const g0 = await get(code, ps[0].tok);
  const teams = g0.d.room.players.map((p) => p.team);
  ok(teams.filter((t) => t === 'red').length === 3 && teams.filter((t) => t === 'blue').length === 2, 'auto-balanced teams 3/2');
  const st = await post({ action: 'start', code, tok: ps[0].tok, expect: 0 });
  ok(st.d.room.race === 1 && st.d.room.sizes.red === 3, 'drag started with sizes');
  const tm = await post({ action: 'team', code, tok: ps[0].tok, team: 'blue' });
  ok(tm.d.error === 'race_running', 'cannot switch team mid race');
  const before = await post({ action: 'pull', code, tok: ps[0].tok, race: 1, n: 10 });
  ok(before.d.room.pull.red === 0, 'pull before start ignored');
  await sleep(st.d.room.startAt - Date.now() + 50);
  // concurrent pulls: 3 red × 4 bursts of 5, 2 blue × 4 bursts of 6
  const bursts = [];
  for (let k = 0; k < 4; k++) for (let i = 0; i < 5; i++) { const p = ps[i]; const team = g0.d.room.players.find((x) => x.id === p.pid).team; bursts.push(post({ action: 'pull', code, tok: p.tok, race: 1, n: team === 'red' ? 5 : 6 })); }
  await Promise.all(bursts);
  const g1 = await get(code, ps[0].tok);
  ok(g1.d.room.pull.red === 60 && g1.d.room.pull.blue === 48, 'concurrent pulls all counted ' + JSON.stringify(g1.d.room.pull));
  ok(Math.abs(g1.d.room.pos - (60 / 3 - 48 / 2) / 20) < 1e-9, 'per-capita position');
  const cap = await post({ action: 'pull', code, tok: ps[3].tok, race: 1, n: 9999 });
  ok(cap.d.room.pull.blue === 88, 'pull capped at 40 per call');
  // blue per-capita: 88/2=44 vs red 20 -> diff -24 -> blue wins
  ok(cap.d.room.winner === 'blue' && cap.d.room.over, 'blue wins at target');
  const after = await post({ action: 'pull', code, tok: ps[0].tok, race: 1, n: 40 });
  ok(after.d.room.pull.red === 60, 'no pulls after win');
}
// ---- Sjöslaget
{
  const { code, ps } = await room('sjo', ['R1', 'B1', 'R2', 'B2']);
  const st = await post({ action: 'start', code, tok: ps[0].tok, expect: 0 });
  const views = await Promise.all(ps.map((p) => get(code, p.tok)));
  const team = (i) => views[i].d.room.players.find((x) => x.id === ps[i].pid).team;
  ok(Object.keys(views[0].d.room.ships).length === 1 && views[0].d.room.ships[team(0)], 'only own fleet visible');
  const fleets = { [team(0)]: views[0].d.room.ships[team(0)], [team(1)]: views[1].d.room.ships[team(1)] };
  ok(fleets.red.flat().length === 14 && fleets.blue.flat().length === 14, 'fleets have 14 cells');
  // no touching
  const touch = (ships) => { const N = 8; for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) for (const a of ships[i]) for (const b of ships[j]) if (Math.abs(a % N - b % N) <= 1 && Math.abs(Math.floor(a / N) - Math.floor(b / N)) <= 1) return true; return false; };
  ok(!touch(fleets.red) && !touch(fleets.blue), 'ships do not touch');
  let r = views[0].d.room;
  const waiting = ps.findIndex((p, i) => team(i) !== r.turn);
  const oot = await post({ action: 'fire', code, tok: ps[waiting].tok, race: 1, n: 0, cell: 0 });
  ok(oot.d.error === 'not_your_turn', 'out of turn rejected');
  // two shooters of the turn team at once with same n
  const shooters = ps.filter((p, i) => team(i) === r.turn);
  const [x, y] = await Promise.all(shooters.map((p, k) => post({ action: 'fire', code, tok: p.tok, race: 1, n: 0, cell: 10 + k })));
  const taken = [x, y].filter((q) => q.d.shot).length;
  ok(taken === 1, 'simultaneous shots -> exactly one');
  // play out: each team fires at enemy ship cells first (cheating bot), finishing game
  let guard = 0, shotsBy = { red: new Set(), blue: new Set() };
  for (const s of (await get(code, ps[0].tok)).d.room.shots) shotsBy[s.team].add(s.cell);
  while (guard++ < 200) {
    const v = (await get(code, ps[0].tok)).d.room;
    if (v.winner) { r = v; break; }
    const t = v.turn, enemy = t === 'red' ? 'blue' : 'red';
    const idx = ps.findIndex((p, i) => team(i) === t);
    // red plays perfectly, blue shoots water
    let cell;
    if (t === 'red') cell = fleets[enemy].flat().find((c) => !shotsBy[t].has(c));
    else { cell = [...Array(64).keys()].find((c) => !shotsBy[t].has(c) && !fleets.red.flat().includes(c)); }
    shotsBy[t].add(cell);
    await post({ action: 'fire', code, tok: ps[idx].tok, race: 1, n: v.n, cell });
  }
  ok(r.winner === 'red', 'red wins sjöslaget after sinking all');
  ok(r.ships.red && r.ships.blue, 'all fleets revealed at end');
  ok(r.sunk.blue.length === 5, 'all blue ships sunk');
  const extra = await post({ action: 'fire', code, tok: ps[0].tok, race: 1, n: r.n, cell: 63 });
  ok(extra.d.error === 'over', 'no shots after win');
  const again = await post({ action: 'start', code, tok: ps[1].tok, expect: 1 });
  ok(again.d.room.race === 2 && again.d.room.shots.length === 0, 'new race resets board');
}
// ---- errors
{
  const nf = await get('ZZZZ', 'x'); ok(nf.s === 404, 'unknown room 404');
  const bad = await post({ action: 'create', game: 'nope', name: 'X' }); ok(bad.s === 400, 'bad game 400');
  const { code, ps } = await room('drag', ['Solo']);
  const st = await post({ action: 'start', code, tok: ps[0].tok, expect: 0 }); ok(st.s === 409 && st.d.error === 'need_teams', 'team game needs both teams');
  const lv = await post({ action: 'leave', code, tok: ps[0].tok }); const g = await get(code, ''); ok(g.d.room.players.length === 0, 'leave removes player');
}

  assert.deepEqual(fails, []);
});

test('room GET without store answers 503 no_store', async () => {
  redis.uninstall();
  const r = await call(roomApi, 'GET', '/api/room?code=ABCD&tok=x');
  assert.equal(r.status, 503);
  assert.equal(r.data.error, 'no_store');
});
