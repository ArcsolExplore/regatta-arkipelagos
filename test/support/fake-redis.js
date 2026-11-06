// In-memory stand-in for Upstash Redis REST (POST /pipeline and POST / for single commands).
// install() wraps globalThis.fetch for URLs under FAKE_URL; everything else passes through.
// Lua (EVAL) is not implemented yet: it arrives with the server rewrite (Fas 3).
export const FAKE_URL = 'https://fake-redis.test';

export function createStore({ now = () => Date.now() } = {}) {
  const db = new Map(); // key -> {v, exp}
  const counts = { commands: 0, requests: 0 };
  const live = (k) => { const e = db.get(k); if (e && e.exp && e.exp <= now()) { db.delete(k); return undefined; } return e; };
  const val = (k) => live(k)?.v;
  const hash = (k) => { const e = live(k); if (e) return e.v; const h = new Map(); db.set(k, { v: h }); return h; };
  const int = (x) => { const n = Number(x); if (!Number.isInteger(n)) throw new Error('ERR value is not an integer or out of range'); return n; };
  const up = (a) => a.map((x) => String(x).toUpperCase());
  const cmds = {
    PING: () => 'PONG',
    GET: ([k]) => (val(k) instanceof Map ? (() => { throw new Error('WRONGTYPE'); })() : val(k) ?? null),
    SET: ([k, v, ...o]) => {
      const f = up(o);
      if (f.includes('NX') && live(k)) return null;
      if (f.includes('XX') && !live(k)) return null;
      let exp = 0; const ex = f.indexOf('EX'), px = f.indexOf('PX');
      if (ex >= 0) exp = now() + int(o[ex + 1]) * 1000;
      if (px >= 0) exp = now() + int(o[px + 1]);
      db.set(k, { v: String(v), exp }); return 'OK';
    },
    DEL: (ks) => ks.reduce((n, k) => n + (live(k) && db.delete(k) ? 1 : 0), 0),
    EXISTS: (ks) => ks.filter((k) => live(k)).length,
    MGET: (ks) => ks.map((k) => val(k) ?? null),
    INCR: ([k]) => cmds.INCRBY([k, 1]),
    INCRBY: ([k, n]) => { const e = live(k); const v = int(e ? e.v : 0) + int(n); db.set(k, { v: String(v), exp: e?.exp || 0 }); return v; },
    EXPIRE: ([k, s]) => { const e = live(k); if (!e) return 0; e.exp = now() + int(s) * 1000; return 1; },
    PEXPIRE: ([k, ms]) => { const e = live(k); if (!e) return 0; e.exp = now() + int(ms); return 1; },
    TTL: ([k]) => { const e = live(k); return !e ? -2 : !e.exp ? -1 : Math.ceil((e.exp - now()) / 1000); },
    HSET: ([k, ...fv]) => { const h = hash(k); let n = 0; for (let i = 0; i < fv.length; i += 2) { if (!h.has(fv[i])) n++; h.set(String(fv[i]), String(fv[i + 1])); } return n; },
    HSETNX: ([k, f, v]) => { const h = hash(k); if (h.has(f)) return 0; h.set(String(f), String(v)); return 1; },
    HGET: ([k, f]) => live(k)?.v.get(f) ?? null,
    HMGET: ([k, ...fs]) => fs.map((f) => live(k)?.v.get(f) ?? null),
    HGETALL: ([k]) => { const e = live(k); return e ? [...e.v.entries()].flat() : []; },
    HVALS: ([k]) => { const e = live(k); return e ? [...e.v.values()] : []; },
    HLEN: ([k]) => live(k)?.v.size ?? 0,
    HDEL: ([k, ...fs]) => { const e = live(k); if (!e) return 0; return fs.reduce((n, f) => n + (e.v.delete(f) ? 1 : 0), 0); },
    HINCRBY: ([k, f, n]) => { const h = hash(k); const v = int(h.get(f) ?? 0) + int(n); h.set(String(f), String(v)); return v; },
  };
  function run(cmd) {
    counts.commands++;
    const [c, ...a] = cmd; const fn = cmds[String(c).toUpperCase()];
    if (!fn) throw new Error(`ERR unknown command '${c}' (fake-redis)`);
    return fn(a.map((x) => (typeof x === 'number' ? String(x) : x)));
  }
  return { db, counts, run };
}

export function install({ latency = 0, now } = {}) {
  const store = createStore({ now });
  const faults = { n: 0, kind: 'http500' };
  const real = globalThis.fetch;
  process.env.KV_REST_API_URL = FAKE_URL;
  process.env.KV_REST_API_TOKEN = 'fake';
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(FAKE_URL)) return real(input, init);
    store.counts.requests++;
    if (latency) await new Promise((r) => setTimeout(r, latency));
    if (faults.n > 0) {
      faults.n--;
      if (faults.kind === 'hang') return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(init.signal.reason)));
      if (faults.kind === 'quota') return new Response(JSON.stringify({ error: 'ERR max requests limit exceeded. Limit: 500000, Usage: 500000' }), { status: 400 });
      return new Response('down', { status: 500 });
    }
    const body = JSON.parse(init.body || 'null');
    const one = (c) => { try { return { result: store.run(c) }; } catch (e) { return { error: e.message }; } };
    const out = url.endsWith('/pipeline') ? body.map(one) : one(body);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return {
    ...store,
    failNext(n = 1, kind = 'http500') { faults.n = n; faults.kind = kind; },
    uninstall() { globalThis.fetch = real; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; },
  };
}
