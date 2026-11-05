// Delad topplista för Regatta Arkipelagos.
// GET  /api/state                 -> { round, scores }
// POST /api/state { type: 'score', round, game, name, score }
// POST /api/state { type: 'round', expect }
// Lagring: Upstash Redis via Vercel Marketplace (KV_REST_API_* eller UPSTASH_REDIS_REST_*).

const DEFAULT_ROUND = { n: 1, seed: 74011, startedAt: null };
const KEY_ROUND = 'ra:round';
const scoresKey = (n) => `ra:scores:${n}`;
const TTL = 60 * 60 * 24 * 60; // 60 dagar

const GAMES = {
  kryss: { better: 'low', min: 3000, max: 900000 },
  slalom: { better: 'high', min: 0, max: 200000 },
  fortoj: { better: 'high', min: 0, max: 500 },
  // Förtöja 2: tid i ms. Ett underkänt försök (kontakt) skickas som DNF och rankas alltid sist.
  parkera: { better: 'low', min: 5000, max: 1800000, dnf: 9999000 },
};

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers });

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function redis(cfg, cmds) {
  const res = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error('redis http ' + res.status);
  const out = await res.json();
  return out.map((x) => {
    if (x && x.error) throw new Error('redis ' + x.error);
    return x ? x.result : null;
  });
}

function parse(v) {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function slug(n) {
  // Skiftläge och mellanrum spelar ingen roll, men å, ä och ö skiljer namn åt (Åsa är inte Asa).
  return String(n).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spelare';
}

function cleanName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

async function readState(cfg) {
  const [raw] = await redis(cfg, [['GET', KEY_ROUND]]);
  const r = parse(raw);
  const round = r && Number.isInteger(r.n) && r.n > 0 ? { n: r.n, seed: r.seed >>> 0, startedAt: r.startedAt || null } : DEFAULT_ROUND;
  const [flat] = await redis(cfg, [['HGETALL', scoresKey(round.n)]]);
  const scores = [];
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const v = parse(flat[i + 1]);
      if (v && GAMES[v.game] && typeof v.name === 'string' && Number.isFinite(v.score)) {
        scores.push({ game: v.game, name: v.name, score: v.score, at: v.at || 0 });
      }
    }
  }
  return { round, scores };
}

export async function GET() {
  const cfg = store();
  if (!cfg) return json(503, { error: 'no_store' });
  try {
    return json(200, await readState(cfg));
  } catch (e) {
    return json(502, { error: 'store_failed' });
  }
}

export async function POST(request) {
  const cfg = store();
  if (!cfg) return json(503, { error: 'no_store' });

  let body;
  try {
    const text = await request.text();
    if (text.length > 2000) return json(413, { error: 'too_large' });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'bad_json' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'bad_body' });

  try {
    const state = await readState(cfg);

    if (body.type === 'score') {
      const game = GAMES[body.game] ? body.game : null;
      const name = cleanName(body.name);
      const score = Number(body.score);
      if (!game || !name || !Number.isFinite(score)) return json(400, { error: 'bad_score' });
      const rules = GAMES[game];
      const isDnf = rules.dnf !== undefined && score === rules.dnf;
      if (!isDnf && (score < rules.min || score > rules.max)) return json(400, { error: 'out_of_range' });
      if (Number(body.round) !== state.round.n) return json(409, { error: 'round_changed', state });

      const val = Math.round(score);
      const prev = state.scores.find((s) => s.game === game && slug(s.name) === slug(name));
      const better = !prev || (rules.better === 'low' ? val < prev.score : val > prev.score);
      if (better) {
        const rec = { game, name, score: val, at: Date.now() };
        await redis(cfg, [
          ['HSET', scoresKey(state.round.n), `${game}:${slug(name)}`, JSON.stringify(rec)],
          ['EXPIRE', scoresKey(state.round.n), String(TTL)],
        ]);
        state.scores = state.scores.filter((s) => s !== prev).concat(rec);
      }
      return json(200, { ok: true, improved: better, state });
    }

    if (body.type === 'round') {
      if (Number(body.expect) !== state.round.n) return json(409, { error: 'round_changed', state });
      // Ett lås per omgång: om två trycker samtidigt vinner bara den första, den andra får 409.
      const [got] = await redis(cfg, [['SET', `ra:roundlock:${state.round.n}`, '1', 'NX', 'EX', '120']]);
      if (got !== 'OK') return json(409, { error: 'round_changed', state: await readState(cfg) });
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const round = { n: state.round.n + 1, seed, startedAt: Date.now() };
      await redis(cfg, [['SET', KEY_ROUND, JSON.stringify(round)]]);
      return json(200, { ok: true, state: { round, scores: [] } });
    }

    return json(400, { error: 'bad_type' });
  } catch (e) {
    return json(502, { error: 'store_failed' });
  }
}
