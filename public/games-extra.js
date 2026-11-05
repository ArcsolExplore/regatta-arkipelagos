/* Regatta Arkipelagos – fler solospel: Navigatören, Fyrkaraktären, Kasta tamp och Grillmästaren.
   Samma gränssnitt som spelen i logic.js (create/update/draw/hud/result) och samma frö för alla
   i omgången. Spelen som tar emot tryck på duken har pointer: true och läser inp.events,
   en kö med { type: 'down'|'move'|'up', id, x, y, t } i spelets egna koordinater. */

/* ---------- gemensamt ---------- */
function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
// Kortaste avståndet mellan två sträckor; 0 om de korsar varandra.
function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  return Math.min(segDist(ax, ay, cx, cy, dx, dy), segDist(bx, by, cx, cy, dx, dy), segDist(cx, cy, ax, ay, bx, by), segDist(dx, dy, ax, ay, bx, by));
}
// Avstånd från en sträcka till en (inte nödvändigtvis konvex) polygon; negativt om sträckan börjar inuti.
function segPolyDist(ax, ay, bx, by, P) {
  if (pointInPoly(ax, ay, P) || pointInPoly(bx, by, P)) return -1;
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    m = Math.min(m, segSegDist(ax, ay, bx, by, p[0], p[1], q[0], q[1]));
    if (m === 0) return 0;
  }
  return m;
}
function hexRgb(hx) {
  const n = parseInt(hx.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  t = clamp(t, 0, 1);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/* =====================================================================
   NAVIGATÖREN – rita rutten på sjökortet: förbi märke 1 och 2 och in i hamn.
   Tiden = hur länge du ritar + hur länge rutten tar till sjöss. Grund kostar tid.
   ===================================================================== */
const NV = { W: 400, H: 720, SPEED: 70, CLEAR: 1.5, START_R: 34, MARK_R: 15, GOAL_R: 20, PEN: 3, GRID: 8, GAP: 7 };

function nvBlob(r, cx, cy, rad) {
  const n = 18;
  const ph = r() * TAU, ph2 = r() * TAU;
  const a1 = 0.16 + r() * 0.12, a2 = 0.08 + r() * 0.08;
  const k1 = 2 + Math.floor(r() * 2), k2 = 3 + Math.floor(r() * 3);
  const sq = 0.75 + r() * 0.4;
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = rad * (1 + a1 * Math.sin(k1 * a + ph) + a2 * Math.sin(k2 * a + ph2));
    P.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq]);
  }
  return P;
}

// Bredden-först-sökning på ett rutnät: finns det en väg med marginal mellan två punkter?
function nvReach(free, cols, rows, a, b) {
  const g = NV.GRID;
  const idx = (p) => Math.min(rows - 1, Math.max(0, Math.round(p.y / g))) * cols + Math.min(cols - 1, Math.max(0, Math.round(p.x / g)));
  const s = idx(a), t = idx(b);
  if (!free[s] || !free[t]) return false;
  const seen = new Uint8Array(cols * rows);
  const q = new Int32Array(cols * rows);
  let qh = 0, qt = 0;
  q[qt++] = s;
  seen[s] = 1;
  while (qh < qt) {
    const c = q[qh++];
    if (c === t) return true;
    const cx = c % cols, cy = (c - cx) / cols;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (!seen[n] && free[n]) {
          seen[n] = 1;
          q[qt++] = n;
        }
      }
    }
  }
  return false;
}

function nvSolvable(map) {
  const g = NV.GRID;
  const cols = Math.floor(NV.W / g) + 1, rows = Math.floor(NV.H / g) + 1;
  const free = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * g, py = y * g;
      if (px < 8 || px > NV.W - 8 || py < 8 || py > NV.H - 8) continue;
      let ok = true;
      for (const o of map.obs) {
        if (px < o.box[0] - NV.GAP || px > o.box[2] + NV.GAP || py < o.box[1] - NV.GAP || py > o.box[3] + NV.GAP) continue;
        if (polyPointGap(o.P, px, py) <= NV.GAP) { ok = false; break; }
      }
      free[y * cols + x] = ok ? 1 : 0;
    }
  }
  const legs = [[map.start, map.marks[0]], [map.marks[0], map.marks[1]], [map.marks[1], map.goal]];
  return legs.every(([a, b]) => nvReach(free, cols, rows, a, b));
}

function nvLegBlocked(map, a, b) {
  return map.obs.some((o) => segPolyDist(a.x, a.y, b.x, b.y, o.P) < 10);
}

function nvMap(seed) {
  const r = rng(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const side = r() < 0.5 ? -1 : 1;
    const start = { x: 200 + (r() * 2 - 1) * 90, y: 672 };
    const goal = { x: 80 + r() * 240, y: 50 };
    const marks = [
      { x: 200 + side * (70 + r() * 85), y: 462 + r() * 56, n: 1 },
      { x: 200 - side * (70 + r() * 85), y: 226 + r() * 56, n: 2 },
    ];
    const keep = [start, goal, ...marks];
    const obs = [];
    const want = [...Array(8).fill('land'), ...Array(5).fill('grund')];
    for (const kind of want) {
      for (let tries = 0; tries < 40; tries++) {
        const rad = kind === 'land' ? 26 + r() * 36 : 16 + r() * 18;
        const cx = 24 + r() * (NV.W - 48), cy = 112 + r() * 490;
        const P = nvBlob(r, cx, cy, rad);
        if (keep.some((p) => polyPointGap(P, p.x, p.y) < 40)) continue;
        const b = polyBox(P);
        obs.push({ kind, P, box: [b.x0, b.y0, b.x1, b.y1] });
        break;
      }
    }
    const map = { start, goal, marks, obs, depths: [] };
    const legs = [[start, marks[0]], [marks[0], marks[1]], [marks[1], goal]];
    // De första försöken kräver att minst ett ben inte går att segla rakt, annars blir det för lätt.
    if (attempt < 30 && !legs.some(([a, b]) => nvLegBlocked(map, a, b))) continue;
    if (!nvSolvable(map)) continue;
    for (let i = 0; i < 34; i++) {
      const x = 16 + r() * (NV.W - 32), y = 90 + r() * 560;
      if (obs.some((o) => polyPointGap(o.P, x, y) < 12)) continue;
      // Inga siffror på varandra, och inga mitt i starten, hamnen eller märkena.
      if (map.depths.some((d) => Math.abs(d.x - x) < 24 && Math.abs(d.y - y) < 16)) continue;
      if ([start, goal, ...marks].some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
      map.depths.push({ x, y, d: 3 + Math.floor(r() * 38) });
    }
    return map;
  }
  // Nödutgång: en öppen karta som alltid går att lösa.
  const start = { x: 200, y: 672 }, goal = { x: 200, y: 50 };
  return { start, goal, marks: [{ x: 110, y: 480, n: 1 }, { x: 290, y: 250, n: 2 }], obs: [], depths: [] };
}

function nvEnd(s) {
  for (let i = s.strokes.length - 1; i >= 0; i--) if (s.strokes[i].length) return s.strokes[i][s.strokes[i].length - 1];
  return [s.map.start.x, s.map.start.y];
}

// Räkna rutten från början: längd och hur långt den kommit bland märkena.
function nvRecount(s) {
  s.len = 0;
  s.prog = 0;
  let [ax, ay] = [s.map.start.x, s.map.start.y];
  for (const st of s.strokes) {
    for (const [bx, by] of st) {
      nvSegment(s, ax, ay, bx, by);
      ax = bx;
      ay = by;
    }
  }
}
function nvSegment(s, ax, ay, bx, by) {
  s.len += Math.hypot(bx - ax, by - ay);
  if (s.prog < 2) {
    const m = s.map.marks[s.prog];
    if (segDist(m.x, m.y, ax, ay, bx, by) <= NV.MARK_R) s.prog++;
  } else if (s.prog === 2) {
    const g = s.map.goal;
    if (segDist(g.x, g.y, ax, ay, bx, by) <= NV.GOAL_R) s.prog = 3;
  }
}

function nvBlocked(s, ax, ay, bx, by) {
  if (bx < 4 || bx > NV.W - 4 || by < 4 || by > NV.H - 4) return true;
  const x0 = Math.min(ax, bx) - 3, x1 = Math.max(ax, bx) + 3, y0 = Math.min(ay, by) - 3, y1 = Math.max(ay, by) + 3;
  for (const o of s.map.obs) {
    if (x1 < o.box[0] || x0 > o.box[2] || y1 < o.box[1] || y0 > o.box[3]) continue;
    if (segPolyDist(ax, ay, bx, by, o.P) < NV.CLEAR) return true;
  }
  return false;
}

// Förläng rutten mot fingret. Går linjen på grund slutar draget där, och det kostar tid.
function nvExtend(s, x, y) {
  const [ax, ay] = nvEnd(s);
  if (Math.hypot(x - ax, y - ay) < 3) return;
  if (!nvBlocked(s, ax, ay, x, y)) {
    s.cur.push([x, y]);
    nvSegment(s, ax, ay, x, y);
    if (s.prog === 3) {
      s.drawing = false;
      s.phase = 'sail';
      s.phaseT = 0;
      say(s, 'KURS SATT!', '#1d6b48', 1.2);
    }
    return;
  }
  let lo = 0, hi = 1;
  for (let k = 0; k < 18; k++) {
    const m = (lo + hi) / 2;
    if (nvBlocked(s, ax, ay, ax + (x - ax) * m, ay + (y - ay) * m)) hi = m;
    else lo = m;
  }
  const sx = ax + (x - ax) * lo, sy = ay + (y - ay) * lo;
  if (Math.hypot(sx - ax, sy - ay) > 1) {
    s.cur.push([sx, sy]);
    nvSegment(s, ax, ay, sx, sy);
  }
  s.drawing = false;
  s.pen += NV.PEN;
  s.grounds++;
  s.hit = { x: ax + (x - ax) * hi, y: ay + (y - ay) * hi, t: 0 };
  s.vibrate = true;
  say(s, `GRUND! +${NV.PEN} s`, '#c0392b', 1.3);
}

function nvTotal(s) {
  return s.drawT + s.pen + s.len / NV.SPEED;
}

const navigatoren = {
  id: 'navigator',
  fit: 'contain',
  W: NV.W,
  H: NV.H,
  controls: 'draw',
  pointer: true,
  hint: 'Rita från båten. Ångra tar bort senaste draget.',
  create(seed) {
    return { t: 0, map: nvMap(seed), strokes: [], cur: null, drawing: false, pid: null, drawT: 0, pen: 0, grounds: 0, len: 0, prog: 0, phase: 'run', phaseT: 0, sailD: 0, hit: null, endT: 0, msg: '', msgT: 0, msgC: '#c0392b' };
  },
  update(s, dt, inp) {
    s.t += dt;
    s.msgT -= dt;
    s.endT += dt;
    if (s.hit) s.hit.t += dt;
    if (s.phase === 'run') {
      s.drawT = Math.min(900, s.drawT + dt);
      if (inp.boostPressed && s.strokes.length) {
        s.strokes.pop();
        s.drawing = false;
        s.cur = null;
        s.pid = null;
        nvRecount(s);
        say(s, 'ÅNGRAT', '#3d5566', 0.6);
      }
      for (const e of inp.events || []) {
        if (s.phase !== 'run') break;
        if (e.type === 'down') {
          if (s.drawing) continue;
          const [ex, ey] = nvEnd(s);
          if (Math.hypot(e.x - ex, e.y - ey) <= NV.START_R) {
            s.drawing = true;
            s.pid = e.id;
            s.cur = [];
            s.strokes.push(s.cur);
            nvExtend(s, e.x, e.y);
          } else {
            s.endT = 0;
            say(s, 'BÖRJA VID LINJENS SLUT', '#3d5566', 1.1);
          }
        } else if (e.type === 'move') {
          if (s.drawing && e.id === s.pid) nvExtend(s, e.x, e.y);
        } else if (e.type === 'up' && e.id === s.pid) {
          s.drawing = false;
          s.pid = null;
          if (s.cur && !s.cur.length) s.strokes.splice(s.strokes.indexOf(s.cur), 1);
          s.cur = null;
        }
      }
    } else if (s.phase === 'sail') {
      s.phaseT += dt;
      // Uppspelningen tar högst 3,5 s oavsett ruttens längd; tiden räknas på riktig fart.
      s.sailD = Math.min(s.len, s.sailD + Math.max(160, s.len / 3.5) * dt);
      if (s.sailD >= s.len) {
        s.phase = 'done';
        s.phaseT = 0;
      }
    } else {
      s.phaseT += dt;
    }
  },
  draw(ctx, s) {
    const { W, H } = NV;
    const m = s.map;
    ctx.fillStyle = '#ede4cc';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,96,60,.13)';
    ctx.lineWidth = 1;
    for (let x = 50; x < W; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Kartram med gradskala
    ctx.strokeStyle = '#3b3326';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    for (let y = 10; y < H; y += 20) {
      ctx.fillStyle = (y / 20) % 2 < 1 ? '#3b3326' : '#ede4cc';
      ctx.fillRect(3, y, 4, 20);
      ctx.fillRect(W - 7, y, 4, 20);
    }
    // Djupsiffror
    ctx.font = `italic 500 10px ${FONT_M}`;
    ctx.fillStyle = 'rgba(70,96,112,.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of m.depths) ctx.fillText(String(d.d), d.x, d.y);
    // Grunt vatten runt land
    for (const o of m.obs) {
      if (o.kind !== 'land') continue;
      pathPoly(ctx, o.P);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(126,178,198,.45)';
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(126,178,198,.55)';
      ctx.lineWidth = 7;
      ctx.stroke();
    }
    for (const o of m.obs) {
      pathPoly(ctx, o.P);
      if (o.kind === 'land') {
        ctx.fillStyle = '#dcc68d';
        ctx.fill();
        ctx.strokeStyle = '#7d6638';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        const cx = (o.box[0] + o.box[2]) / 2, cy = (o.box[1] + o.box[3]) / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(0.55, 0.55);
        ctx.translate(-cx, -cy);
        pathPoly(ctx, o.P);
        ctx.strokeStyle = 'rgba(125,102,56,.45)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(110,165,190,.32)';
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#3f6f86';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = (o.box[0] + o.box[2]) / 2, cy = (o.box[1] + o.box[3]) / 2;
        ctx.strokeStyle = '#2e4f60';
        ctx.lineWidth = 1.3;
        for (const [dx, dy] of [[0, 0], [-7, 5], [6, -4]]) {
          ctx.beginPath();
          ctx.moveTo(cx + dx - 3.5, cy + dy);
          ctx.lineTo(cx + dx + 3.5, cy + dy);
          ctx.moveTo(cx + dx, cy + dy - 3.5);
          ctx.lineTo(cx + dx, cy + dy + 3.5);
          ctx.stroke();
        }
      }
    }
    // Kompassros, i det övre hörnet där hamnen inte ligger
    ctx.save();
    ctx.translate(m.goal.x < NV.W / 2 ? NV.W - 46 : 46, 52);
    ctx.strokeStyle = 'rgba(59,51,38,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,48,36,.75)';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(59,51,38,.55)';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 10px ${FONT_M}`;
    ctx.fillText('N', 0, -32);
    ctx.restore();

    // Hamnen
    const g = m.goal;
    ctx.strokeStyle = s.prog === 3 ? '#1d6b48' : '#3b3326';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(g.x, g.y, NV.GOAL_R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.strokeStyle = '#3b3326';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, 9);
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, -5);
    ctx.moveTo(-8, 3);
    ctx.quadraticCurveTo(0, 14, 8, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -11, 2.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.font = `700 10px ${FONT_M}`;
    ctx.fillStyle = '#3b3326';
    ctx.fillText('HAMN', g.x, g.y + NV.GOAL_R + 9);

    // Märken
    m.marks.forEach((mk, i) => {
      const passed = s.prog > i;
      const next = s.prog === i;
      ctx.strokeStyle = passed ? 'rgba(29,107,72,.7)' : 'rgba(59,51,38,.5)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(mk.x, mk.y, NV.MARK_R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      if (next && s.phase === 'run') {
        ctx.strokeStyle = `rgba(176,58,46,${0.35 + 0.3 * Math.sin(s.t * 5)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mk.x, mk.y, NV.MARK_R + 5, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = i === 0 ? '#c0392b' : '#1f8a4c';
      ctx.beginPath();
      ctx.arc(mk.x, mk.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 9px ${FONT_M}`;
      ctx.fillText(passed ? '✓' : String(mk.n), mk.x, mk.y + 0.5);
    });

    // Starten: en liten brygga
    const st = m.start;
    ctx.fillStyle = '#7a5a3e';
    ctx.fillRect(st.x - 16, st.y + 12, 32, 8);
    ctx.fillRect(st.x - 3, st.y + 12, 6, 30);
    ctx.font = `700 10px ${FONT_M}`;
    ctx.fillStyle = '#3b3326';
    ctx.fillText('START', st.x + 36, st.y + 16);

    // Rutten
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#b03a2e';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(st.x, st.y);
    for (const stroke of s.strokes) for (const [x, y] of stroke) ctx.lineTo(x, y);
    ctx.stroke();
    if (s.phase === 'run' && !s.drawing) {
      const [ex, ey] = nvEnd(s);
      const pulse = 0.5 + 0.5 * Math.sin(s.t * 4);
      ctx.strokeStyle = `rgba(176,58,46,${0.3 + 0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey, 12 + pulse * 6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#b03a2e';
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, TAU);
      ctx.fill();
      if (s.endT < 1.2) {
        ctx.strokeStyle = 'rgba(176,58,46,.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ex, ey, NV.START_R, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (s.hit && s.hit.t < 2.5) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 3;
      const k = 7;
      ctx.beginPath();
      ctx.moveTo(s.hit.x - k, s.hit.y - k);
      ctx.lineTo(s.hit.x + k, s.hit.y + k);
      ctx.moveTo(s.hit.x + k, s.hit.y - k);
      ctx.lineTo(s.hit.x - k, s.hit.y + k);
      ctx.stroke();
    }

    // Båten: står vid starten, seglar rutten när den är klar
    let bx = st.x, by = st.y, ba = -Math.PI / 2;
    if (s.phase !== 'run') {
      let left = s.sailD, ax = st.x, ay = st.y;
      outer: for (const stroke of s.strokes) {
        for (const [x, y] of stroke) {
          const l = Math.hypot(x - ax, y - ay);
          if (l > 0.01) ba = Math.atan2(y - ay, x - ax);
          if (left <= l) {
            bx = ax + ((x - ax) * left) / (l || 1);
            by = ay + ((y - ay) * left) / (l || 1);
            break outer;
          }
          left -= l;
          ax = x;
          ay = y;
          bx = x;
          by = y;
        }
      }
    }
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(0.75, 0.75);
    drawSailboat(ctx, 0, 0, ba, 0.5, 0, s.t, '#2a64c4');
    ctx.restore();

    if (s.phase === 'run' && !s.strokes.length && s.t < 6) {
      ctx.font = `600 13px ${FONT_M}`;
      const tw = ctx.measureText('Dra från båten förbi 1 och 2, in i hamn').width;
      ctx.fillStyle = 'rgba(237,228,204,.92)';
      rrect(ctx, W / 2 - tw / 2 - 10, 300 - 13, tw + 20, 26, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(59,51,38,.9)';
      ctx.fillText('Dra från båten förbi 1 och 2, in i hamn', W / 2, 300);
    }
    centerMsg(ctx, s, W / 2, H / 2, 30);
  },
  hud(s) {
    const txt = ['Till märke 1', 'Till märke 2', 'In i hamnen', 'I hamn'][s.prog];
    return { main: fmtTime(nvTotal(s) * 1000), sub: `${txt} · till sjöss ${fmtTime((s.len / NV.SPEED) * 1000)}${s.pen ? ` · grund +${s.pen} s` : ''}` };
  },
  result(s) {
    if (s.phase === 'done' && s.phaseT > 0.5) {
      const grounds = s.grounds ? ` · ${plural(s.grounds, 'grundstötning', 'grundstötningar')} +${s.pen} s` : '';
      return { score: Math.min(1200000, Math.round(nvTotal(s) * 1000)), title: 'I hamn!', detail: `Ritat på ${fmtTime(s.drawT * 1000)} · ${fmtTime((s.len / NV.SPEED) * 1000)} till sjöss${grounds}` };
    }
    return null;
  },
};

/* =====================================================================
   FYRKARAKTÄREN – läs av fyrens karaktär och blinka tillbaka den.
   Riktiga beteckningar från sjökortet. Tio fyrar, tre liv.
   ===================================================================== */
const FY = { W: 400, H: 720, SHORT: 500, LIVES: 3, LEVELS: 10, LEAD: 0.9, MIN_TOL: 260, REL_TOL: 0.14 };
const FY_S = 300, FY_L = 1100, FY_G = 450, FY_E = 1700, FY_Q = 180, FY_QG = 220, FY_DOT = 260, FY_DASH = 780, FY_MG = 260;
const fyRep = (n, on, gap, last) => Array.from({ length: n }, (_, i) => [on, i === n - 1 ? last : gap]);
const FY_CHARS = {
  Fl: { desc: 'En kort blixt', seq: [[FY_S, FY_E]] },
  LFl: { desc: 'En lång blixt', seq: [[FY_L, FY_E]] },
  Iso: { desc: 'Lika länge ljus som mörker', seq: [[1000, 1000]] },
  'Fl(2)': { desc: 'Grupp om två blixtar', seq: fyRep(2, FY_S, FY_G, FY_E) },
  'Mo(A)': { desc: 'Morse A: kort, lång', seq: [[FY_DOT, FY_MG], [FY_DASH, FY_E]] },
  'Mo(N)': { desc: 'Morse N: lång, kort', seq: [[FY_DASH, FY_MG], [FY_DOT, FY_E]] },
  'Fl(3)': { desc: 'Grupp om tre blixtar', seq: fyRep(3, FY_S, FY_G, FY_E) },
  'Mo(U)': { desc: 'Morse U: kort, kort, lång', seq: [[FY_DOT, FY_MG], [FY_DOT, FY_MG], [FY_DASH, FY_E]] },
  'Mo(D)': { desc: 'Morse D: lång, kort, kort', seq: [[FY_DASH, FY_MG], [FY_DOT, FY_MG], [FY_DOT, FY_E]] },
  'Q(3)': { desc: 'Tre snabba blixtar · ostkardinal', seq: fyRep(3, FY_Q, FY_QG, FY_E), white: true },
  'Fl(2+1)': { desc: 'Två blixtar, paus, en blixt', seq: [[FY_S, FY_G], [FY_S, 1100], [FY_S, FY_E]] },
  'Mo(R)': { desc: 'Morse R: kort, lång, kort', seq: [[FY_DOT, FY_MG], [FY_DASH, FY_MG], [FY_DOT, FY_E]] },
  'Fl(4)': { desc: 'Grupp om fyra blixtar', seq: fyRep(4, FY_S, FY_G, FY_E) },
  'Q(6)+LFl': { desc: 'Sex snabba och en lång · sydkardinal', seq: [...fyRep(6, FY_Q, FY_QG, FY_QG), [1400, FY_E]], white: true },
  'Q(9)': { desc: 'Nio snabba blixtar · västkardinal', seq: fyRep(9, FY_Q, FY_QG, FY_E), white: true },
};
const FY_TIERS = [['Fl', 'LFl', 'Iso'], ['Fl(2)', 'Mo(A)', 'Mo(N)'], ['Fl(3)', 'Mo(U)', 'Mo(D)'], ['Q(3)', 'Fl(2+1)', 'Mo(R)'], ['Fl(4)', 'Q(6)+LFl', 'Q(9)']];
const FY_COLORS = [{ c: '#fff6d8', k: 'W', n: 'vitt' }, { c: '#ff5a4f', k: 'R', n: 'rött' }, { c: '#4fe08f', k: 'G', n: 'grönt' }];

function fyPeriod(seq) {
  return seq.reduce((a, [on, off]) => a + on + off, 0);
}
// Hur lång karaktären är från första blixtens början till sista blixtens slut.
function fySpan(seq) {
  return fyPeriod(seq) - seq[seq.length - 1][1];
}
function fyOnAt(seq, ms) {
  let t = 0;
  for (const [on, off] of seq) {
    if (ms < t + on) return ms >= t;
    t += on + off;
  }
  return false;
}
// Jämför spelarens blixtar med fyrens. Returnerar { ok, why, pts }.
function fyJudge(seq, presses) {
  if (presses.length < seq.length) return { ok: false, why: 'FÖR FÅ BLIXTAR', pts: 0 };
  if (presses.length > seq.length) return { ok: false, why: 'FÖR MÅNGA BLIXTAR', pts: 0 };
  let t = 0, err = 0;
  for (let i = 0; i < seq.length; i++) {
    const [on, off] = seq[i];
    const p = presses[i];
    const dur = p.off - p.on;
    if (on >= FY.SHORT !== dur >= FY.SHORT) return { ok: false, why: on >= FY.SHORT ? 'BLIXTEN SKA VARA LÅNG' : 'BLIXTEN SKA VARA KORT', pts: 0, at: i };
    const tol = Math.max(FY.MIN_TOL, FY.REL_TOL * t);
    const e = Math.abs(p.on - presses[0].on - t);
    if (i > 0 && e > tol) return { ok: false, why: 'FEL RYTM', pts: 0, at: i };
    const onsetN = i > 0 ? e / tol : 0;
    const durN = Math.min(1, Math.abs(dur - on) / Math.max(on, 300));
    err += 0.6 * onsetN + 0.4 * durN;
    t += on + off;
  }
  return { ok: true, why: '', pts: Math.round(60 + 40 * (1 - err / seq.length)) };
}

function fyLevels(seed) {
  const r = rng(seed);
  const out = [];
  for (const tier of FY_TIERS) {
    const pool = tier.slice();
    for (let k = 0; k < 2; k++) {
      const name = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const ch = FY_CHARS[name];
      const col = ch.white ? FY_COLORS[0] : FY_COLORS[Math.floor(r() * 3)];
      out.push({ name, desc: ch.desc, seq: ch.seq, col });
    }
  }
  return out;
}

const fyr = {
  id: 'fyr',
  fit: 'contain',
  W: FY.W,
  H: FY.H,
  controls: 'hold',
  holdLabel: 'Håll = tänd',
  create(seed) {
    const r = rng(seed ^ 0x5f17);
    const stars = Array.from({ length: 70 }, () => ({ x: r() * FY.W, y: r() * 400, s: 0.4 + r() * 1.3, p: r() * TAU }));
    return { t: 0, levels: fyLevels(seed), i: 0, lives: FY.LIVES, score: 0, phase: 'show', pt: 0, presses: [], holding: false, armed: false, judge: null, results: [], stars, light: false, msg: '', msgT: 0, msgC: '#f5c225' };
  },
  next(s) {
    s.i++;
    if (s.i >= s.levels.length || s.lives <= 0) {
      s.phase = 'done';
    } else {
      s.phase = 'show';
    }
    s.pt = 0;
    s.presses = [];
    s.judge = null;
  },
  judgeNow(s, forced) {
    const L = s.levels[s.i];
    const j = forced || fyJudge(L.seq, s.presses);
    s.judge = j;
    s.results.push(j.ok ? j.pts : 0);
    if (j.ok) {
      s.score += j.pts;
      say(s, j.pts >= 92 ? 'PRICK RÄTT!' : 'RÄTT KARAKTÄR', '#4cc38a', 2);
    } else {
      s.lives--;
      s.vibrate = true;
      say(s, j.why, '#ff6b6b', 2);
    }
    s.phase = 'judge';
    s.pt = 0;
  },
  update(s, dt, inp) {
    s.t += dt;
    s.pt += dt;
    s.msgT -= dt;
    const L = s.levels[Math.min(s.i, s.levels.length - 1)];
    const ms = s.pt * 1000;
    if (s.phase === 'show') {
      const P = fyPeriod(L.seq);
      const tt = ms - FY.LEAD * 1000;
      s.light = tt >= 0 && tt < 2 * P && fyOnAt(L.seq, tt % P);
      if (tt > 2 * P - L.seq[L.seq.length - 1][1] + 500) {
        s.phase = 'turn';
        s.pt = 0;
        s.presses = [];
        s.armed = !inp.hold; // en tumme som redan ligger på knappen räknas inte
      }
      return;
    }
    if (s.phase === 'turn') {
      const hold = !!inp.hold;
      s.light = s.armed && hold;
      if (!s.armed) {
        if (!hold) s.armed = true;
        return;
      }
      if (hold && !s.holding) {
        s.holding = true;
        if (s.presses.length >= L.seq.length) {
          s.presses.push({ on: ms, off: ms });
          fyr.judgeNow(s);
          return;
        }
        s.presses.push({ on: ms, off: null });
      } else if (!hold && s.holding) {
        s.holding = false;
        const p = s.presses[s.presses.length - 1];
        p.off = ms;
        if (s.presses.length === L.seq.length) {
          fyr.judgeNow(s);
          return;
        }
      }
      const last = s.presses[s.presses.length - 1];
      if (last && s.holding && ms - last.on > 3500) {
        last.off = ms;
        fyr.judgeNow(s, { ok: false, why: 'FÖR LÅNG BLIXT', pts: 0 });
      } else if (last && !s.holding && last.off !== null && ms - last.off > Math.max(2600, FY_E + 700)) {
        fyr.judgeNow(s);
      }
      return;
    }
    if (s.phase === 'judge') {
      s.light = false;
      if (!inp.hold) s.holding = false;
      if (s.pt > 2.4) fyr.next(s);
    }
  },
  draw(ctx, s) {
    const { W, H } = FY;
    const L = s.levels[Math.min(s.i, s.levels.length - 1)];
    const sky = ctx.createLinearGradient(0, 0, 0, 450);
    sky.addColorStop(0, '#050c1a');
    sky.addColorStop(1, '#13304c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 450);
    for (const st of s.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(s.t * 1.3 + st.p)})`;
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    const sea = ctx.createLinearGradient(0, 450, 0, H);
    sea.addColorStop(0, '#0d2740');
    sea.addColorStop(1, '#06121f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 450, W, H - 450);
    const fx = 200, fy = 236;
    const col = L.col.c;
    // Ljuset
    if (s.light) {
      const glow = ctx.createRadialGradient(fx, fy, 4, fx, fy, 190);
      glow.addColorStop(0, col);
      glow.addColorStop(0.18, col.length === 7 ? col + '88' : col);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 40, W, 400);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = col;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + d * 260, fy - 60);
        ctx.lineTo(fx + d * 260, fy + 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 0.35;
      const refl = ctx.createLinearGradient(0, 452, 0, 660);
      refl.addColorStop(0, col);
      refl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = refl;
      for (let y = 456; y < 660; y += 7) {
        const w = 6 + (y - 450) * 0.12 + Math.sin(s.t * 3 + y) * 4;
        ctx.fillRect(fx - w / 2, y, w, 3);
      }
      ctx.restore();
    }
    // Skäret och tornet
    ctx.fillStyle = '#1c2a33';
    ctx.beginPath();
    ctx.moveTo(110, 456);
    ctx.quadraticCurveTo(140, 420, 180, 424);
    ctx.quadraticCurveTo(220, 414, 250, 426);
    ctx.quadraticCurveTo(290, 432, 300, 456);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const y0 = 260 + i * 27;
      const w0 = 13 + i * 1.6, w1 = 13 + (i + 1) * 1.6;
      ctx.fillStyle = i % 2 ? '#c9302c' : '#eef1f2';
      ctx.beginPath();
      ctx.moveTo(fx - w0, y0);
      ctx.lineTo(fx + w0, y0);
      ctx.lineTo(fx + w1, y0 + 27);
      ctx.lineTo(fx - w1, y0 + 27);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#20262b';
    ctx.fillRect(fx - 20, 252, 40, 8);
    ctx.fillStyle = s.light ? col : '#24323d';
    ctx.fillRect(fx - 11, 224, 22, 28);
    ctx.strokeStyle = '#20262b';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx - 11, 224, 22, 28);
    ctx.fillStyle = '#20262b';
    ctx.beginPath();
    ctx.moveTo(fx - 15, 224);
    ctx.lineTo(fx, 208);
    ctx.lineTo(fx + 15, 224);
    ctx.closePath();
    ctx.fill();

    // Rubrik
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    smallText(ctx, `FYR ${Math.min(s.i + 1, s.levels.length)} AV ${s.levels.length}`, W / 2, 30, 'center', 0.7, 12);
    ctx.font = `900 40px ${FONT_D}`;
    ctx.fillStyle = '#eaf1f5';
    ctx.fillText(`${L.name} ${L.col.k}`, W / 2, 70);
    smallText(ctx, `${L.desc} · ${L.col.n} ljus`, W / 2, 102, 'center', 0.8, 12);
    for (let i = 0; i < FY.LIVES; i++) {
      ctx.fillStyle = i < s.lives ? '#f5c225' : 'rgba(255,255,255,.15)';
      ctx.beginPath();
      ctx.arc(W - 64 + i * 20, 30, 6, 0, TAU);
      ctx.fill();
    }
    let cap = '';
    if (s.phase === 'show') cap = s.pt < FY.LEAD ? 'TITTA PÅ FYREN' : 'TITTA…';
    else if (s.phase === 'turn') cap = s.armed ? 'DIN TUR · HÅLL FÖR LJUS' : 'SLÄPP KNAPPEN';
    if (cap) smallText(ctx, cap, W / 2, 500, 'center', 0.95, 15);

    // Tidslinjer: fyren överst, du under
    const seq = L.seq;
    const span = fySpan(seq);
    const x0 = 34, wpx = W - 68;
    const sc = wpx / Math.max(span, 1200);
    const bar = (y, list, color) => {
      for (const [a, b] of list) {
        ctx.fillStyle = color;
        rrect(ctx, x0 + a * sc, y, Math.max(3, (b - a) * sc), 16, 4);
        ctx.fill();
      }
    };
    const expected = [];
    {
      let t = 0;
      for (const [on, off] of seq) {
        expected.push([t, t + on]);
        t += on + off;
      }
    }
    const mine = s.presses.length
      ? s.presses.map((p) => [p.on - s.presses[0].on, (p.off === null ? s.pt * 1000 : p.off) - s.presses[0].on])
      : [];
    if (s.phase === 'show') {
      const P = fyPeriod(seq);
      const tt = s.pt * 1000 - FY.LEAD * 1000;
      if (tt > 0) {
        const shown = Math.min(span, tt % P);
        bar(560, expected.filter(([a]) => a < shown || tt >= P).map(([a, b]) => [a, tt >= P ? b : Math.min(b, shown)]), 'rgba(255,246,216,.75)');
      }
      smallText(ctx, 'FYREN', x0, 548, 'left', 0.6, 10);
    } else if (s.phase === 'turn') {
      smallText(ctx, 'DU', x0, 598, 'left', 0.6, 10);
      bar(610, mine, '#f5c225');
    } else if (s.phase === 'judge') {
      smallText(ctx, 'FYREN', x0, 548, 'left', 0.6, 10);
      bar(560, expected, 'rgba(255,246,216,.75)');
      smallText(ctx, 'DU', x0, 598, 'left', 0.6, 10);
      bar(610, mine, s.judge && s.judge.ok ? '#4cc38a' : '#ff6b6b');
      if (s.judge && s.judge.ok) smallText(ctx, `+${s.judge.pts} p`, W / 2, 660, 'center', 0.95, 16);
      centerMsg(ctx, s, W / 2, 400, 32);
    }
  },
  hud(s) {
    return { main: `${s.score} p`, sub: `Fyr ${Math.min(s.i + 1, s.levels.length)} av ${s.levels.length} · ${plural(Math.max(0, s.lives), 'liv', 'liv')} kvar` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 0.3) {
      const ok = s.results.filter((p) => p > 0).length;
      return { score: s.score, title: s.lives > 0 ? 'Alla fyrar avlästa!' : 'Mörkt i tornet', detail: `${ok} av ${s.results.length} rätt · ` + s.results.join(' · ') };
    }
    return null;
  },
};

/* =====================================================================
   KASTA TAMP – svep tampen mot pollaren på bryggan. Fem kast, vind från sidan.
   Allt räknas i meter; bilden är en enkel perspektivprojektion.
   ===================================================================== */
const TP = { W: 400, H: 720, THROWS: 5, G: 9.8, ELEV: (40 * Math.PI) / 180, F: 330, HOR: 228, CAMH: 2.4, CAMZ: 2.2, RING: 0.3, HAND: [0, 1.2, 0.3], WATER: -0.7, MAXA: 0.62 };

function tpProj(x, y, z) {
  const d = Math.max(0.3, z + TP.CAMZ);
  return [TP.W / 2 + (x * TP.F) / d, TP.HOR + ((TP.CAMH - y) * TP.F) / d, TP.F / d];
}
// Svepets fart i px/s (spelets koordinater) blir kastfart i m/s. Kurvan gör snabba svep mindre extrema.
function tpSpeed(px) {
  return 2.5 + 10 * (1 - Math.exp(-px / 1700));
}
function tpLaunch(s, vxPx, vyPx) {
  const sp = Math.hypot(vxPx, vyPx);
  const v = tpSpeed(sp);
  const yaw = clamp(Math.atan2(vxPx, -vyPx), -TP.MAXA, TP.MAXA);
  const vh = v * Math.cos(TP.ELEV);
  s.rope = { x: TP.HAND[0], y: TP.HAND[1], z: TP.HAND[2], vx: vh * Math.sin(yaw), vy: v * Math.sin(TP.ELEV), vz: vh * Math.cos(yaw), t: 0, trail: [] };
  s.phase = 'fly';
  s.pt = 0;
}
function tpScore(d) {
  if (d <= TP.RING) return 100;
  return Math.max(0, Math.round(90 - (d - TP.RING) * 55));
}

const tamp = {
  id: 'tamp',
  fit: 'contain',
  W: TP.W,
  H: TP.H,
  controls: 'none',
  pointer: true,
  hint: 'Svep uppåt från tampen. Fart ger längd, riktning ger sida.',
  create(seed) {
    const r = rng(seed);
    const throws = [];
    for (let i = 0; i < TP.THROWS; i++) {
      const bz = 4.6 + r() * 3.8 + i * 0.12;
      throws.push({ bx: (r() * 2 - 1) * 1.7, bz, dock: bz - 0.7 - r() * 0.5, ws: i === 0 ? r() * 2 : 1 + r() * 6, wd: r() < 0.5 ? -1 : 1 });
    }
    return { t: 0, throws, i: 0, phase: 'aim', pt: 0, path: [], pid: null, rope: null, land: null, pts: [], total: 0, lab: '', marks: [], msg: '', msgT: 0, msgC: '#f5c225' };
  },
  land(s, T, x, z, wet) {
    const R = s.rope;
    let p = 0, lab, sub;
    if (wet) {
      lab = 'I PLASKET';
      sub = z < T.dock - 0.1 ? 'för kort' : 'mot bryggkanten';
      s.vibrate = true;
    } else {
      const d = Math.hypot(x - T.bx, z - T.bz);
      p = tpScore(d);
      lab = p === 100 ? 'PÅ POLLAREN!' : p >= 70 ? 'NÄRA!' : p >= 30 ? 'GODKÄNT' : p > 0 ? 'LÅNGT IFRÅN' : 'MISS';
      const dz = z - T.bz, dx = x - T.bx;
      sub = p === 100 ? 'öglan runt pollaren' : `${fmtNum(d)} m ${Math.abs(dz) > Math.abs(dx) ? (dz < 0 ? 'för kort' : 'för långt') : dx < 0 ? 'till vänster' : 'till höger'}`;
      s.marks.push({ x, z, i: s.i });
    }
    s.land = { x, z, y: wet ? TP.WATER : 0, wet, p, lab, sub };
    R.vx = R.vy = R.vz = 0;
    s.pts.push(p);
    s.total += p;
    s.phase = 'land';
    s.pt = 0;
  },
  update(s, dt, inp) {
    s.t += dt;
    s.pt += dt;
    s.msgT -= dt;
    const T = s.throws[Math.min(s.i, TP.THROWS - 1)];
    if (s.phase === 'aim') {
      for (const e of inp.events || []) {
        if (e.type === 'down' && s.pid === null) {
          s.pid = e.id;
          s.path = [{ x: e.x, y: e.y, t: e.t }];
        } else if (e.type === 'move' && e.id === s.pid) {
          s.path.push({ x: e.x, y: e.y, t: e.t });
          if (s.path.length > 60) s.path.shift();
        } else if (e.type === 'up' && e.id === s.pid) {
          s.path.push({ x: e.x, y: e.y, t: e.t });
          s.pid = null;
          const last = s.path[s.path.length - 1];
          let first = s.path[0];
          for (const p of s.path) if (last.t - p.t <= 90) { first = p; break; }
          const dtm = Math.max(8, last.t - first.t);
          const vx = ((last.x - first.x) / dtm) * 1000, vy = ((last.y - first.y) / dtm) * 1000;
          s.path = [];
          if (-vy < 250) {
            say(s, 'SVEP UPPÅT', '#f5c225', 1);
            continue;
          }
          tpLaunch(s, vx, vy);
          break;
        }
      }
    } else if (s.phase === 'fly') {
      const R = s.rope;
      R.t += dt;
      const wind = T.wd * T.ws * 0.22;
      R.vx += wind * dt;
      R.vy -= TP.G * dt;
      const pz = R.z, py = R.y;
      R.x += R.vx * dt;
      R.y += R.vy * dt;
      R.z += R.vz * dt;
      if (R.trail.length === 0 || R.t - R.trail[R.trail.length - 1][3] > 0.03) R.trail.push([R.x, R.y, R.z, R.t]);
      // Bryggkanten: korsar tampen kanten under däckshöjd slår den i och faller i vattnet.
      if (pz < T.dock && R.z >= T.dock && R.y < 0) {
        R.z = T.dock - 0.05;
        tamp.land(s, T, R.x, R.z, true);
      } else if (R.z >= T.dock && R.y <= 0 && py > 0) {
        tamp.land(s, T, R.x, R.z, false);
      } else if (R.z < T.dock && R.y <= TP.WATER) {
        tamp.land(s, T, R.x, R.z, true);
      } else if (R.t > 4) {
        tamp.land(s, T, R.x, R.z, true);
      }
    } else if (s.phase === 'land') {
      if (s.pt > 1.9) {
        s.i++;
        s.rope = null;
        s.land = null;
        s.pid = null;
        s.path = [];
        s.phase = s.i >= TP.THROWS ? 'done' : 'aim';
        s.pt = 0;
      }
    }
  },
  draw(ctx, s) {
    const { W, H } = TP;
    const T = s.throws[Math.min(s.i, TP.THROWS - 1)];
    const sky = ctx.createLinearGradient(0, 0, 0, TP.HOR);
    sky.addColorStop(0, '#7fb2d6');
    sky.addColorStop(1, '#cfe3ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, TP.HOR);
    // Skärgård vid horisonten
    ctx.fillStyle = '#5d7a6a';
    ctx.beginPath();
    ctx.moveTo(0, TP.HOR);
    ctx.quadraticCurveTo(60, TP.HOR - 22, 120, TP.HOR - 8);
    ctx.quadraticCurveTo(170, TP.HOR - 2, 210, TP.HOR);
    ctx.moveTo(250, TP.HOR);
    ctx.quadraticCurveTo(320, TP.HOR - 30, 400, TP.HOR - 12);
    ctx.lineTo(400, TP.HOR);
    ctx.fill();
    waterFill(ctx, W, H, '#2e6f93', '#123e5c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, TP.HOR);
    ctx.fillStyle = '#5d7a6a';
    ctx.beginPath();
    ctx.moveTo(0, TP.HOR);
    ctx.quadraticCurveTo(60, TP.HOR - 22, 120, TP.HOR - 8);
    ctx.quadraticCurveTo(170, TP.HOR - 2, 210, TP.HOR);
    ctx.closePath();
    ctx.moveTo(250, TP.HOR);
    ctx.quadraticCurveTo(320, TP.HOR - 30, 400, TP.HOR - 12);
    ctx.lineTo(400, TP.HOR);
    ctx.closePath();
    ctx.fill();
    // Vågor
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const z = 0.6 + ((i * 0.37 + s.t * 0.15) % 9);
      const x = ((i * 1.7) % 7) - 3.5;
      const [sx, sy, k] = tpProj(x, TP.WATER, z);
      ctx.beginPath();
      ctx.moveTo(sx - k * 0.25, sy);
      ctx.quadraticCurveTo(sx, sy - k * 0.04, sx + k * 0.25, sy);
      ctx.stroke();
    }
    // Bryggan: däck från kanten och bortåt, med plankor
    const dz0 = T.dock, dz1 = T.dock + 4.5, dx0 = -4.5, dx1 = 4.5;
    const c = (x, y, z) => tpProj(x, y, z);
    const poly = (pts, fill) => {
      ctx.beginPath();
      pts.forEach(([x, y, z], i) => {
        const [sx, sy] = c(x, y, z);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    poly([[dx0, 0, dz0], [dx1, 0, dz0], [dx1, TP.WATER, dz0], [dx0, TP.WATER, dz0]], '#4a3626');
    poly([[dx0, 0, dz0], [dx1, 0, dz0], [dx1, 0, dz1], [dx0, 0, dz1]], '#8a6748');
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.lineWidth = 1;
    for (let z = dz0 + 0.3; z < dz1; z += 0.3) {
      const [ax, ay] = c(dx0, 0, z), [bx, by] = c(dx1, 0, z);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    // Tidigare kast som landade på bryggan
    for (const m of s.marks) {
      if (m.i === s.i) continue;
      const [mx, my, k] = c(m.x, 0, m.z);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(mx, my, k * 0.16, k * 0.06, 0, 0, TAU);
      ctx.stroke();
    }
    // Pollaren
    {
      const [px, py, k] = c(T.bx, 0, T.bz);
      const [, ty] = c(T.bx, 0.55, T.bz);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(px + k * 0.04, py + k * 0.01, k * 0.18, k * 0.06, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#23272b';
      ctx.fillRect(px - k * 0.14, ty, k * 0.28, py - ty);
      ctx.beginPath();
      ctx.ellipse(px, py, k * 0.14, k * 0.05, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px, ty, k * 0.21, k * 0.07, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4a5157';
      ctx.beginPath();
      ctx.ellipse(px, ty - 1, k * 0.18, k * 0.055, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,194,37,.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, py, k * TP.RING, k * TP.RING * 0.36, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Vimpel som visar vinden
    {
      const [fx, fy, k] = c(dx1 - 1.2, 0, dz0 + 1.6);
      const [, ty] = c(dx1 - 1.2, 2.4, dz0 + 1.6);
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = Math.max(1.5, k * 0.03);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, ty);
      ctx.stroke();
      const len = k * (0.25 + T.ws * 0.08);
      const wave = Math.sin(s.t * (4 + T.ws)) * k * 0.04;
      ctx.fillStyle = '#d7323b';
      ctx.beginPath();
      ctx.moveTo(fx, ty);
      ctx.quadraticCurveTo(fx + (T.wd * len) / 2, ty + wave, fx + T.wd * len, ty + k * 0.06 + wave);
      ctx.lineTo(fx, ty + k * 0.18);
      ctx.closePath();
      ctx.fill();
    }
    // Fören och relingen längst ner
    ctx.fillStyle = '#f2f0ea';
    ctx.beginPath();
    ctx.moveTo(40, H);
    ctx.quadraticCurveTo(120, 600, 200, 586);
    ctx.quadraticCurveTo(280, 600, 360, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9b48f';
    ctx.beginPath();
    ctx.moveTo(70, H);
    ctx.quadraticCurveTo(130, 618, 200, 606);
    ctx.quadraticCurveTo(270, 618, 330, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b7bcc2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(44, H - 6);
    ctx.quadraticCurveTo(120, 596, 200, 582);
    ctx.quadraticCurveTo(280, 596, 356, H - 6);
    ctx.stroke();
    // Tampen: kveil på däck, linje till öglan
    ctx.strokeStyle = '#e8d9a8';
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(200, 664, 34 - k * 6, 13 - k * 2.4, 0, 0, TAU);
      ctx.stroke();
    }
    const [hx, hy] = c(...TP.HAND);
    const R = s.rope;
    const eye = R ? c(R.x, Math.max(R.y, TP.WATER), R.z) : null;
    if (eye) {
      ctx.strokeStyle = '#e8d9a8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(200, 664);
      ctx.quadraticCurveTo(hx, hy, hx, hy);
      const sag = s.phase === 'land' ? 0 : 40;
      ctx.quadraticCurveTo((hx + eye[0]) / 2, Math.max(hy, eye[1]) + sag, eye[0], eye[1]);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(eye[0], eye[1], eye[2] * 0.22, eye[2] * 0.09, 0, 0, TAU);
      ctx.stroke();
      if (s.land && s.land.wet && s.pt < 0.8) {
        ctx.strokeStyle = `rgba(255,255,255,${0.8 - s.pt})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(eye[0], eye[1], eye[2] * (0.2 + s.pt), eye[2] * (0.07 + s.pt * 0.35), 0, 0, TAU);
        ctx.stroke();
      }
    } else if (s.phase === 'aim') {
      ctx.strokeStyle = '#e8d9a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(200, 650, 15, 7, 0, 0, TAU);
      ctx.stroke();
    }
    // Fingrets spår
    if (s.path.length > 1) {
      ctx.strokeStyle = 'rgba(245,194,37,.6)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    // Text
    smallText(ctx, `KAST ${Math.min(s.i + 1, TP.THROWS)} AV ${TP.THROWS}`, W / 2, 24, 'center', 0.9, 13);
    const wtxt = T.ws < 0.8 ? 'Vind: stilla' : `Vind ${fmtNum(T.ws)} m/s ${T.wd > 0 ? '→' : '←'}`;
    smallText(ctx, wtxt, W / 2, 44, 'center', 0.9, 12);
    if (s.phase === 'aim' && s.pid === null) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.t * 4);
      smallText(ctx, 'SVEP UPPÅT MOT POLLAREN', W / 2, 560, 'center', 1, 14);
      ctx.globalAlpha = 1;
    }
    if (s.phase === 'land' && s.land) {
      ctx.fillStyle = 'rgba(6,14,22,.72)';
      ctx.fillRect(0, 96, W, 96);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 34px ${FONT_D}`;
      ctx.fillStyle = s.land.p === 100 ? '#4cc38a' : s.land.p >= 30 ? '#f5c225' : '#ff6b6b';
      ctx.fillText(s.land.lab, W / 2, 128);
      smallText(ctx, `${s.land.sub} · ${s.land.p} p`, W / 2, 166, 'center', 0.95, 14);
    }
    centerMsg(ctx, s, W / 2, 500, 28);
  },
  hud(s) {
    return { main: `${s.total} p`, sub: `Kast ${Math.min(s.i + 1, TP.THROWS)} av ${TP.THROWS}` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 0.3) {
      const on = s.pts.filter((p) => p === 100).length;
      return { score: s.total, title: on >= 3 ? 'Däcksmästare!' : 'Tampen är i land', detail: `${plural(on, 'kast', 'kast')} på pollaren · ` + s.pts.join(' · ') };
    }
    return null;
  },
};

/* =====================================================================
   GRILLMÄSTAREN – 60 sekunder vid klippgrillen. Vänd i tid, servera perfekt.
   Varje plats på gallret har sin egen värme; maten kommer i samma ordning för alla.
   ===================================================================== */
const GR = { W: 400, H: 720, TIME: 60, HOLD: 0.45, R: 40, FIRE: 1.9, BURN: 1.2 };
const GR_SLOTS = [[86, 330], [200, 330], [314, 330], [86, 470], [200, 470], [314, 470]];
const GR_TYPES = {
  korv: { name: 'Korv', rate: 1 / 6, raw: '#e4a090', done: '#a65a32' },
  burgare: { name: 'Burgare', rate: 1 / 8, raw: '#c8686a', done: '#6e3d22' },
  majs: { name: 'Majs', rate: 1 / 7, raw: '#f3d34e', done: '#c98f28' },
  halloumi: { name: 'Halloumi', rate: 1 / 4.5, raw: '#f5eedb', done: '#cf9340' },
  spett: { name: 'Grillspett', rate: 1 / 6.5, raw: '#d9846a', done: '#8c4a26' },
};
const GR_KEYS = Object.keys(GR_TYPES);

// Poäng för en sida beroende på hur genomstekt den är (1,0 = perfekt).
function grSide(d) {
  if (d < 0.5) return 0;
  if (d < 0.85) return Math.round(10 + ((d - 0.5) / 0.35) * 35);
  if (d <= 1.15) return 50;
  if (d <= 1.5) return Math.round(45 - ((d - 1.15) / 0.35) * 35);
  return -15;
}
function grColor(type, d) {
  const T = GR_TYPES[type];
  if (d <= 1) return mixHex(T.raw, T.done, d);
  if (d <= 1.5) return mixHex(T.done, '#3a2415', (d - 1) / 0.5);
  return mixHex('#3a2415', '#121010', (d - 1.5) / 0.5);
}

const grill = {
  id: 'grill',
  fit: 'contain',
  W: GR.W,
  H: GR.H,
  controls: 'none',
  pointer: true,
  hint: 'Tryck på maten för att vända. Håll kvar för att servera.',
  create(seed) {
    const r = rng(seed);
    const heats = [0.7, 0.85, 1, 1, 1.2, 1.4];
    for (let i = heats.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [heats[i], heats[j]] = [heats[j], heats[i]];
    }
    const queue = [];
    let at = 0;
    for (let i = 0; i < 48; i++) {
      queue.push({ type: GR_KEYS[Math.floor(r() * GR_KEYS.length)], at });
      at += i < 3 ? 0.6 : 1.6 + r() * 2.2;
    }
    return { t: 0, left: GR.TIME, heats, queue, slots: Array(6).fill(null), score: 0, served: 0, perfect: 0, streak: 0, fires: 0, phase: 'run', pt: 0, pops: [], smoke: [], msg: '', msgT: 0, msgC: '#f5c225' };
  },
  serve(s, k) {
    const it = s.slots[k];
    const a = grSide(it.a), b = grSide(it.b);
    let p = a + b;
    let lab;
    if (a === 50 && b === 50) {
      s.streak++;
      s.perfect++;
      p += Math.min(50, 10 * (s.streak - 1));
      lab = s.streak > 1 ? `PERFEKT ×${s.streak}` : 'PERFEKT!';
    } else {
      s.streak = 0;
      lab = it.a < 0.5 || it.b < 0.5 ? 'RÅ!' : a < 0 || b < 0 ? 'BRÄNT' : 'GOTT';
    }
    s.score += p;
    s.served++;
    s.slots[k] = null;
    const [x, y] = GR_SLOTS[k];
    s.pops.push({ x, y, txt: `${lab} ${p >= 0 ? '+' : ''}${p}`, c: p >= 100 ? '#4cc38a' : p >= 50 ? '#f5c225' : '#ff6b6b', t: 0 });
  },
  update(s, dt, inp) {
    s.t += dt;
    s.msgT -= dt;
    for (const p of s.pops) p.t += dt;
    s.pops = s.pops.filter((p) => p.t < 1.4);
    for (const p of s.smoke) {
      p.y -= p.vy * dt;
      p.x += p.vx * dt;
      p.life -= dt;
    }
    s.smoke = s.smoke.filter((p) => p.life > 0);
    if (s.phase !== 'run') {
      s.pt += dt;
      return;
    }
    s.left = Math.max(0, s.left - dt);
    const el = GR.TIME - s.left;
    // Ny mat läggs på första lediga plats när dess tid har kommit.
    while (s.queue.length && s.queue[0].at <= el) {
      const k = s.slots.indexOf(null);
      if (k < 0) break;
      const q = s.queue.shift();
      s.slots[k] = { type: q.type, a: 0, b: 0, down: 'a', fire: 0, flipT: 1, pid: null, holdT: 0 };
    }
    for (const e of inp.events || []) {
      if (e.type === 'down') {
        for (let k = 0; k < 6; k++) {
          const it = s.slots[k];
          const [x, y] = GR_SLOTS[k];
          if (it && it.pid === null && Math.hypot(e.x - x, e.y - y) <= GR.R + 10) {
            it.pid = e.id;
            it.holdT = 0;
            break;
          }
        }
      } else if (e.type === 'up') {
        for (let k = 0; k < 6; k++) {
          const it = s.slots[k];
          if (it && it.pid === e.id) {
            it.pid = null;
            if (it.holdT < GR.HOLD) {
              it.down = it.down === 'a' ? 'b' : 'a';
              it.flipT = 0;
            }
          }
        }
      }
    }
    for (let k = 0; k < 6; k++) {
      const it = s.slots[k];
      if (!it) continue;
      it.flipT = Math.min(1, it.flipT + dt * 5);
      if (it.pid !== null) {
        it.holdT += dt;
        if (it.holdT >= GR.HOLD) {
          grill.serve(s, k);
          continue;
        }
      }
      const rate = GR_TYPES[it.type].rate * s.heats[k];
      it[it.down] += rate * dt;
      const d = it[it.down];
      const [x, y] = GR_SLOTS[k];
      if (d > 0.8 && Math.random() < dt * (d > 1.3 ? 14 : 5)) {
        s.smoke.push({ x: x + (Math.random() * 2 - 1) * 24, y: y - 6, vx: (Math.random() * 2 - 1) * 8, vy: 24 + Math.random() * 30, life: 1 + Math.random(), dark: d > 1.3 });
      }
      if (d > GR.FIRE) {
        it.fire += dt;
        if (it.fire > GR.BURN) {
          s.score -= 25;
          s.fires++;
          s.streak = 0;
          s.slots[k] = null;
          s.vibrate = true;
          s.pops.push({ x, y, txt: 'ELD! −25', c: '#ff6b6b', t: 0 });
        }
      } else {
        it.fire = Math.max(0, it.fire - dt);
      }
    }
    if (s.left <= 0) {
      s.phase = 'done';
      s.pt = 0;
      say(s, 'TIDEN ÄR UTE', '#f5c225', 2);
    }
  },
  drawItem(ctx, it, x, y, t) {
    const up = it.down === 'a' ? 'b' : 'a';
    const dUp = it[up], dDown = it[it.down];
    const fill = grColor(it.type, dUp);
    const rim = grColor(it.type, dDown);
    const sq = it.flipT < 1 ? Math.abs(Math.cos(it.flipT * Math.PI)) * 0.85 + 0.15 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, sq);
    const marks = (w, h) => {
      if (dUp < 0.35) return;
      ctx.strokeStyle = `rgba(40,20,10,${clamp(dUp - 0.3, 0, 0.6)})`;
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.22 - h * 0.3, -h * 0.5);
        ctx.lineTo(i * w * 0.22 + h * 0.3, h * 0.5);
        ctx.stroke();
      }
    };
    ctx.lineWidth = 4;
    ctx.strokeStyle = rim;
    ctx.fillStyle = fill;
    if (it.type === 'korv') {
      rrect(ctx, -38, -12, 76, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      rrect(ctx, -38, -12, 76, 24, 12);
      ctx.clip();
      marks(76, 24);
      ctx.restore();
    } else if (it.type === 'burgare') {
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.clip();
      marks(60, 60);
      ctx.restore();
    } else if (it.type === 'majs') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 38, 15, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let i = -4; i <= 4; i++) for (let j = -1; j <= 1; j++) {
        ctx.beginPath();
        ctx.arc(i * 7.5, j * 7, 2.3, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#7da34a';
      ctx.beginPath();
      ctx.moveTo(36, 0);
      ctx.lineTo(50, -9);
      ctx.lineTo(48, 9);
      ctx.closePath();
      ctx.fill();
    } else if (it.type === 'halloumi') {
      rrect(ctx, -30, -20, 60, 40, 6);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      rrect(ctx, -30, -20, 60, 40, 6);
      ctx.clip();
      marks(60, 40);
      ctx.restore();
    } else {
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-46, 0);
      ctx.lineTo(46, 0);
      ctx.stroke();
      const parts = ['#000', '#5a8f3a', '#000', '#d8b54a', '#000'];
      parts.forEach((pc, i) => {
        const px = -32 + i * 16;
        ctx.fillStyle = pc === '#000' ? fill : grColor(it.type, dUp * 0.8);
        ctx.strokeStyle = rim;
        ctx.lineWidth = 3;
        rrect(ctx, px - 7, -11, 14, 22, 4);
        ctx.fill();
        ctx.stroke();
        if (pc !== '#000') {
          ctx.fillStyle = pc;
          ctx.globalAlpha = clamp(1 - dUp * 0.5, 0.3, 1);
          rrect(ctx, px - 5, -9, 10, 18, 3);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    }
    ctx.restore();
    if (it.fire > 0) {
      for (let i = 0; i < 6; i++) {
        const fx = x + Math.sin(t * 9 + i * 2.1) * 20 + (i - 2.5) * 6;
        const fh = 16 + Math.abs(Math.sin(t * 13 + i)) * 22;
        ctx.fillStyle = i % 2 ? 'rgba(255,190,60,.85)' : 'rgba(255,90,30,.85)';
        ctx.beginPath();
        ctx.moveTo(fx - 7, y + 6);
        ctx.quadraticCurveTo(fx, y - fh * 1.4, fx + 7, y + 6);
        ctx.fill();
      }
    }
    if (it.pid !== null) {
      const p = clamp(it.holdT / GR.HOLD, 0, 1);
      ctx.strokeStyle = '#4cc38a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, GR.R + 8, -Math.PI / 2, -Math.PI / 2 + p * TAU);
      ctx.stroke();
    }
  },
  draw(ctx, s) {
    const { W, H } = GR;
    const sky = ctx.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#4d5f96');
    sky.addColorStop(1, '#f0a35e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 200);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(300, 188, 26, 0, TAU);
    ctx.fill();
    waterFill(ctx, W, 60, '#3e5f86', '#2c4a6c');
    ctx.save();
    ctx.translate(0, 190);
    waterFill(ctx, W, 50, '#cf8a5c', '#3e5f86');
    ctx.restore();
    ctx.fillStyle = '#6e625c';
    ctx.fillRect(0, 230, W, H - 230);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse((i * 83) % W, 260 + ((i * 131) % 420), 50, 12, 0.3, 0, TAU);
      ctx.fill();
    }
    // Grillen
    ctx.fillStyle = '#1a1c1f';
    rrect(ctx, 18, 244, W - 36, 300, 22);
    ctx.fill();
    for (let k = 0; k < 6; k++) {
      const [x, y] = GR_SLOTS[k];
      const hgt = s.heats[k];
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 62);
      glow.addColorStop(0, `rgba(255,${Math.round(150 - hgt * 60)},40,${0.25 + hgt * 0.35})`);
      glow.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 60, y - 64, 120, 128);
      const fl = hgt < 0.8 ? 1 : hgt < 1.1 ? 2 : 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < fl ? '#ff8a3d' : 'rgba(255,255,255,.12)';
        const fx = x - 12 + i * 12, fy = y + 58;
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy + 4);
        ctx.quadraticCurveTo(fx, fy - 9, fx + 4, fy + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#4b4f55';
    ctx.lineWidth = 3;
    for (let y = 262; y < 530; y += 14) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(W - 30, y);
      ctx.stroke();
    }
    for (let k = 0; k < 6; k++) {
      const it = s.slots[k];
      if (it) grill.drawItem(ctx, it, GR_SLOTS[k][0], GR_SLOTS[k][1], s.t);
    }
    for (const p of s.smoke) {
      ctx.fillStyle = p.dark ? `rgba(40,40,40,${p.life * 0.35})` : `rgba(240,240,240,${p.life * 0.25})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + (1.6 - p.life) * 8, 0, TAU);
      ctx.fill();
    }
    for (const p of s.pops) {
      ctx.save();
      ctx.globalAlpha = clamp(1.4 - p.t, 0, 1);
      ctx.font = `900 22px ${FONT_D}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(5,12,20,.7)';
      ctx.strokeText(p.txt, p.x, p.y - 30 - p.t * 30);
      ctx.fillStyle = p.c;
      ctx.fillText(p.txt, p.x, p.y - 30 - p.t * 30);
      ctx.restore();
    }
    // Bricka med det som kommer härnäst
    smallText(ctx, 'PÅ TUR', 30, 584, 'left', 0.7, 10);
    const el = GR.TIME - s.left;
    s.queue.slice(0, 4).forEach((q, i) => {
      ctx.fillStyle = q.at <= el ? 'rgba(245,194,37,.25)' : 'rgba(255,255,255,.08)';
      rrect(ctx, 28 + i * 90, 596, 82, 40, 10);
      ctx.fill();
      smallText(ctx, GR_TYPES[q.type].name, 69 + i * 90, 616, 'center', 0.9, 11);
    });
    smallText(ctx, 'Lågor visar värmen på platsen', W / 2, 666, 'center', 0.55, 11);
    if (s.t < 5) smallText(ctx, 'Tryck = vänd · håll = servera', W / 2, 226 - 4, 'center', 0.95, 13);
    // Över gallret skulle meddelandet krocka med poängen som stiger från maten; himlen är fri.
    centerMsg(ctx, s, W / 2, 150, 36);
  },
  hud(s) {
    return { main: `${Math.max(0, s.score)} p`, sub: `${Math.ceil(s.left)} s kvar · ${s.served} serverade` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 1.4) {
      const fire = s.fires ? ` · ${plural(s.fires, 'brand', 'bränder')}` : '';
      return { score: Math.max(0, s.score), title: s.perfect >= 8 ? 'Grillmästare!' : 'Maten är serverad', detail: `${s.served} serverade · ${s.perfect} perfekta${fire}` };
    }
    return null;
  },
};

Object.assign(GAME_LOGIC, { navigator: navigatoren, fyr, tamp, grill });

if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, { NV, nvMap, nvSolvable, nvExtend, nvTotal, segPolyDist, segSegDist, FY, FY_CHARS, fyJudge, fyLevels, fyPeriod, fyOnAt, TP, tpLaunch, tpSpeed, tpScore, GR, grSide, GR_TYPES, GR_SLOTS });
}
