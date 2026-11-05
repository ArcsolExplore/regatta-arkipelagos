/* Regatta Arkipelagos – livespel i rum: Startlinjen, Dragkampen och Sjöslaget.
   Alla är med på sina egna telefoner i samma rum. Servern (/api/room) håller ordning
   på lopp, lag och skott; klienten synkar klockan mot servern för rättvisa starter. */
(() => {
  'use strict';
  const API = '/api/room';
  const RA = () => window.RA;
  const h = (...a) => RA().h(...a);

  const LG = {
    start: {
      title: 'Startlinjen', flag: 'I', signal: 'Flagga I · tjuvstart kostar',
      pitch: 'Nedräkningen försvinner fyra sekunder före skottet. Tryck så nära skottet du vågar, men inte före.',
      rules: ['Alla ser samma nedräkning, synkad mot servern.', 'Vid fyra sekunder kvar släcks siffrorna. Räkna själv.', 'Tryck KÖR när du tror att skottet går. Före skottet är tjuvstart.', 'Närmast efter skottet vinner. Din bästa start sparas i topplistan.'],
      startLabel: 'Starta loppet', team: false,
    },
    drag: {
      title: 'Dragkampen', flag: 'Z', signal: 'Signal Z · jag behöver bogserbåt',
      pitch: 'Rött mot blått. Tryck så fort ni kan, knuten dras mot det lag som trycker mest per person.',
      rules: ['Delas upp i rött och blått lag. Byt lag innan start.', 'Tryck på DRA så snabbt du kan när det börjar.', 'Lagens tryck räknas per person, så olika stora lag blir rättvist.', 'Först att dra knuten hela vägen vinner. Annars leder laget när 40 sekunder gått.'],
      startLabel: 'Starta dragkampen', team: true,
    },
    sjo: {
      title: 'Sjöslaget', flag: 'B', signal: 'Signal B · farligt gods ombord',
      pitch: 'Lag mot lag på ett hemligt rutnät. Laget som har turen skjuter, en träff ger ett skott till.',
      rules: ['Två lag, var sin flotta på 8 × 8 rutor: ett fyrskepp, två treskepp och två tvåskepp.', 'Servern placerar flottorna. Ert lag ser bara sin egen.', 'Den som först trycker i ert lag skjuter. Prata ihop er.', 'Träff ger ett skott till. Sänk hela fiendeflottan för att vinna.'],
      startLabel: 'Starta sjöslaget', team: true,
    },
  };
  const TEAM = { red: 'Röda', blue: 'Blå' };
  const COLS = 'ABCDEFGH';

  const S = { code: null, pid: null, tok: null, room: null, offset: 0, bestRtt: Infinity, poll: 0, raf: 0, sig: '', pend: 0, flushing: false, myTap: null, saved: {}, gunFx: 0, busy: false };

  /* ---------- lagring av rum man är med i ---------- */
  const rooms = () => RA().LS.get('ra_rooms', {}) || {};
  function remember(code, pid, tok) {
    const all = rooms();
    all[code] = { pid, tok, at: Date.now() };
    for (const [c, v] of Object.entries(all)) if (!v || Date.now() - v.at > 3 * 3600e3) delete all[c];
    RA().LS.set('ra_rooms', all);
  }
  function forget(code) {
    const all = rooms();
    delete all[code];
    RA().LS.set('ra_rooms', all);
  }

  /* ---------- nät och klocka ---------- */
  const serverNow = () => Date.now() + S.offset;
  async function call(method, body) {
    const t0 = Date.now();
    const url = method === 'GET' ? `${API}?code=${S.code}&tok=${encodeURIComponent(S.tok || '')}&t=${t0}` : API;
    const res = await fetch(url, { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const t1 = Date.now();
    let data = null;
    try { data = await res.json(); } catch (e) { /* tomt */ }
    if (data && Number.isFinite(data.serverNow)) {
      // Den mätning som hade kortast tur och retur ger säkrast klockskillnad.
      const rtt = t1 - t0;
      if (rtt <= S.bestRtt * 1.2 || rtt < 120) {
        S.bestRtt = Math.min(S.bestRtt, rtt);
        S.offset = data.serverNow - (t0 + t1) / 2;
      }
    }
    if (data && data.room) setRoom(data.room);
    return { status: res.status, data };
  }
  const post = (action, extra) => call('POST', { action, code: S.code, tok: S.tok, ...extra });

  function explain(status, data) {
    const err = data && data.error;
    if (status === 503) return ['Livespelen är inte igång', 'Livespelen behöver den delade databasen (Upstash Redis i Vercel). När den är kopplad fungerar rummen direkt. Solospelen och bordet fungerar ändå.'];
    if (status === 404) return ['Rummet finns inte', 'Kontrollera koden. Ett rum stängs tre timmar efter att det skapats.'];
    if (err === 'room_full') return ['Rummet är fullt', 'Ett rum tar 24 spelare.'];
    if (err === 'need_teams') return ['Båda lagen behöver folk', 'Minst en spelare i rött och en i blått innan ni kan starta.'];
    return ['Något gick fel', 'Nätet svarade inte som det skulle. Försök igen om en stund.'];
  }
  function fail(status, data) {
    const [t, b] = explain(status, data);
    RA().toastSheet(t, b);
  }

  /* ---------- skapa, gå med, lämna ---------- */
  function withName(then) {
    if (RA().getName()) then();
    else RA().askName(then);
  }
  function create(game) {
    withName(async () => {
      if (S.busy) return;
      S.busy = true;
      try {
        const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', game, name: RA().getName() }) });
        let data = null;
        try { data = await res.json(); } catch (e) { /* tomt */ }
        if (res.status !== 200 || !data || !data.code) return fail(res.status, data);
        enter(data.code, data.pid, data.tok, data.room);
      } catch (e) {
        fail(0, null);
      } finally {
        S.busy = false;
      }
    });
  }
  function join(code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      RA().toastSheet('Fyra bokstäver', 'Rumskoden är fyra bokstäver, till exempel KLMR.');
      return;
    }
    withName(async () => {
      if (S.busy) return;
      S.busy = true;
      const known = rooms()[code];
      try {
        const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'join', code, name: RA().getName(), tok: known ? known.tok : undefined }) });
        let data = null;
        try { data = await res.json(); } catch (e) { /* tomt */ }
        if (res.status !== 200 || !data || !data.tok) return fail(res.status, data);
        enter(code, data.pid, data.tok, data.room);
      } catch (e) {
        fail(0, null);
      } finally {
        S.busy = false;
      }
    });
  }
  function enter(code, pid, tok, room) {
    Object.assign(S, { code, pid, tok, room: null, sig: '', myTap: null, pend: 0, bestRtt: Infinity });
    remember(code, pid, tok);
    if (location.hash !== '#rum-' + code) history.replaceState(null, '', '#rum-' + code);
    openOverlay();
    setRoom(room);
    schedule(0);
    tick();
  }
  function close() {
    clearTimeout(S.poll);
    cancelAnimationFrame(S.raf);
    S.code = null;
    S.room = null;
    $live.hidden = true;
    document.body.style.overflow = '';
    if (location.hash.startsWith('#rum-')) history.replaceState(null, '', '#spel');
    RA().renderAll(true);
  }
  async function leave() {
    const code = S.code;
    try { await post('leave'); } catch (e) { /* ok */ }
    forget(code);
    close();
  }

  /* ---------- överlägget ---------- */
  const $live = document.createElement('div');
  $live.id = 'live';
  $live.hidden = true;
  document.body.append($live);
  let $title, $codeChip, $body;
  function openOverlay() {
    $live.replaceChildren(
      h('div', { class: 'hud' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Stäng rummet', onclick: close }, '✕'),
        h('div', { class: 'hud-mid' }, ($title = h('div', { class: 'hud-title', text: 'Rum' })), h('div', { class: 'hud-sub', text: 'Live' })),
        ($codeChip = h('button', { class: 'chip code-chip', type: 'button', onclick: share }, S.code))),
      ($body = h('div', { class: 'live-body' })));
    $live.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  async function share() {
    const url = `${location.origin}/#rum-${S.code}`;
    const text = `Gå med i ${LG[S.room ? S.room.game : 'start'].title}: rumskod ${S.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Regatta Arkipelagos', text, url });
      else {
        await navigator.clipboard.writeText(url);
        RA().toastSheet('Länken är kopierad', url);
      }
    } catch (e) { /* avbrutet */ }
  }

  /* ---------- polling ---------- */
  function pollDelay() {
    const r = S.room;
    if (!r) return 1500;
    if (r.over) return 1500;
    if (r.game === 'drag') return 350;
    if (r.game === 'start') return serverNow() > r.gunAt - 1500 ? 600 : 1200;
    return 1100;
  }
  function schedule(ms) {
    clearTimeout(S.poll);
    S.poll = setTimeout(pollOnce, ms === undefined ? pollDelay() : ms);
  }
  async function pollOnce() {
    if (!S.code) return;
    try {
      if (S.room && S.room.game === 'drag' && !S.room.over && S.pend > 0) await flushPull();
      else {
        const { status } = await call('GET');
        if (status === 404) {
          forget(S.code);
          RA().toastSheet('Rummet har stängt', 'Rummet finns inte längre. Skapa ett nytt.');
          return close();
        }
      }
    } catch (e) { /* nätet borta en stund */ }
    if (S.code) schedule();
  }
  async function flushPull() {
    if (S.flushing || !S.pend) return;
    S.flushing = true;
    const n = Math.min(40, S.pend);
    S.pend -= n;
    try {
      const { status } = await post('pull', { race: S.room.race, n });
      if (status !== 200) S.pend += n;
    } catch (e) {
      S.pend += n;
    } finally {
      S.flushing = false;
    }
  }

  /* ---------- tillstånd och ritning ---------- */
  function setRoom(room) {
    if (!room || !S.code) return;
    const prev = S.room;
    if (prev && prev.race !== room.race) {
      S.myTap = null;
      S.pend = 0;
      S.gunFx = 0;
    }
    S.room = room;
    saveStartIfDone(room);
    const sig = JSON.stringify([room.race, room.over, room.players, room.results, room.shots && room.shots.length, room.winner, room.turn, room.me, S.myTap]);
    if (sig !== S.sig) {
      S.sig = sig;
      render();
    }
  }
  function saveStartIfDone(room) {
    if (room.game !== 'start' || !room.over || !room.race) return;
    const key = `${room.code}:${room.race}`;
    if (S.saved[key]) return;
    const mine = (room.results || []).find((r) => r.id === room.me);
    S.saved[key] = true;
    if (mine && !mine.ocs && Number.isFinite(mine.ms) && mine.ms >= 0 && mine.ms <= 5000) {
      RA().saveScore('start', RA().getName(), mine.ms, RA().round()).catch(() => {});
    }
  }

  function meP() {
    return S.room ? S.room.players.find((p) => p.id === S.room.me) : null;
  }
  function render() {
    const r = S.room;
    if (!r || !$body) return;
    const G = LG[r.game];
    $title.textContent = G.title;
    $codeChip.textContent = `Rum ${r.code}`;
    $codeChip.setAttribute('aria-label', `Rumskod ${r.code}. Dela länken.`);
    const live = r.race > 0 && !r.over;
    $body.replaceChildren(...(live ? renderLive(r) : renderLobby(r)));
  }

  function playersBlock(r) {
    const G = LG[r.game];
    const me = r.me;
    const item = (p) => h('li', { class: 'pl' + (p.id === me ? ' me' : '') }, h('span', { text: p.name }), p.id === me ? h('span', { class: 'tag', text: 'du' }) : null);
    if (!G.team) return h('ul', { class: 'pls' }, r.players.map(item));
    const col = (t) => h('div', { class: `team team-${t}` },
      h('h3', { text: `${TEAM[t]} lag · ${r.players.filter((p) => p.team === t).length}` }),
      h('ul', { class: 'pls' }, r.players.filter((p) => p.team === t).map(item)));
    return h('div', { class: 'teams' }, col('red'), col('blue'));
  }

  function renderLobby(r) {
    const G = LG[r.game];
    const out = [];
    out.push(h('div', { class: 'room-code' },
      h('span', { class: 'eyebrow', text: 'Rumskod' }),
      h('div', { class: 'big-code', text: r.code }),
      h('p', { class: 'note', text: 'De andra öppnar appen, går till Tillsammans och skriver koden. Eller dela länken.' }),
      h('button', { class: 'btn ghost small', type: 'button', onclick: share }, 'Dela länk')));
    if (r.race > 0) out.push(resultBlock(r));
    out.push(h('div', { class: 'section' }, h('h2', { text: `Spelare · ${r.players.length}` }), playersBlock(r)));
    const me = meP();
    const acts = h('div', { class: 'actions' });
    if (G.team && me) {
      acts.append(h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await post('team', { team: me.team === 'red' ? 'blue' : 'red' }); } }, `Byt till ${TEAM[me.team === 'red' ? 'blue' : 'red'].toLowerCase()}`));
    }
    const teamsOk = !G.team || (r.players.some((p) => p.team === 'red') && r.players.some((p) => p.team === 'blue'));
    const startBtn = h('button', { class: 'btn', type: 'button', disabled: !teamsOk, onclick: async () => {
      startBtn.disabled = true;
      unlockAudio();
      const { status, data } = await post('start', { expect: r.race });
      if (status !== 200) fail(status, data);
      startBtn.disabled = false;
    } }, r.race > 0 ? 'Nytt lopp' : G.startLabel);
    acts.prepend(startBtn);
    out.push(acts);
    if (!teamsOk) out.push(h('p', { class: 'note', text: 'Båda lagen behöver minst en spelare innan ni kan starta.' }));
    out.push(h('div', { class: 'section' }, h('h2', { text: 'Så spelar ni' }), h('ul', { class: 'how' }, G.rules.map((t, i) => h('li', null, h('b', { text: String(i + 1) }), h('span', { text: t }))))));
    out.push(h('button', { class: 'linkish', type: 'button', onclick: leave }, 'Lämna rummet'));
    return out;
  }

  function resultBlock(r) {
    if (r.game === 'start') {
      const res = (r.results || []).slice().sort((a, b) => (a.ocs ? 1 : 0) - (b.ocs ? 1 : 0) || (a.ocs ? b.ms - a.ms : a.ms - b.ms));
      const missing = r.players.filter((p) => !res.some((x) => x.id === p.id));
      return h('div', { class: 'section' },
        h('h2', { text: `Lopp ${r.race}` }),
        h('ol', { class: 'board' },
          res.map((x, i) => h('li', { class: 'row' + (x.id === r.me ? ' me' : '') },
            h('span', { class: 'rank', text: x.ocs ? '–' : String(i + 1) }),
            h('span', { class: 'who' }, h('span', { class: 'name', text: x.name })),
            h('span', { class: 'val', text: x.ocs ? 'Tjuvstart' : `+${fmt2(x.ms)} s` }))),
          missing.map((p) => h('li', { class: 'row' }, h('span', { class: 'rank', text: '–' }), h('span', { class: 'who' }, h('span', { class: 'name', text: p.name })), h('span', { class: 'val', text: 'Ingen start' })))));
    }
    const w = r.winner;
    const txt = w === 'lika' ? 'Oavgjort!' : w ? `${TEAM[w]} laget vann!` : '';
    const sub = r.game === 'drag' ? 'Knuten hamnade ' + (Math.abs(r.pos) >= 1 ? 'hela vägen över.' : 'närmast vinnarna när tiden tog slut.') : `Efter ${r.n} skott.`;
    return h('div', { class: `section winner win-${w || 'none'}` }, h('h2', { text: txt }), h('p', { class: 'note', text: sub }));
  }

  const fmt2 = (ms) => (ms / 1000).toFixed(2).replace('.', ',');

  /* ---------- Startlinjen ---------- */
  let $count, $countSub, $go, $mine;
  function renderLive(r) {
    if (r.game === 'start') {
      $count = h('div', { class: 'count', text: '' });
      $countSub = h('p', { class: 'count-sub', text: '' });
      $mine = h('div', { class: 'mine' });
      $go = h('button', { class: 'go', type: 'button', onpointerdown: tapStart }, 'KÖR!');
      if (S.myTap) showMyTap();
      const done = (r.results || []).length;
      return [h('div', { class: 'start-stage' }, $count, $countSub, $mine), $go, h('p', { class: 'note center', text: `${done} av ${r.players.length} har startat` })];
    }
    if (r.game === 'drag') return renderDrag(r);
    return renderSjo(r);
  }
  function tapStart(e) {
    e.preventDefault();
    if (S.myTap || !S.room) return;
    const at = serverNow();
    const ms = Math.round(at - S.room.gunAt);
    S.myTap = { ms, ocs: ms < 0 };
    RA().vibrate(ms < 0 ? [80, 60, 80] : 60);
    beep(ms < 0 ? 220 : 660, 0.12);
    showMyTap();
    post('tap', { race: S.room.race, at }).catch(() => {});
  }
  function showMyTap() {
    if (!$mine) return;
    const t = S.myTap;
    $mine.replaceChildren(h('div', { class: 'mine-val ' + (t.ocs ? 'bad' : 'good'), text: t.ocs ? 'TJUVSTART' : `+${fmt2(t.ms)} s` }), h('p', { class: 'note', text: t.ocs ? `Du tryckte ${fmt2(-t.ms)} s före skottet.` : 'efter skottet. Väntar på de andra…' }));
    if ($go) $go.disabled = true;
  }
  function tickStart(r) {
    const T = r.gunAt - serverNow();
    if (T > 4000) {
      $count.textContent = String(Math.ceil(T / 1000));
      $count.classList.remove('pang');
      $countSub.textContent = 'sekunder till start';
      $count.classList.remove('hidden-count');
    } else if (T > 0) {
      $count.textContent = '?';
      $countSub.textContent = 'Räkna själv…';
      $count.classList.add('hidden-count');
    } else {
      if (!S.gunFx) {
        S.gunFx = 1;
        beep(880, 0.25);
        RA().vibrate(120);
      }
      $count.textContent = 'PANG!';
      $count.classList.remove('hidden-count');
      $count.classList.add('pang');
      $countSub.textContent = S.myTap ? '' : 'Skottet har gått!';
    }
    $live.classList.toggle('flash', T <= 0 && T > -300);
  }

  /* ---------- Dragkampen ---------- */
  let $knot, $dragInfo, $dragCount, $pullBtn, $myTaps;
  function renderDrag(r) {
    const me = meP();
    const team = me ? me.team : 'red';
    $knot = h('i', { class: 'knot' });
    $dragCount = h('div', { class: 'count small-count' });
    $dragInfo = h('p', { class: 'note center' });
    $myTaps = h('span', { text: '0' });
    S.myTaps = 0;
    $pullBtn = h('button', { class: `go pull pull-${team}`, type: 'button', onpointerdown: (e) => {
      e.preventDefault();
      const rr = S.room;
      if (!rr || serverNow() < rr.startAt || rr.winner) return;
      S.pend++;
      S.myTaps++;
      $myTaps.textContent = String(S.myTaps);
      $pullBtn.classList.remove('bump');
      void $pullBtn.offsetWidth;
      $pullBtn.classList.add('bump');
    } }, h('span', { text: 'DRA!' }), h('small', null, 'dina drag ', $myTaps));
    return [
      h('div', { class: 'drag-stage' },
        h('div', { class: 'drag-teams' }, h('span', { class: 'red', text: `Röda · ${r.sizes ? r.sizes.red : 0}` }), h('span', { class: 'blue', text: `Blå · ${r.sizes ? r.sizes.blue : 0}` })),
        h('div', { class: 'rope' }, h('b', { class: 'goal goal-red' }), h('b', { class: 'goal goal-blue' }), $knot),
        $dragCount, $dragInfo),
      h('p', { class: 'note center', text: `Du drar för ${TEAM[team].toLowerCase()} laget` }),
      $pullBtn,
    ];
  }
  function tickDrag(r) {
    const now = serverNow();
    // Knuten: positivt läge betyder att rött leder och knuten dras åt vänster.
    $knot.style.left = `${50 - (r.pos || 0) * 46}%`;
    if (now < r.startAt) {
      $dragCount.textContent = String(Math.ceil((r.startAt - now) / 1000));
      $dragInfo.textContent = 'Gör er redo…';
    } else {
      const left = Math.max(0, r.endAt - now);
      $dragCount.textContent = r.winner ? (r.winner === 'lika' ? 'LIKA!' : `${TEAM[r.winner].toUpperCase()}!`) : 'DRA!';
      const pr = r.pull || { red: 0, blue: 0 };
      const per = (n, k) => (k ? n / k : 0).toFixed(1).replace('.', ',');
      $dragInfo.textContent = `${Math.ceil(left / 1000)} s kvar · per person: röda ${per(pr.red, r.sizes && r.sizes.red)}, blå ${per(pr.blue, r.sizes && r.sizes.blue)}`;
    }
  }

  /* ---------- Sjöslaget ---------- */
  function renderSjo(r) {
    const me = meP();
    const team = me ? me.team : 'red';
    const enemy = team === 'red' ? 'blue' : 'red';
    const N = r.size;
    const ours = r.turn === team;
    const myShots = r.shots.filter((s) => s.team === team);
    const theirShots = r.shots.filter((s) => s.team === enemy);
    const sunkEnemy = new Set((r.sunk[enemy] || []).flat());
    const myShips = r.ships[team] || [];
    const myShipCells = new Set(myShips.flat());
    const sunkMine = new Set((r.sunk[team] || []).flat());
    const last = r.shots[r.shots.length - 1];
    const cellName = (c) => `${COLS[c % N]}${Math.floor(c / N) + 1}`;
    const banner = h('div', { class: `turn ${ours ? 'ours' : 'theirs'} team-${r.turn}` },
      h('b', { text: ours ? 'Ert drag – skjut!' : `${TEAM[r.turn]} lagets tur` }),
      last ? h('span', { text: `${last.by || TEAM[last.team]} sköt ${cellName(last.cell)}: ${last.hit ? 'TRÄFF' : 'miss'}` }) : h('span', { text: `${TEAM[r.turn]} börjar` }));
    const grid = (cls, cellFn) => {
      const g = h('div', { class: `grid ${cls}`, style: `--n:${N}` });
      g.append(h('span', { class: 'lab' }));
      for (let x = 0; x < N; x++) g.append(h('span', { class: 'lab', text: COLS[x] }));
      for (let y = 0; y < N; y++) {
        g.append(h('span', { class: 'lab', text: String(y + 1) }));
        for (let x = 0; x < N; x++) g.append(cellFn(y * N + x));
      }
      return g;
    };
    const target = grid('target' + (ours ? ' armed' : ''), (c) => {
      const s = myShots.find((q) => q.cell === c);
      const cls = s ? (sunkEnemy.has(c) ? 'sunk' : s.hit ? 'hit' : 'miss') : '';
      const b = h('button', { class: `cell ${cls}`, type: 'button', 'aria-label': cellName(c), disabled: !!s || !ours });
      if (!s && ours) b.addEventListener('click', () => fire(c, b));
      return b;
    });
    const fleet = grid('fleet', (c) => {
      const s = theirShots.find((q) => q.cell === c);
      const ship = myShipCells.has(c);
      const cls = [ship ? 'ship' : '', s ? (s.hit ? (sunkMine.has(c) ? 'sunk' : 'hit') : 'miss') : ''].join(' ');
      return h('span', { class: `cell ${cls}` });
    });
    const left = (t) => r.fleet.length - (r.sunk[t] || []).length;
    return [
      banner,
      h('div', { class: 'sjo-head' }, h('h3', { text: 'Fiendens vatten' }), h('span', { class: 'note', text: `${left(enemy)} av ${r.fleet.length} skepp kvar` })),
      target,
      h('div', { class: 'sjo-head' }, h('h3', { text: `Vår flotta · ${TEAM[team].toLowerCase()} laget` }), h('span', { class: 'note', text: `${left(team)} av ${r.fleet.length} kvar` })),
      fleet,
    ];
  }
  async function fire(cell, btn) {
    if (!S.room || S.firing) return;
    S.firing = true;
    btn.classList.add('aim');
    try {
      const { data } = await post('fire', { race: S.room.race, n: S.room.n, cell });
      if (data && data.shot) {
        RA().vibrate(data.shot.hit ? [60, 40, 120] : 40);
        beep(data.shot.hit ? 180 : 520, data.shot.hit ? 0.3 : 0.1);
      }
    } catch (e) { /* nästa poll visar läget */ }
    S.firing = false;
  }

  /* ---------- animationsloop ---------- */
  function tick() {
    cancelAnimationFrame(S.raf);
    const step = () => {
      if (!S.code) return;
      const r = S.room;
      if (r && r.race > 0 && !r.over) {
        if (r.game === 'start' && $count) tickStart(r);
        if (r.game === 'drag' && $knot) tickDrag(r);
      }
      S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }

  /* ---------- ljud ---------- */
  let audio = null;
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(freq, dur) {
    try {
      if (!audio) return;
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq;
      o.type = 'square';
      g.gain.setValueAtTime(0.08, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch (e) { /* inget ljud */ }
  }
  document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  /* ---------- startsidans sektion ---------- */
  let section = null, codeIn = null, backSlot = null;
  function homeSection() {
    if (!section) {
      codeIn = h('input', { id: 'roomCode', type: 'text', maxlength: '4', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'KOD', 'aria-label': 'Rumskod', enterkeyhint: 'go' });
      codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
      codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(codeIn.value); });
      backSlot = h('div');
      section = h('div', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: 'Tillsammans' }), h('span', { class: 'eyebrow', text: 'Live' })),
        h('p', { class: 'note', text: 'En skapar ett rum, de andra går med med koden. Alla spelar samtidigt på sina egna telefoner.' }),
        h('div', { class: 'join' }, codeIn, h('button', { class: 'btn', type: 'button', onclick: () => join(codeIn.value) }, 'Gå med')),
        backSlot,
        h('div', { class: 'games live-games' }, Object.entries(LG).map(([id, g]) => h('article', { class: 'game' },
          h('div', { class: 'game-head' },
            h('span', { class: 'flag-wrap', svg: RA().flagSVG(g.flag, 54, 36) }),
            h('div', null, h('div', { class: 'signal', text: g.signal }), h('h3', { text: g.title }))),
          h('p', { text: g.pitch }),
          h('div', { class: 'game-foot' },
            h('span', { class: 'muted', text: g.team ? 'Lag mot lag · 2–24 spelare' : 'Alla mot alla · 2–24 spelare' }),
            h('button', { class: 'btn', type: 'button', onclick: () => create(id) }, 'Skapa rum'))))));
    }
    // Ett rum man nyss var med i går att komma tillbaka till.
    const recent = Object.entries(rooms()).filter(([, v]) => v && Date.now() - v.at < 3 * 3600e3).sort((a, b) => b[1].at - a[1].at)[0];
    backSlot.replaceChildren(recent ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => join(recent[0]) }, `Tillbaka till rum ${recent[0]}`) : '');
    return section;
  }

  window.Live = { homeSection, join, create, close, LG };

  // Länk med rumskod: #rum-ABCD öppnar rummet direkt.
  function fromHash() {
    const m = location.hash.match(/^#rum-([A-Za-z]{4})$/);
    if (m && S.code !== m[1].toUpperCase()) setTimeout(() => join(m[1]), 0);
  }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('load', fromHash);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.code) schedule(0);
  });
})();
