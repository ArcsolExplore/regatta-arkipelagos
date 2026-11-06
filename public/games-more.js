/* Regatta Arkipelagos – ännu fler solospel: Måsattacken, Svallvågen och Lotsen i dimman.
   Samma gränssnitt och samma frö för alla i omgången som spelen i logic.js och games-extra.js. */

/* =====================================================================
   MÅSATTACKEN – försvara räksmörgåsen mot måsarna. Tryck eller svep bort dem.
   ===================================================================== */
const MS = { W: 400, H: 720, TIME: 60, CX: 200, CY: 470, REACH: 46, SHRIMP: 10, COMBO: 0.8, BONUS: 25, STROKE: 0.4 };
const MS_KINDS = {
  mas: { r: 30, hp: 1, pts: 10, span: 1 },
  trut: { r: 40, hp: 2, pts: 25, span: 1.35 },
  dyk: { r: 30, hp: 1, pts: 15, span: 0.95 },
};

function msSpawns(seed) {
  const r = rng(seed);
  const out = [];
  let t = 0.6;
  while (t < MS.TIME) {
    const rate = 0.7 + t * 0.042;
    const roll = r();
    const kind = t > 18 && roll < 0.16 ? 'dyk' : roll > 0.84 ? 'trut' : 'mas';
    // Måsarna kommer från alla håll utom underifrån, där bordet står.
    const a = -Math.PI / 2 + (r() * 2 - 1) * 1.75;
    const x0 = MS.CX + Math.cos(a) * 520, y0 = MS.CY + Math.sin(a) * 520;
    const spd = kind === 'dyk' ? 175 + t * 1.6 : kind === 'trut' ? 52 + t * 0.9 : 68 + t * 1.25;
    out.push({ t, kind, x0, y0, spd, wob: kind === 'dyk' ? 0 : 20 + r() * 40, wf: 1.5 + r() * 2, ph: r() * TAU });
    t += (1 / rate) * (0.55 + r() * 0.9);
  }
  return out;
}

/* Poängtext som stiger: håll den innanför kanterna och stapla den ovanför en som redan syns på samma ställe. */
function msPop(s, x, y, txt, c) {
  x = clamp(x, 44, MS.W - 44);
  for (let k = 0; k < 6 && s.pops.some((p) => p.t < 1 && Math.abs(p.x - x) < 120 && Math.abs((p.y - p.t * 30) - y) < 32); k++) y -= 34;
  s.pops.push({ x, y, txt, c, t: 0 });
}

function msHit(s, gull, now) {
  if (gull.state !== 'in') return;
  gull.hp--;
  gull.hitT = 0.15;
  if (gull.hp > 0) {
    burst(s.parts, gull.x, gull.y, 5, '#ffffff', 90);
    return;
  }
  s.combo = now - s.lastHit < MS.COMBO ? Math.min(4, s.combo + 1) : 1;
  s.lastHit = now;
  const p = MS_KINDS[gull.kind].pts * s.combo;
  s.score += p;
  s.shoos++;
  gull.state = 'flee';
  const d = Math.hypot(gull.x - MS.CX, gull.y - MS.CY) || 1;
  gull.vx = ((gull.x - MS.CX) / d) * 380;
  gull.vy = ((gull.y - MS.CY) / d) * 380 - 120;
  burst(s.parts, gull.x, gull.y, 10, '#ffffff', 160);
  msPop(s, gull.x, gull.y, s.combo > 1 ? `+${p} ×${s.combo}` : `+${p}`, s.combo > 1 ? '#f5c225' : '#ffffff');
}

const masattack = {
  id: 'mas',
  fit: 'contain',
  W: MS.W,
  H: MS.H,
  controls: 'none',
  pointer: true,
  hint: 'Tryck eller svep över måsarna. Truten behöver två.',
  create(seed) {
    return { t: 0, left: MS.TIME, spawns: msSpawns(seed), next: 0, gulls: [], shrimps: MS.SHRIMP, score: 0, shoos: 0, stolen: 0, combo: 0, lastHit: -9, parts: [], pops: [], strokes: {}, phase: 'run', pt: 0, msg: '', msgT: 0, msgC: '#f5c225' };
  },
  update(s, dt, inp) {
    s.t += dt;
    s.msgT -= dt;
    s.parts = stepParts(s.parts, dt);
    for (const p of s.pops) p.t += dt;
    s.pops = s.pops.filter((p) => p.t < 1);
    // Flyende måsar flyger vidare även när försöket är slut.
    for (const g of s.gulls) {
      g.flap += dt * (g.state === 'in' ? 7 : 12);
      g.hitT = Math.max(0, (g.hitT || 0) - dt);
      if (g.state !== 'in') {
        g.x += g.vx * dt;
        g.y += g.vy * dt;
      }
    }
    s.gulls = s.gulls.filter((g) => g.state === 'in' || (g.x > -120 && g.x < MS.W + 120 && g.y > -120 && g.y < MS.H + 120));
    if (s.phase !== 'run') {
      s.pt += dt;
      return;
    }
    s.left = Math.max(0, s.left - dt);
    const el = MS.TIME - s.left;
    while (s.next < s.spawns.length && s.spawns[s.next].t <= el) {
      const sp = s.spawns[s.next++];
      s.gulls.push({ ...sp, x: sp.x0, y: sp.y0, age: 0, hp: MS_KINDS[sp.kind].hp, state: 'in', flap: sp.ph, hitBy: {} });
    }
    // Tryck och svep. Varje drag kan bara träffa samma mås en gång.
    for (const e of inp.events || []) {
      if (e.type === 'down') s.strokes[e.id] = { n: (s.strokeN = (s.strokeN || 0) + 1), px: e.x, py: e.y, t0: s.t };
      if (e.type === 'up') {
        delete s.strokes[e.id];
        continue;
      }
      const st = s.strokes[e.id];
      if (!st) continue;
      // Svepet räknas som en linje från förra punkten, så snabba svep träffar det de passerar (R1-LOG2-3).
      // Ett svep slår bara under sina första 0,4 s: att rita cirklar runt smörgåsen ska inte löna sig.
      if (s.t - st.t0 <= MS.STROKE) {
        for (const g of s.gulls) {
          if (g.state !== 'in' || g.hitBy[st.n]) continue;
          if (segDist(g.x, g.y, st.px, st.py, e.x, e.y) <= MS_KINDS[g.kind].r) {
            g.hitBy[st.n] = true;
            msHit(s, g, s.t);
          }
        }
      }
      st.px = e.x;
      st.py = e.y;
    }
    for (const g of s.gulls) {
      if (g.state !== 'in') continue;
      g.age += dt;
      const dx = MS.CX - g.x, dy = MS.CY - g.y;
      const d = Math.hypot(dx, dy) || 1;
      // Rakt mot smörgåsen, med en slingrande sidorörelse som avtar på nära håll.
      const ux = dx / d, uy = dy / d;
      const side = g.wob * Math.cos(g.age * g.wf + g.ph) * g.wf * Math.min(1, d / 200);
      g.vx = ux * g.spd - uy * side;
      g.vy = uy * g.spd + ux * side;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < MS.REACH) {
        g.state = 'steal';
        s.shrimps--;
        s.stolen++;
        s.combo = 0;
        s.vibrate = true;
        g.vx = -ux * 300;
        g.vy = -uy * 300 - 60;
        g.carry = true;
        msPop(s, MS.CX, MS.CY - 40, '−1 RÄKA', '#ff6b6b');
        if (s.shrimps <= 0) {
          s.shrimps = 0;
          s.phase = 'done';
          s.pt = 0;
          say(s, 'SMÖRGÅSEN ÄR BORTA', '#ff6b6b', 3);
          return;
        }
      }
    }
    if (s.left <= 0) {
      s.score += s.shrimps * MS.BONUS;
      s.phase = 'done';
      s.pt = 0;
      say(s, `${s.shrimps} RÄKOR KVAR!`, '#4cc38a', 3);
    }
  },
  drawGull(ctx, g) {
    const K = MS_KINDS[g.kind];
    const ang = Math.atan2(g.vy, g.vx);
    const sc = K.span * (g.kind === 'dyk' && g.state === 'in' ? 0.8 + 0.4 * clamp(1 - Math.hypot(g.x - MS.CX, g.y - MS.CY) / 400, 0, 1) : 1);
    const flap = Math.sin(g.flap) * 0.45;
    ctx.save();
    ctx.translate(g.x + 10 * sc, g.y + 14 * sc);
    ctx.rotate(ang);
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 30 * (1 - Math.abs(flap) * 0.4), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(ang);
    ctx.scale(sc, sc);
    const back = g.kind === 'trut' ? '#4a525a' : '#b9c2c9';
    for (const side of [-1, 1]) {
      const span = 34 * (1 - Math.abs(flap) * 0.5);
      ctx.fillStyle = back;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(-2, side * span * 0.6, -12, side * span);
      ctx.lineTo(-18, side * span * 0.92);
      ctx.quadraticCurveTo(-10, side * span * 0.4, -8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#16191c';
      ctx.beginPath();
      ctx.moveTo(-12, side * span);
      ctx.lineTo(-18, side * span * 0.92);
      ctx.lineTo(-13, side * span * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = g.hitT > 0 ? '#ffd2d2' : '#f6f7f4';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 14, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11, 0, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.moveTo(15, -1.8);
    ctx.lineTo(23, 0);
    ctx.lineTo(15, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d7323b';
    ctx.fillRect(19, -0.4, 2, 1.4);
    ctx.fillStyle = '#222';
    ctx.fillRect(12, -3, 1.6, 1.6);
    ctx.fillRect(12, 1.4, 1.6, 1.6);
    if (g.carry) {
      ctx.strokeStyle = '#ff9a8a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(25, 0, 4, 0.4, 4.2);
      ctx.stroke();
    }
    ctx.restore();
  },
  draw(ctx, s) {
    const { W, H, CX, CY } = MS;
    // Däck av teak
    ctx.fillStyle = '#a87a4e';
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 26) {
      ctx.fillStyle = (x / 26) % 2 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.03)';
      ctx.fillRect(x, 0, 26, H);
      ctx.fillStyle = 'rgba(30,20,10,.5)';
      ctx.fillRect(x, 0, 2, H);
    }
    // Rutig duk
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(0.06);
    rrect(ctx, -150, -120, 300, 240, 10);
    ctx.clip();
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(-150, -120, 300, 240);
    ctx.fillStyle = 'rgba(200,40,50,.55)';
    for (let i = -150; i < 150; i += 30) ctx.fillRect(i, -120, 15, 240);
    for (let j = -120; j < 120; j += 30) ctx.fillRect(-150, j, 300, 15);
    ctx.restore();
    // Tallrik och smörgås
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath();
    ctx.ellipse(CX + 4, CY + 6, 82, 78, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.arc(CX, CY, 80, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#dfe3e6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, CY, 64, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#7b4b2a';
    rrect(ctx, CX - 52, CY - 38, 104, 76, 12);
    ctx.fill();
    ctx.fillStyle = '#5fa84a';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(CX - 44 + i * 11, CY - 30 + (i % 2) * 4, 9, 0, TAU);
      ctx.fill();
    }
    for (const [ex, ey] of [[-26, 14], [0, 18], [26, 14]]) {
      ctx.fillStyle = '#fffdf6';
      ctx.beginPath();
      ctx.arc(CX + ex, CY + ey, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f4b52a';
      ctx.beginPath();
      ctx.arc(CX + ex, CY + ey, 5, 0, TAU);
      ctx.fill();
    }
    // Räkorna: de som finns kvar
    ctx.lineCap = 'round';
    for (let i = 0; i < MS.SHRIMP; i++) {
      if (i >= s.shrimps) break;
      const a = (i / MS.SHRIMP) * TAU;
      const x = CX + Math.cos(a) * 26, y = CY - 6 + Math.sin(a) * 15;
      ctx.strokeStyle = '#f08a7a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, 6, a, a + 3.6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, a + 0.4, a + 2.2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3f7a37';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(CX - 6 + i * 4, CY - 10);
      ctx.lineTo(CX - 12 + i * 6, CY - 18);
      ctx.stroke();
    }
    ctx.fillStyle = '#f5e04a';
    ctx.beginPath();
    ctx.moveTo(CX + 56, CY - 6);
    ctx.arc(CX + 56, CY - 6, 16, -0.6, 0.9);
    ctx.closePath();
    ctx.fill();
    for (const g of s.gulls) masattack.drawGull(ctx, g);
    for (const p of s.parts) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.6, p.r * 0.7, p.vx * 0.01, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of s.pops) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - p.t, 0, 1);
      ctx.font = `900 22px ${FONT_D}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(5,12,20,.7)';
      ctx.strokeText(p.txt, p.x, p.y - 20 - p.t * 30);
      ctx.fillStyle = p.c;
      ctx.fillText(p.txt, p.x, p.y - 20 - p.t * 30);
      ctx.restore();
    }
    if (s.t < 4 && s.phase === 'run') smallText(ctx, 'Skydda räkorna!', W / 2, 640, 'center', 0.95, 15);
    centerMsg(ctx, s, W / 2, 250, 32);
  },
  hud(s) {
    return { main: `${s.score} p`, sub: `${Math.ceil(s.left)} s kvar · ${s.shrimps} ${s.shrimps === 1 ? 'räka' : 'räkor'} kvar` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 1.4) {
      const kept = s.shrimps > 0;
      return {
        score: s.score,
        title: kept ? 'Smörgåsen räddad!' : 'Måsarna vann',
        detail: `${plural(s.shoos, 'mås', 'måsar')} bortjagade · ${s.stolen} ${s.stolen === 1 ? 'räka' : 'räkor'} stulna${kept ? ` · ${s.shrimps} kvar ger ${s.shrimps * MS.BONUS} p` : ''}`,
      };
    }
    return null;
  },
};

/* =====================================================================
   SVALLVÅGEN – båtarna passerar och svallet gungar sittbrunnen.
   Luta telefonen så att kaffekoppen står kvar och inget skvimpar ut.
   ===================================================================== */
const SV = { W: 400, H: 720, TIME: 60, X0: 44, X1: 356, Y0: 214, Y1: 660, R: 24, G: 430, STICK: 70, FRIC: 110, TIP: 165, SPILL: 0.0011, SPILL_A: 150 };
const SV_BOATS = [
  { name: 'Waxholmsbåten', A: [1.15, 1.4], per: [2.7, 3.4], dec: [5, 6.5], col: '#f4f4f0', len: 120 },
  { name: 'Taxibåt', A: [0.85, 1.05], per: [2.0, 2.5], dec: [3, 4], col: '#f5c225', len: 50 },
  { name: 'Motorbåt', A: [0.7, 0.9], per: [1.8, 2.3], dec: [3, 3.8], col: '#d7323b', len: 40 },
  { name: 'Segelbåt', A: [0.35, 0.5], per: [2.8, 3.4], dec: [3.5, 4.5], col: '#2a64c4', len: 44 },
];

function svWakes(seed) {
  const r = rng(seed);
  const out = [];
  let t = 3;
  let i = 0;
  while (t < SV.TIME - 2) {
    const B = i === 2 || i === 6 ? SV_BOATS[0] : SV_BOATS[1 + Math.floor(r() * 3)];
    const f = (lo, hi) => lo + r() * (hi - lo);
    const grow = 0.75 + Math.min(1, t / SV.TIME) * 0.35;
    // Svallet kommer från sidan båten passerar: babord, styrbord, förifrån eller akterifrån.
    const dir = Math.floor(r() * 4) * (Math.PI / 2) + (r() * 2 - 1) * 0.35;
    out.push({ t0: t, name: B.name, col: B.col, len: B.len, A: f(...B.A) * grow, per: f(...B.per), dec: f(...B.dec), dir, side: r() < 0.5 ? -1 : 1 });
    t += 3.2 + r() * 3.6 - Math.min(1.6, t / 40);
    i++;
  }
  return out;
}
// Båtens lutning som en vektor i bordets plan: åt vilket håll koppen vill glida, och hur mycket.
function svTilt(wakes, t) {
  let x = 0.06 * Math.sin(t * 0.9), y = 0.05 * Math.sin(t * 0.7 + 1);
  for (const w of wakes) {
    const u = t - w.t0;
    if (u < 0 || u > w.dec * 3) continue;
    const env = Math.min(1, u / 0.6) * Math.exp(-u / w.dec);
    const a = w.A * env * Math.sin((u / w.per) * TAU);
    x += Math.cos(w.dir) * a;
    y += Math.sin(w.dir) * a;
  }
  return [x, y];
}

const svall = {
  id: 'svall',
  fit: 'contain',
  W: SV.W,
  H: SV.H,
  controls: 'none',
  pointer: true,
  tilt: true,
  hint: 'Luta telefonen mot svallet. Utan lutningssensor: dra med fingret.',
  create(seed) {
    const wakes = svWakes(seed);
    return { t: 0, wakes, x: 200, y: 450, vx: 0, vy: 0, ax: 0, ay: 0, level: 1, score: 0, phase: 'run', pt: 0, tipped: false, drag: null, px: 0, py: 0, bumps: 0, msg: '', msgT: 0, msgC: '#f5c225', drops: [] };
  },
  update(s, dt, inp) {
    s.t += dt;
    s.msgT -= dt;
    for (const d of s.drops) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    s.drops = s.drops.filter((d) => d.life > 0);
    if (s.phase !== 'run') {
      s.pt += dt;
      return;
    }
    // Spelarens lutning: telefonens sensor om den finns, annars ett drag med fingret som en styrspak.
    for (const e of inp.events || []) {
      if (e.type === 'down') s.drag = { id: e.id, x0: e.x, y0: e.y, x: e.x, y: e.y };
      else if (s.drag && e.id === s.drag.id) {
        if (e.type === 'move') {
          s.drag.x = e.x;
          s.drag.y = e.y;
        } else s.drag = null;
      }
    }
    let px = 0, py = 0;
    if (inp.tiltOk) {
      px = clamp(inp.tiltX || 0, -1.2, 1.2);
      py = clamp(inp.tiltY || 0, -1.2, 1.2);
    } else if (s.drag) {
      px = clamp((s.drag.x - s.drag.x0) / 80, -1.2, 1.2);
      py = clamp((s.drag.y - s.drag.y0) / 80, -1.2, 1.2);
    } else {
      px = (inp.right ? 0.8 : 0) - (inp.left ? 0.8 : 0);
    }
    // Snabb men inte omedelbar utjämning, så att en skakig hand inte ger ryck.
    const k = 1 - Math.exp(-dt * 18);
    s.px += (px - s.px) * k;
    s.py += (py - s.py) * k;
    const [wx, wy] = svTilt(s.wakes, s.t);
    s.wx = wx;
    s.wy = wy;
    const ax = SV.G * (wx + s.px), ay = SV.G * (wy + s.py);
    s.ax = ax;
    s.ay = ay;
    const amag = Math.hypot(ax, ay);
    // Coulombfriktion: en stillastående kopp rör sig inte förrän lutningen övervinner vilofriktionen.
    // En glidande kopp bromsas lika mycket per sekund oavsett steglängd och stannar när farten når noll.
    const ox = s.vx, oy = s.vy;
    if (ox === 0 && oy === 0 && amag < SV.STICK) {
      // står kvar
    } else {
      let nx = ox + ax * dt, ny = oy + ay * dt;
      const v = Math.hypot(nx, ny);
      const nv = Math.max(0, v - SV.FRIC * dt);
      if (nv === 0 && amag < SV.STICK) {
        nx = 0;
        ny = 0;
      } else if (v > 0) {
        nx *= nv / v;
        ny *= nv / v;
      }
      s.x += ((ox + nx) / 2) * dt;
      s.y += ((oy + ny) / 2) * dt;
      s.vx = nx;
      s.vy = ny;
    }
    // Slingerkanten: koppen studsar, men slår den i för hårt välter den.
    const rim = (n, pos, lo, hi, set) => {
      if (pos - SV.R < lo || pos + SV.R > hi) {
        const vn = Math.abs(s[n]);
        set(clamp(pos, lo + SV.R, hi - SV.R));
        if (vn > SV.TIP) {
          s.tipped = true;
          return;
        }
        if (vn > 30) {
          s.level = Math.max(0, s.level - 0.06 * (vn / SV.TIP));
          s.bumps++;
          s.vibrate = vn > 90;
          for (let i = 0; i < 4; i++) s.drops.push({ x: s.x, y: s.y, vx: (Math.random() * 2 - 1) * 60, vy: (Math.random() * 2 - 1) * 60, life: 0.6 });
        }
        s[n] = -s[n] * 0.25;
      }
    };
    rim('vx', s.x, SV.X0, SV.X1, (v) => (s.x = v));
    rim('vy', s.y, SV.Y0, SV.Y1, (v) => (s.y = v));
    // Kaffet skvimpar när koppen rycker till.
    const spill = SV.SPILL * Math.max(0, amag - SV.SPILL_A) * dt;
    if (spill > 0) {
      s.level = Math.max(0, s.level - spill);
      if (Math.random() < spill * 200) s.drops.push({ x: s.x + (ax / amag) * SV.R, y: s.y + (ay / amag) * SV.R, vx: (ax / amag) * 50, vy: (ay / amag) * 50, life: 0.8 });
    }
    s.score += s.level * dt * (1000 / SV.TIME);
    if (s.tipped || s.level <= 0) {
      s.phase = 'done';
      s.pt = 0;
      s.vibrate = true;
      say(s, s.tipped ? 'KOPPEN VÄLTE!' : 'KOPPEN ÄR TOM', '#ff6b6b', 3);
      return;
    }
    if (s.t >= SV.TIME) {
      s.phase = 'done';
      s.pt = 0;
      say(s, 'KAFFET RÄDDAT!', '#4cc38a', 3);
    }
  },
  draw(ctx, s) {
    const { W, H } = SV;
    // Havet med båtarna som passerar
    waterFill(ctx, W, 190, '#2e6f93', '#1f5878');
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const x = (i * 71 + s.t * 12) % 420 - 10, y = 20 + ((i * 47) % 150);
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.quadraticCurveTo(x, y - 3, x + 10, y);
      ctx.stroke();
    }
    let warn = null;
    for (const w of s.wakes) {
      const u = s.t - w.t0;
      if (u > -4.5 && u < 2) {
        const p = (u + 4.5) / 6.5;
        const x = w.side > 0 ? -w.len + p * (W + 2 * w.len) : W + w.len - p * (W + 2 * w.len);
        const y = 60 + ((w.t0 * 37) % 90);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(w.side, 1);
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 2;
        for (let k = 1; k <= 4; k++) {
          ctx.beginPath();
          ctx.moveTo(-w.len / 2 - k * 18, -k * 6);
          ctx.lineTo(-w.len / 2, 0);
          ctx.lineTo(-w.len / 2 - k * 18, k * 6);
          ctx.stroke();
        }
        ctx.fillStyle = w.col;
        ctx.beginPath();
        ctx.moveTo(w.len / 2, 0);
        ctx.quadraticCurveTo(w.len / 4, -w.len * 0.16, -w.len / 2, -w.len * 0.14);
        ctx.lineTo(-w.len / 2, w.len * 0.14);
        ctx.quadraticCurveTo(w.len / 4, w.len * 0.16, w.len / 2, 0);
        ctx.fill();
        if (w.name === 'Waxholmsbåten') {
          ctx.fillStyle = '#1a1f24';
          ctx.fillRect(-w.len * 0.05, -6, 12, 12);
          ctx.fillStyle = '#e8c45a';
          ctx.fillRect(-w.len * 0.05, -6, 12, 4);
        }
        ctx.restore();
      }
      if (u > -1.6 && u < 0.3) warn = w;
    }
    // Sittbrunnen och bordet
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(0, 190, W, H - 190);
    ctx.fillStyle = '#b5844f';
    rrect(ctx, SV.X0 - 14, SV.Y0 - 14, SV.X1 - SV.X0 + 28, SV.Y1 - SV.Y0 + 28, 18);
    ctx.fill();
    ctx.fillStyle = '#c99760';
    rrect(ctx, SV.X0, SV.Y0, SV.X1 - SV.X0, SV.Y1 - SV.Y0, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,15,.35)';
    ctx.lineWidth = 2;
    for (let x = SV.X0 + 26; x < SV.X1; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, SV.Y0);
      ctx.lineTo(x, SV.Y1);
      ctx.stroke();
    }
    // Kanelbulle som dekor
    ctx.fillStyle = '#c98a45';
    ctx.beginPath();
    ctx.arc(300, 600, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8a5526';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let a = 0; a < 12; a += 0.3) {
      const rr = 3 + a * 1.4;
      ctx.lineTo(300 + Math.cos(a) * rr, 600 + Math.sin(a) * rr);
    }
    ctx.stroke();
    // Spill
    ctx.fillStyle = 'rgba(80,45,20,.55)';
    for (const d of s.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, TAU);
      ctx.fill();
    }
    // Koppen sedd ovanifrån
    const amag = Math.hypot(s.ax, s.ay) || 1;
    const sl = clamp(amag / 600, 0, 0.5);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.arc(4, 5, SV.R + 1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f7f7f3';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(SV.R + 6, 0, 8, -1.2, 1.2);
    ctx.stroke();
    ctx.fillStyle = '#f7f7f3';
    ctx.beginPath();
    ctx.arc(0, 0, SV.R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d64848';
    ctx.beginPath();
    ctx.arc(0, 0, SV.R, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a64c4';
    ctx.stroke();
    const cr = (SV.R - 5) * (0.35 + 0.65 * s.level);
    ctx.fillStyle = '#5a3418';
    ctx.beginPath();
    ctx.arc((-s.ax / amag) * sl * 6, (-s.ay / amag) * sl * 6, cr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,180,140,.5)';
    ctx.beginPath();
    ctx.ellipse((s.ax / amag) * sl * cr * 0.6, (s.ay / amag) * sl * cr * 0.6, cr * 0.5, cr * 0.3, Math.atan2(s.ay, s.ax), 0, TAU);
    ctx.fill();
    ctx.restore();
    // Vattenpass: visar hur bordet lutar just nu (båt + din lutning)
    const lx = 60, ly = 680;
    ctx.fillStyle = 'rgba(13,20,27,.75)';
    rrect(ctx, lx - 30, ly - 12, 60, 24, 12);
    ctx.fill();
    const bx = clamp((s.wx + s.px) * 22, -22, 22);
    ctx.fillStyle = Math.abs(s.wx + s.px) < 0.15 ? '#4cc38a' : '#f5c225';
    ctx.beginPath();
    ctx.arc(lx - bx, ly, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(13,20,27,.75)';
    rrect(ctx, 290, 670, 84, 24, 12);
    ctx.fill();
    smallText(ctx, `Kaffe ${Math.round(s.level * 100)} %`, 332, 682, 'center', 0.95, 12);
    if (warn) {
      const ux = Math.cos(warn.dir), uy = Math.sin(warn.dir);
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.t * 14);
      ctx.translate(200 - ux * 120, 437 - uy * 160);
      ctx.rotate(warn.dir);
      ctx.fillStyle = '#f5c225';
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(-12, -16);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-12, 16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      smallText(ctx, `SVALL FRÅN ${warn.name.toUpperCase()}`, W / 2, 205, 'center', 0.95, 12);
    }
    centerMsg(ctx, s, W / 2, 330, 30);
  },
  hud(s) {
    return { main: `${Math.round(s.score)} p`, sub: `${Math.max(0, Math.ceil(SV.TIME - s.t))} s kvar · kaffe ${Math.round(s.level * 100)} %` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 1.6) {
      const full = s.t >= SV.TIME - 0.01;
      return {
        score: Math.round(s.score),
        title: s.tipped ? 'Koppen välte' : full ? 'Kaffet står kvar!' : 'Koppen är tom',
        detail: `${fmtNum(Math.min(s.t, SV.TIME), 0)} s i sittbrunnen · ${Math.round(s.level * 100)} % kaffe kvar · ${plural(s.bumps, 'smäll', 'smällar')} i kanten`,
      };
    }
    return null;
  },
};

/* =====================================================================
   LOTSEN I DIMMAN – memorera kartan, sedan kommer dimman.
   Lys efter sjömärkena, passera 1 och 2 och nå fyren. Mistluren visar kartan en kort stund.
   ===================================================================== */
const LT = { W: 400, H: 720, MEMO: 4, SPEED: 58, TURN: 2.1, SEE: 62, GAP: 18, PEN: 5, HORN: 2, HORN_T: 0.7, HORN_CD: 2.5, MARK_R: 22, GOAL_R: 26, SC: 0.6, TLIM: 180 };
const LT_HULL = MB_HULL.map(([x, y]) => [x * LT.SC, y * LT.SC]);

function ltSolvable(map) {
  const g = NV.GRID;
  const cols = Math.floor(LT.W / g) + 1, rows = Math.floor(LT.H / g) + 1;
  const free = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * g, py = y * g;
      if (px < LT.GAP || px > LT.W - LT.GAP || py < LT.GAP || py > LT.H - LT.GAP) continue;
      let ok = true;
      for (const o of map.obs) {
        if (px < o.box[0] - LT.GAP || px > o.box[2] + LT.GAP || py < o.box[1] - LT.GAP || py > o.box[3] + LT.GAP) continue;
        if (polyPointGap(o.P, px, py) <= LT.GAP) { ok = false; break; }
      }
      free[y * cols + x] = ok ? 1 : 0;
    }
  }
  const legs = [[map.start, map.marks[0]], [map.marks[0], map.marks[1]], [map.marks[1], map.goal]];
  return legs.every(([a, b]) => nvReach(free, cols, rows, a, b));
}

function ltMap(seed) {
  const r = rng(seed);
  for (let attempt = 0; attempt < 80; attempt++) {
    const side = r() < 0.5 ? -1 : 1;
    const start = { x: 200 + (r() * 2 - 1) * 80, y: 668 };
    const goal = { x: 90 + r() * 220, y: 56 };
    const marks = [
      { x: 200 + side * (60 + r() * 90), y: 470 + r() * 50, n: 1 },
      { x: 200 - side * (60 + r() * 90), y: 240 + r() * 50, n: 2 },
    ];
    const keep = [start, goal, ...marks];
    const obs = [];
    // Färre men större skär än i Navigatören: farleden ska gå att minnas.
    const want = [...Array(9).fill('land'), ...Array(4).fill('grund')];
    for (const kind of want) {
      for (let tries = 0; tries < 40; tries++) {
        const rad = kind === 'land' ? 22 + r() * 30 : 14 + r() * 14;
        const cx = 20 + r() * (LT.W - 40), cy = 120 + r() * 480;
        const P = nvBlob(r, cx, cy, rad);
        if (keep.some((p) => polyPointGap(P, p.x, p.y) < 46)) continue;
        const b = polyBox(P);
        obs.push({ kind, P, box: [b.x0, b.y0, b.x1, b.y1] });
        break;
      }
    }
    const map = { start, goal, marks, obs };
    const legs = [[start, marks[0]], [marks[0], marks[1]], [marks[1], goal]];
    if (attempt < 40 && !legs.some(([a, b]) => nvLegBlocked(map, a, b))) continue;
    if (!ltSolvable(map)) continue;
    return map;
  }
  return { start: { x: 200, y: 668 }, goal: { x: 200, y: 56 }, marks: [{ x: 110, y: 480, n: 1 }, { x: 290, y: 260, n: 2 }], obs: [] };
}

function ltHull(s) {
  // Fören uppåt i MB_HULL; båtens kurs a mäts från +x, så vrid med a + π/2.
  const c = Math.cos(s.a + Math.PI / 2), sn = Math.sin(s.a + Math.PI / 2);
  return LT_HULL.map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
}
// Rör skrovet land, grund eller kartkanten? Exakt mot skrovets kanter, samma form som ritas.
function ltAground(s) {
  const P = ltHull(s);
  for (const [x, y] of P) if (x < 2 || x > LT.W - 2 || y < 2 || y > LT.H - 2) return true;
  const bx0 = s.x - 16, bx1 = s.x + 16, by0 = s.y - 16, by1 = s.y + 16;
  for (const o of s.map.obs) {
    if (bx1 < o.box[0] || bx0 > o.box[2] || by1 < o.box[1] || by0 > o.box[3]) continue;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (segPolyDist(a[0], a[1], b[0], b[1], o.P) <= 0) return true;
    }
    // Ett litet grund kan ligga helt innanför skrovet.
    if (pointInPoly(o.P[0][0], o.P[0][1], P)) return true;
  }
  return false;
}

const lotsen = {
  id: 'lots',
  fit: 'contain',
  W: LT.W,
  H: LT.H,
  controls: 'lrb',
  actionLabel: 'TUTA',
  create(seed) {
    const map = ltMap(seed);
    return { t: 0, map, x: map.start.x, y: map.start.y, a: -Math.PI / 2, phase: 'memo', pt: 0, run: 0, pen: 0, hits: 0, horns: 0, hornT: 0, hornCd: 0, stopT: 0, prog: 0, safe: [], flashT: 0, wake: [], msg: '', msgT: 0, msgC: '#f5c225' };
  },
  update(s, dt, inp) {
    s.t += dt;
    s.pt += dt;
    s.msgT -= dt;
    s.hornT = Math.max(0, s.hornT - dt);
    s.hornCd = Math.max(0, s.hornCd - dt);
    s.flashT = Math.max(0, s.flashT - dt);
    for (const w of s.wake) w.life -= dt;
    s.wake = s.wake.filter((w) => w.life > 0);
    if (s.phase === 'memo') {
      if (s.pt >= LT.MEMO) {
        s.phase = 'run';
        s.pt = 0;
        say(s, 'DIMMAN KOMMER', '#eaf1f5', 1.4);
      }
      return;
    }
    if (s.phase !== 'run') return;
    s.run += dt;
    if (s.run >= LT.TLIM) {
      // Tre minuter i dimman utan att komma fram: försöket avbryts och sparas inte (R1-LOG2-5).
      s.phase = 'timeout';
      s.pt = 0;
      say(s, 'TIDEN ÄR UTE', '#f5c225', 3);
      return;
    }
    if (inp.boostPressed && s.hornCd <= 0) {
      s.hornT = LT.HORN_T;
      s.hornCd = LT.HORN_CD;
      s.pen += LT.HORN;
      s.horns++;
      say(s, `TUUUT! +${LT.HORN} s`, '#eaf1f5', 0.9);
    }
    if (s.stopT > 0) {
      s.stopT -= dt;
      return;
    }
    const turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    s.a += turn * LT.TURN * dt;
    s.x += Math.cos(s.a) * LT.SPEED * dt;
    s.y += Math.sin(s.a) * LT.SPEED * dt;
    if (Math.random() < dt * 20) s.wake.push({ x: s.x - Math.cos(s.a) * 12, y: s.y - Math.sin(s.a) * 12, life: 1.2 });
    if (ltAground(s)) {
      s.hits++;
      s.pen += LT.PEN;
      s.vibrate = true;
      s.flashT = 0.9;
      s.stopT = 0.8;
      say(s, `GRUND! +${LT.PEN} s`, '#ff6b6b', 1.3);
      // Tillbaka till en säker punkt en bit bakåt i kölvattnet, vänd mot märket du ska till (R1-LOG2-6).
      // Ligger det land rakt framför i den riktningen vänds båten bort från grundet i stället.
      const hitX = s.x, hitY = s.y;
      const back = s.safe[Math.max(0, s.safe.length - 6)] || { x: s.map.start.x, y: s.map.start.y, a: -Math.PI / 2 };
      const tgt = s.prog < 2 ? s.map.marks[s.prog] : s.map.goal;
      const clear = (a) => {
        for (let d = 0; d <= 30; d += 6) {
          if (ltAground({ ...s, x: back.x + Math.cos(a) * d, y: back.y + Math.sin(a) * d, a })) return false;
        }
        return true;
      };
      const toMark = Math.atan2(tgt.y - back.y, tgt.x - back.x);
      const away = Math.atan2(back.y - hitY, back.x - hitX);
      s.x = back.x;
      s.y = back.y;
      s.a = clear(toMark) ? toMark : clear(away) ? away : back.a;
      s.safe = s.safe.slice(0, Math.max(0, s.safe.length - 6));
      return;
    }
    if (!s.safe.length || Math.hypot(s.x - s.safe[s.safe.length - 1].x, s.y - s.safe[s.safe.length - 1].y) > 8) {
      s.safe.push({ x: s.x, y: s.y, a: s.a });
      if (s.safe.length > 80) s.safe.shift();
    }
    if (s.prog < 2) {
      const m = s.map.marks[s.prog];
      if (Math.hypot(s.x - m.x, s.y - m.y) <= LT.MARK_R) {
        s.prog++;
        say(s, `MÄRKE ${m.n} ✓`, '#4cc38a', 1);
      }
    } else if (Math.hypot(s.x - s.map.goal.x, s.y - s.map.goal.y) <= LT.GOAL_R) {
      s.prog = 3;
      s.phase = 'done';
      s.pt = 0;
      say(s, 'FRAMME VID FYREN!', '#4cc38a', 2);
    }
  },
  draw(ctx, s) {
    const { W, H } = LT;
    const m = s.map;
    waterFill(ctx, W, H, '#1b4a68', '#123a56');
    for (const o of m.obs) {
      pathPoly(ctx, o.P);
      if (o.kind === 'land') {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(126,178,198,.35)';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.fillStyle = '#6f6660';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(150,200,215,.35)';
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(220,240,250,.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const w of s.wake) {
      ctx.fillStyle = `rgba(255,255,255,${w.life * 0.25})`;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 2 + (1.2 - w.life) * 4, 0, TAU);
      ctx.fill();
    }
    // Fyren vid målet och sjömärkena
    const lamp = (x, y, col, rad, on) => {
      if (!on) return;
      const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    const drawMarks = (glowOnly) => {
      m.marks.forEach((mk, i) => {
        const col = i === 0 ? 'rgba(255,80,70,.9)' : 'rgba(80,230,140,.9)';
        // Märkena blinkar: Fl(1) för 1, Fl(2) för 2, så man vet vilket man ser i dimman.
        const ph = s.t % 2.4;
        const on = i === 0 ? ph < 0.35 : ph < 0.25 || (ph > 0.55 && ph < 0.8);
        lamp(mk.x, mk.y, col, 34, on || !glowOnly);
        if (!glowOnly) {
          ctx.fillStyle = i === 0 ? '#c0392b' : '#1f8a4c';
          ctx.beginPath();
          ctx.arc(mk.x, mk.y, 7, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 9px ${FONT_M}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(s.prog > i ? '✓' : String(mk.n), mk.x, mk.y + 0.5);
        }
      });
      const fon = s.t % 3 < 0.5;
      lamp(m.goal.x, m.goal.y, 'rgba(255,246,216,.95)', fon ? 70 : 0, fon || !glowOnly);
      if (!glowOnly) {
        ctx.fillStyle = '#eef1f2';
        ctx.fillRect(m.goal.x - 5, m.goal.y - 14, 10, 20);
        ctx.fillStyle = '#c9302c';
        ctx.fillRect(m.goal.x - 5, m.goal.y - 6, 10, 5);
        ctx.fillStyle = '#20262b';
        ctx.fillRect(m.goal.x - 7, m.goal.y + 6, 14, 4);
      }
    };
    drawMarks(false);
    // Båten
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a + Math.PI / 2);
    ctx.scale(LT.SC, LT.SC);
    drawMotorboat(ctx, 0, 0, 0, '#f5c225', 1);
    ctx.restore();
    // Dimman: tät överallt utom närmast båten. Mistluren och grundstötningar lättar den en stund.
    if (s.phase !== 'memo') {
      const lift = Math.max(s.hornT / LT.HORN_T, s.flashT / 0.9, s.phase === 'done' ? clamp(s.pt / 1.2, 0, 1) : 0);
      const dense = 0.97 - lift * 0.62;
      ctx.save();
      const fog = ctx.createRadialGradient(s.x, s.y, LT.SEE * 0.55, s.x, s.y, LT.SEE * 1.6);
      fog.addColorStop(0, 'rgba(196,206,212,0)');
      fog.addColorStop(1, `rgba(196,206,212,${dense})`);
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // Rörliga dimslöjor
      ctx.fillStyle = `rgba(230,236,240,${0.08 * (1 - lift)})`;
      for (let i = 0; i < 6; i++) {
        const y = (i * 140 + s.t * 9) % (H + 100) - 50;
        ctx.beginPath();
        ctx.ellipse((i * 97 + s.t * 14) % (W + 200) - 100, y, 160, 26, 0, 0, TAU);
        ctx.fill();
      }
      drawMarks(true);
    }
    if (s.phase === 'memo') {
      const left = Math.ceil(LT.MEMO - s.pt);
      ctx.fillStyle = 'rgba(6,14,22,.7)';
      rrect(ctx, W / 2 - 120, H / 2 - 40, 240, 80, 14);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 30px ${FONT_D}`;
      ctx.fillStyle = '#f5c225';
      ctx.fillText(`MEMORERA · ${left}`, W / 2, H / 2 - 8);
      smallText(ctx, 'Start → 1 → 2 → fyren', W / 2, H / 2 + 22, 'center', 0.9, 12);
    }
    centerMsg(ctx, s, W / 2, 120, 30);
  },
  hud(s) {
    const txt = ['Mot märke 1', 'Mot märke 2', 'Mot fyren', 'Framme'][s.prog];
    return { main: fmtTime((s.run + s.pen) * 1000), sub: s.phase === 'memo' ? 'Memorera farleden' : `${txt}${s.pen ? ` · tillägg +${s.pen} s` : ''}` };
  },
  result(s) {
    if (s.phase === 'done' && s.pt > 1.4) {
      const extra = [s.hits ? plural(s.hits, 'grundstötning', 'grundstötningar') : '', s.horns ? `${s.horns} tut` : ''].filter(Boolean).join(' · ');
      return { score: Math.min(900000, Math.round((s.run + s.pen) * 1000)), title: 'Lotsad i hamn!', detail: `Gångtid ${fmtTime(s.run * 1000)}${extra ? ' · ' + extra + ` (+${s.pen} s)` : ' · utan tillägg'}` };
    }
    if (s.phase === 'timeout' && s.pt > 1.4) {
      return { score: null, void: true, title: 'Tiden är ute', detail: 'Tre minuter i dimman utan att nå fyren. Försöket sparas inte.' };
    }
    return null;
  },
};

Object.assign(GAME_LOGIC, { mas: masattack, svall, lots: lotsen });

if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, { MS, msSpawns, SV, svWakes, svTilt, LT, ltMap, ltSolvable, ltAground, ltHull });
}
