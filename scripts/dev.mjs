#!/usr/bin/env node
// Local dev server: serves public/, runs api/*.js handlers in-process and (by default)
// an in-memory Redis, so "Delad" mode and live rooms work without Upstash.
//   npm run dev                     -> http://localhost:4173, shared store
//   node scripts/dev.mjs --nostore  -> no store: the app runs in "bara här" mode
//   node scripts/dev.mjs --port 4300 --latency 60
// Fault injection: GET /__fake/fail?n=2&kind=http500|hang|quota
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const PORT = Number(flag('port', process.env.PORT || 4173));
const NOSTORE = !!flag('nostore', false);
const LATENCY = Number(flag('latency', 0));

let fake = null;
if (!NOSTORE) fake = (await import(pathToFileURL(path.join(ROOT, 'test/support/fake-redis.js')))).install({ latency: LATENCY });

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const headerRules = (vercel.headers || []).map((h) => ({ re: new RegExp('^' + h.source + '$'), headers: h.headers }));
const rewrites = (vercel.rewrites || []).map((r) => ({ re: new RegExp('^' + r.source + '$'), to: r.destination }));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
const apis = new Map();
async function api(name) {
  if (!apis.has(name)) {
    const f = path.join(ROOT, 'api', name + '.js');
    apis.set(name, fs.existsSync(f) && !name.startsWith('_') ? await import(pathToFileURL(f)) : null);
  }
  return apis.get(name);
}

http.createServer(async (req, res) => {
  try {
    let url = new URL(req.url, `http://localhost:${PORT}`);
    for (const r of rewrites) if (r.re.test(url.pathname)) url = new URL(r.to + url.search, url);
    const extra = {};
    for (const h of headerRules) if (h.re.test(url.pathname)) for (const { key, value } of h.headers) extra[key] = value;
    if (url.pathname === '/__fake/fail') {
      fake?.failNext(Number(url.searchParams.get('n') || 1), url.searchParams.get('kind') || 'http500');
      res.end(fake ? 'ok' : 'no store'); return;
    }
    const m = url.pathname.match(/^\/api\/([\w-]+)$/);
    if (m) {
      const mod = await api(m[1]);
      const fn = mod && mod[req.method];
      if (!fn) { res.writeHead(mod ? 405 : 404, extra); res.end(); return; }
      let body = ''; for await (const ch of req) body += ch;
      const headers = { ...req.headers, host: `localhost:${PORT}` };
      const out = await fn(new Request(url.href, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
      res.writeHead(out.status, { ...extra, ...Object.fromEntries(out.headers) });
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(ROOT, 'public', path.normalize(rel));
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, extra); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...extra });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e); res.writeHead(500); res.end('dev server error');
  }
}).listen(PORT, () => console.log(`dev server http://localhost:${PORT} (${NOSTORE ? 'no store' : 'in-memory store'}${LATENCY ? `, latency ${LATENCY} ms` : ''})`));
