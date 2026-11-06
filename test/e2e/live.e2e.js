// Live rooms in two browsers against the dev server's in-memory store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './server.js';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, srv;
before(async () => { browser = await chromium.launch(); srv = await startServer(); });
after(async () => { await browser?.close(); srv?.stop(); });

async function player(name, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(srv.url);
  await p.evaluate((n) => localStorage.setItem('ra_name', JSON.stringify(n)), name);
  await p.goto(srv.url + hash);
  await p.waitForTimeout(500);
  return { ctx, p, errors };
}
const createRoom = async (p, title) => {
  await p.locator('.live-games .game', { has: p.locator(`h3:text-is("${title}")`) }).getByRole('button', { name: 'Skapa rum' }).click();
  await p.waitForSelector('#live .big-code');
  return (await p.locator('#live .big-code').textContent()).trim();
};

test('Startlinjen: a tap survives a reload, cannot be repeated, and is saved once', { timeout: 60000 }, async () => {
  const A = await player('Anna'), B = await player('Bo');
  const code = await createRoom(A.p, 'Startlinjen');
  await B.p.goto(srv.url + '#rum-' + code); await B.p.waitForSelector('#live .big-code');
  await A.p.getByRole('button', { name: 'Starta loppet' }).click();
  await A.p.waitForSelector('#live .go');
  // rAF runs during the countdown
  await A.p.waitForTimeout(11000); // gun at +10 s
  await A.p.locator('#live .go').dispatchEvent('pointerdown');
  await A.p.waitForTimeout(300);
  const first = await A.p.locator('#live .mine-val').textContent();
  await A.p.reload(); await A.p.waitForSelector('#live .go');
  await A.p.waitForTimeout(400);
  assert.ok(await A.p.locator('#live .go').isDisabled(), 'KÖR disabled after reload');
  assert.equal(await A.p.locator('#live .mine-val').textContent(), first);
  await B.p.locator('#live .go').dispatchEvent('pointerdown');
  await A.p.waitForSelector('#live .board', { timeout: 8000 });
  await A.p.waitForTimeout(800);
  const board = await A.p.evaluate(() => fetch('/api/state').then((r) => r.json()));
  assert.equal(board.scores.filter((s) => s.game === 'start' && s.name === 'Anna').length, 1);
  await A.p.reload(); await A.p.waitForTimeout(800);
  const again = await A.p.evaluate(() => JSON.parse(localStorage.getItem('ra_live')));
  assert.equal(Object.keys(again.saved).length, 1);
  assert.deepEqual([...A.errors, ...B.errors], []);
  await A.ctx.close(); await B.ctx.close();
});

test('lobby and Sjöslaget run no animation loop; hidden page stops polling', { timeout: 60000 }, async () => {
  const A = await player('Rut'), B = await player('Ben');
  await A.p.addInitScript(() => {});
  const code = await createRoom(A.p, 'Sjöslaget');
  await B.p.goto(srv.url + '#rum-' + code); await B.p.waitForSelector('#live .big-code');
  const countRaf = (p) => p.evaluate(() => new Promise((res) => {
    let n = 0; const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = (f) => { n++; return orig(f); };
    setTimeout(() => { window.requestAnimationFrame = orig; res(n); }, 2000);
  }));
  assert.equal(await countRaf(A.p), 0, 'lobby');
  await A.p.getByRole('button', { name: 'Starta sjöslaget' }).click();
  await A.p.waitForSelector('#live .grid.target');
  assert.equal(await countRaf(A.p), 0, 'sjöslaget');
  let requests = 0;
  A.p.on('request', (r) => { if (r.url().includes('/api/room')) requests++; });
  await A.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await A.p.waitForTimeout(4000);
  assert.equal(requests, 0, 'no polling while hidden');
  assert.deepEqual([...A.errors, ...B.errors], []);
  await A.ctx.close(); await B.ctx.close();
});

test('without a store the live section says so before anyone taps', { timeout: 30000 }, async () => {
  const none = await startServer('--nostore');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(none.url); await p.waitForTimeout(600);
  const sec = p.locator('.section', { has: p.locator('h2:text-is("Livespel")') });
  assert.match(await sec.textContent(), /inte igång just nu/);
  assert.ok(await sec.getByRole('button', { name: 'Skapa rum' }).first().isDisabled());
  await ctx.close(); none.stop();
});
