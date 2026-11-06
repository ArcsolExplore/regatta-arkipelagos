// Browser smoke test: every screen opens and every solo game runs for a moment without errors.
// Run: npm run e2e   (uses the Playwright that is installed with Chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Playwright is installed globally here (and with npm i --no-save in CI); require() finds both.
const { chromium } = createRequire(import.meta.url)('playwright');
import { startServer } from './server.js';

const GAMES = ['Kryssbanan', 'Skärslalom', 'Förtöj!', 'Förtöja 2', 'Navigatören', 'Fyrkaraktären', 'Kasta tamp', 'Grillmästaren', 'Måsattacken', 'Svallvågen', 'Lotsen i dimman'];
let browser, servers = [];
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); servers.forEach((s) => s.stop()); });

async function page(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto(url);
  await p.evaluate(() => localStorage.setItem('ra_name', JSON.stringify('Testare')));
  await p.reload();
  await p.waitForTimeout(400);
  return { p, errors, ctx };
}

for (const mode of ['store', 'nostore']) {
  test(`solo games run (${mode})`, { timeout: 120000 }, async () => {
    const srv = await startServer(...(mode === 'nostore' ? ['--nostore'] : []));
    servers.push(srv);
    const { p, errors, ctx } = await page(srv.url);
    for (const title of GAMES) {
      await p.locator('.game', { has: p.locator(`h3:text-is("${title}")`) }).getByRole('button', { name: /Spela/ }).click();
      await p.locator('#introPanel button', { hasText: 'Kör' }).click();
      const box = await p.locator('#cv').boundingBox();
      for (let i = 0; i < 12; i++) {
        await p.mouse.click(box.x + box.width * (0.2 + 0.6 * ((i * 37) % 10) / 10), box.y + box.height * (0.3 + 0.4 * ((i * 53) % 10) / 10));
        await p.waitForTimeout(80);
      }
      await p.locator('#quitBtn').click();
      await p.waitForTimeout(100);
      assert.deepEqual(errors, [], `${title} (${mode})`);
    }
    await ctx.close();
  });
}

test('Bordet, card deck and table games open', { timeout: 60000 }, async () => {
  const srv = await startServer(); servers.push(srv);
  const { p, errors, ctx } = await page(srv.url + '#kort');
  await p.waitForTimeout(300);
  assert.ok(await p.locator('#view-kort').isVisible());
  const btns = p.locator('#view-kort button');
  assert.ok((await btns.count()) > 3, 'deck has buttons');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('live lobby opens with the store', { timeout: 60000 }, async () => {
  const srv = await startServer(); servers.push(srv);
  const { p, errors, ctx } = await page(srv.url);
  const create = p.getByRole('button', { name: /Skapa rum|Starta rum|Skapa/ }).first();
  if (await create.count()) { await create.click(); await p.waitForTimeout(800); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('no Content-Security-Policy violations across screens', { timeout: 90000 }, async () => {
  const srv = await startServer(); servers.push(srv);
  const { p, errors, ctx } = await page(srv.url);
  await p.evaluate(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  for (const h of ['#topplista', '#kort', '#spel']) { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(300); }
  await p.locator('.game', { has: p.locator('h3:text-is("Navigatören")') }).getByRole('button', { name: /Spela/ }).click();
  await p.locator('#introPanel button', { hasText: 'Kör' }).click();
  await p.waitForTimeout(500);
  await p.locator('#quitBtn').click();
  const create = p.getByRole('button', { name: /Skapa rum|Starta rum|Skapa/ }).first();
  if (await create.count()) { await create.click(); await p.waitForTimeout(800); }
  const csp = await p.evaluate(() => window.__csp);
  assert.deepEqual(csp, []);
  assert.deepEqual(errors, []);
  await ctx.close();
});
