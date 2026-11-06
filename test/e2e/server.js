// Starts scripts/dev.mjs on a free port for browser tests.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { ROOT } from '../support/load.js';

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

export async function startServer(...flags) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/dev.mjs'), '--port', String(port), ...flags], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => {
    child.stdout.on('data', (d) => { if (/dev server/.test(String(d))) res(); });
    child.on('exit', (c) => rej(new Error('dev server exited ' + c)));
  });
  return { url: `http://localhost:${port}/`, stop: () => child.kill() };
}
