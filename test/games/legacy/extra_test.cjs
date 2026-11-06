const L = require('../../support/games.cjs');
const { GAME_LOGIC: G, nvMap, nvSolvable, NV, segPolyDist, fyJudge, fyLevels, FY_CHARS, TP, tpLaunch, tpScore, GR, GR_TYPES } = L;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// --- Navigatören
let t0 = Date.now(), nobs = 0, unsolved = 0;
for (let sd = 1; sd <= 200; sd++) { const m = nvMap(sd * 7919); nobs += m.obs.length; if (!nvSolvable(m)) unsolved++; }
console.log('nav maps: avg obs', (nobs / 200).toFixed(1), 'unsolvable', unsolved, 'ms', Date.now() - t0);
ok(unsolved === 0, 'all maps solvable');
// segment tests: near miss 2px vs touch
const sq = [[0,0],[10,0],[10,10],[0,10]];
ok(segPolyDist(-5, 12, 15, 12, sq) === 2, 'near miss 2px'); ok(segPolyDist(-5, 9, 15, 9, sq) === 0 || segPolyDist(-5,9,15,9,sq) < 0, 'crossing');
ok(segPolyDist(-5, 11.4, 15, 11.4, sq) < NV.CLEAR, 'within clearance counts');
ok(segPolyDist(9.5, 10.5, 30, 30, sq) > 0 && segPolyDist(9.5, 10.5, 30, 30, sq) < 1, 'corner clip distance');
// bot: BFS path on fine grid then draw it
function bfsPath(m, a, b) {
  const g = 6, cols = Math.floor(400/g)+1, rows = Math.floor(720/g)+1; const free = new Uint8Array(cols*rows);
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++){ const px=x*g,py=y*g; if(px<10||px>390||py<10||py>710) continue; free[y*cols+x] = m.obs.every(o=>L.polyPointGap(o.P,px,py)>9)?1:0; }
  const id=(p)=>Math.round(p.y/g)*cols+Math.round(p.x/g); const s=id(a), t=id(b); const prev=new Int32Array(cols*rows).fill(-1); prev[s]=s; const q=[s];
  while(q.length){const c=q.shift(); if(c===t)break; const cx=c%cols, cy=(c-cx)/cols; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=cx+dx,ny=cy+dy; if(nx<0||ny<0||nx>=cols||ny>=rows)continue; const n=ny*cols+nx; if(prev[n]<0&&free[n]){prev[n]=c;q.push(n);}}}
  if (prev[t] < 0) return null; const out=[]; for(let c=t;c!==s;c=prev[c]) out.push([ (c%cols)*g, Math.floor(c/cols)*g ]); return out.reverse();
}
let navOk = 0, navScores = [];
for (let sd = 1; sd <= 5; sd++) {
  const g = G.navigator; const s = g.create(sd * 104729); const m = s.map;
  const pts = [m.start, m.marks[0], m.marks[1], m.goal]; let route = [];
  for (let i=0;i<3;i++){ const p = bfsPath(m, pts[i], pts[i+1]); if(!p){route=null;break;} route = route.concat(p); }
  if (!route) { console.log('bot no path', sd); continue; }
  const inp = { events: [{type:'down', id:1, x: m.start.x, y: m.start.y, t:0}] }; g.update(s, 1/120, inp);
  for (let i=0;i<route.length;i+=2){ inp.events=[{type:'move',id:1,x:route[i][0],y:route[i][1]}]; g.update(s,1/120,inp); if (s.phase!=='run') break; }
  inp.events=[{type:'up',id:1}]; g.update(s,1/120,inp);
  for (let k=0;k<600 && !g.result(s);k++){ inp.events=[]; g.update(s,1/120,inp); }
  const r = g.result(s); if (r && s.grounds===0) { navOk++; navScores.push(r.score); } else console.log('nav seed', sd, 'phase', s.phase, 'prog', s.prog, 'grounds', s.grounds);
}
console.log('nav bot finished', navOk, '/5; scores ms min/max', Math.min(...navScores), Math.max(...navScores));
ok(navOk >= 5, 'nav bot finishes');
// grounding: draw straight through first land
{ const g=G.navigator; const s=g.create(5); const o=s.map.obs.find(o=>o.kind==='land'); const cx=(o.box[0]+o.box[2])/2, cy=(o.box[1]+o.box[3])/2;
  const inp={events:[{type:'down',id:1,x:s.map.start.x,y:s.map.start.y}]}; g.update(s,0.01,inp);
  inp.events=[{type:'move',id:1,x:cx,y:cy}]; g.update(s,0.01,inp);
  // either it grounded on the way or earlier island; either way grounds>=1 and route end is outside every obstacle
  const end = L.nvEnd ? null : null; ok(s.grounds===1 && !s.drawing, 'grounding stops stroke');
  const last = s.strokes[0][s.strokes[0].length-1]; ok(s.map.obs.every(o=>L.polyPointGap(o.P,last[0],last[1])>=NV.CLEAR-0.01), 'route end clear of land');
  inp.events=[{type:'move',id:1,x:cx+40,y:cy}]; g.update(s,0.01,inp); ok(s.strokes[0].length<=1, 'ignored after grounding');
  inp.events=[]; inp.boostPressed=true; g.update(s,0.01,inp); ok(s.strokes.length===0 && s.len===0, 'undo removes stroke'); }
// --- Fyr
for (const [name, ch] of Object.entries(FY_CHARS)) {
  let t = 0; const pr = ch.seq.map(([on, off]) => { const p = { on: t, off: t + on }; t += on + off; return p; });
  const j = fyJudge(ch.seq, pr); ok(j.ok && j.pts === 100, 'perfect ' + name + ' ' + JSON.stringify(j));
  const slow = pr.map((p, i) => ({ on: p.on * 1.1, off: p.on * 1.1 + (p.off - p.on) })); const j2 = fyJudge(ch.seq, slow); ok(j2.ok && (ch.seq.length===1 || j2.pts < 100), '10% slow ok ' + name + ' ' + j2.pts);
}
ok(!fyJudge(FY_CHARS['Mo(A)'].seq, [{on:0,off:260},{on:520,off:700}]).ok, 'dash too short fails');
ok(fyJudge(FY_CHARS['Fl(2)'].seq, [{on:0,off:300}]).why === 'FÖR FÅ BLIXTAR', 'too few');
// simulate whole game with perfect bot
{ const g = G.fyr; const s = g.create(1234); const inp = { hold: false }; let turnStart = null, step = 1/120, guard = 0;
  while (!g.result(s) && guard++ < 120*400) {
    if (s.phase === 'turn' && s.armed) { if (turnStart === null) turnStart = s.pt + 0.4; const L0 = s.levels[s.i]; const ms = (s.pt - turnStart) * 1000; inp.hold = ms >= 0 && L.fyOnAt(L0.seq, ms) && ms < L.fyPeriod(L0.seq); }
    else { if (s.phase !== 'turn') turnStart = null; inp.hold = false; }
    g.update(s, step, inp);
  }
  const r = g.result(s); console.log('fyr bot', r && r.score, r && r.detail); ok(r && r.score >= 950, 'fyr bot near perfect'); }
// --- Tamp: is 100 reachable with reasonable swipes for every throw of many seeds?
{ const g = G.tamp; let need = [], unreachable = 0;
  for (let sd = 1; sd <= 5; sd++) { const s0 = g.create(sd * 31337);
    for (let i = 0; i < TP.THROWS; i++) { let best = null;
      for (let sp = 300; sp <= 4000 && !best; sp += 20) for (let a = -0.6; a <= 0.6; a += 0.01) {
        const s = JSON.parse(JSON.stringify(s0)); s.i = i; tpLaunch(s, Math.sin(a) * sp, -Math.cos(a) * sp);
        for (let k = 0; k < 600 && s.phase === 'fly'; k++) g.update(s, 1/120, { events: [] });
        if (s.land && s.land.p === 100) { best = sp; break; } }
      if (best) need.push(best); else unreachable++; } }
  need.sort((a,b)=>a-b); console.log('tamp swipe px/s needed: min', need[0], 'median', need[need.length>>1], 'max', need[need.length-1], 'unreachable', unreachable);
  ok(unreachable === 0, 'tamp all reachable'); }
// swipe via events produces a throw
{ const g = G.tamp; const s = g.create(9); const inp = { events: [{type:'down',id:3,x:200,y:660,t:0},{type:'move',id:3,x:200,y:620,t:30},{type:'move',id:3,x:200,y:560,t:60},{type:'up',id:3,x:200,y:520,t:90}] };
  g.update(s, 1/120, inp); ok(s.phase === 'fly', 'swipe launches'); }
// frame-rate independence of the flight
{ const g = G.tamp; const land = (dt) => { const s = g.create(77); tpLaunch(s, 100, -1300); for (let k=0;k<5000 && s.phase==='fly';k++) g.update(s, dt, {events:[]}); return s.land; };
  const a = land(1/120), b = land(1/240); console.log('tamp dt drift', Math.hypot(a.x-b.x, a.z-b.z).toFixed(3)); ok(Math.hypot(a.x-b.x,a.z-b.z) < 0.08, 'tamp dt independent'); }
// --- Grill
function grillBot(seed, mode) { const g = G.grill; const s = g.create(seed); let id = 1; const step = 1/120; let guard = 0;
  while (!g.result(s) && guard++ < 120*80) { const ev = [];
    if (mode === 'smart') for (let k=0;k<6;k++){ const it=s.slots[k]; if(!it || it.pid!==null) continue; const [x,y]=L.GR_SLOTS[k];
      if (it[it.down] >= 1.0) { if (it.down==='a' && it.b < 0.5) { ev.push({type:'down',id,x,y},{type:'up',id}); id++; } else { ev.push({type:'down',id,x,y}); it._serve=id++; } } }
    g.update(s, step, { events: ev }); }
  return g.result(s); }
const smart = grillBot(4242, 'smart'), idle = grillBot(4242, 'idle');
console.log('grill smart', smart.score, smart.detail, '| idle', idle.score, idle.detail);
ok(smart.score > 1500 && idle.score === 0, 'grill scoring');
ok(L.grSide(1) === 50 && L.grSide(0.3) === 0 && L.grSide(1.7) === -15, 'grSide');
console.log(fails ? fails + ' FAILURES' : 'ALL OK');
