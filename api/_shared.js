// Shared server core for the API routes. Files starting with _ are not routes on Vercel.
// - store()/redis(): Upstash REST with a 3 s timeout and typed errors
// - json(): every response (errors too) carries t1/t2 (server receive/send time), serverNow and build
// - readJson(): JSON only, same origin only, size cap (blocks cross-site form posts)
// - route(): maps errors to status codes and logs server failures (never names or tokens)

export const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
const REDIS_TIMEOUT_MS = 3000;

export class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export class StoreError extends Error {
  /** @param {'http'|'cmd'|'timeout'|'quota'} kind */
  constructor(kind, detail) {
    super(`store ${kind}: ${detail}`);
    this.kind = kind;
  }
}

export function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

const QUOTA = /max .*limit exceeded/i;

/** Runs a pipeline. Throws StoreError on HTTP failure, timeout, quota or a command error. */
export async function redis(cfg, cmds, ctx) {
  if (ctx) ctx.cmds = (ctx.cmds || 0) + cmds.length;
  let res;
  try {
    res = await fetch(cfg.url + '/pipeline', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  } catch (e) {
    throw new StoreError(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'http', e && e.message);
  }
  let out = null;
  try { out = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = out && out.error ? String(out.error) : 'status ' + res.status;
    throw new StoreError(QUOTA.test(msg) ? 'quota' : 'http', msg);
  }
  if (!Array.isArray(out)) throw new StoreError('http', 'bad pipeline reply');
  return out.map((x) => {
    if (x && x.error) throw new StoreError(QUOTA.test(x.error) ? 'quota' : 'cmd', x.error);
    return x ? x.result : null;
  });
}

export function parse(v) {
  if (typeof v !== 'string') return null;
  try { return JSON.parse(v); } catch { return null; }
}

/** JSON response with timing fields. ctx = the request context from route(). */
export function json(ctx, status, body, extraHeaders) {
  const t2 = Date.now();
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(extraHeaders || {}),
  };
  const out = { ...body, t1: ctx ? ctx.t1 : t2, t2, serverNow: t2, build: BUILD };
  return new Response(JSON.stringify(out), { status, headers });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin GETs and some older browsers send none
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
  let o;
  try { o = new URL(origin).host; } catch { return false; }
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return o === host || allowed.includes(origin);
}

/** Reads a JSON body: 415 unless application/json, 403 for another origin, 413 if too large. */
export async function readJson(request, max = 2000) {
  const type = request.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'bad_content_type');
  if (!sameOrigin(request)) throw new HttpError(403, 'bad_origin');
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'too_large');
  let body;
  try { body = JSON.parse(text); } catch { throw new HttpError(400, 'bad_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_body');
  return body;
}

function log(level, fields) {
  const line = JSON.stringify({ lvl: level, ...fields });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

/**
 * Wraps a handler (request, ctx) => Response. ctx = {t1, cmds, route, action}.
 * HttpError -> its status; StoreError -> 503 store_quota or 502 store_failed; other -> 500.
 */
export function route(name, handler) {
  return async (request) => {
    const ctx = { t1: Date.now(), cmds: 0, route: name, action: '' };
    try {
      return await handler(request, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 429) log('warn', { ev: 'rate_limited', route: name, action: ctx.action });
        return json(ctx, e.status, { error: e.code, ...(e.extra || {}) });
      }
      const ms = Date.now() - ctx.t1;
      if (e instanceof StoreError) {
        log('error', { ev: 'store_error', route: name, action: ctx.action, kind: e.kind, ms, cmds: ctx.cmds, err: String(e.message).slice(0, 200) });
        return e.kind === 'quota' ? json(ctx, 503, { error: 'store_quota' }) : json(ctx, 502, { error: 'store_failed' });
      }
      log('error', { ev: 'internal', route: name, action: ctx.action, ms, err: String(e && e.message).slice(0, 200), stack: String(e && e.stack).slice(0, 800) });
      return json(ctx, 500, { error: 'internal' });
    }
  };
}

/** Name cleaning shared by both routes (client copy must match; see test/server/names.test.js). */
// Removes control, format (bidi overrides, zero-width), private-use and lone surrogate characters,
// and < >; collapses spaces; keeps at most 20 code points.
export function cleanName(n) {
  if (typeof n !== 'string') return '';
  const s = n.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}<>]/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 20).join('').trim();
}
