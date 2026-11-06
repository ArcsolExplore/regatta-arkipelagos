// Drives a game like the engine does: fixed substeps, edge inputs delivered once.
import { seeded } from './load.js';
import { stubCanvas } from './canvas.js';

export const view = (g) => ({ w: 390, h: 700, scale: 390 / g.W, ox: 0, oy: 0, H: g.fit === 'width' ? 640 : g.H, dpr: 1 });

/** Random but reproducible input for a control type. */
export function fuzzPolicy(g, seed) {
  const r = seeded(seed ^ 0x5bd1e995);
  const st = { left: false, right: false, hold: false, skot: 0.45, rudder: 0, throttle: 0, tiltX: 0, tiltY: 0, down: null, id: 1 };
  return (t, dt) => {
    const inp = { left: st.left, right: st.right, hold: st.hold, boostPressed: false, skot: st.skot, rudder: st.rudder, throttle: st.throttle, events: [], tiltOk: !!g.tilt, tiltX: st.tiltX, tiltY: st.tiltY };
    const p = dt * 3; // ~3 changes per second
    if (r() < p) st.left = r() < 0.4;
    if (r() < p) st.right = r() < 0.4;
    if (r() < p) st.hold = !st.hold;
    if (r() < dt * 2) inp.boostPressed = true;
    st.skot = Math.min(1, Math.max(0, st.skot + (r() - 0.5) * dt * 2));
    st.rudder = Math.min(1, Math.max(-1, st.rudder + (r() - 0.5) * dt * 4));
    st.throttle = Math.min(1, Math.max(-1, st.throttle + (r() - 0.5) * dt * 3));
    st.tiltX = Math.min(1, Math.max(-1, st.tiltX + (r() - 0.5) * dt * 4));
    st.tiltY = Math.min(1, Math.max(-1, st.tiltY + (r() - 0.5) * dt * 4));
    if (g.pointer) {
      const x = r() * g.W, y = r() * g.H;
      if (st.down === null && r() < p * 2) { st.down = st.id++; inp.events.push({ type: 'down', id: st.down, x, y, t }); }
      else if (st.down !== null) {
        if (r() < p) { inp.events.push({ type: 'up', id: st.down, x, y, t }); st.down = null; }
        else if (r() < 0.5) inp.events.push({ type: 'move', id: st.down, x, y, t });
      }
    }
    Object.assign(inp, { left: st.left, right: st.right, hold: st.hold });
    return inp;
  };
}

export const idlePolicy = () => () => ({ left: false, right: false, hold: false, boostPressed: false, skot: 0.45, rudder: 0, throttle: 0, events: [], tiltOk: false });

/**
 * Runs one attempt. frameDt = simulated frame length; physics substeps ≤ 1/120 as in app.js.
 * @returns {{res: any, t: number, steps: number, s: any}}
 */
export function runGame(g, seed, policy, { frameDt = 1 / 60, maxT = 900, draw = false } = {}) {
  const s = g.create(seed);
  const v = view(g);
  const ctx = draw ? stubCanvas() : null;
  let t = 0, steps = 0, res = null;
  while (t < maxT) {
    const inp = policy(t, frameDt);
    let rem = frameDt;
    while (rem > 1e-9) {
      const step = Math.min(rem, 1 / 120);
      g.update(s, step, inp, v);
      inp.boostPressed = false;
      if (inp.events.length) inp.events = [];
      rem -= step; steps++;
    }
    t += frameDt;
    if (draw) { g.draw(ctx, s, v); g.hud(s); }
    res = g.result(s);
    if (res) break;
  }
  return { res, t, steps, s };
}

/** Small stable hash of any JSON-able value (FNV-1a). */
export function hashJSON(v) {
  const str = JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
