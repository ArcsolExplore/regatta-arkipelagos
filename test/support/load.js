// Loads the classic browser scripts (logic.js, games-extra.js, games-more.js) into one
// Node vm context, the same way the browser shares top-level bindings between them.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GAME_FILES = ['public/logic.js', 'public/games-extra.js', 'public/games-more.js'];

/**
 * Runs the three files as one function body, so their top-level bindings are shared like
 * classic scripts. (A vm context would also work but runs game code ~7x slower.)
 * @param {{random?: () => number}} [opts]
 */
export function loadGames(opts = {}) {
  const module = { exports: {} };
  const math = Object.create(Math);
  if (opts.random) math.random = opts.random;
  const src = GAME_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const fn = vm.runInThisContext(`(function (module, Math, performance) {\n${src}\n})`, { filename: 'games-bundle.js' });
  fn(module, math, { now: () => 0 });
  return { G: module.exports.GAME_LOGIC, L: module.exports };
}

/** Evaluates an object literal assigned to `const NAME = { … };` in a source file. */
export function readObjectLiteral(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = src.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + src.slice(src.indexOf('{', start), end) + ')')));
}

/** Seeded generator (mulberry32) for bots and fuzzing. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
