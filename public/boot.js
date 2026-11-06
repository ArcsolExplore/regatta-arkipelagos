/* Regatta Arkipelagos – laddas först: fångar fel och skickar dem anonymt till /api/log. */
(() => {
  'use strict';
  const seen = new Set();
  let sent = 0, dead = false;
  const clean = (s) => String(s || '').replace(/#rum-[A-Z]+/g, '#rum-…').replace(/tok=[\w-]+/g, 'tok=…');
  function report(r) {
    if (dead || sent >= 5) return;
    const err = r.err || {};
    const msg = String(r.msg || err.message || err).slice(0, 300);
    const key = r.kind + ':' + msg;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    const body = {
      kind: r.kind, game: r.game, phase: r.phase, msg: clean(msg),
      stack: clean(String(err.stack || r.stack || '').slice(0, 1500)),
      path: clean(location.pathname + location.hash), ua: navigator.userAgent.slice(0, 120),
    };
    try {
      fetch('/api/log', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then((res) => { if (res.status === 404) dead = true; }, () => {});
    } catch (e) { /* inget nät */ }
  }
  window.RA_REPORT = report;
  window.addEventListener('error', (e) => {
    // Bara fel från appens egna filer (inte tillägg i webbläsaren).
    if (e.filename && !e.filename.startsWith(location.origin)) return;
    report({ kind: 'window', msg: e.message, err: e.error, stack: e.filename + ':' + e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => report({ kind: 'promise', err: e.reason }));
  // Startade appen aldrig (t.ex. ett skript som inte laddades)? Visa det i stället för en tom sida.
  setTimeout(() => {
    if (window.__raBooted) return;
    report({ kind: 'boot', msg: 'app did not boot' });
    const d = document.createElement('div');
    d.className = 'bootfail';
    d.innerHTML = '<p><b>Appen kunde inte starta.</b></p><p>Kontrollera nätet och ladda om sidan.</p>';
    const b = document.createElement('button');
    b.className = 'btn'; b.type = 'button'; b.textContent = 'Ladda om';
    b.addEventListener('click', () => location.reload());
    d.append(b);
    document.body.append(d);
  }, 10000);
})();
