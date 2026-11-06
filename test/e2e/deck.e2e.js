// Card deck: secret words stay covered, position survives a reload, timer pauses and signals the end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './server.js';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, srv;
before(async () => { browser = await chromium.launch(); srv = await startServer(); });
after(async () => { await browser?.close(); srv?.stop(); });

test('Bakvänt hides the word until "Visa för mig"; reload keeps the card', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(srv.url + '#kort'); await p.waitForTimeout(300);
  await p.locator('.cat', { hasText: 'Bakvänt' }).click();
  await p.locator('button', { hasText: 'Nästa kort' }).click();
  await p.locator('button', { hasText: 'Nästa kort' }).click();
  const words = await p.evaluate(() => CARD_CATS.find((c) => c.id === 'bakvant').cards.map((c) => c.a));
  const text = await p.locator('#view-kort .card').textContent();
  assert.ok(!words.some((w) => text.includes(w)), 'no word visible before reveal');
  await p.getByRole('button', { name: 'Visa för mig' }).click();
  const shown = await p.locator('#view-kort .card .card-main').textContent();
  assert.ok(words.includes(shown));
  const pos = await p.locator('#view-kort .section-head .eyebrow').textContent();
  assert.equal(pos, '3 av 12');
  await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = '#kort'; }); await p.waitForTimeout(200);
  assert.equal(await p.locator('#view-kort .section-head .eyebrow').textContent(), '3 av 12');
  assert.ok(await p.getByRole('button', { name: 'Visa för mig' }).isVisible(), 'covered again after reload');
  await p.getByRole('button', { name: 'Visa för mig' }).click();
  assert.equal(await p.locator('#view-kort .card .card-main').textContent(), shown);
  await ctx.close();
});

test('card timer: pause keeps the time, the end plays a sound and says so', { timeout: 60000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__osc = 0;
    const O = window.AudioContext;
    window.AudioContext = class extends O { createOscillator() { window.__osc++; return super.createOscillator(); } };
  });
  await p.goto(srv.url + '#kort'); await p.waitForTimeout(300);
  await p.locator('.cat', { hasText: 'Tempo' }).click();
  await p.getByRole('button', { name: '30 s' }).click();
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Paus' }).click();
  const a = await p.locator('.timer-dial span').textContent();
  await p.waitForTimeout(2000);
  assert.equal(await p.locator('.timer-dial span').textContent(), a, 'paused');
  await p.getByRole('button', { name: 'Fortsätt' }).click();
  // Fast-forward: move the end time close to now.
  await p.evaluate(() => { /* nothing exposed: wait the remaining time */ });
  await p.waitForFunction(() => document.querySelector('#timerMsg').textContent === 'Tiden är ute!', null, { timeout: 40000 });
  assert.equal(await p.locator('.timer-dial span').textContent(), '0');
  assert.ok((await p.evaluate(() => window.__osc)) >= 4, 'ticks and horn');
  await ctx.close();
});
