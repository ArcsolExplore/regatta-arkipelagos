// Engine and sync behaviour in a real browser: crash panel + report, intro scroll, offline start.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './server.js';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, srv;
before(async () => { browser = await chromium.launch(); srv = await startServer(); });
after(async () => { await browser?.close(); srv?.stop(); });

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  if (opts.init) await p.addInitScript(opts.init);
  await p.goto(srv.url);
  await p.evaluate(() => localStorage.setItem('ra_name', JSON.stringify('Testare')));
  await p.reload();
  await p.waitForTimeout(300);
  return { ctx, p };
}
const spela = (p, title) => p.locator('.game', { has: p.locator(`h3:text-is("${title}")`) }).getByRole('button', { name: /Spela/ }).click();

test('a game that throws shows the crash panel and reports it', async () => {
  const { ctx, p } = await open({ init: () => {
    const orig = CanvasRenderingContext2D.prototype.fillText; let n = 0;
    CanvasRenderingContext2D.prototype.fillText = function (...a) { if (window.__boom && n++ === 0) throw new Error('test boom'); return orig.apply(this, a); };
  } });
  const logs = [];
  await p.route('**/api/log', (r) => { logs.push(r.request().postDataJSON()); r.fulfill({ status: 204 }); });
  await spela(p, 'Skärslalom');
  await p.locator('#introPanel button', { hasText: 'Kör' }).click();
  await p.evaluate(() => { window.__boom = true; });
  await p.waitForTimeout(400);
  assert.ok(await p.locator('#resultPanel', { hasText: 'kraschade' }).isVisible());
  assert.equal(logs.length, 1);
  assert.equal(logs[0].kind, 'engine'); assert.equal(logs[0].game, 'slalom'); assert.match(logs[0].msg, /test boom/);
  await ctx.close();
});

test('intro opens scrolled to the top on a small phone', async () => {
  const { ctx, p } = await open({ viewport: { width: 320, height: 568 } });
  for (const title of ['Kryssbanan', 'Hamnmanövern', 'Svallvågen']) {
    await spela(p, title);
    await p.waitForTimeout(120);
    assert.equal(await p.locator('#introPanel').evaluate((el) => el.scrollTop), 0, title);
    await p.locator('#introPanel button', { hasText: 'Tillbaka' }).click();
  }
  await ctx.close();
});

test('starting without network after a shared visit keeps the shared round (offline, not local)', async () => {
  const { ctx, p } = await open();
  assert.match(await p.locator('#syncLabel').textContent(), /gemensam/);
  await p.route('**/api/state*', (r) => r.abort('internetdisconnected'));
  await p.reload();
  await p.waitForTimeout(600);
  assert.match(await p.locator('#syncLabel').textContent(), /Omgång 1 · offline/);
  await ctx.close();
});

test('a hung /api/state request times out and the chip leaves "gemensam"', { timeout: 30000 }, async () => {
  const { ctx, p } = await open();
  await p.route('**/api/state*', () => { /* never answers */ });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(9500);
  assert.match(await p.locator('#syncLabel').textContent(), /offline/);
  await ctx.close();
});
