// GET /api/health          -> 200 {ok, store:'ok', latencyMs, build, region} | 503 {ok:false, store:'missing'|'error'|'quota'}
// GET /api/health?shallow=1 -> 200 without touching the store (for uptime checks that must cost nothing)
import { store, redis, json, route, StoreError } from './_shared.js';

export const GET = route('health', async (request, ctx) => {
  const region = process.env.VERCEL_REGION || 'local';
  if (new URL(request.url).searchParams.get('shallow')) return json(ctx, 200, { ok: true, region });
  const cfg = store();
  if (!cfg) return json(ctx, 503, { ok: false, store: 'missing', region });
  const t0 = Date.now();
  try {
    await redis(cfg, [['PING']], ctx);
  } catch (e) {
    return json(ctx, 503, { ok: false, store: e instanceof StoreError && e.kind === 'quota' ? 'quota' : 'error', region });
  }
  return json(ctx, 200, { ok: true, store: 'ok', latencyMs: Date.now() - t0, region });
});
