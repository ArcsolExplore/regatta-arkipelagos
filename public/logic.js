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
const KRY = { W: 400, H: 720, LY: 612, LX0: 72, LX1: 328, BX: 200, BY: 118, ZONE: 140, RESET: 185, MAX: 104, TURN: 2.2, WALL: 26 };

const kryss = {
  id: 'kryss',
  fit: 'contain',
  W: KRY.W,
  H: KRY.H,
  controls: 'sail',
  create(seed) {
    const r = rng(seed);
    const streaks = [];
    for (let i = 0; i < 46; i++) streaks.push({ x: r() * 460 - 30, y: r() * 780 - 30, l: 8 + r() * 12 });
    const shore = [[], []];
    for (let side = 0; side < 2; side++) for (let y = -30; y <= 760; y += 24) shore[side].push({ y, w: 10 + r() * 10 });
    return {
      t: 0, x: 200, y: 668, a: -Math.PI / 2 - 0.78, speed: 0, energy: 100, phase: 0, raceT: 0,
      ph1: r() * TAU, ph2: r() * TAU, wa: Math.PI / 2,
      prevSide: 0, tackT: 0, penT: 0, msg: '', msgT: 0, msgC: '#f5c225',
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

    if (racing && inp.boostPressed) {
      if (s.tackT > 0) {
        s.tackT = 0;
        s.speed = Math.max(s.speed, KRY.MAX * 1.45);
        s.energy = Math.min(100, s.energy + 20);
        s.perfect++;
        say(s, 'PERFEKT SLAG!', '#4cc38a', 1.2);
      } else if (s.energy >= 35) {
        s.energy -= 35;
        s.speed += 40;
        say(s, 'PUFF!', '#f4f4f0', 0.5);
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
    s.energy = Math.min(100, s.energy + 12 * dt);

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
  },
  draw(ctx, s) {
    const { W, H } = KRY;
    waterFill(ctx, W, H);

    const wx = Math.cos(s.wa), wy = Math.sin(s.wa);
    ctx.strokeStyle = 'rgba(220,240,255,.17)';
    ctx.lineWidth = 1.5;
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
      smallText(ctx, 'Kryssa uppåt och korsa linjen', W / 2, KRY.LY - 70, 'center', 0.85, 12);
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

const GAME_LOGIC = { kryss, slalom, fortoj };

if (typeof module !== 'undefined') {
  module.exports = { GAME_LOGIC, rng, hashStr, fmtTime, fmtNum, angDiff, KRY, FT, SL, slSpeed, shoreW };
}
