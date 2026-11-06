/* Regatta Arkipelagos – bordsspel på en telefon: Tickande sjömina och Pannkortet.
   Inget nät behövs. Allt körs på telefonen som skickas runt eller hålls mot pannan. */
(() => {
  'use strict';
  const RA = () => window.RA;
  const h = (...a) => RA().h(...a);

  /* ---------- ljud ---------- */
  let audio = null;
  function unlock() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state !== 'running') audio.resume(); // även iOS-läget 'interrupted'
    } catch (e) { audio = null; }
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function tone(freq, dur, type = 'square', vol = 0.08) {
    try {
      if (!audio) return;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch (e) { /* inget ljud */ }
  }
  function boom() {
    try {
      if (!audio) return;
      const len = audio.sampleRate * 1.2;
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      src.buffer = buf;
      f.type = 'lowpass';
      f.frequency.value = 600;
      g.gain.value = 0.6;
      src.connect(f).connect(g).connect(audio.destination);
      src.start();
    } catch (e) { /* inget ljud */ }
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- överlägget ---------- */
  const $t = document.createElement('div');
  $t.id = 'table';
  $t.hidden = true;
  document.body.append($t);
  let $title, $sub, $body, cleanup = null;
  function open(title) {
    unlock();
    $t.replaceChildren(
      h('div', { class: 'hud' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Stäng', onclick: close }, '✕'),
        h('div', { class: 'hud-mid' }, ($title = h('div', { class: 'hud-title', text: title })), ($sub = h('div', { class: 'hud-sub', text: 'Runt bordet' }))),
        h('div', { class: 'hud-main' })),
      ($body = h('div', { class: 'table-body' })));
    $t.hidden = false;
    document.body.style.overflow = 'hidden';
    requestWake();
  }
  function close() {
    P.run++; // en lutningsfråga som besvaras efter stängning startar ingen runda (R1-LIVE-12)
    if (cleanup) cleanup();
    cleanup = null;
    $t.hidden = true;
    $t.className = '';
    document.body.style.overflow = '';
    releaseWake();
  }
  // Skärmlåset släpps av webbläsaren när sidan göms; det begärs igen när den syns (R1-LIVE-8).
  let lock = null, lockTok = 0;
  async function requestWake() {
    const t = ++lockTok;
    try {
      if (!navigator.wakeLock || lock) return;
      const l = await navigator.wakeLock.request('screen');
      if (t !== lockTok || $t.hidden) { l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    } catch (e) { /* ok */ }
  }
  function releaseWake() {
    lockTok++;
    try { lock && lock.release(); } catch (e) { /* ok */ }
    lock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if ($t.hidden) return;
    if (document.visibilityState === 'visible') {
      unlock();
      requestWake();
    } else if (P.state === 'run') {
      pannaPause(true);
    }
  });

  /* =====================================================================
     TICKANDE SJÖMINA – säg ett ord i kategorin och skicka vidare innan det smäller.
     ===================================================================== */
  const M = { mode: 'kategori', fuse: 0, t0: 0, timer: 0, passes: 0, cat: '', letter: '', nextTick: 0, ended: false };
  function minaSetup() {
    if (cleanup) cleanup();
    cleanup = null;
    $t.className = '';
    $title.textContent = 'Tickande sjömina';
    $sub.textContent = 'Runt bordet, en telefon';
    const seg = h('div', { class: 'seg two', role: 'group', 'aria-label': 'Läge' },
      [['kategori', 'Kategori'], ['bokstav', 'Kategori + bokstav']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(M.mode === k), onclick: () => { M.mode = k; minaSetup(); } }, l)));
    $body.replaceChildren(
      h('div', { class: 'mine-art', svg: mineSVG(false) }),
      h('h1', { class: 'center', text: 'Tickande sjömina' }),
      h('ul', { class: 'how' },
        h('li', null, h('b', { text: '1' }), h('span', { text: 'Telefonen visar en kategori. Den som håller den säger något som passar.' })),
        h('li', null, h('b', { text: '2' }), h('span', { text: 'Tryck på Skicka vidare och ge telefonen till nästa person. Ingen får säga något som redan sagts.' })),
        h('li', null, h('b', { text: '3' }), h('span', { text: 'Stubinen är hemlig, mellan 20 och 60 sekunder. Den som håller minan när den smäller förlorar rundan.' }))),
      seg,
      h('button', { class: 'btn big', type: 'button', onclick: minaStart }, 'Tänd stubinen'));
  }
  function minaPrompt() {
    M.cat = pick(MINA_CATS);
    M.letter = M.mode === 'bokstav' ? pick(MINA_LETTERS) : '';
  }
  function minaStart() {
    unlock();
    M.fuse = 20000 + Math.random() * 40000;
    M.t0 = performance.now();
    M.passes = 0;
    M.ended = false;
    M.nextTick = 0;
    minaPrompt();
    $t.className = 'mina-run';
    const catEl = h('div', { class: 'mina-cat' });
    const passEl = h('span', { text: 'Skickad 0 gånger' });
    const art = h('div', { class: 'mine-art live', svg: mineSVG(true) });
    const paint = () => {
      catEl.replaceChildren(...[h('span', { text: M.cat }), M.letter ? h('b', { text: `som börjar på ${M.letter}` }) : null].filter(Boolean));
    };
    paint();
    $body.replaceChildren(
      art,
      catEl,
      h('button', { class: 'btn big pass-btn', type: 'button', onclick: () => {
        M.passes++;
        passEl.textContent = `Skickad ${plural(M.passes, 'gång', 'gånger')}`;
        tone(1200, 0.05, 'triangle', 0.06);
        RA().vibrate(20);
        if (M.letter) {
          M.letter = pick(MINA_LETTERS.filter((l) => l !== M.letter));
          paint();
        }
      } }, 'Skicka vidare'),
      h('p', { class: 'note center' }, passEl),
      h('button', { class: 'linkish center-block', type: 'button', onclick: () => { minaPrompt(); paint(); } }, 'Byt kategori'));
    const loop = () => {
      if (M.ended) return;
      const el = performance.now() - M.t0;
      if (el >= M.fuse) return minaBoom();
      // Tickandet går fortare mot slutet, men stubinens längd är okänd, så det avslöjar inte exakt när.
      const left = (M.fuse - el) / M.fuse;
      const iv = left < 0.08 ? 230 : left < 0.25 ? 480 : 950;
      if (el >= M.nextTick) {
        M.nextTick = el + iv;
        tone(left < 0.08 ? 1500 : 1000, 0.035, 'square', 0.05);
        art.classList.remove('beat');
        void art.offsetWidth;
        art.classList.add('beat');
      }
      M.timer = requestAnimationFrame(loop);
    };
    M.timer = requestAnimationFrame(loop);
    cleanup = () => {
      M.ended = true;
      cancelAnimationFrame(M.timer);
    };
  }
  function minaBoom() {
    M.ended = true;
    boom();
    RA().vibrate([400, 100, 400]);
    $t.className = 'mina-boom';
    $body.replaceChildren(
      h('div', { class: 'boom-word', text: 'BOOM!' }),
      h('p', { class: 'lede center', text: 'Den som håller telefonen förlorade rundan.' }),
      h('p', { class: 'note center', text: `Minan skickades ${plural(M.passes, 'gång', 'gånger')}. Sista kategorin: ${M.cat}${M.letter ? `, ${M.letter}` : ''}.` }),
      h('div', { class: 'actions center-actions' },
        h('button', { class: 'btn', type: 'button', onclick: minaStart }, 'Ny runda'),
        h('button', { class: 'btn ghost', type: 'button', onclick: minaSetup }, 'Inställningar')));
  }
  function mineSVG(lit) {
    const spikes = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const x1 = 60 + Math.cos(a) * 34, y1 = 64 + Math.sin(a) * 34, x2 = 60 + Math.cos(a) * 48, y2 = 64 + Math.sin(a) * 48;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2a2f35" stroke-width="7" stroke-linecap="round"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="5" fill="#2a2f35"/>`;
    }).join('');
    return `<svg viewBox="0 0 120 128" width="140" height="150" aria-hidden="true">${spikes}<circle cx="60" cy="64" r="38" fill="#3a4148"/><circle cx="48" cy="52" r="9" fill="rgba(255,255,255,.18)"/><path d="M60 26 C 64 14, 74 10, 82 8" stroke="#c9b48f" stroke-width="3" fill="none"/>${lit ? '<circle class="spark" cx="82" cy="8" r="6" fill="#ffb02e"/>' : ''}</svg>`;
  }

  /* =====================================================================
     PANNKORTET – telefonen mot pannan, laget beskriver. Fäll ner = rätt, upp = pass.
     ===================================================================== */
  const P = { deck: null, rule: false, order: {}, pos: {}, words: [], score: 0, t0: 0, dur: 60000, raf: 0, state: 'setup', armed: false, neutralT: 0, sensor: false, cool: 0, cur: '', ruleText: '', run: 0, pausedAt: 0 };
  function pannaSetup() {
    if (cleanup) cleanup();
    cleanup = null;
    $t.className = '';
    $title.textContent = 'Pannkortet';
    $sub.textContent = 'Runt bordet, en telefon';
    if (!P.deck) P.deck = PANNA_DECKS[0].id;
    const ruleBox = h('input', { type: 'checkbox', id: 'pannaRule' });
    ruleBox.checked = P.rule;
    ruleBox.addEventListener('change', () => { P.rule = ruleBox.checked; });
    $body.replaceChildren(
      h('h1', { class: 'center', text: 'Pannkortet' }),
      h('ul', { class: 'how' },
        h('li', null, h('b', { text: '1' }), h('span', { text: 'En håller telefonen mot pannan med skärmen utåt. De andra beskriver ordet som syns.' })),
        h('li', null, h('b', { text: '2' }), h('span', { text: 'Fäll telefonen nedåt när du gissat rätt. Fäll uppåt för att passa. Knapparna fungerar också.' })),
        h('li', null, h('b', { text: '3' }), h('span', { text: 'Gissa så många ord ni hinner på 60 sekunder.' }))),
      h('div', { class: 'cat-grid' }, PANNA_DECKS.map((d) => h('button', { class: 'cat' + (P.deck === d.id ? ' on' : ''), type: 'button', 'aria-pressed': String(P.deck === d.id), onclick: () => { P.deck = d.id; pannaSetup(); } },
        h('span', { svg: RA().flagSVG(d.flag, 36, 24) }), h('b', { text: d.name }), h('span', { text: `${d.words.length} ord` })))),
      h('label', { class: 'check', for: 'pannaRule' }, ruleBox, h('span', null, h('b', { text: 'Med kortregel' }), h('span', { class: 'muted', text: ': ett kort ur Begränsning bestämmer hur ni får beskriva' }))),
      h('button', { class: 'btn big', type: 'button', onclick: pannaStart }, 'Starta'));
  }
  function nextWord() {
    const d = PANNA_DECKS.find((x) => x.id === P.deck);
    if (!P.order[d.id] || P.pos[d.id] >= P.order[d.id].length) {
      P.order[d.id] = shuffle(d.words);
      P.pos[d.id] = 0;
    }
    P.cur = P.order[d.id][P.pos[d.id]++];
  }
  async function pannaStart() {
    unlock();
    const run = ++P.run;
    // iOS kräver att man ber om lov att läsa lutningen, och det måste ske i ett tryck.
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* knapparna fungerar ändå */ }
    if (run !== P.run || $t.hidden) return;
    P.words = [];
    P.score = 0;
    P.armed = false;
    P.neutralT = 0;
    P.sensor = false;
    P.cool = 0;
    P.ruleText = '';
    if (P.rule) {
      const cat = CARD_CATS.find((c) => c.id === 'begransning');
      const card = cat && pick(cat.cards.filter((c) => c.b));
      P.ruleText = card ? card.b : '';
    }
    P.state = 'ready';
    window.addEventListener('deviceorientation', onTilt);
    cleanup = () => {
      window.removeEventListener('deviceorientation', onTilt);
      cancelAnimationFrame(P.raf);
      P.state = 'setup';
    };
    $t.className = 'panna-run';
    const word = h('div', { class: 'panna-word', text: 'Mot pannan!' });
    const info = h('div', { class: 'panna-info', text: 'Skärmen utåt' });
    const ruleEl = P.ruleText ? h('div', { class: 'panna-rule', text: `Regel: ${P.ruleText}` }) : null;
    const pass = h('button', { class: 'panna-btn pass', type: 'button', onclick: () => answer(false) }, 'Pass');
    const ok = h('button', { class: 'panna-btn ok', type: 'button', onclick: () => answer(true) }, 'Rätt');
    const pauseBtn = h('button', { class: 'btn ghost small panna-pause', type: 'button', onclick: () => pannaPause(P.state === 'run') }, 'Paus');
    $body.replaceChildren(h('div', { class: 'panna' }, h('div', { class: 'panna-top' }, info, ruleEl, pauseBtn), word, h('div', { class: 'panna-btns' }, pass, ok)));
    P.els = { word, info, pauseBtn };
    const t0 = performance.now();
    let lastCount = 4;
    const loop = () => {
      const now = performance.now();
      if (P.state === 'ready') {
        const left = 3.5 - (now - t0) / 1000;
        const c = Math.ceil(left);
        if (c !== lastCount && c > 0) {
          lastCount = c;
          tone(700, 0.08);
          word.textContent = String(c);
        }
        if (left <= 0) {
          P.state = 'run';
          P.t0 = now;
          nextWord();
          showWord();
          tone(1000, 0.15);
        }
      } else if (P.state === 'paused') {
        // klockan står still medan rundan är pausad
      } else if (P.state === 'run') {
        const left = Math.max(0, P.dur - (now - P.t0));
        info.textContent = `${Math.ceil(left / 1000)} s · ${P.score} rätt`;
        if (left <= 0) return pannaEnd();
      }
      P.raf = requestAnimationFrame(loop);
    };
    P.raf = requestAnimationFrame(loop);
  }
  // Paus mitt i en runda (C6-7): klockan stannar, ordet döljs och lutningen räknas inte.
  function pannaPause(on) {
    if (!P.els || !P.els.pauseBtn) return;
    if (on && P.state === 'run') {
      P.state = 'paused';
      P.pausedAt = performance.now();
      P.els.word.textContent = 'Paus';
      P.els.info.textContent = 'Rundan är pausad';
      P.els.pauseBtn.textContent = 'Fortsätt';
    } else if (!on && P.state === 'paused') {
      P.t0 += performance.now() - P.pausedAt;
      P.state = 'run';
      P.armed = false;
      P.els.pauseBtn.textContent = 'Paus';
      showWord();
    }
  }
  // Lutningen: z-komponenten av "uppåt" i telefonens koordinater. Skärmen rakt ut = 0,
  // skärmen mot golvet = −1 (rätt), skärmen mot taket = +1 (pass). Fungerar åt alla håll telefonen vänds.
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    P.sensor = true;
    if (P.state !== 'run') return;
    const gz = Math.cos((e.beta * Math.PI) / 180) * Math.cos((e.gamma * Math.PI) / 180);
    const now = performance.now();
    if (Math.abs(gz) < 0.35) {
      if (!P.neutralT) P.neutralT = now;
      if (now - P.neutralT > 150) P.armed = true;
      return;
    }
    P.neutralT = 0;
    if (!P.armed || now < P.cool) return;
    if (gz < -0.6) answer(true);
    else if (gz > 0.6) answer(false);
  }
  function answer(right) {
    if (P.state !== 'run') return;
    P.armed = false;
    P.cool = performance.now() + 450;
    P.words.push({ w: P.cur, ok: right });
    if (right) P.score++;
    tone(right ? 1320 : 330, right ? 0.18 : 0.22, right ? 'triangle' : 'sawtooth', 0.08);
    RA().vibrate(right ? 40 : [30, 40, 30]);
    $t.classList.remove('flash-ok', 'flash-pass');
    void $t.offsetWidth;
    $t.classList.add(right ? 'flash-ok' : 'flash-pass');
    nextWord();
    showWord();
  }
  // Ordet ska rymmas på en rad även på en smal skärm; långa ord får mindre text.
  function showWord() {
    const longest = Math.max(...P.cur.split(/\s+/).map((w) => w.length), 4);
    P.els.word.style.fontSize = `min(16vmin + 40px, ${Math.floor(150 / longest)}vw, ${Math.floor(260 / longest)}vh)`;
    P.els.word.textContent = P.cur;
  }
  function pannaEnd() {
    if (cleanup) cleanup();
    cleanup = null;
    tone(440, 0.5, 'triangle');
    RA().vibrate([200, 80, 200]);
    $t.className = '';
    const d = PANNA_DECKS.find((x) => x.id === P.deck);
    $body.replaceChildren(
      h('span', { class: 'eyebrow center-block', text: d.name }),
      h('div', { class: 'boom-word ok', text: `${P.score} rätt` }),
      h('p', { class: 'note center', text: P.sensor ? 'Tiden är ute.' : 'Tiden är ute. Telefonen kände ingen lutning, så knapparna gällde.' }),
      h('ol', { class: 'board' }, P.words.map((x, i) => h('li', { class: 'row' },
        h('span', { class: 'rank', text: String(i + 1) }),
        h('span', { class: 'who' }, h('span', { class: 'name', text: x.w })),
        h('span', { class: 'val ' + (x.ok ? 'good' : 'bad'), text: x.ok ? 'Rätt' : 'Pass' })))),
      h('div', { class: 'actions center-actions' },
        h('button', { class: 'btn', type: 'button', onclick: pannaStart }, 'Nästa person'),
        h('button', { class: 'btn ghost', type: 'button', onclick: pannaSetup }, 'Byt tema')));
  }

  /* ---------- Bordets sektion ---------- */
  function section() {
    const card = (title, flag, text, onclick, btn) => h('article', { class: 'game' },
      h('div', { class: 'game-head' }, h('span', { class: 'flag-wrap', svg: RA().flagSVG(flag, 54, 36) }), h('div', null, h('div', { class: 'signal', text: 'En telefon, hela bordet' }), h('h3', { text: title }))),
      h('p', { text }),
      h('div', { class: 'game-foot' }, h('span'), h('button', { class: 'btn', type: 'button', onclick }, btn)));
    return h('div', { class: 'section' },
      h('div', { class: 'games' },
        card('Tickande sjömina', 'W', 'Säg något i kategorin och skicka vidare. Stubinen är hemlig, och den som håller minan när den smäller förlorar.', () => { open('Tickande sjömina'); minaSetup(); }, 'Spela'),
        card('Pannkortet', 'C', 'Telefonen mot pannan, laget beskriver. Fäll ner för rätt, upp för pass. Sextio sekunder per person.', () => { open('Pannkortet'); pannaSetup(); }, 'Spela')));
  }

  window.Table = { section, close };
})();
