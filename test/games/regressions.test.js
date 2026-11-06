// Repros of round-1 game bugs. Each must stay fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGames } from '../support/load.js';

const { G, L } = loadGames();
const step = (g, s, inp, secs, dt = 1 / 120) => { for (let t = 0; t < secs; t += dt) g.update(s, dt, { events: [], ...inp }); };

test('Fyrkaraktären: holding through the verdict into the next light does not crash (R1-LOG2-1)', () => {
  const g = G.fyr; const s = g.create(3);
  while (s.phase !== 'turn') g.update(s, 1 / 120, { hold: false, events: [] });
  step(g, s, { hold: true }, 4); // too long flash -> judge
  assert.equal(s.phase, 'judge');
  while (s.phase !== 'turn') g.update(s, 1 / 120, { hold: true, events: [] }); // keep holding into the next turn
  assert.doesNotThrow(() => step(g, s, { hold: false }, 0.5));
});

test('Fyrkaraktären: never pressing costs a life after 6 s and the game ends (R1-LOG2-4)', () => {
  const g = G.fyr; const s = g.create(3);
  let t = 0; while (!g.result(s) && t < 300) { g.update(s, 1 / 120, { hold: false, events: [] }); t += 1 / 120; }
  assert.ok(g.result(s), 'ended'); assert.ok(t < 120, `ended after ${t.toFixed(0)} s`);
});

test('Kasta tamp: the same throw lands identically at 30–144 fps (R1-LOG2-2)', () => {
  const g = G.tamp;
  for (const [vx, vy] of [[100, -1300], [-260, -900], [40, -1600], [0, -700]]) {
    const outs = [1 / 30, 1 / 60, 1 / 90, 1 / 144].map((frame) => {
      const s = g.create(77); L.tpLaunch(s, vx, vy);
      for (let k = 0; k < 2000 && s.phase === 'fly'; k++) { let rem = frame; while (rem > 1e-9) { const d = Math.min(rem, 1 / 120); g.update(s, d, { events: [] }); rem -= d; } }
      return JSON.stringify({ p: s.land.p, wet: s.land.wet, x: Math.round(s.land.x * 1000), z: Math.round(s.land.z * 1000) });
    });
    assert.equal(new Set(outs).size, 1, outs.join(' | '));
  }
});

test('Måsattacken: a fast swipe hits the gull it passes over (R1-LOG2-3)', () => {
  const g = G.mas;
  for (const stepPx of [40, 61, 90, 140]) {
    const s = g.create(1); s.gulls.length = 0;
    s.gulls.push({ kind: 'mas', x: 200, y: 300, x0: 0, y0: 0, spd: 0, wob: 0, wf: 1, ph: 0, age: 0, hp: 1, state: 'in', flap: 0, hitBy: {} });
    const ev = [{ type: 'down', id: 1, x: 200 - 2 * stepPx + 7, y: 302 }];
    for (let k = 1; k <= 4; k++) ev.push({ type: 'move', id: 1, x: 200 - 2 * stepPx + 7 + k * stepPx, y: 302 });
    g.update(s, 1 / 120, { events: ev });
    assert.notEqual(s.gulls[0].state, 'in', `step ${stepPx} px`);
  }
});

test('Måsattacken: a stroke stops hitting after 0.4 s', () => {
  const g = G.mas; const s = g.create(1); s.gulls.length = 0;
  g.update(s, 1 / 120, { events: [{ type: 'down', id: 1, x: 50, y: 50 }] });
  for (let i = 0; i < 60; i++) g.update(s, 1 / 120, { events: [] });
  s.gulls.push({ kind: 'mas', x: 200, y: 300, x0: 0, y0: 0, spd: 0, wob: 0, wf: 1, ph: 0, age: 0, hp: 1, state: 'in', flap: 0, hitBy: {} });
  g.update(s, 1 / 120, { events: [{ type: 'move', id: 1, x: 200, y: 300 }] });
  assert.equal(s.gulls[0].state, 'in');
});

test('Navigatören: no empty strokes survive two-finger drawing; every undo changes something (R1-LOG2-7)', () => {
  const g = G.navigator;
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = g.create(seed); let id = 1;
    let r = seed * 7919;
    const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
    // Run until the route is being drawn.
    while (s.phase !== 'run') g.update(s, 1 / 60, { events: [] });
    for (let k = 0; k < 400 && s.phase === 'run'; k++) {
      const ev = [];
      const end = s.strokes.length && s.strokes.at(-1).length ? s.strokes.at(-1).at(-1) : [s.map.start.x, s.map.start.y];
      const roll = rnd();
      if (roll < 0.25) ev.push({ type: 'down', id: id++, x: end[0] + (rnd() - 0.5) * 20, y: end[1] + (rnd() - 0.5) * 20 });
      else if (roll < 0.8) ev.push({ type: 'move', id: id - 1 - Math.floor(rnd() * 2), x: end[0] + (rnd() - 0.5) * 120, y: end[1] + (rnd() - 0.5) * 120 });
      else ev.push({ type: 'up', id: id - 1 - Math.floor(rnd() * 2) });
      g.update(s, 1 / 60, { events: ev, boostPressed: false });
      if (!s.drawing) assert.ok(s.strokes.every((st) => st.length), `seed ${seed}: empty stroke while not drawing`);
    }
    while (s.phase === 'run' && s.strokes.length) {
      const before = JSON.stringify(s.strokes);
      g.update(s, 1 / 60, { events: [], boostPressed: true });
      assert.notEqual(JSON.stringify(s.strokes), before, 'undo changed the route');
    }
  }
});

test('Lotsen: after a grounding, 0.5 s straight on almost never grounds again (R1-LOG2-6)', () => {
  // Old code: ~2.7 % re-grounded (heading restored toward the rock); now < 1 %.
  const g = G.lots; let respawns = 0, again = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = g.create(seed);
    while (s.phase === 'memo') g.update(s, 1 / 60, { events: [] });
    let t = 0;
    while (s.phase === 'run' && t < 100) {
      const h = s.hits;
      g.update(s, 1 / 120, { events: [], right: Math.sin(t * 1.3 + seed) > 0.6 }); t += 1 / 120;
      if (s.hits > h) {
        respawns++;
        const h2 = s.hits;
        for (let k = 0; k < 96 + 60; k++) g.update(s, 1 / 120, { events: [] }); // 0.8 s stop, then 0.5 s straight
        if (s.hits > h2) again++;
        t += 1.3;
      }
    }
  }
  assert.ok(respawns > 300, `enough respawns (${respawns})`);
  assert.ok(again / respawns < 0.01, `${again} of ${respawns} grounded again`);
});

test('Förtöj!: crash or not does not depend on the frame rate, and no round lasts over 12 s (R1-LOG1-2)', () => {
  const g = G.fortoj; let mismatches = 0, cases = 0, longest = 0;
  for (let seed = 1; seed <= 25; seed++) {
    for (const brakeAt of [80, 120, 160, 200, 240]) {
      const out = [1 / 30, 1 / 60, 1 / 144].map((frame) => {
        const s = g.create(seed);
        while (s.phase !== 'run') g.update(s, 1 / 120, { events: [] });
        let t = 0;
        while (s.phase === 'run' && t < 30) {
          let rem = frame; const hold = s.bowY - 96 < brakeAt;
          while (rem > 1e-9 && s.phase === 'run') { const d = Math.min(rem, 1 / 120); g.update(s, d, { hold, events: [] }); rem -= d; t += d; }
        }
        longest = Math.max(longest, t);
        return s.pts.at(-1) === 0 && s.lab === 'KRASCH!' ? 'crash' : 'ok';
      });
      cases++; if (new Set(out).size > 1) mismatches++;
    }
  }
  assert.equal(mismatches, 0, `${mismatches} of ${cases} differ`);
  assert.ok(longest <= 12.1, `longest round ${longest.toFixed(1)} s`);
});
