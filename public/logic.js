/* Regatta Arkipelagos – spellogik.
   Rena funktioner utan DOM: varje spel har create/update/draw/hud/result.
   Samma frö (seed) ger samma bana för alla i en omgång. */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
const normA = (a) => mod(a, TAU);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function fmtTime(ms) {
  const tt = Math.max(0, Math.round(ms / 100));
  const m = Math.floor(tt / 600);
  const rem = tt % 600;
  return m + ':' + String(Math.floor(rem / 10)).padStart(2, '0') + ',' + (rem % 10);
}
const fmtNum = (n, d = 1) => n.toFixed(d).replace('.', ',');

const FONT_D = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif';
const FONT_M = '"IBM Plex Mono",ui-monospace,Menlo,monospace';

function say(s, text, color, dur) {
  s.msg = text;
  s.msgC = color;
  s.msgT = dur;
}

function centerMsg(ctx, s, x, y, size = 32) {
  if (!(s.msgT > 0) || !s.msg) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.msgT / 0.25);
  ctx.font = `900 ${size}px ${FONT_D}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(5,12,20,.65)';
  ctx.strokeText(s.msg, x, y);
  ctx.fillStyle = s.msgC;
  ctx.fillText(s.msg, x, y);
  ctx.restore();
}

function smallText(ctx, text, x, y, align = 'center', alpha = 0.75, size = 11) {
  ctx.save();
  ctx.font = `600 ${size}px ${FONT_M}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(234,241,245,${alpha})`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ---------- partiklar ---------- */
function burst(parts, x, y, n, color, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const v = spd * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.6, c: color, r: 1.5 + Math.random() * 2.5 });
  }
}
function stepParts(parts, dt) {
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-2.5 * dt);
    p.vy *= Math.exp(-2.5 * dt);
    p.life -= dt;
  }
  return parts.filter((p) => p.life > 0);
}

/* ---------- båtar ---------- */
function sailHull(ctx) {
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.bezierCurveTo(12, -7.5, -2, -8, -13, -6.5);
  ctx.lineTo(-13, 6.5);
  ctx.bezierCurveTo(-2, 8, 12, 7.5, 18, 0);
  ctx.closePath();
}

function sailShape(ctx, mx, my, len, s, belly) {
  const tx = mx - len * Math.cos(s);
  const ty = -len * Math.sin(s);
  const nx = Math.sin(s), ny = -Math.cos(s); // lä-normal när s > 0
  const cx = (mx + tx) / 2 + nx * belly;
  const cy = (my + ty) / 2 + ny * belly;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  ctx.closePath();
  return { tx, ty };
}

// Segelbåt med fören mot +x. boom > 0 = bommen ut åt babord.
function drawSailboat(ctx, x, y, a, boom, luff, t, accent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.save();
  ctx.translate(2.5, 3.5);
  sailHull(ctx);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fill();
  ctx.restore();
  sailHull(ctx);
  ctx.fillStyle = '#f4f4f0';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = 'rgba(13,20,27,.22)';
  ctx.fillRect(-11, -3.5, 8, 7);

  const side = boom >= 0 ? 1 : -1;
  const flut = luff > 0 ? Math.sin(t * 38) * luff * 3.5 : 0;
  const belly = 5 * (1 - luff * 0.7) * side + flut;
  // fock
  sailShape(ctx, 17, 0, 11, boom * 0.85, belly * 0.6);
  ctx.fillStyle = 'rgba(255,252,244,.9)';
  ctx.fill();
  // stor
  const { tx, ty } = sailShape(ctx, 5, 0, 21, boom, belly);
  ctx.fillStyle = 'rgba(255,252,244,.97)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(13,20,27,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = '#2a2f35';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = '#2a2f35';
  ctx.beginPath();
  ctx.arc(5, 0, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Motorbåt med fören uppåt; (x, y) är båtens mitt. Skrovet går från -22 till 20.
function drawMotorboat(ctx, x, y, rot, accent, sc = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(9, -15, 10.5, 4, 9, 20);
    ctx.lineTo(-9, 20);
    ctx.bezierCurveTo(-10.5, 4, -9, -15, 0, -22);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(2.5, 3.5);
  hull();
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fill();
  ctx.restore();
  hull();
  ctx.fillStyle = '#f4f4f0';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.bezierCurveTo(4, -14, 5, -8, 5, -6);
  ctx.lineTo(-5, -6);
  ctx.bezierCurveTo(-5, -8, -4, -14, 0, -19);
  ctx.fill();
  ctx.fillStyle = '#1c2f40';
  ctx.beginPath();
  ctx.moveTo(-6.5, -2);
  ctx.quadraticCurveTo(0, -6, 6.5, -2);
  ctx.lineTo(6, 1);
  ctx.quadraticCurveTo(0, -2, -6, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(13,20,27,.2)';
  ctx.fillRect(-6.5, 4, 13, 12);
  ctx.fillStyle = '#2a2f35';
  ctx.fillRect(-3, 19, 6, 4);
  ctx.restore();
}

function waterFill(ctx, w, h, top = '#15496a', bottom = '#0e3653') {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function granite(ctx, path) {
  ctx.save();
  path();
  ctx.fillStyle = '#7c6c66';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/* =====================================================================
   KRYSSBANAN – kryssa upp till bojen, runda, lensa hem.
   ===================================================================== */
const KRY = { W: 400, H: 720, LY: 612, LX0: 72, LX1: 328, BX: 200, BY: 118, ZONE: 140, RESET: 185, MAX: 104, TURN: 2.2, WALL: 26, ZOOM: 1.8 };

// Kameran följer båten med inzoomning, men visar aldrig något utanför banan.
function kryCamClamp(x, y) {
  const hw = KRY.W / 2 / KRY.ZOOM, hh = KRY.H / 2 / KRY.ZOOM;
  return [clamp(x, hw, KRY.W - hw), clamp(y, hh, KRY.H - hh)];
}

const kryss = {
  id: 'kryss',
  fit: 'contain',
  W: KRY.W,
  H: KRY.H,
  controls: 'sail',
  create(seed) {
    const r = rng(seed);
    const streaks = [];
    for (let i = 0; i < 150; i++) streaks.push({ x: r() * 460 - 30, y: r() * 780 - 30, l: 6 + r() * 8 });
    const shore = [[], []];
    for (let side = 0; side < 2; side++) for (let y = -30; y <= 760; y += 24) shore[side].push({ y, w: 10 + r() * 10 });
    const [camX, camY] = kryCamClamp(200, 668);
    return {
      t: 0, x: 200, y: 668, a: -Math.PI / 2 - 0.78, speed: 0, phase: 0, raceT: 0, camX, camY,
      ph1: r() * TAU, ph2: r() * TAU, wa: Math.PI / 2,
      prevSide: 0, tackT: 0, lockT: 0, penT: 0, msg: '', msgT: 0, msgC: '#f5c225',
      sweep: 0, prevAng: null, above: false, wake: [], wakeT: 0, perfect: 0, tacks: 0,
      eff: 1, luff: 0, boom: 0.3, irons: false, finalMs: 0, endT: 0, streaks, shore,
    };
  },
  update(s, dt, inp) {
    s.t += dt;
    if (s.phase === 1 || s.phase === 2) s.raceT += dt;
    if (s.phase === 3) s.endT += dt;
    s.msgT -= dt;

    // Vinden vrider sig lite fram och tillbaka – samma mönster för alla i omgången.
    s.wa = Math.PI / 2 + 0.2 * Math.sin(s.t * 0.19 + s.ph1) + 0.07 * Math.sin(s.t * 0.61 + s.ph2);

    const racing = s.phase < 3;
    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (racing) s.a = normA(s.a + steer * KRY.TURN * dt);

    const from = normA(s.wa + Math.PI);
    const rel = angDiff(from, s.a); // + = vind från styrbord
    const th = Math.abs(rel);
    const side = rel >= 0 ? 1 : -1;

    if (racing && s.prevSide !== 0 && side !== s.prevSide && th < Math.PI / 2) {
      s.tackT = 0.8;
      s.tacks++;
      say(s, 'SLAG NU!', '#f5c225', 0.8);
    }
    s.prevSide = side;

    // SLAG räknas bara i fönstret efter vindögat. Ett tryck för tidigt låser knappen
    // en kort stund, så att man inte kan hamra sig till ett perfekt slag.
    s.lockT -= dt;
    if (racing && inp.boostPressed) {
      if (s.tackT > 0 && s.lockT <= 0) {
        s.tackT = 0;
        s.speed = Math.max(s.speed, KRY.MAX * 1.45);
        s.perfect++;
        say(s, 'PERFEKT SLAG!', '#4cc38a', 1.2);
      } else if (s.tackT <= 0) {
        s.lockT = 0.5;
        say(s, 'FÖR TIDIGT', '#ff6b6b', 0.5);
      }
    }
    if (s.tackT > 0) {
      s.tackT -= dt;
      if (s.tackT <= 0) {
        s.tackT = 0;
        s.speed *= 0.5;
        s.penT = 0.6;
        say(s, 'SLAPPT SLAG', '#ff6b6b', 1);
      }
    }
    // Polardiagram: ingen fart i vindögat, bäst på slör.
    let pol;
    if (th < 0.52) pol = 0.06;
    else if (th < 0.9) pol = lerp(0.55, 0.95, (th - 0.52) / 0.38);
    else if (th < 2.3) pol = 1;
    else pol = lerp(1, 0.66, (th - 2.3) / (Math.PI - 2.3));

    // Skotet: hur långt ut bommen får gå. Rätt läge följer vinkeln mot vinden.
    const ideal = clamp((th - 0.35) * 0.5, 0.08, 1.45);
    const mag = clamp(inp.skot, 0, 1) * 1.5;
    const err = mag - ideal;
    s.eff = clamp(1 - Math.abs(err) / 0.55, 0.12, 1);
    s.irons = th < 0.52;
    s.luff = s.irons ? 1 : clamp(err / 0.5, 0, 1);
    s.boom = side * Math.min(mag, Math.max(0.05, th - 0.1));

    let target = racing ? KRY.MAX * pol * s.eff : 0;
    if (s.penT > 0) {
      s.penT -= dt;
      target *= 0.3;
    }
    const k = s.speed < target ? 0.9 : racing ? 0.55 : 1.4;
    s.speed += (target - s.speed) * (1 - Math.exp(-k * dt));

    if (racing && s.irons && s.msgT <= 0) say(s, 'I VINDÖGAT! FALL AV', '#ff6b6b', 0.6);

    let nx = s.x + Math.cos(s.a) * s.speed * dt;
    let ny = s.y + Math.sin(s.a) * s.speed * dt;
    if (nx < KRY.WALL || nx > KRY.W - KRY.WALL) {
      nx = clamp(nx, KRY.WALL, KRY.W - KRY.WALL);
      s.speed *= Math.exp(-6 * dt);
      if (s.msgT <= 0) say(s, 'GRUND!', '#ff6b6b', 0.5);
    }
    if (ny < 20 || ny > KRY.H - 20) {
      ny = clamp(ny, 20, KRY.H - 20);
      s.speed *= Math.exp(-6 * dt);
    }

    // Bojen är ett hinder.
    let bdx = nx - KRY.BX, bdy = ny - KRY.BY, bd = Math.hypot(bdx, bdy);
    if (bd < 13 && bd > 0.001) {
      nx = KRY.BX + (bdx / bd) * 13;
      ny = KRY.BY + (bdy / bd) * 13;
      s.speed *= Math.exp(-8 * dt);
      bdx = nx - KRY.BX; bdy = ny - KRY.BY; bd = 13;
    }

    const onLine = (x) => x >= KRY.LX0 && x <= KRY.LX1;
    if (s.phase === 0 && s.y >= KRY.LY && ny < KRY.LY && onLine(nx)) {
      s.phase = 1;
      s.raceT = 0;
      say(s, 'START!', '#f5c225', 1);
    } else if (s.phase === 1) {
      // Rundning = båten har svept minst 234° runt bojen och varit ovanför den.
      if (bd < KRY.ZONE) {
        const ang = Math.atan2(bdy, bdx);
        if (s.prevAng !== null) s.sweep += angDiff(ang, s.prevAng);
        s.prevAng = ang;
        if (ny < KRY.BY) s.above = true;
        if (Math.abs(s.sweep) > Math.PI * 1.3 && s.above) {
          s.phase = 2;
          say(s, 'RUNDAD! MOT MÅL', '#4cc38a', 1.6);
        }
      } else {
        s.prevAng = null;
        if (bd > KRY.RESET) {
          s.sweep = 0;
          s.above = false;
        }
      }
    } else if (s.phase === 2 && s.y <= KRY.LY && ny > KRY.LY && onLine(nx)) {
      s.phase = 3;
      s.finalMs = Math.round(s.raceT * 1000);
      say(s, 'I MÅL!', '#4cc38a', 3);
    }

    s.wakeT += dt;
    if (s.wakeT > 0.06) {
      s.wakeT = 0;
      s.wake.push({ x: s.x, y: s.y });
      if (s.wake.length > 28) s.wake.shift();
    }
    s.x = nx;
    s.y = ny;

    // Kameran tittar lite framför båten och följer mjukt (tidsbaserat, oberoende av bildfrekvens).
    const [tx, ty] = kryCamClamp(s.x + Math.cos(s.a) * 30, s.y + Math.sin(s.a) * 30);
    const kc = 1 - Math.exp(-3.5 * dt);
    s.camX += (tx - s.camX) * kc;
    s.camY += (ty - s.camY) * kc;
  },
  draw(ctx, s) {
    const { W, H, ZOOM } = KRY;
    ctx.fillStyle = '#0f3a58';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-s.camX, -s.camY);
    waterFill(ctx, W, H);

    const wx = Math.cos(s.wa), wy = Math.sin(s.wa);
    ctx.strokeStyle = 'rgba(220,240,255,.17)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    const off = s.t * 48;
    for (const k of s.streaks) {
      const x = mod(k.x + wx * off + 30, 460) - 30;
      const y = mod(k.y + wy * off + 30, 780) - 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + wx * k.l, y + wy * k.l);
      ctx.stroke();
    }

    for (let side = 0; side < 2; side++) {
      granite(ctx, () => {
        const X = (w) => (side === 0 ? w : W - w);
        ctx.beginPath();
        ctx.moveTo(side === 0 ? -6 : W + 6, -40);
        for (const p of s.shore[side]) ctx.lineTo(X(p.w), p.y);
        ctx.lineTo(side === 0 ? -6 : W + 6, H + 40);
        ctx.closePath();
      });
    }

    // Start- och mållinje mellan startbåten och linjebojen.
    const target = s.phase === 0 || s.phase === 2;
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = target ? 'rgba(245,194,37,.9)' : 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(KRY.LX0, KRY.LY);
    ctx.lineTo(KRY.LX1, KRY.LY);
    ctx.stroke();
    ctx.restore();
    drawMotorboat(ctx, KRY.LX0 - 12, KRY.LY, -Math.PI / 2, '#2a64c4', 0.9);
    // P-flaggan på startbåten
    ctx.fillStyle = '#2a64c4';
    ctx.fillRect(KRY.LX0 - 26, KRY.LY - 26, 14, 10);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(KRY.LX0 - 21.5, KRY.LY - 23, 5, 4);
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(KRY.LX1 + 4, KRY.LY, 6, 0, TAU);
    ctx.fill();
    smallText(ctx, 'START / MÅL', W / 2, KRY.LY + 18, 'center', 0.7, 11);

    // Bojen
    if (s.phase === 1) {
      ctx.save();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(KRY.BX, KRY.BY, KRY.ZONE, 0, TAU);
      ctx.stroke();
      ctx.restore();
      const pr = (s.t * 18) % 18;
      ctx.strokeStyle = `rgba(255,122,26,${0.6 - pr / 30})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(KRY.BX, KRY.BY, 12 + pr, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.arc(KRY.BX + 2, KRY.BY + 3, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(KRY.BX, KRY.BY, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f4f4f0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(KRY.BX, KRY.BY, 5, 0, TAU);
    ctx.stroke();

    // Kölvatten
    for (let i = 1; i < s.wake.length; i++) {
      const a = s.wake[i - 1], b = s.wake[i];
      ctx.strokeStyle = `rgba(255,255,255,${(i / s.wake.length) * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    drawSailboat(ctx, s.x, s.y, s.a, s.boom, s.luff, s.t, '#f5c225');
    ctx.restore();

    // Pil i kanten mot nästa mål när det ligger utanför bild.
    const goal = s.phase === 1 ? { x: KRY.BX, y: KRY.BY, lab: 'BOJ' } : s.phase === 3 ? null : { x: clamp(s.x, KRY.LX0, KRY.LX1), y: KRY.LY, lab: s.phase === 0 ? 'START' : 'MÅL' };
    if (goal) {
      const gx = (goal.x - s.camX) * ZOOM + W / 2, gy = (goal.y - s.camY) * ZOOM + H / 2;
      const m = 34;
      if (gx < m || gx > W - m || gy < m || gy > H - m) {
        const dx = gx - W / 2, dy = gy - H / 2;
        const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
        const ax = W / 2 + dx * k, ay = H / 2 + dy * k;
        const dist = Math.hypot(goal.x - s.x, goal.y - s.y) / 4; // 4 enheter per meter
        ctx.save();
        ctx.translate(ax, ay);
        ctx.fillStyle = 'rgba(10,24,36,.75)';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, TAU);
        ctx.fill();
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = s.phase === 1 ? '#ff7a1a' : '#f5c225';
        ctx.beginPath();
        ctx.moveTo(33, 0);
        ctx.lineTo(23, -8);
        ctx.lineTo(23, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        smallText(ctx, goal.lab, ax, ay - 5, 'center', 0.95, 9);
        smallText(ctx, `${Math.round(dist)} m`, ax, ay + 7, 'center', 0.8, 9);
      }
    }

    // Vindros: pilen pekar dit vinden blåser.
    ctx.save();
    ctx.translate(352, 58);
    ctx.fillStyle = 'rgba(10,24,36,.6)';
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(s.wa);
    ctx.fillStyle = '#7fe0ff';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    smallText(ctx, 'VIND', 352, 92, 'center', 0.7, 10);

    smallText(ctx, fmtNum(s.speed / 13) + ' kn', 34, H - 22, 'left', 0.8, 12);

    if (s.phase === 0 && s.t < 7) {
      smallText(ctx, 'Kryssa uppåt och korsa linjen', W / 2, 140, 'center', 0.9, 13);
    }

    centerMsg(ctx, s, W / 2, 380, 32);
    if (s.tackT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(W / 2 - 50, 404, 100, 8);
      ctx.fillStyle = '#f5c225';
      ctx.fillRect(W / 2 - 50, 404, 100 * (s.tackT / 0.8), 8);
    }
  },
  hud(s) {
    const main = s.phase === 0 ? '0:00,0' : fmtTime(s.phase === 3 ? s.finalMs : s.raceT * 1000);
    const sub = ['Korsa startlinjen uppåt', 'Runda den orange bojen', 'Mot mål: korsa linjen', 'I mål!'][s.phase];
    return { main, sub };
  },
  result(s) {
    if (s.phase === 3 && s.endT > 1.4) {
      return { score: s.finalMs, title: 'I mål!', detail: `${s.perfect} perfekta slag av ${s.tacks}` };
    }
    return null;
  },
};

/* =====================================================================
   SKÄRSLALOM – kör mellan skären, farten ökar hela tiden.
   ===================================================================== */
const SL = { W: 400, FROM_BOTTOM: 118 };
const shoreW = (y, side) => 16 + 7 * Math.sin(y * 0.011 + side * 2.1) + 4 * Math.sin(y * 0.037 + side * 0.7) + 3 * Math.sin(y * 0.093 + side * 4);
const slSpeed = (d) => Math.min(430, 150 + d * 0.022);

function slGen(s, upto) {
  const r = s.r;
  while (s.nextY < upto) {
    const d = s.nextY;
    const gw = Math.max(104, 200 - d * 0.0075);
    const rowGap = Math.max(118, 210 - d * 0.004);
    const maxShift = Math.min(130, (0.55 * rowGap * 260) / slSpeed(d));
    s.gc = clamp(s.gc + (r() * 2 - 1) * maxShift, 48 + gw / 2, 352 - gw / 2);
    const dens = Math.min(0.85, 0.5 + d / 40000);
    for (const [a, b] of [[44, s.gc - gw / 2], [s.gc + gw / 2, 356]]) {
      const len = b - a;
      const n = Math.max(0, Math.floor(len / 56));
      for (let i = 0; i < n; i++) {
        const roll = r();
        const rad = 11 + r() * 15;
        const pos = r();
        if (roll > dens || len < 2 * rad) continue;
        const verts = [];
        for (let j = 0; j < 9; j++) verts.push(0.78 + r() * 0.34);
        s.rocks.push({ x: a + rad + pos * (len - 2 * rad), y: d + (r() * 2 - 1) * 14, rad, verts, rot: r() * TAU });
      }
    }
    if (s.rowN % 3 === 2) s.buoys.push({ x: s.gc, y: d, got: false });
    s.rowN++;
    s.nextY += rowGap;
  }
}

const slalom = {
  id: 'slalom',
  fit: 'width',
  W: SL.W,
  H: 640,
  controls: 'lr',
  create(seed) {
    const s = { r: rng(seed), t: 0, d: 0, x: 200, vx: 0, rocks: [], buoys: [], nextY: 430, gc: 200, rowN: 0, alive: true, bonus: 0, got: 0, endT: 0, wake: [], wakeT: 0, parts: [], msg: 'KÖR!', msgC: '#f5c225', msgT: 1.2, speed: 150 };
    slGen(s, 1400);
    return s;
  },
  score(s) {
    return Math.floor(s.d / 10) + s.bonus;
  },
  crash(s, text) {
    s.alive = false;
    say(s, text, '#ff6b6b', 2.2);
    burst(s.parts, s.x, s.d, 34, '#f4f4f0', 160);
    burst(s.parts, s.x, s.d, 16, '#7fe0ff', 120);
    s.vibrate = true;
  },
  update(s, dt, inp, v) {
    s.t += dt;
    s.msgT -= dt;
    s.parts = stepParts(s.parts, dt);
    if (!s.alive) {
      s.endT += dt;
      return;
    }
    s.speed = slSpeed(s.d);
    s.d += s.speed * dt;
    slGen(s, s.d + (v ? v.H : 900) + 220);

    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    s.vx += steer * 1500 * dt;
    s.vx *= Math.exp(-4.5 * dt);
    s.vx = clamp(s.vx, -290, 290);
    s.x += s.vx * dt;

    s.rocks = s.rocks.filter((k) => k.y > s.d - 300);
    s.buoys = s.buoys.filter((b) => b.y > s.d - 300);

    for (const k of s.rocks) {
      if (Math.abs(k.y - s.d) > 60) continue;
      if (Math.hypot(k.x - s.x, k.y - s.d) < k.rad * 0.82 + 8) {
        slalom.crash(s, 'GRUNDSTÖTNING!');
        return;
      }
    }
    if (s.x - 8 < shoreW(s.d, 0) || s.x + 8 > SL.W - shoreW(s.d, 1)) {
      slalom.crash(s, 'PÅ LAND!');
      return;
    }
    for (const b of s.buoys) {
      if (!b.got && Math.hypot(b.x - s.x, b.y - s.d) < 21) {
        b.got = true;
        s.bonus += 25;
        s.got++;
        burst(s.parts, b.x, b.y, 14, '#f5c225', 110);
        say(s, '+25', '#f5c225', 0.6);
      }
    }
    s.wakeT += dt;
    if (s.wakeT > 0.03) {
      s.wakeT = 0;
      s.wake.push({ x: s.x, y: s.d });
      if (s.wake.length > 30) s.wake.shift();
    }
  },
  draw(ctx, s, v) {
    const W = SL.W, H = v.H, by = H - SL.FROM_BOTTOM;
    const sy = (wy) => by + s.d - wy;
    waterFill(ctx, W, H, '#0f3e5d', '#14496a');

    // Strömrandiga vågor, förankrade i världen så att de glider förbi.
    ctx.strokeStyle = 'rgba(220,240,255,.13)';
    ctx.lineWidth = 1.5;
    const step = 64;
    for (let wy = Math.floor((s.d - 200) / step) * step; wy < s.d + H + step; wy += step) {
      const y = sy(wy);
      const h = hashStr(String(wy));
      for (let i = 0; i < 4; i++) {
        const x = 50 + ((h >>> (i * 7)) % 300);
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x, y - 4);
        ctx.lineTo(x + 8, y);
        ctx.stroke();
      }
    }

    for (let side = 0; side < 2; side++) {
      granite(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(side === 0 ? -6 : W + 6, -10);
        for (let y = -10; y <= H + 10; y += 10) {
          const w = shoreW(s.d + by - y, side);
          ctx.lineTo(side === 0 ? w : W - w, y);
        }
        ctx.lineTo(side === 0 ? -6 : W + 6, H + 10);
        ctx.closePath();
      });
    }

    for (const k of s.rocks) {
      const y = sy(k.y);
      if (y < -50 || y > H + 50) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(k.x, y, k.rad + 4 + Math.sin(s.t * 3 + k.x) * 1.2, 0, TAU);
      ctx.stroke();
      const poly = (scale, ox, oy) => {
        ctx.beginPath();
        k.verts.forEach((m, j) => {
          const a = k.rot + (j / k.verts.length) * TAU;
          const px = k.x + ox + Math.cos(a) * k.rad * m * scale;
          const py = y + oy + Math.sin(a) * k.rad * m * scale;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      };
      poly(1, 0, 0);
      ctx.fillStyle = '#5c4f4b';
      ctx.fill();
      poly(0.72, -2, -2.5);
      ctx.fillStyle = '#8f7f78';
      ctx.fill();
      poly(0.34, -3.5, -4);
      ctx.fillStyle = '#ad9c94';
      ctx.fill();
    }

    for (const b of s.buoys) {
      if (b.got) continue;
      const y = sy(b.y);
      if (y < -30 || y > H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.arc(b.x + 2, y + 3, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f5c225';
      ctx.beginPath();
      ctx.arc(b.x, y, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d7323b';
      ctx.beginPath();
      ctx.arc(b.x, y, 3.5, 0, TAU);
      ctx.fill();
    }

    for (let i = 1; i < s.wake.length; i++) {
      const p = s.wake[i];
      const y = sy(p.y) + 20;
      const spread = (s.d - p.y) * 0.18;
      ctx.strokeStyle = `rgba(255,255,255,${(i / s.wake.length) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 6 - spread, y);
      ctx.lineTo(p.x - 4 - spread * 0.8, y - 3);
      ctx.moveTo(p.x + 6 + spread, y);
      ctx.lineTo(p.x + 4 + spread * 0.8, y - 3);
      ctx.stroke();
    }

    if (s.alive || s.endT < 0.25) drawMotorboat(ctx, s.x, by, (s.vx / 290) * 0.35, '#d7323b');

    for (const p of s.parts) {
      ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, sy(p.y), p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    centerMsg(ctx, s, W / 2, H * 0.4, 34);
  },
  hud(s) {
    return { main: `${slalom.score(s)} p`, sub: `${Math.floor(s.d / 10)} m · ${fmtNum(s.speed / 14)} kn` };
  },
  result(s) {
    if (!s.alive && s.endT > 1.2) {
      return { score: slalom.score(s), title: s.msg === 'PÅ LAND!' ? 'På land!' : 'Grundstötning!', detail: `${Math.floor(s.d / 10)} meter och ${s.got} ${s.got === 1 ? 'boj' : 'bojar'}` };
    }
    return null;
  },
};

/* =====================================================================
   FÖRTÖJ! – fem angöringar, backa och stanna nära bryggan.
   ===================================================================== */
const FT = { W: 400, H: 720, EDGE: 96, BOOM_L: 132, BOOM_R: 268, BOOM_END: 236, LEN: 74, SC: 74 / 42, CRASH: 36, BRAKE: 270, ROUNDS: 5 };

const fortoj = {
  id: 'fortoj',
  fit: 'contain',
  W: FT.W,
  H: FT.H,
  controls: 'hold',
  create(seed) {
    const r = rng(seed);
    const rounds = [];
    for (let i = 0; i < FT.ROUNDS; i++) rounds.push({ v0: 150 + r() * 110, y0: 520 + r() * 100, cur: (r() * 2 - 1) * 28 });
    const s = { t: 0, rounds, i: 0, phase: 'ready', readyT: 0, bowY: rounds[0].y0, v: rounds[0].v0, roundT: 0, pts: [], gaps: [], lab: '', resT: 0, total: 0, bubbles: [], doneT: 0, msg: '', msgT: 0, msgC: '#f5c225' };
    return s;
  },
  end(s, p, gap, lab) {
    s.phase = 'result';
    s.resT = 0;
    s.pts.push(p);
    s.gaps.push(gap);
    s.total += p;
    s.lab = lab;
    if (lab === 'KRASCH!') s.vibrate = true;
    s.v = 0;
  },
  update(s, dt, inp) {
    s.t += dt;
    for (const b of s.bubbles) {
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.life -= dt;
    }
    s.bubbles = s.bubbles.filter((b) => b.life > 0);
    const R = s.rounds[s.i];
    if (s.phase === 'ready') {
      s.readyT += dt;
      if (s.readyT > 1.1) {
        s.phase = 'run';
        s.roundT = 0;
      }
    } else if (s.phase === 'run') {
      s.roundT += dt;
      s.v += (R.cur - (inp.hold ? FT.BRAKE : 0)) * dt;
      s.v *= Math.exp(-0.12 * dt);
      s.bowY -= s.v * dt;
      if (inp.hold && Math.random() < dt * 45) {
        s.bubbles.push({ x: 200 + (Math.random() * 2 - 1) * 10, y: s.bowY + FT.LEN + 4, vx: (Math.random() * 2 - 1) * 30, vy: -20 - Math.random() * 40, life: 0.6 + Math.random() * 0.4, r: 2 + Math.random() * 3 });
      }
      if (s.bowY <= FT.EDGE) {
        s.bowY = FT.EDGE;
        if (s.v > FT.CRASH) fortoj.end(s, 0, 0, 'KRASCH!');
        else fortoj.end(s, 100, 0, 'PERFEKT ANGÖRING');
      } else if (s.v <= 0 && s.roundT > 0.3) {
        const gap = s.bowY - FT.EDGE;
        const p = Math.max(0, Math.round(100 - gap));
        fortoj.end(s, p, gap, p >= 90 ? 'SNYGGT!' : p >= 60 ? 'GODKÄNT' : p > 0 ? 'LÅNGT KVAR' : 'FÖR TIDIGT');
      }
    } else if (s.phase === 'result') {
      s.resT += dt;
      if (s.resT > 1.8) {
        s.i++;
        if (s.i >= FT.ROUNDS) {
          s.phase = 'done';
        } else {
          const N = s.rounds[s.i];
          s.phase = 'ready';
          s.readyT = 0;
          s.bowY = N.y0;
          s.v = N.v0;
        }
      }
    } else {
      s.doneT += dt;
    }
  },
  draw(ctx, s) {
    const { W, H, EDGE } = FT;
    waterFill(ctx, W, H, '#103c5a', '#15496a');
    ctx.strokeStyle = 'rgba(220,240,255,.1)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      const x = (i * 97) % 380 + 10;
      const y = EDGE + 30 + ((i * 151 + s.t * 6) % (H - EDGE - 30));
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 3, 0, 0, TAU);
      ctx.stroke();
    }

    // Bryggan
    ctx.fillStyle = '#7a5a3e';
    ctx.fillRect(0, 0, W, EDGE);
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, EDGE - 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c4330';
    ctx.fillRect(0, EDGE - 8, W, 8);
    for (const bx of [FT.BOOM_L - 12, FT.BOOM_R]) {
      ctx.fillStyle = '#86664a';
      ctx.fillRect(bx, EDGE, 12, FT.BOOM_END - EDGE);
      ctx.fillStyle = '#4a3626';
      ctx.beginPath();
      ctx.arc(bx + 6, FT.BOOM_END, 7, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#2a2f35';
    for (const cx of [176, 224]) ctx.fillRect(cx - 7, EDGE - 16, 14, 5);
    // Livboj på bryggan
    ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? '#f4f4f0' : '#ff7a1a';
      ctx.beginPath();
      ctx.arc(336, 40, 13, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
      ctx.stroke();
    }
    // Grannbåtar
    drawMotorboat(ctx, 66, EDGE + 6 + 22 * 1.5, 0, '#2a64c4', 1.5);
    drawMotorboat(ctx, 334, EDGE + 6 + 22 * 1.45, 0, '#4cc38a', 1.45);

    // Ström/vind-indikator
    const R = s.rounds[Math.min(s.i, FT.ROUNDS - 1)];
    const lab = R.cur > 10 ? 'MEDVIND' : R.cur < -10 ? 'MOTVIND' : 'STILLA';
    ctx.save();
    ctx.translate(58, 300);
    ctx.fillStyle = 'rgba(10,24,36,.6)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    if (lab !== 'STILLA') {
      ctx.rotate(R.cur > 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = '#7fe0ff';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    smallText(ctx, lab, 58, 336, 'center', 0.75, 10);

    for (const b of s.bubbles) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(b.life, 0, 0.7)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    if (s.phase !== 'done') drawMotorboat(ctx, 200, s.bowY + 22 * FT.SC, 0, '#f5c225', FT.SC);

    if (s.phase === 'ready') {
      smallText(ctx, `ANGÖRING ${s.i + 1} AV ${FT.ROUNDS}`, W / 2, 400, 'center', 0.95, 15);
    }
    if (s.phase === 'result') {
      const p = s.pts[s.pts.length - 1];
      const gap = s.gaps[s.gaps.length - 1];
      ctx.fillStyle = 'rgba(6,14,22,.78)';
      ctx.fillRect(0, 330, W, 112);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 34px ${FONT_D}`;
      ctx.fillStyle = s.lab === 'KRASCH!' ? '#ff6b6b' : p >= 90 ? '#4cc38a' : '#f5c225';
      ctx.fillText(s.lab, W / 2, 362);
      ctx.font = `600 16px ${FONT_M}`;
      ctx.fillStyle = '#eaf1f5';
      const gapTxt = s.lab === 'KRASCH!' ? 'för hög fart in' : `${fmtNum(gap / 10)} m kvar`;
      ctx.fillText(`${gapTxt} · ${p} p`, W / 2, 404);
      ctx.restore();
    }
  },
  hud(s) {
    const kn = Math.max(0, s.v) / 40;
    return { main: `${s.total} p`, sub: `Angöring ${Math.min(s.i + 1, FT.ROUNDS)} av ${FT.ROUNDS} · ${fmtNum(kn)} kn` };
  },
  result(s) {
    if (s.phase === 'done' && s.doneT > 0.4) {
      return { score: s.total, title: 'Förtöjd!', detail: 'Rundor: ' + s.pts.join(' · ') };
    }
    return null;
  },
};

/* =====================================================================
   FÖRTÖJA 2 – manövrera in i båtplatser i fem hamnscener. Snabbast tid vinner.
   Fysiken räknar i meter och sekunder; allt ritas i skala K enheter per meter.
   Kollisioner: exakt överlapp mellan konvexa polygoner (SAT). Samma polygoner
   som testas är de som ritas, så det du ser är det som räknas.
   ===================================================================== */
const PK = { W: 36, H: 64, K: 10, L: 8, B: 3, DNF: 9999000, HOLD: 0.6 };
const PK_TYPES = ['langsides', 'forut', 'backa', 'ficka', 'inlopp'];
const PK_INFO = {
  langsides: { name: 'Långsides', hint: 'Lägg till långsides mot bryggan, i luckan mellan båtarna.', wind: [3, 5], label: 'LÅNGSIDES' },
  forut: { name: 'Förut in', hint: 'Kör in förut i den markerade boxen mellan bommarna.', wind: [4, 7], label: 'FÖRUT IN' },
  backa: { name: 'Backa in', hint: 'Passera boxen, vänd och backa in med aktern först.', wind: [5, 8], label: 'AKTERN IN' },
  ficka: { name: 'Fickparkering', hint: 'Trång lucka. Lägg till långsides utan att röra grannarna.', wind: [6, 9], label: 'LÅNGSIDES' },
  inlopp: { name: 'Hamninloppet', hint: 'Genom öppningen i vågbrytaren, sedan förut in i boxen.', wind: [7, 10], label: 'FÖRUT IN' },
};
const PK_COLORS = ['#2a64c4', '#4cc38a', '#d7323b', '#f4f4f0', '#8a6fd6', '#e0873a', '#1f8f8a'];
const PK_COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];

// Skrovet sett ovanifrån, fören mot +x. Konvex femhörning.
function hullPts(L, B) {
  const sh = Math.min(L * 0.28, 2.4);
  return [[L / 2, 0], [L / 2 - sh, B / 2], [-L / 2, B / 2], [-L / 2, -B / 2], [L / 2 - sh, -B / 2]];
}
const PK_HULL = hullPts(PK.L, PK.B);

function placePts(pts, x, y, h) {
  const c = Math.cos(h), s = Math.sin(h);
  return pts.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function polyBox(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// Separating Axis Theorem: två konvexa polygoner överlappar om och endast om
// ingen kantnormal skiljer dem åt. Ingen marginal läggs till åt något håll.
function polysOverlap(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) {
        const d = v[0] * nx + v[1] * ny;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      for (const v of B) {
        const d = v[0] * nx + v[1] * ny;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

function pkBuild(type, seed, index) {
  const r = rng(seed);
  const W = PK.W, H = PK.H;
  const obs = [];
  const addRect = (x0, y0, x1, y1, kind) => obs.push({ kind, poly: rectPts(x0, y0, x1, y1) });
  const addBoat = (x, y, h, L, B) => obs.push({ kind: 'boat', x, y, h, L, B, color: PK_COLORS[Math.floor(r() * PK_COLORS.length)], poly: placePts(hullPts(L, B), x, y, h) });
  const UP = -Math.PI / 2, DOWN = Math.PI / 2;
  let target, start, head;

  addRect(0, 0, 0.8, H, 'quay');
  addRect(W - 0.8, 0, W, H, 'quay');

  if (type === 'langsides' || type === 'ficka') {
    const tight = type === 'ficka';
    const face = 29.6;
    addRect(0.8, 0, W - 0.8, 3, 'quay');
    addRect(face, 5, W - 0.8, 54, 'dock');
    const gapLen = tight ? 11.4 + r() * 0.8 : 19 + r() * 3;
    const gy = tight ? 18 + r() * 10 : 14 + r() * 6;
    const bx = face - 0.25 - 1.6;
    const chain = (yStart, dir, count) => {
      let y = yStart;
      for (let i = 0; i < count; i++) {
        const room = dir < 0 ? y - 5.4 : 53.6 - y;
        const L = Math.min(7.5 + r() * 2.5, room);
        const flip = r() < 0.7;
        const gapNext = 0.9 + r() * 1.2;
        if (L < 6) break;
        addBoat(bx, y + (dir * L) / 2, flip ? UP : DOWN, L, 3.2);
        y += dir * (L + gapNext);
      }
    };
    chain(gy - 0.6, -1, tight ? 3 : 1);
    chain(gy + gapLen + 0.6, 1, tight ? 3 : 1);
    target = { x0: face - 0.1 - 4.3, x1: face - 0.1, y0: gy + 0.1, y1: gy + gapLen - 0.1 };
    head = 'vert';
    addRect(0.8, 10, 4.2, 50, 'dock');
    for (let y2 = 12; y2 < 48;) {
      const L = 7.5 + r() * 2;
      const occupied = r() < 0.75;
      const flip = r() < 0.5;
      if (y2 + L > 48) break;
      if (occupied) addBoat(4.2 + 0.25 + 1.6, y2 + L / 2, flip ? UP : DOWN, L, 3.2);
      y2 += L + 1 + r() * 2;
    }
    start = { x: 13 + r() * 5, y: 58, h: UP };
  } else {
    addRect(0.8, 0, W - 0.8, 6, 'quay');
    const boomLen = 9.4;
    const booms = [];
    for (let k = 0; k <= 6; k++) booms.push(1.6 + k * 4.8);
    for (const b of booms) addRect(b, 6, b + 0.4, 6 + boomLen, 'boom');
    const slotC = (k) => booms[k] + 0.4 + 2.2;
    let kt;
    let ox = 0;
    if (type === 'inlopp') {
      ox = 9 + r() * 18;
      kt = ox < 18 ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
    } else {
      kt = 1 + Math.floor(r() * 4);
    }
    for (let k = 0; k < 6; k++) {
      const occupied = r() < 0.82;
      const L = 7.2 + r() * 2;
      const bowIn = r() < 0.6;
      const jit = (r() * 2 - 1) * 0.25;
      if (k === kt || !occupied) continue;
      addBoat(slotC(k) + jit, 6.35 + L / 2, bowIn ? UP : DOWN, L, 3.0);
    }
    const tx = slotC(kt);
    target = { x0: tx - 2.15, x1: tx + 2.15, y0: 6.1, y1: 6.1 + PK.L + 1.3 };
    head = type === 'backa' ? 'down' : 'up';
    if (type === 'inlopp') {
      addRect(0.8, 31, ox - 4, 34, 'quay');
      addRect(ox + 4, 31, W - 0.8, 34, 'quay');
      start = { x: ox + (r() * 2 - 1) * 3, y: 58, h: UP };
    } else {
      const left = r() < 0.5;
      addBoat(left ? 5.5 + r() * 2.5 : 30.5 - r() * 2.5, 34 + r() * 8, r() * TAU, 8.5, 3.0);
      const side = r() < 0.5 ? -1 : 1;
      start = { x: clamp(tx + side * (5 + r() * 7), 10, 26), y: 58, h: UP };
    }
  }

  const wind = { ws: PK_INFO[type].wind[0] + r() * (PK_INFO[type].wind[1] - PK_INFO[type].wind[0]), from: r() * TAU, ph: r() * TAU, ph2: r() * TAU };

  if (r() < 0.5) {
    // Spegelvänd hela scenen så att bryggan ibland ligger på andra sidan.
    for (const o of obs) {
      o.poly = o.poly.map(([x, y]) => [W - x, y]);
      if (o.kind === 'boat') {
        o.x = W - o.x;
        o.h = normA(Math.PI - o.h);
      }
    }
    target = { x0: W - target.x1, x1: W - target.x0, y0: target.y0, y1: target.y1 };
    start = { x: W - start.x, y: start.y, h: normA(Math.PI - start.h) };
  }
  for (const o of obs) o.box = polyBox(o.poly);
  return { type, index, ...PK_INFO[type], obs, target, start, head, wind };
}

function pkWind(S, t) {
  const w = S.wind;
  const from = w.from + 0.12 * Math.sin(t * 0.31 + w.ph2);
  const ws = w.ws * (1 + 0.2 * Math.sin(t * 0.63 + w.ph) + 0.08 * Math.sin(t * 1.9 + w.ph2));
  const to = from + Math.PI;
  return { ws, from, dx: Math.cos(to), dy: Math.sin(to) };
}
function pkCompass(from) {
  // Uppåt på skärmen är norr.
  const bearing = normA(from + Math.PI / 2);
  return PK_COMPASS[Math.round(bearing / (Math.PI / 4)) % 8];
}

// Båtmodell i båtens egna axlar: u = fart framåt, v = fart i sidled, r = girhastighet.
// Dämpning integreras exakt (exp), så resultatet beror inte på stegets storlek.
function pkPhysics(b, rud, thr, w, dt) {
  const c = Math.cos(b.h), sn = Math.sin(b.h);
  const aw = 0.0075 * w.ws * w.ws;
  const wx = w.dx * aw, wy = w.dy * aw;
  const aSurgeW = (wx * c + wy * sn) * 0.35;
  const aSwayW = -wx * sn + wy * c;
  const thrust = thr >= 0 ? thr * 1.15 : thr * 0.75;

  b.u += (thrust + aSurgeW - 0.09 * b.u * Math.abs(b.u)) * dt;
  b.u *= Math.exp(-0.28 * dt);

  const kv = 1.5;
  const ev = Math.exp(-kv * dt);
  b.v = b.v * ev + (aSwayW / kv) * (1 - ev);

  const flow = b.u + 0.9 * Math.max(thr, 0);
  const windTurn = (0.0022 * w.ws * w.ws * Math.sin(angDiff(Math.atan2(w.dy, w.dx), b.h))) / (1 + 1.5 * Math.abs(b.u));
  const walk = thr < 0 ? 0.07 * thr : 0;
  const er = Math.exp(-1.9 * dt);
  const torque = rud * 0.26 * flow + walk + windTurn;
  b.r = b.r * er + (torque / 1.9) * (1 - er);
  b.h = normA(b.h + b.r * dt);
  b.x += (b.u * c - b.v * sn) * dt;
  b.y += (b.u * sn + b.v * c) * dt;
}

function pkInside(P, t) {
  for (const [x, y] of P) if (x <= t.x0 || x >= t.x1 || y <= t.y0 || y >= t.y1) return false;
  return true;
}
function pkAligned(h, head) {
  const tol = (10 * Math.PI) / 180;
  const up = Math.abs(angDiff(h, -Math.PI / 2)) < tol;
  const down = Math.abs(angDiff(h, Math.PI / 2)) < tol;
  return head === 'up' ? up : head === 'down' ? down : up || down;
}

function pkFillPoly(ctx, P, fill, stroke, lw) {
  ctx.beginPath();
  P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    // Kantlinjen ritas helt innanför polygonen så att formen inte ser större ut än den är.
    ctx.save();
    ctx.clip();
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }
}

function pkDrawBoat(ctx, x, y, h, L, B, hull, edge, accent) {
  pkFillPoly(ctx, placePts(hullPts(L, B), x, y, h), hull, edge, 0.09);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(h);
  const sh = Math.min(L * 0.28, 2.4);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(L / 2 - 0.35, 0);
    ctx.lineTo(L / 2 - sh + 0.2, B / 2 - 0.45);
    ctx.lineTo(L / 2 - sh - 0.3, B / 2 - 0.45);
    ctx.lineTo(L / 2 - sh - 0.3, -B / 2 + 0.45);
    ctx.lineTo(L / 2 - sh + 0.2, -B / 2 + 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(13,20,27,.24)';
  ctx.fillRect(-L / 2 + 0.45, -B / 2 + 0.45, L * 0.38, B - 0.9);
  ctx.fillStyle = '#1c2f40';
  ctx.fillRect(-L / 2 + 0.45 + L * 0.38, -B / 2 + 0.5, 0.35, B - 1.0);
  ctx.restore();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const parkera = {
  id: 'parkera',
  fit: 'contain',
  W: PK.W * PK.K,
  H: PK.H * PK.K,
  controls: 'helm',
  create(seed) {
    const scen = PK_TYPES.map((t, i) => pkBuild(t, (seed ^ hashStr('pk' + i + t)) >>> 0, i));
    const r = rng(seed ^ 0x5eed);
    const streaks = [];
    for (let i = 0; i < 70; i++) streaks.push({ x: r() * PK.W, y: r() * PK.H, l: 0.6 + r() * 0.8 });
    const s = { scen, i: 0, phase: 'intro', phaseT: 0, t: 0, scenT: 0, total: 0, times: [], b: null, rud: 0, thr: 0, held: 0, inside: false, aligned: false, hit: null, bubbles: [], streaks, msg: '', msgT: 0, msgC: '#f5c225' };
    parkera.startScen(s);
    return s;
  },
  startScen(s) {
    const S = s.scen[s.i];
    s.b = { x: S.start.x, y: S.start.y, h: S.start.h, u: 0, v: 0, r: 0 };
    s.phase = 'intro';
    s.phaseT = 0;
    s.scenT = 0;
    s.held = 0;
    s.rud = 0;
    s.thr = 0;
    s.inside = false;
    s.aligned = false;
  },
  hull(s) {
    return placePts(PK_HULL, s.b.x, s.b.y, s.b.h);
  },
  collide(S, hull) {
    const hb = polyBox(hull);
    for (const o of S.obs) {
      if (o.box.x1 <= hb.x0 || hb.x1 <= o.box.x0 || o.box.y1 <= hb.y0 || hb.y1 <= o.box.y0) continue;
      if (polysOverlap(hull, o.poly)) return o;
    }
    return null;
  },
  update(s, dt, inp) {
    s.t += dt;
    s.phaseT += dt;
    s.msgT -= dt;
    for (const p of s.bubbles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.bubbles = s.bubbles.filter((p) => p.life > 0);
    const S = s.scen[s.i];

    if (s.phase === 'intro') {
      if (s.phaseT > 2.2) {
        s.phase = 'run';
        s.phaseT = 0;
        s.b.u = 1.8; // båten kommer in med fart
      }
      return;
    }
    if (s.phase === 'moored') {
      if (s.phaseT > 1.6) {
        s.i++;
        if (s.i >= s.scen.length) {
          s.phase = 'done';
          s.phaseT = 0;
        } else parkera.startScen(s);
      }
      return;
    }
    if (s.phase !== 'run') return;

    s.scenT += dt;
    s.total += dt;
    const rudIn = inp.left ? -1 : inp.right ? 1 : clamp(inp.rudder || 0, -1, 1);
    const thrIn = clamp(inp.throttle || 0, -1, 1);
    s.rud += clamp(rudIn - s.rud, -2.5 * dt, 2.5 * dt);
    s.thr += clamp(thrIn - s.thr, -1.6 * dt, 1.6 * dt);

    const b = s.b;
    pkPhysics(b, s.rud, s.thr, pkWind(S, s.scenT), dt);
    if (b.y > PK.H + 2) {
      b.y = PK.H + 2;
      b.u *= Math.exp(-4 * dt);
      b.v *= Math.exp(-4 * dt);
    }

    if (Math.abs(s.thr) > 0.1 && Math.random() < dt * 40) {
      const c = Math.cos(b.h), sn = Math.sin(b.h);
      const back = s.thr > 0 ? 1 : -0.6;
      s.bubbles.push({ x: b.x - c * PK.L * 0.5 + (Math.random() - 0.5) * 0.8 * -sn, y: b.y - sn * PK.L * 0.5 + (Math.random() - 0.5) * 0.8 * c, vx: -c * 2.2 * back + (Math.random() - 0.5) * 0.6, vy: -sn * 2.2 * back + (Math.random() - 0.5) * 0.6, life: 0.5 + Math.random() * 0.5, r: 0.12 + Math.random() * 0.18 });
    }

    const hull = parkera.hull(s);
    const hit = parkera.collide(S, hull);
    if (hit) {
      s.hit = hit;
      s.phase = 'crash';
      s.phaseT = 0;
      s.vibrate = true;
      say(s, 'KOLLISION!', '#ff6b6b', 3);
      return;
    }

    s.inside = pkInside(hull, S.target);
    s.aligned = pkAligned(b.h, S.head);
    const stopped = Math.abs(b.u) < 0.3 && Math.abs(b.r) < 0.2;
    if (s.inside && s.aligned && stopped) s.held += dt;
    else s.held = 0;
    if (s.held >= PK.HOLD) {
      s.times.push(s.scenT);
      s.phase = 'moored';
      s.phaseT = 0;
      say(s, 'FÖRTÖJD!', '#4cc38a', 1.6);
    }
  },
  draw(ctx, s) {
    const K = PK.K, S = s.scen[Math.min(s.i, s.scen.length - 1)];
    const w = pkWind(S, s.scenT);
    ctx.save();
    ctx.scale(K, K);
    waterFill(ctx, PK.W, PK.H, '#13456a', '#0f3a58');

    // Vindkrusningar: rör sig med vinden, tätare och tydligare när det blåser mer.
    ctx.strokeStyle = `rgba(220,240,255,${0.08 + w.ws * 0.012})`;
    ctx.lineWidth = 0.12;
    ctx.lineCap = 'round';
    const off = s.t * w.ws * 0.9;
    const len = 0.5 + w.ws * 0.12;
    for (const k of s.streaks) {
      const x = mod(k.x + w.dx * off, PK.W);
      const y = mod(k.y + w.dy * off, PK.H);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w.dx * len * k.l, y + w.dy * len * k.l);
      ctx.stroke();
    }

    // Målbox
    const T = S.target;
    const ok = s.inside && s.aligned;
    ctx.fillStyle = ok ? 'rgba(76,195,138,.18)' : 'rgba(245,194,37,.08)';
    ctx.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    ctx.save();
    ctx.setLineDash([0.5, 0.4]);
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = ok ? '#4cc38a' : 'rgba(245,194,37,.85)';
    ctx.strokeRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    ctx.restore();

    for (const o of S.obs) {
      if (o.kind === 'boat') {
        const white = o.color === '#f4f4f0';
        pkDrawBoat(ctx, o.x, o.y, o.h, o.L, o.B, white ? '#f4f4f0' : o.color, white ? '#7d8a94' : 'rgba(0,0,0,.35)', null);
      } else if (o.kind === 'quay') {
        pkFillPoly(ctx, o.poly, '#6d625d', 'rgba(255,255,255,.22)', 0.08);
      } else {
        pkFillPoly(ctx, o.poly, o.kind === 'boom' ? '#8a6a4c' : '#7a5a3e', 'rgba(0,0,0,.25)', 0.06);
        if (o.kind === 'dock') {
          const bx = o.box;
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0);
          ctx.clip();
          ctx.strokeStyle = 'rgba(0,0,0,.18)';
          ctx.lineWidth = 0.05;
          const vertical = bx.y1 - bx.y0 > bx.x1 - bx.x0;
          if (vertical) for (let y = bx.y0; y < bx.y1; y += 0.9) { ctx.beginPath(); ctx.moveTo(bx.x0, y); ctx.lineTo(bx.x1, y); ctx.stroke(); }
          else for (let x = bx.x0; x < bx.x1; x += 0.9) { ctx.beginPath(); ctx.moveTo(x, bx.y0); ctx.lineTo(x, bx.y1); ctx.stroke(); }
          ctx.restore();
        }
      }
    }
    if (s.phase === 'crash' && s.hit) {
      const P = s.hit.poly;
      ctx.beginPath();
      P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = `rgba(255,107,107,${0.6 + 0.4 * Math.sin(s.t * 12)})`;
      ctx.stroke();
      ctx.restore();
    }

    for (const p of s.bubbles) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(p.life, 0, 0.6)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }

    const b = s.b;
    const crashed = s.phase === 'crash';
    pkDrawBoat(ctx, b.x, b.y, b.h, PK.L, PK.B, crashed ? '#ffb3b3' : '#f4f4f0', crashed ? '#d7323b' : '#f5c225', '#f5c225');
    ctx.restore();

    // Texter i skärmenheter
    const tcx = ((T.x0 + T.x1) / 2) * K;
    const tLabelY = S.head === 'vert' ? ((T.y0 + T.y1) / 2) * K : T.y1 * K + 14;
    if (s.phase === 'run' || s.phase === 'intro') {
      ctx.save();
      ctx.font = `600 10px ${FONT_M}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ok ? '#4cc38a' : 'rgba(245,194,37,.95)';
      if (S.head === 'vert') {
        ctx.translate(tcx, tLabelY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(PK_INFO[S.type].label, 0, 0);
      } else ctx.fillText(PK_INFO[S.type].label, tcx, tLabelY);
      ctx.restore();
    }
    if (s.phase === 'run' && s.held > 0) {
      const px = b.x * K, py = b.y * K;
      ctx.strokeStyle = '#4cc38a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, py, 18, -Math.PI / 2, -Math.PI / 2 + TAU * (s.held / PK.HOLD));
      ctx.stroke();
    }

    // Vindros nere till höger
    const cx = PK.W * K - 40, cy = PK.H * K - 52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(10,24,36,.7)';
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(Math.atan2(w.dy, w.dx));
    ctx.fillStyle = '#7fe0ff';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-11, -9);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-11, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    smallText(ctx, `${Math.round(w.ws)} m/s ${pkCompass(w.from)}`, cx, cy + 36, 'center', 0.85, 11);

    const W = PK.W * K;
    if (s.phase === 'intro') {
      ctx.fillStyle = 'rgba(6,14,22,.82)';
      ctx.fillRect(0, 250, W, 150);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 12px ${FONT_M}`;
      ctx.fillStyle = 'rgba(234,241,245,.75)';
      ctx.fillText(`SCEN ${s.i + 1} AV ${s.scen.length}`, W / 2, 274);
      ctx.font = `900 36px ${FONT_D}`;
      ctx.fillStyle = '#f5c225';
      ctx.fillText(S.name.toUpperCase(), W / 2, 306);
      ctx.font = `400 14px "Atkinson Hyperlegible",system-ui,sans-serif`;
      ctx.fillStyle = '#eaf1f5';
      wrapLines(ctx, S.hint, W - 60).forEach((ln, i) => ctx.fillText(ln, W / 2, 338 + i * 18));
      ctx.font = `600 12px ${FONT_M}`;
      ctx.fillStyle = '#7fe0ff';
      ctx.fillText(`VIND ${Math.round(S.wind.ws)} M/S FRÅN ${pkCompass(S.wind.from)}`, W / 2, 384);
      ctx.restore();
    }
    if (s.phase === 'moored') {
      ctx.fillStyle = 'rgba(6,14,22,.78)';
      ctx.fillRect(0, 280, W, 90);
      centerMsg(ctx, s, W / 2, 312, 38);
      smallText(ctx, `${S.name} på ${fmtTime(s.times[s.times.length - 1] * 1000)}`, W / 2, 348, 'center', 0.95, 14);
    }
    if (s.phase === 'crash') {
      ctx.fillStyle = 'rgba(6,14,22,.78)';
      ctx.fillRect(0, 280, W, 90);
      centerMsg(ctx, s, W / 2, 312, 38);
      smallText(ctx, 'Försöket är underkänt', W / 2, 348, 'center', 0.95, 14);
    }
  },
  hud(s) {
    const S = s.scen[Math.min(s.i, s.scen.length - 1)];
    const w = pkWind(S, s.scenT);
    return { main: fmtTime(s.total * 1000), sub: `${Math.min(s.i + 1, s.scen.length)}/${s.scen.length} ${S.name} · ${Math.round(w.ws)} m/s ${pkCompass(w.from)}` };
  },
  result(s) {
    if (s.phase === 'done' && s.phaseT > 0.4) {
      return { score: Math.round(s.total * 1000), title: 'Alla förtöjda!', detail: s.times.map((t, i) => `${s.scen[i].name} ${fmtTime(t * 1000)}`).join(' · ') };
    }
    if (s.phase === 'crash' && s.phaseT > 1.8) {
      const S = s.scen[s.i];
      return { score: PK.DNF, dnf: true, title: 'Kollision!', detail: `I scen ${s.i + 1}, ${S.name}. Försöket är underkänt och ger ingen giltig tid.` };
    }
    return null;
  },
};

const GAME_LOGIC = { kryss, slalom, fortoj, parkera };

if (typeof module !== 'undefined') {
  module.exports = { GAME_LOGIC, rng, hashStr, fmtTime, fmtNum, angDiff, KRY, FT, SL, slSpeed, shoreW, PK, PK_HULL, pkBuild, pkPhysics, pkWind, polysOverlap, placePts, rectPts, hullPts, pkInside };
}
