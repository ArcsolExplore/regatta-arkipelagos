// POST /api/log {kind, msg, stack?, game?, phase?, path?, v?, ua?} -> 204
// Client crash reports go to the function log only (never to Redis). No names, rooms or tokens.
import { json, readJson, route, HttpError } from './_shared.js';

const hits = new Map(); // ip -> [timestamps]; in memory per instance
const LIMIT = 10, WINDOW = 60000;
const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

export const POST = route('log', async (request, ctx) => {
  const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (list.length >= LIMIT) throw new HttpError(429, 'rate_limited', { retryAfter: 60 });
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  const b = await readJson(request, 2500);
  const clean = (s) => s && s.replace(/#rum-[A-Z]+/g, '#rum-…').replace(/tok=[\w-]+/g, 'tok=…');
  console.error('[client] ' + JSON.stringify({
    kind: cut(b.kind, 12), game: cut(b.game, 16), phase: cut(b.phase, 16), v: cut(b.v, 16),
    msg: clean(cut(b.msg, 300)), stack: clean(cut(b.stack, 1500)), path: clean(cut(b.path, 120)), ua: cut(b.ua, 120),
  }));
  void ctx;
  return new Response(null, { status: 204 });
});
