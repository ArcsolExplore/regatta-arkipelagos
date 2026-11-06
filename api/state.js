// Delad topplista för Regatta Arkipelagos.
// GET  /api/state                 -> { round, scores }
// POST /api/state { type: 'score', round, game, name, score }
// POST /api/state { type: 'round', expect }
// Lagring: Upstash Redis via Vercel Marketplace (KV_REST_API_* eller UPSTASH_REDIS_REST_*).

import { store, redis, parse, json, readJson, route, HttpError, cleanName } from './_shared.js';

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
  navigator: { better: 'low', min: 3000, max: 1200000 },
  fyr: { better: 'high', min: 0, max: 1000 },
  tamp: { better: 'high', min: 0, max: 500 },
  grill: { better: 'high', min: 0, max: 6000 },
  mas: { better: 'high', min: 0, max: 10000 },
  svall: { better: 'high', min: 0, max: 1000 },
  lots: { better: 'low', min: 5000, max: 900000 },
  // Startlinjen spelas live; bästa start i ms efter skottet. Räknas inte i Regattan.
  start: { better: 'low', min: 0, max: 5000 },
};

function slug(n) {
  // Skiftläge och mellanrum spelar ingen roll, men å, ä och ö skiljer namn åt (Åsa är inte Asa).
  return String(n).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spelare';
}

async function readState(cfg, ctx) {
  const [raw] = await redis(cfg, [['GET', KEY_ROUND]], ctx);
  const r = parse(raw);
  const round = r && Number.isInteger(r.n) && r.n > 0 ? { n: r.n, seed: r.seed >>> 0, startedAt: r.startedAt || null } : DEFAULT_ROUND;
  const [flat] = await redis(cfg, [['HGETALL', scoresKey(round.n)]], ctx);
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

export const GET = route('state', async (request, ctx) => {
  const cfg = store();
  if (!cfg) return json(ctx, 503, { error: 'no_store' });
  return json(ctx, 200, await readState(cfg, ctx));
});

export const POST = route('state', async (request, ctx) => {
  const cfg = store();
  if (!cfg) return json(ctx, 503, { error: 'no_store' });
  const body = await readJson(request);
  ctx.action = String(body.type || '').slice(0, 16);
  const state = await readState(cfg, ctx);

  if (body.type === 'score') {
    const game = GAMES[body.game] ? body.game : null;
    const name = cleanName(body.name);
    const score = Number(body.score);
    if (!game || !name || !Number.isFinite(score)) throw new HttpError(400, 'bad_score');
    const rules = GAMES[game];
    if (rules.serverOnly) throw new HttpError(403, 'server_only');
    const isDnf = rules.dnf !== undefined && score === rules.dnf;
    if (!isDnf && (score < rules.min || score > rules.max)) throw new HttpError(400, 'out_of_range');
    if (Number(body.round) !== state.round.n) return json(ctx, 409, { error: 'round_changed', state });

    const val = Math.round(score);
    const prev = state.scores.find((s) => s.game === game && slug(s.name) === slug(name));
    const better = !prev || (rules.better === 'low' ? val < prev.score : val > prev.score);
    if (better) {
      const rec = { game, name, score: val, at: Date.now() };
      await redis(cfg, [
        ['HSET', scoresKey(state.round.n), `${game}:${slug(name)}`, JSON.stringify(rec)],
        ['EXPIRE', scoresKey(state.round.n), String(TTL)],
      ], ctx);
      state.scores = state.scores.filter((s) => s !== prev).concat(rec);
    }
    return json(ctx, 200, { ok: true, improved: better, name, state });
  }

  if (body.type === 'round') {
    if (Number(body.expect) !== state.round.n) return json(ctx, 409, { error: 'round_changed', state });
    // Ett lås per omgång: om två trycker samtidigt vinner bara den första, den andra får 409.
    const lock = `ra:roundlock:${state.round.n}`;
    const [got] = await redis(cfg, [['SET', lock, '1', 'NX', 'EX', '120']], ctx);
    if (got !== 'OK') return json(ctx, 409, { error: 'round_changed', state: await readState(cfg, ctx) });
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const round = { n: state.round.n + 1, seed, startedAt: Date.now() };
    try {
      await redis(cfg, [['SET', KEY_ROUND, JSON.stringify(round)]], ctx);
    } catch (e) {
      // Släpp låset så att omgången kan bytas igen när lagringen fungerar (R1-SRV-10).
      await redis(cfg, [['DEL', lock]], ctx).catch(() => {});
      throw e;
    }
    return json(ctx, 200, { ok: true, state: { round, scores: [] } });
  }

  throw new HttpError(400, 'bad_type');
});
