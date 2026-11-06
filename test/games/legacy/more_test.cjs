const L = require('../../support/games.cjs'); const G = L.GAME_LOGIC;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
// ---------- Måsattacken
function masBot(seed, mode, reach = 230, dt = 1 / 120) { const g = G.mas; const s = g.create(seed); let id = 1, guard = 0;
  while (!g.result(s) && guard++ < 1e5) { const ev = [];
    if (mode !== 'idle') for (const q of s.gulls) if (q.state === 'in' && Math.hypot(q.x - 200, q.y - 470) < reach && (mode === 'perfect' || (Math.hypot(q.x - 200, q.y - 470) < 95 && Math.random() < 0.012))) { ev.push({ type: 'down', id, x: q.x, y: q.y }, { type: 'up', id }); id++; }
    g.update(s, dt, { events: ev }); }
  return [g.result(s), s]; }
for (const sd of [11, 222, 3333]) {
  const [p, ps] = masBot(sd, 'perfect'), [i] = masBot(sd, 'idle'), [r] = masBot(sd, 'sloppy');
  console.log(`mas seed ${sd}: perfect ${p.score} (${ps.spawns.length} måsar, ${ps.shrimps} räkor) | sloppy ${r.score} | idle ${i.score} ${i.title}`);
  ok(p.score > r.score && r.score >= i.score && ps.shrimps === 10, 'mas ordering');
}
ok(L.msSpawns(5).length === L.msSpawns(5).length && JSON.stringify(L.msSpawns(5)) === JSON.stringify(L.msSpawns(5)), 'mas seeded');
{ // trut needs two separate strokes, a swipe over it hits once
  const g = G.mas; const s = g.create(1); s.gulls.push({ kind: 'trut', x: 200, y: 300, x0: 0, y0: 0, spd: 0, wob: 0, wf: 1, ph: 0, age: 0, hp: 2, state: 'in', flap: 0, hitBy: {} });
  g.update(s, 0.001, { events: [{ type: 'down', id: 9, x: 200, y: 300 }, { type: 'move', id: 9, x: 201, y: 300 }, { type: 'move', id: 9, x: 202, y: 300 }] });
  const tr = s.gulls.find((q) => q.kind === 'trut'); ok(tr.hp === 1 && tr.state === 'in', 'one stroke = one hit on trut');
  g.update(s, 0.001, { events: [{ type: 'up', id: 9 }, { type: 'down', id: 10, x: 200, y: 300 }] }); ok(tr.state === 'flee', 'second stroke shoos trut');
}
// ---------- Svallvågen
function svBot(seed, mode, dt = 1 / 120) { const g = G.svall; const s = g.create(seed); const hist = []; let guard = 0;
  while (!g.result(s) && guard++ < 1e6) {
    const [wx, wy] = L.svTilt(s.wakes, s.t); hist.push([s.t, wx, wy]);
    let inp = { events: [], tiltOk: true, tiltX: 0, tiltY: 0 };
    if (mode === 'perfect') { inp.tiltX = -wx; inp.tiltY = -wy; }
    else if (typeof mode === 'number') { const want = s.t - mode; let k = hist.length - 1; while (k > 0 && hist[k][0] > want) k--; inp.tiltX = -hist[k][1] * 0.9; inp.tiltY = -hist[k][2] * 0.9; }
    g.update(s, dt, inp); }
  return g.result(s); }
for (const sd of [7, 77, 777]) {
  const res = ['perfect', 0.25, 0.5, 'idle'].map((m) => svBot(sd, m));
  console.log(`svall seed ${sd}: ` + res.map((r, i) => `${['perfekt', 'lag 0,25s', 'lag 0,5s', 'idle'][i]} ${r.score} (${r.title})`).join(' | '));
  ok(res[0].score >= 990 && res[0].score > res[1].score && res[1].score > res[2].score && res[2].score > res[3].score - 40 && res[3].score < 350, 'svall skill ordering');
}
{ const run = (dt) => { const g = G.svall; const s = g.create(77); while (!g.result(s)) { const [wx, wy] = L.svTilt(s.wakes, s.t + dt / 2 - 0.25); g.update(s, dt, { events: [], tiltOk: true, tiltX: -wx * 0.9, tiltY: -wy * 0.9 }); } return g.result(s).score; };
  const a = run(1 / 120), b = run(1 / 240), c = run(1 / 480); console.log('svall dt 1/120, 1/240, 1/480:', a, b, c); ok(Math.abs(a - c) <= 15, 'svall frame-rate independent within engine step sizes'); }
// ---------- Lotsen
function ltBot(seed, dt = 1 / 120, horn = false) {
  const g = G.lots; const s = g.create(seed); const m = s.map;
  const gr = 6, cols = 67, rows = 121; const free = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const px = x * gr, py = y * gr; if (px < 18 || px > 382 || py < 18 || py > 702) continue; free[y * cols + x] = m.obs.every((o) => L.polyPointGap(o.P, px, py) > 19) ? 1 : 0; }
  const bfs = (a, b) => { const id = (p) => Math.round(p.y / gr) * cols + Math.round(p.x / gr); const s0 = id(a), t = id(b); const prev = new Int32Array(cols * rows).fill(-1); prev[s0] = s0; const q = [s0]; let h = 0;
    while (h < q.length) { const c = q[h++]; if (c === t) break; const cx = c % cols, cy = (c - cx) / cols; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const n = ny * cols + nx; if (prev[n] < 0 && free[n]) { prev[n] = c; q.push(n); } } }
    if (prev[t] < 0) return null; const out = []; for (let c = t; c !== s0; c = prev[c]) out.push([(c % cols) * gr, Math.floor(c / cols) * gr]); return out.reverse(); };
  const pts = [m.start, m.marks[0], m.marks[1], m.goal]; let path = [];
  for (let i = 0; i < 3; i++) { const p = bfs(pts[i], pts[i + 1]); if (!p) return { nopath: true }; path = path.concat(p); }
  let wi = 0, guard = 0;
  while (!g.result(s) && guard++ < 2e5) {
    let best = wi, bd = 1e9; for (let k = wi; k < Math.min(path.length, wi + 40); k++) { const d = Math.hypot(path[k][0] - s.x, path[k][1] - s.y); if (d < bd) { bd = d; best = k; } } wi = best;
    let ti = wi; while (ti < path.length - 1 && Math.hypot(path[ti][0] - s.x, path[ti][1] - s.y) < 24) ti++;
    const [tx, ty] = path[ti];
    const want = Math.atan2(ty - s.y, tx - s.x); const d = L.angDiff(want, s.a);
    g.update(s, dt, { left: d < -0.05, right: d > 0.05, boostPressed: false, events: [] });
  }
  return { r: g.result(s), s };
}
let lok = 0, lt = [];
for (let sd = 1; sd <= 40; sd++) { const o = ltBot(sd * 7717); if (o.nopath) { console.log('lots no bot path', sd); continue; } if (o.r && o.s.hits === 0) { lok++; lt.push(o.r.score); } else console.log('lots seed', sd, 'hits', o.s.hits, o.r && o.r.score); }
console.log('lots bot clean finishes', lok, '/40; ms', Math.min(...lt), '-', Math.max(...lt));
ok(lok >= 34, 'lots bot mostly clean');
let t0 = Date.now(); for (let sd = 1; sd <= 100; sd++) L.ltMap(sd * 31); console.log('ltMap avg ms', (Date.now() - t0) / 100);
{ const a = ltBot(7717, 1 / 60), b = ltBot(7717, 1 / 240); console.log('lots dt drift', a.r && a.r.score, b.r && b.r.score); ok(a.r && b.r && Math.abs(a.r.score - b.r.score) < 600, 'lots dt'); }
{ // aground detection honest: hull touching a square polygon
  const s = G.lots.create(3); s.map.obs = [{ kind: 'land', P: [[0,0],[40,0],[40,40],[0,40]], box: [0,0,40,40] }].map(o => ({...o, P: o.P.map(([x,y]) => [x+180, y+300]), box: [180,300,220,340]}));
  s.a = -Math.PI / 2; s.x = 200; const hullHalf = -Math.min(...L.ltHull({ ...s, x: 0, y: 0 }).map(([, y]) => y));
  s.y = 340 + hullHalf + 0.5; ok(!L.ltAground(s), 'near miss 0.5 px is not aground');
  s.y = 340 + hullHalf - 0.5; ok(L.ltAground(s), 'overlap 0.5 px is aground');
}
console.log(fails ? fails + ' FAILURES' : 'ALL OK');
