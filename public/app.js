/* Regatta Arkipelagos – appen: vyer, topplista, spelmotor och kortlek. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const API = '/api/state';
  const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
  const DEFAULT_SEED = 74011;

  /* ---------- små hjälpare ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'svg') el.innerHTML = v; // endast egna, statiska flagg-SVG:er
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const LS = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) { /* privat läge */ }
    },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Samma städning av namn som servern gör (api/_shared.js), så att namnen alltid matchar.
  function cleanName(n) {
    if (typeof n !== 'string') return '';
    const s = n.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}<>]/gu, '').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, 20).join('').trim();
  }
  function slug(n) {
    // Skiftläge och mellanrum spelar ingen roll, men å, ä och ö skiljer namn åt (Åsa är inte Asa).
    return String(n).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spelare';
  }
  function vibrate(ms) {
    try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* stöds inte */ }
  }

  /* ---------- signalflaggor ---------- */
  const FC = { r: '#d7323b', y: '#f5c225', b: '#2a64c4', w: '#f4f4f0', k: '#131a21' };
  function flagSVG(code, w = 42, h = 28) {
    const R = (x, y, ww, hh, c) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${c}"/>`;
    const P = (pts, c) => `<polygon points="${pts}" fill="${c}"/>`;
    const swallow = `0,0 ${w},0 ${w * 0.72},${h / 2} ${w},${h} 0,${h}`;
    let outline = `0,0 ${w},0 ${w},${h} 0,${h}`;
    let s = '';
    switch (code) {
      case 'A': s = P(swallow, FC.b) + R(0, 0, w / 2, h, FC.w); outline = swallow; break;
      case 'B': s = P(swallow, FC.r); outline = swallow; break;
      case 'D': s = R(0, 0, w, h, FC.y) + R(0, h / 4, w, h / 2, FC.b); break;
      case 'C': [FC.b, FC.w, FC.r, FC.w, FC.b].forEach((c, i) => { s += R(0, (i * h) / 5, w, h / 5 + 0.2, c); }); break;
      case 'G': for (let i = 0; i < 6; i++) s += R((i * w) / 6, 0, w / 6 + 0.2, h, i % 2 ? FC.b : FC.y); break;
      case 'H': s = R(0, 0, w / 2, h, FC.w) + R(w / 2, 0, w / 2, h, FC.r); break;
      case 'O': s = P(`0,0 ${w},0 ${w},${h}`, FC.r) + P(`0,0 ${w},${h} 0,${h}`, FC.y); break;
      case 'I': s = R(0, 0, w, h, FC.y) + `<circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.28}" fill="${FC.k}"/>`; break;
      case 'J': s = R(0, 0, w, h, FC.b) + R(0, h / 3, w, h / 3, FC.w); break;
      case 'K': s = R(0, 0, w / 2, h, FC.y) + R(w / 2, 0, w / 2, h, FC.b); break;
      case 'L': s = R(0, 0, w / 2, h / 2, FC.y) + R(w / 2, 0, w / 2, h / 2, FC.k) + R(0, h / 2, w / 2, h / 2, FC.k) + R(w / 2, h / 2, w / 2, h / 2, FC.y); break;
      case 'N': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += R((i * w) / 4, (j * h) / 4, w / 4 + 0.2, h / 4 + 0.2, (i + j) % 2 ? FC.w : FC.b); break;
      case 'P': s = R(0, 0, w, h, FC.b) + R(w / 3, h / 3, w / 3, h / 3, FC.w); break;
      case 'R': s = R(0, 0, w, h, FC.r) + R(w / 2 - h / 10, 0, h / 5, h, FC.y) + R(0, h / 2 - h / 10, w, h / 5, FC.y); break;
      case 'S': s = R(0, 0, w, h, FC.w) + R(w / 3, h / 3, w / 3, h / 3, FC.b); break;
      case 'T': s = R(0, 0, w / 3 + 0.2, h, FC.r) + R(w / 3, 0, w / 3 + 0.2, h, FC.w) + R((2 * w) / 3, 0, w / 3, h, FC.b); break;
      case 'U': s = R(0, 0, w / 2, h / 2, FC.r) + R(w / 2, 0, w / 2, h / 2, FC.w) + R(0, h / 2, w / 2, h / 2, FC.w) + R(w / 2, h / 2, w / 2, h / 2, FC.r); break;
      case 'W': s = R(0, 0, w, h, FC.b) + R(w * 0.17, h * 0.17, w * 0.66, h * 0.66, FC.w) + R(w * 0.34, h * 0.34, w * 0.32, h * 0.32, FC.r); break;
      case 'Z': s = P(`0,0 ${w},0 ${w / 2},${h / 2}`, FC.y) + P(`0,0 ${w / 2},${h / 2} 0,${h}`, FC.k) + P(`0,${h} ${w / 2},${h / 2} ${w},${h}`, FC.b) + P(`${w},0 ${w},${h} ${w / 2},${h / 2}`, FC.r); break;
      default: s = R(0, 0, w, h, FC.w);
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${s}<polygon points="${outline}" fill="none" stroke="rgba(18,50,77,.6)" stroke-width="1.4"/></svg>`;
  }
  $('#brandFlags').innerHTML = flagSVG('R', 30, 20) + flagSVG('A', 30, 20);

  /* ---------- spelens metadata ---------- */
  const GAMES = {
    kryss: {
      ...GAME_LOGIC.kryss,
      title: 'Kryssbanan', flag: 'P', signal: 'Signal P: förberedelsesignal i kappsegling',
      unit: 'time', better: 'low',
      pitch: 'Kryssa upp till bojen, runda den och länsa hem i mål. Snabbast tid vinner.',
      how: [
        ['◀ ▶', 'Styr båten. Rakt mot vinden står du still, så kryssa i sicksack.'],
        ['Skot', 'Dra reglaget. Fladdrar seglet: skota hem. Går båten trögt: fira på skotet. Trimmätaren visar hur bra det sitter.'],
        ['SLAG', 'Tryck i samma stund som du vänder genom vinden. Perfekt tajmat ger en rejäl fartökning. Trycker du för tidigt låses knappen en kort stund.'],
        ['Banan', 'Korsa linjen uppåt, runda den orange bojen och korsa linjen igen. Efter fem minuter på banan är tiden ute.'],
      ],
    },
    slalom: {
      ...GAME_LOGIC.slalom,
      title: 'Skärslalom', flag: 'U', signal: 'Signal U: ni står i begrepp att råka i fara',
      unit: 'points', better: 'high',
      pitch: 'Full gas mellan skären. Farten ökar hela tiden, och gula bojar ger bonus.',
      how: [
        ['◀ ▶', 'Håll knapparna, eller tryck på vänster och höger halva av vattnet, för att styra.'],
        ['Undvik', 'Skär och land. En träff och försöket är slut.'],
        ['Bojar', 'Gula bojar ger 25 poäng extra. Varje meter ger en poäng.'],
      ],
    },
    fortoj: {
      ...GAME_LOGIC.fortoj,
      title: 'Förtöj!', flag: 'S', signal: 'Signal S: jag backar med maskin',
      unit: 'points', better: 'high',
      pitch: 'Fem angöringar mot bryggan. Backa i rätt ögonblick och stanna så nära du vågar.',
      how: [
        ['BACKA', 'Håll inne för att backa. Angöringen är klar när båten nuddar bryggan eller står still.'],
        ['Poäng', '100 poäng för en mjuk angöring. Varje decimeter kvar till bryggan kostar en poäng.'],
        ['Krasch', 'Kommer du in för fort blir det noll.'],
        ['Vind', 'Medvind och motvind ändrar hur långt båten glider.'],
      ],
    },
    parkera: {
      ...GAME_LOGIC.parkera,
      title: 'Hamnmanövern', flag: 'D', signal: 'Signal D: håll undan, jag manövrerar med svårighet',
      unit: 'time', better: 'low',
      pitch: 'Fem hamnmanövrar i olika vind: långsides, förut in, backa in och fler. Snabbast tid vinner, men en enda kontakt underkänner försöket.',
      how: [
        ['Roder', 'Dra längs linjen till vänster. Ratten vrider drevet och styr både framåt och bakåt, men bara när båten rör sig eller du ger gas. Den stannar där du släpper.'],
        ['Gas', 'Spaken till höger: uppåt är fram, nedåt är back, mitten är neutral. Båten är tung, så börja bromsa i god tid. En kort gasstöt med ratten ute svänger aktern.'],
        ['Vind', 'Samma vindriktning hela försöket, men det blåser mer för varje manöver. Vinden driver båten i sidled och vrider fören, mest när du står still.'],
        ['Förtöj', 'Lägg hela båten i den gula rutan, rätt vänd och i låg fart. Då går tamparna i land och drar in den. Rör du brygga eller båt är försöket underkänt.'],
      ],
    },
    navigator: {
      ...GAME_LOGIC.navigator,
      title: 'Navigatören', flag: 'N', signal: 'Signal N: nej',
      unit: 'time', better: 'low',
      pitch: 'Rita rutten på sjökortet förbi märke 1 och 2 och in i hamn. Snabb penna och kort rutt vinner.',
      how: [
        ['Rita', 'Dra med fingret från båten. Rutten måste passera genom ringen runt märke 1, sedan märke 2, och sluta i hamnen.'],
        ['Tiden', 'Klockan går medan du ritar. Till det läggs tiden båten behöver till sjöss, så en kort rutt lönar sig. Efter tre minuter är tiden ute.'],
        ['Grund', 'Gula öar och streckade grund är förbjudna. Om linjen nuddar dem tar draget slut och du får 3 sekunder extra.'],
        ['Ångra', 'Tar bort senaste draget. Fortsätt rita från linjens slut.'],
      ],
    },
    fyr: {
      ...GAME_LOGIC.fyr,
      title: 'Fyrkaraktären', flag: 'L', signal: 'Signal L: stoppa genast',
      unit: 'points', better: 'high',
      pitch: 'Fyren blinkar sin karaktär. Blinka tillbaka exakt samma rytm. Tio fyrar, tre liv.',
      how: [
        ['Titta', 'Fyren visar sin karaktär två gånger, med en förenklad beteckning som på sjökortet.'],
        ['Blinka', 'Håll knappen, eller var som helst på skärmen, så länge ljuset ska lysa. Kort och lång blixt måste stämma.'],
        ['Rytm', 'Pauserna räknas också. Ju närmare fyrens takt, desto fler poäng, upp till 100 per fyr.'],
        ['Liv', 'Fel antal blixtar, fel rytm eller ingen blixt inom sex sekunder kostar ett liv. Tre liv per försök.'],
      ],
    },
    tamp: {
      ...GAME_LOGIC.tamp,
      title: 'Kasta tamp', flag: 'T', signal: 'Signal T: håll undan för mig',
      unit: 'points', better: 'high',
      pitch: 'Fem kast med förtöjningstampen mot pollaren på bryggan. Vinden tar tag i öglan.',
      how: [
        ['Svep', 'Dra fingret uppåt och släpp. Ju snabbare svep, desto längre kast. Sned riktning ger sned kast. Kastar du inte inom 20 sekunder räknas kastet som missat.'],
        ['Vind', 'Vimpeln och texten visar vinden. Sikta lite mot vinden så driver öglan in.'],
        ['Poäng', 'Öglan runt pollaren ger 100. Annars färre poäng ju längre bort. I vattnet blir det noll.'],
      ],
    },
    grill: {
      ...GAME_LOGIC.grill,
      title: 'Grillmästaren', flag: 'G', signal: 'Signal G: jag behöver lots',
      unit: 'points', better: 'high',
      pitch: 'Sextio sekunder vid klippgrillen. Vänd i rätt stund och servera perfekt grillat på båda sidor.',
      how: [
        ['Vänd', 'Tryck på maten. Kanten visar undersidan, ytan visar ovansidan.'],
        ['Servera', 'Håll kvar tills ringen är full. Båda sidor perfekta ger 100 poäng, och perfekta i rad ger bonus.'],
        ['Värme', 'Lågorna under varje plats visar hur varmt det är. Brinner det för länge blir det minuspoäng.'],
      ],
    },
    mas: {
      ...GAME_LOGIC.mas,
      title: 'Måsattacken', flag: 'A', signal: 'Signal A: jag har dykare nere, håll undan',
      unit: 'points', better: 'high',
      pitch: 'Måsarna vill åt räksmörgåsen. Tryck eller svep bort dem i sextio sekunder, och spara så många räkor du kan.',
      how: [
        ['Schas', 'Tryck på en mås eller svep över den. Flera i snabb följd ger upp till fyra gånger poängen.'],
        ['Truten', 'Den stora mörka truten behöver två tryck. Dykande måsar kommer snabbt och rakt.'],
        ['Räkorna', 'Når en mås smörgåsen tar den en räka. Varje räka kvar när tiden är slut ger 25 poäng. Tar alla tio slut är försöket över.'],
      ],
    },
    svall: {
      ...GAME_LOGIC.svall,
      title: 'Svallvågen', flag: 'O', signal: 'Signal O: man över bord',
      unit: 'points', better: 'high',
      pitch: 'Waxholmsbåten och taxibåtarna passerar. Luta telefonen så att kaffekoppen står kvar på bordet.',
      how: [
        ['Luta', 'Telefonen är bordet. Luta mot svallet så att bordet hålls plant. Utan lutningssensor: dra med fingret som en spak.'],
        ['Svall', 'En gul pil visar varifrån nästa svall kommer. Vattenpasset nere till vänster visar hur bordet lutar just nu.'],
        ['Kaffe', 'Ryck och smällar i kanten spiller. Slår koppen i för hårt välter den. Poängen räknas på hur mycket kaffe du har kvar, sekund för sekund.'],
      ],
    },
    lots: {
      ...GAME_LOGIC.lots,
      title: 'Lotsen i dimman', flag: 'H', signal: 'Signal H: jag har lots ombord',
      unit: 'time', better: 'low',
      pitch: 'Fyra sekunder att memorera farleden, sedan kommer dimman. Lys efter märkena och lotsa båten fram till fyren.',
      how: [
        ['Minns', 'Kartan syns i fyra sekunder. Ta in skären och vägen förbi märke 1 och 2 till fyren.'],
        ['◀ ▶', 'Båten går med jämn fart. Du styr bara. Märkena blinkar genom dimman: rött en gång, grönt två gånger.'],
        ['TUTA', 'Mistluren lättar dimman en kort stund men kostar 2 sekunder.'],
        ['Grund', 'Skrovet mot sten ger 5 sekunder extra, och båten backas en bit. Efter tre minuter är tiden ute.'],
      ],
    },
    // Startlinjen spelas live i ett rum; här finns bara det som topplistan behöver.
    start: {
      id: 'start', title: 'Startlinjen', flag: 'P', unit: 'ms', better: 'low', live: true,
    },
  };
  // Regattan räknar de elva solospelen. Startlinjen har en egen lista men ger inga Regatta-poäng.
  const GAME_ORDER = ['kryss', 'slalom', 'fortoj', 'parkera', 'navigator', 'fyr', 'tamp', 'grill', 'mas', 'svall', 'lots'];
  const BOARD_ORDER = [...GAME_ORDER, 'start'];
  const isBetter = (g, a, b) => (GAMES[g].better === 'low' ? a < b : a > b);
  // Samma gränser som servern. Ett resultat utanför dem sparas aldrig, varken där eller här.
  const RANGE = {
    kryss: [3000, 900000], slalom: [0, 200000], fortoj: [0, 500], parkera: [5000, 1800000],
    navigator: [3000, 1200000], fyr: [0, 1000], tamp: [0, 500], grill: [0, 6000], start: [0, 5000],
    mas: [0, 10000], svall: [0, 1000], lots: [5000, 900000],
  };
  const inRange = (g, v) => Number.isFinite(v) && ((g === 'parkera' && v === PK.DNF) || (RANGE[g] && v >= RANGE[g][0] && v <= RANGE[g][1]));
  // Ett underkänt försök sparas som en tid som alltid är sämst, så det aldrig slår en giltig tid.
  const isDnf = (g, v) => g === 'parkera' && v >= PK.DNF;
  const fmtScore = (g, v) => (isDnf(g, v) ? 'Underkänd' : GAMES[g].unit === 'time' ? fmtTime(v) : GAMES[g].unit === 'ms' ? `+${fmtNum(v / 1000, 2)} s` : `${v} p`);
  const validRec = (r) => r && typeof r.name === 'string' && r.name.trim().length > 0 && r.name.length <= 24 && GAMES[r.game] && inRange(r.game, r.score);

  /* ---------- namn ---------- */
  const getName = () => {
    const n = LS.get('ra_name', '');
    return typeof n === 'string' ? n : '';
  };
  const setName = (n) => LS.set('ra_name', n);

  /* =====================================================================
     DATA: delad topplista via /api/state, annars lokalt på telefonen.
     ===================================================================== */
  const Sync = {
    mode: 'connecting', // connecting | shared | offline | local
    round: { n: 1, seed: DEFAULT_SEED, startedAt: null },
    shared: [],
    local: LS.get('ra_local', { round: { n: 1, seed: DEFAULT_SEED, startedAt: null }, scores: [] }),
    lastShared: 0,
    polling: false,
    everShared: false, // har den gemensamma listan svarat någon gång under det här besöket?
  };
  // Senast kända gemensamma omgång. Startar appen utan nät spelar man vidare på den (R1-APP-1).
  const SHARED_CACHE_MS = 12 * 3600e3;
  {
    const c = LS.get('ra_shared_cache', null);
    if (c && c.round && Number.isInteger(c.round.n) && Date.now() - c.at < SHARED_CACHE_MS) {
      Sync.round = { n: c.round.n, seed: c.round.seed >>> 0, startedAt: c.round.startedAt || null };
      Sync.cached = true;
    }
  }
  // Lokala omgångar har fasta banor, så två telefoner på samma lokala omgång seglar samma bana.
  const localSeed = (n) => (n === 1 ? DEFAULT_SEED : hashStr('omgang:' + n) >>> 0);
  if (!Sync.local || !Array.isArray(Sync.local.scores) || !Sync.local.round) {
    Sync.local = { round: { n: 1, seed: DEFAULT_SEED, startedAt: null }, scores: [] };
  }
  const persistLocal = () => LS.set('ra_local', Sync.local);
  // Rensa bort sparade resultat som servern aldrig skulle godta (t.ex. från en äldre version).
  {
    const before = Sync.local.scores.length;
    Sync.local.scores = Sync.local.scores.filter(validRec);
    if (Sync.local.scores.length !== before) persistLocal();
  }

  function allScores() {
    const n = Sync.round.n;
    if (Sync.mode === 'local') {
      return Sync.local.scores.filter((r) => r.round === n && r.src === 'local' && validRec(r));
    }
    const map = new Map();
    for (const r of Sync.shared) if (validRec(r)) map.set(r.game + ':' + slug(r.name), { ...r });
    for (const r of Sync.local.scores) {
      if (r.src !== 'pending' || r.round !== n || !validRec(r)) continue;
      const k = r.game + ':' + slug(r.name);
      const p = map.get(k);
      if (!p || isBetter(r.game, r.score, p.score)) map.set(k, { ...r, pending: true });
    }
    return [...map.values()];
  }

  // Varje anrop får en tidsgräns: ett svar som aldrig kommer får inte frysa topplistan.
  let reqSeq = 0, writeSeq = 0;
  async function api(method, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), method === 'GET' ? 8000 : 10000);
    const seq = ++reqSeq;
    try {
      const res = await fetch(API + (method === 'GET' ? '?t=' + Date.now() : ''), {
        method,
        cache: 'no-store',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* tomt svar */ }
      if (method !== 'GET' && res.ok) writeSeq = seq;
      return { status: res.status, data, seq };
    } finally {
      clearTimeout(timer);
    }
  }

  function applyState(data) {
    if (!data || !data.round) return;
    Sync.everShared = true;
    LS.set('ra_shared_cache', { round: data.round, at: Date.now() });
    const prevN = Sync.round.n;
    Sync.round = { n: data.round.n | 0 || 1, seed: data.round.seed >>> 0 || DEFAULT_SEED, startedAt: data.round.startedAt || null };
    Sync.shared = Array.isArray(data.scores) ? data.scores.filter(validRec) : [];
    Sync.lastShared = Date.now();
    if (prevN !== Sync.round.n) {
      // Väntande resultat från en gammal omgång gäller inte längre.
      Sync.local.scores = Sync.local.scores.filter((r) => r.src !== 'pending' || r.round === Sync.round.n);
      persistLocal();
    }
  }

  async function poll() {
    if (Sync.polling) return;
    Sync.polling = true;
    try {
      const { status, data, seq } = await api('GET');
      if (status === 200 && data) {
        Sync.mode = 'shared';
        // Ett långsamt svar som skickades före en sparning får inte skriva över det nya (R1-APP-9).
        if (seq > writeSeq) applyState(data);
        // Skicka väntande resultat varje gång servern svarar, inte bara när nätet kommer tillbaka.
        if (Sync.local.scores.some((r) => r.src === 'pending')) await flushPending();
      } else if (status === 503 && data && data.error === 'no_store' && !Sync.everShared && !Sync.cached) {
        // Servern säger själv att det inte finns någon gemensam lista: då är appen lokal på riktigt.
        goLocal();
      } else {
        netDown();
      }
    } catch (e) {
      netDown();
    } finally {
      Sync.polling = false;
      renderAll();
    }
  }
  function goLocal() {
    Sync.mode = 'local';
    Sync.round = Sync.local.round;
  }
  // Nätet eller servern svarar inte. Har vi sett den gemensamma listan (nu eller nyligen) väntar
  // resultaten på nätet i stället för att hamna i en lokal omgång som ingen annan ser.
  function netDown() {
    if (Sync.mode === 'local') return;
    if (Sync.everShared || Sync.cached) Sync.mode = 'offline';
    else if (Sync.mode === 'connecting') goLocal();
  }

  let flushing = false;
  async function flushPending() {
    if (flushing) return;
    flushing = true;
    try {
      const pend = Sync.local.scores.filter((r) => r.src === 'pending');
      for (const r of pend) {
        let status, data;
        try {
          ({ status, data } = await api('POST', { type: 'score', round: r.round, game: r.game, name: r.name, score: r.score }));
        } catch (e) {
          return; // nätet borta igen: försök vid nästa svar
        }
        // 200 = sparat, 409 = omgången har bytts, 4xx = ogiltigt. I alla fallen är det klart.
        if (status === 200 || (status >= 400 && status < 500 && status !== 429)) {
          Sync.local.scores = Sync.local.scores.filter((x) => x !== r);
          persistLocal();
          if (data && data.state) applyState(data.state);
        }
      }
    } finally {
      flushing = false;
    }
  }

  async function saveScore(game, name, score, roundN) {
    const n = roundN === undefined ? Sync.round.n : roundN;
    // Spelet kördes på en omgång som inte längre gäller: banan var en annan, så resultatet räknas inte.
    if (n !== Sync.round.n) return { improved: false, where: 'stale', prev: null };
    if (!inRange(game, score)) return { improved: false, where: 'rejected', prev: null };
    name = cleanName(name) || name;
    const key = game + ':' + slug(name);
    const prev = allScores().find((r) => r.game + ':' + slug(r.name) === key) || null;
    const improved = !prev || isBetter(game, score, prev.score);
    if (!improved) return { improved: false, where: Sync.mode === 'local' ? 'local' : 'shared', prev };

    if (Sync.mode === 'shared' || Sync.mode === 'offline') {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { status, data } = await api('POST', { type: 'score', round: n, game, name, score });
          if (status === 200) {
            Sync.mode = 'shared';
            if (data && data.state) applyState(data.state);
            // Servern avgör om det blev ett personbästa (den ser alla telefoners resultat).
            const improvedSrv = data && typeof data.improved === 'boolean' ? data.improved : true;
            return { improved: improvedSrv, where: 'shared', prev };
          }
          if (status === 409) {
            if (data && data.state) applyState(data.state);
            return { improved: false, where: 'stale', prev };
          }
          if (status >= 400 && status < 500 && status !== 429) return { improved: false, where: 'rejected', prev };
          if (status >= 500 && attempt === 0) {
            await sleep(400 + Math.random() * 600);
            continue;
          }
          break;
        } catch (e) {
          if (attempt === 0) {
            await sleep(500);
            continue;
          }
          Sync.mode = 'offline';
        }
      }
    }
    // Lokalt: antingen hela appen är lokal, eller så väntar resultatet på nätet.
    const src = Sync.mode === 'local' ? 'local' : 'pending';
    Sync.local.scores = Sync.local.scores.filter((r) => !(r.round === n && r.src === src && r.game + ':' + slug(r.name) === key));
    Sync.local.scores.push({ round: n, game, name, score, at: Date.now(), src });
    if (Sync.local.scores.length > 400) Sync.local.scores = Sync.local.scores.slice(-400);
    persistLocal();
    return { improved: true, where: src, prev };
  }

  async function newRound() {
    if (Sync.mode === 'local') {
      Sync.local.round = { n: Sync.round.n + 1, seed: localSeed(Sync.round.n + 1), startedAt: Date.now() };
      Sync.round = Sync.local.round;
      persistLocal();
      renderAll();
      return true;
    }
    try {
      const { status, data } = await api('POST', { type: 'round', expect: Sync.round.n });
      if (data && data.state) applyState(data.state);
      renderAll();
      return status === 200 || status === 409;
    } catch (e) {
      return false;
    }
  }

  /* ---------- rankning ---------- */
  function gameRanking(game) {
    const best = new Map();
    for (const r of allScores()) {
      if (r.game !== game) continue;
      const k = slug(r.name);
      const p = best.get(k);
      if (!p || isBetter(game, r.score, p.score)) best.set(k, r);
    }
    const list = [...best.values()].sort((a, b) => (GAMES[game].better === 'low' ? a.score - b.score : b.score - a.score) || a.at - b.at);
    let rank = 0;
    return list.map((r, i) => {
      if (i > 0 && r.score !== list[i - 1].score) rank = i;
      return { ...r, rank };
    });
  }
  function regattaTable() {
    const tot = new Map();
    for (const g of GAME_ORDER) {
      for (const r of gameRanking(g)) {
        const k = slug(r.name);
        const t = tot.get(k) || { name: r.name, pts: 0, wins: 0, played: 0 };
        const dnf = isDnf(g, r.score);
        t.pts += dnf ? 0 : POINTS[r.rank] || 0;
        t.played++;
        if (r.rank === 0 && !dnf) t.wins++;
        tot.set(k, t);
      }
    }
    const list = [...tot.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.name.localeCompare(b.name, 'sv'));
    let rank = 0;
    return list.map((r, i) => {
      if (i > 0 && (r.pts !== list[i - 1].pts || r.wins !== list[i - 1].wins)) rank = i;
      return { ...r, rank };
    });
  }

  /* =====================================================================
     VYER
     ===================================================================== */
  let view = 'spel';
  let boardTab = 'regatta';

  function setView(v) {
    if (!['spel', 'topplista', 'kort'].includes(v)) v = 'spel';
    if (view === 'kort' && v !== 'kort') stopTimer();
    view = v;
    for (const id of ['spel', 'topplista', 'kort']) $('#view-' + id).hidden = id !== v;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === v) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    $('#main').scrollTop = 0;
    if (v === 'kort') renderCards();
  }
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

  function renderSyncChip() {
    const chip = $('#syncChip');
    const labels = { connecting: 'ansluter', shared: 'gemensam', offline: 'offline', local: 'bara här' };
    chip.dataset.state = Sync.mode;
    $('#syncLabel').textContent = `Omgång ${Sync.round.n} · ${labels[Sync.mode]}`;
    chip.setAttribute('aria-label', `Topplistan: omgång ${Sync.round.n}, ${labels[Sync.mode]}. Visa mer.`);
  }

  function rowEl(rank, name, value, meta, isMe, extraTag) {
    return h('li', { class: 'row' + (isMe ? ' me' : '') },
      h('span', { class: 'rank', text: String(rank + 1) }),
      h('span', { class: 'who' }, h('span', { class: 'name', text: name }), meta ? h('span', { class: 'meta', text: meta }) : null),
      h('span', { class: 'val' }, value, extraTag ? h('div', null, h('span', { class: 'tag', text: extraTag })) : null));
  }

  function renderHome() {
    const root = $('#view-spel');
    root.replaceChildren();
    const name = getName();
    const me = slug(name);

    root.append(
      h('div', { class: 'hero' },
        h('span', { class: 'eyebrow', text: `Omgång ${Sync.round.n}` }),
        h('h1', { text: Sync.mode === 'local' ? 'Elva spel. Ställningen på den här telefonen.' : 'Elva spel. En topplista.' }),
        h('p', { class: 'lede', text: Sync.mode === 'local'
          ? 'Resultaten sparas bara på den här telefonen. Telefoner på samma omgång får samma banor. Skicka runt telefonen, eller lägg in resultat för hand.'
          : 'Alla spelar på sin egen telefon. Ditt bästa resultat i varje spel räknas, och placeringarna ger poäng i Regattan. Vill ni mötas på riktigt finns livespelen och spelen runt bordet.' })),
      h('div', { class: 'player' },
        name
          ? h('div', null, h('div', { class: 'muted', text: 'Du spelar som' }), h('strong', { text: name }))
          : h('div', null, h('strong', { text: 'Vem spelar?' }), h('div', { class: 'muted', text: 'Välj ett namn till topplistan.' })),
        h('button', { class: name ? 'btn ghost small' : 'btn small', type: 'button', onclick: () => askName() }, name ? 'Byt namn' : 'Välj namn')),
    );

    const games = h('div', { class: 'games' });
    for (const id of GAME_ORDER) {
      const g = GAMES[id];
      const rk = gameRanking(id);
      const mine = rk.find((r) => slug(r.name) === me && name);
      const lead = rk[0];
      games.append(
        h('article', { class: 'game' },
          h('div', { class: 'game-head' },
            h('span', { class: 'flag-wrap', svg: flagSVG(g.flag, 54, 36) }),
            h('div', null, h('div', { class: 'signal', text: g.signal }), h('h3', { text: g.title }))),
          h('p', { text: g.pitch }),
          h('div', { class: 'game-foot' },
            h('div', { class: 'stats' },
              h('span', null, h('span', { class: 'lbl', text: 'Ditt bästa ' }), h('b', { text: mine ? fmtScore(id, mine.score) : '–' })),
              h('span', null, h('span', { class: 'lbl', text: 'Leder ' }), lead ? h('b', { text: `${lead.name} ${fmtScore(id, lead.score)}` }) : h('b', { text: 'ingen än' }))),
            h('button', { class: 'btn', type: 'button', 'aria-label': `Spela ${g.title}`, onclick: () => startGame(id) }, 'Spela'))));
    }
    const table = regattaTable().slice(0, 3);
    const top = h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Ställningen' }), h('a', { class: 'linkish', href: '#topplista', text: 'Hela topplistan' })));
    if (table.length) {
      top.append(h('ol', { class: 'board' }, table.map((r) => rowEl(r.rank, r.name, `${r.pts} p`, `${r.played} av ${GAME_ORDER.length} spel, ${r.wins} ${r.wins === 1 ? 'seger' : 'segrar'}`, slug(r.name) === me && !!name))));
    } else {
      top.append(h('div', { class: 'empty' }, h('span', { text: `Ingen har seglat i omgång ${Sync.round.n} än. Första resultatet hamnar här.` })));
    }
    root.append(top);

    root.append(h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Regattan' }), h('span', { class: 'eyebrow', text: 'Solo' })),
      games));

    if (window.Live) root.append(window.Live.homeSection());

    root.append(h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Runt bordet' }), h('span', { class: 'eyebrow', text: 'En telefon' })),
      h('a', { class: 'teaser', href: '#kort' },
        h('span', { svg: flagSVG('K', 54, 36) }),
        h('span', null, h('h3', { text: 'Bordet' }), h('p', { text: `Kortleken med ${CARD_CATS.length} kategorier, Tickande sjömina och Pannkortet. Skicka runt telefonen.` })))));
  }

  function renderBoard() {
    const root = $('#view-topplista');
    root.replaceChildren();
    const name = getName();
    const me = slug(name);
    const startedTxt = Sync.round.startedAt ? ', startad ' + new Date(Sync.round.startedAt).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    root.append(h('div', { class: 'hero' }, h('span', { class: 'eyebrow', text: `Omgång ${Sync.round.n}${startedTxt}` }), h('h1', { text: 'Topplista' })));

    const tabs = [['regatta', 'Regatta'], ...BOARD_ORDER.map((g) => [g, GAMES[g].title])];
    const seg = h('div', { class: 'seg scroll', role: 'group', 'aria-label': 'Välj lista' },
      tabs.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(boardTab === k), onclick: () => { boardTab = k; renderBoard(); } }, label)));
    root.append(seg);
    // Håll den valda fliken synlig när raden är bredare än skärmen.
    requestAnimationFrame(() => {
      const on = seg.querySelector('[aria-pressed="true"]');
      if (on) seg.scrollLeft = Math.max(0, on.offsetLeft - seg.clientWidth / 2 + on.offsetWidth / 2);
    });

    const list = h('ol', { class: 'board' });
    if (boardTab === 'regatta') {
      const t = regattaTable();
      t.forEach((r) => list.append(rowEl(r.rank, r.name, `${r.pts} p`, `${r.played} av ${GAME_ORDER.length} spel, ${r.wins} ${r.wins === 1 ? 'seger' : 'segrar'}`, slug(r.name) === me && !!name)));
      root.append(t.length ? list : emptyBoard());
      root.append(h('p', { class: 'note', text: 'Placeringen i varje spel ger poäng: 10, 8, 6, 5, 4, 3, 2 och 1. Lika resultat ger lika poäng.' }));
    } else {
      const rk = gameRanking(boardTab);
      rk.forEach((r) => {
        const when = r.at ? new Date(r.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
        list.append(rowEl(r.rank, r.name, fmtScore(boardTab, r.score), when, slug(r.name) === me && !!name, r.pending ? 'väntar' : null));
      });
      root.append(rk.length ? list : emptyBoard(boardTab));
      if (GAMES[boardTab].live) root.append(h('p', { class: 'note', text: 'Bästa start i ett livelopp, i hundradelar efter skottet. Tjuvstarter räknas inte. Startlinjen ger inga poäng i Regattan.' }));
    }

    const acts = h('div', { class: 'actions' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: askManual }, 'Lägg till resultat'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: askNewRound }, 'Ny omgång'));
    root.append(h('div', { class: 'section' }, h('h2', { text: 'Omgången' }),
      h('p', { class: 'note', text: 'En ny omgång nollställer listan och ger alla nya banor. Alla i omgången seglar exakt samma bana och vind.' }), acts));
  }
  function emptyBoard(game) {
    return h('div', { class: 'empty' },
      h('span', { text: `Inga resultat i omgång ${Sync.round.n} än.` }),
      game && !GAMES[game].live ? h('button', { class: 'btn small', type: 'button', onclick: () => startGame(game) }, `Spela ${GAMES[game].title}`) : null);
  }

  let lastSig = '';
  function renderAll(force) {
    renderSyncChip();
    if (!$('#play').hidden && Play.running) return;
    // Bygg bara om vyerna när något faktiskt ändrats, så att ett tryck inte försvinner mitt i en omritning.
    const sig = JSON.stringify([Sync.mode, Sync.round, Sync.shared, Sync.local.scores, getName(), boardTab]);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    renderHome();
    renderBoard();
  }

  /* ---------- ark (dialoger) ---------- */
  let sheetClose = null;
  function openSheet(title, body, actions, onClose) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').replaceChildren(...(Array.isArray(body) ? body : [body]).filter(Boolean));
    $('#sheetActions').replaceChildren(...actions.map((a) => h('button', { class: 'btn' + (a.kind ? ' ' + a.kind : ''), type: a.submit ? 'submit' : 'button', onclick: a.onClick }, a.label)));
    $('#sheet').hidden = false;
    sheetClose = onClose || null;
    const first = $('#sheetBody input, #sheetBody select');
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    const f = sheetClose;
    sheetClose = null;
    if (f) f();
  }
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  function askName(then) {
    const input = h('input', { id: 'nameInput', type: 'text', maxlength: '20', autocomplete: 'nickname', value: getName(), enterkeyhint: 'done' });
    const err = h('p', { class: 'err', hidden: true });
    const save = () => {
      const n = cleanName(input.value);
      if (!/[\p{L}\p{N}]/u.test(n)) {
        err.textContent = 'Skriv ett namn med minst en bokstav eller siffra.';
        err.hidden = false;
        return;
      }
      setName(n);
      sheetClose = null;
      closeSheet();
      renderAll();
      if (then) then();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    openSheet('Ditt namn',
      [h('p', { text: 'Namnet syns på topplistan. Använd samma namn varje gång så samlas dina resultat.' }), h('div', { class: 'field' }, h('label', { for: 'nameInput', text: 'Namn' }), input), err],
      [{ label: 'Spara', onClick: save }, { label: 'Avbryt', kind: 'ghost', onClick: closeSheet }]);
  }

  function askNewRound() {
    const n = Sync.round.n;
    openSheet(`Starta omgång ${n + 1}?`,
      [h('p', { text: `Alla börjar om från noll och får nya banor och ny vind. Resultaten från omgång ${n} sparas men visas inte längre.` }),
        Sync.mode !== 'shared' && Sync.mode !== 'local' ? h('p', { class: 'err', text: 'Topplistan går inte att nå just nu. Försök igen om en stund.' }) : null],
      [{ label: `Starta omgång ${n + 1}`, kind: 'danger', onClick: async () => { const ok = await newRound(); if (ok) closeSheet(); } },
        { label: 'Avbryt', kind: 'ghost', onClick: closeSheet }]);
  }

  function parseScore(game, txt) {
    const t = String(txt).trim().replace(',', '.');
    if (!t) return null;
    if (GAMES[game].unit === 'time') {
      const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
      const secs = m ? Number(m[1]) * 60 + Number(m[2]) : Number(t);
      if (!Number.isFinite(secs) || secs <= 0) return null;
      return Math.round(secs * 1000);
    }
    const v = Math.round(Number(t.replace(/\s|p$/g, '')));
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  function askManual() {
    const nameIn = h('input', { id: 'manName', type: 'text', maxlength: '20', value: '' });
    const sel = h('select', { id: 'manGame' }, GAME_ORDER.map((g) => h('option', { value: g, text: GAMES[g].title })));
    const scoreIn = h('input', { id: 'manScore', type: 'text', inputmode: 'decimal', placeholder: '0:24,3' });
    const hint = h('p', { class: 'note', text: 'Tid skrivs som 0:24,3. Poäng skrivs som en siffra.' });
    sel.addEventListener('change', () => {
      const time = GAMES[sel.value].unit === 'time';
      scoreIn.placeholder = time ? '0:24,3' : '312';
    });
    const err = h('p', { class: 'err', hidden: true });
    openSheet('Lägg till resultat',
      [h('p', { text: 'För någon vars telefon inte kom åt topplistan. Bara ett bättre resultat ersätter det gamla.' }),
        h('div', { class: 'field' }, h('label', { for: 'manName', text: 'Namn' }), nameIn),
        h('div', { class: 'field' }, h('label', { for: 'manGame', text: 'Spel' }), sel),
        h('div', { class: 'field' }, h('label', { for: 'manScore', text: 'Resultat' }), scoreIn), hint, err],
      [{ label: 'Spara', onClick: async () => {
        const n = cleanName(nameIn.value);
        const sc = parseScore(sel.value, scoreIn.value);
        if (!/[\p{L}\p{N}]/u.test(n)) { err.textContent = 'Skriv ett namn med minst en bokstav eller siffra.'; err.hidden = false; return; }
        if (sc == null) { err.textContent = GAMES[sel.value].unit === 'time' ? 'Skriv tiden som 0:24,3.' : 'Skriv poängen som en siffra.'; err.hidden = false; return; }
        if (!inRange(sel.value, sc)) {
          const [lo, hi] = RANGE[sel.value];
          err.textContent = `${GAMES[sel.value].title} tar resultat mellan ${fmtScore(sel.value, lo)} och ${fmtScore(sel.value, hi)}.`;
          err.hidden = false;
          return;
        }
        const out = await saveScore(sel.value, n, sc);
        if (out.where === 'rejected') { err.textContent = 'Servern godtog inte resultatet.'; err.hidden = false; return; }
        if (out.where === 'stale') { err.textContent = 'Omgången har bytts. Resultatet sparades inte.'; err.hidden = false; return; }
        closeSheet();
        boardTab = sel.value;
        renderAll();
        if (!out.improved && out.prev) toastSheet('Inget nytt personbästa', `${n} har redan ${fmtScore(sel.value, out.prev.score)} i ${GAMES[sel.value].title}.`);
      } }, { label: 'Avbryt', kind: 'ghost', onClick: closeSheet }]);
  }
  function toastSheet(title, text) {
    openSheet(title, [h('p', { text })], [{ label: 'OK', onClick: closeSheet }]);
  }

  $('#syncChip').addEventListener('click', () => {
    const texts = {
      shared: ['Gemensam topplista', 'Alla som öppnar den här adressen ser samma topplista. Resultat sparas direkt och listan uppdateras av sig själv.'],
      connecting: ['Ansluter', 'Appen letar efter den delade topplistan.'],
      offline: ['Offline just nu', 'Telefonen når inte topplistan. Nya resultat sparas här och skickas när nätet är tillbaka. De märks "väntar" på listan.'],
      local: ['Bara den här telefonen', 'Den gemensamma topplistan är inte igång här, så resultaten sparas bara på den här telefonen. Andras telefoner ser dem inte. Ni kan skicka runt telefonen, eller lägga in resultat för hand senare.'],
    };
    const [t, b] = texts[Sync.mode];
    openSheet(t, [h('p', { text: b }), h('p', { class: 'note', text: `Omgång ${Sync.round.n}.` })], [{ label: 'OK', onClick: closeSheet }]);
  });

  /* =====================================================================
     SPELMOTOR
     ===================================================================== */
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const Play = {
    game: null, s: null, raf: 0, last: 0, running: false, ended: false, lock: null,
    view: { w: 0, h: 0, scale: 1, ox: 0, oy: 0, H: 720, dpr: 1 },
    input: { left: false, right: false, hold: false, boostPressed: false, skot: 0.45, events: [] },
    els: {},
  };

  function seedFor(id) {
    return (Sync.round.seed ^ hashStr(id)) >>> 0;
  }

  function resize() {
    const st = $('#stage').getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, st.width), hh = Math.max(1, st.height);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hh * dpr);
    const g = Play.game;
    if (!g) return;
    let scale, ox, oy, H;
    if (g.fit === 'contain') {
      scale = Math.min(w / g.W, hh / g.H);
      ox = (w - g.W * scale) / 2;
      oy = (hh - g.H * scale) / 2;
      H = g.H;
    } else {
      scale = Math.min(w / g.W, hh / 560);
      ox = (w - g.W * scale) / 2;
      oy = 0;
      H = hh / scale;
    }
    Play.view = { w, h: hh, scale, ox, oy, H, dpr };
    if (!Play.running && Play.s) drawFrame();
  }
  new ResizeObserver(resize).observe($('#stage'));

  function drawFrame() {
    const v = Play.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = '#07121b';
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Play.game.W, v.H);
    ctx.clip();
    Play.game.draw(ctx, Play.s, v);
    ctx.restore();
  }

  function updateHud() {
    const hud = Play.game.hud(Play.s);
    $('#hudMain').textContent = hud.main;
    $('#hudSub').textContent = hud.sub;
    const s = Play.s;
    if (Play.game.controls === 'sail' && Play.els.trimFill) {
      const e = s.eff;
      Play.els.trimFill.style.width = Math.round(e * 100) + '%';
      Play.els.trimFill.style.background = e > 0.8 ? 'var(--good)' : e > 0.5 ? 'var(--yellow)' : 'var(--bad)';
      Play.els.trimTxt.textContent = `Trim ${Math.round(e * 100)} %`;
      // Ringen runt SLAG visar hur mycket som är kvar av fönstret för ett perfekt slag.
      const hot = s.tackT > 0;
      Play.els.boost.style.setProperty('--e', hot ? Math.round((s.tackT / 0.8) * 100) : 0);
      Play.els.boost.classList.toggle('hot', hot);
    }
    if (Play.game.controls === 'helm' && Play.els.rudThumb) paintHelm();
  }

  // Roderlinje och gasreglage: värdena ligger i Play.input; tummarna ritas från dem.
  function paintHelm() {
    const r = clamp(Play.input.rudder || 0, -1, 1);
    const t = clamp(Play.input.throttle || 0, -1, 1);
    Play.els.rudThumb.style.left = `${50 + r * 50}%`;
    Play.els.rudTxt.textContent = r === 0 ? 'midskepps' : `${r < 0 ? 'babord' : 'styrbord'} ${Math.round(Math.abs(r) * 100)} %`;
    Play.els.thrThumb.style.top = `${50 - t * 50}%`;
    Play.els.thrThumb.dataset.dir = t > 0 ? 'fram' : t < 0 ? 'back' : 'neutral';
    Play.els.thrTxt.textContent = t === 0 ? 'Neutral' : `${t > 0 ? 'Fram' : 'Back'} ${Math.round(Math.abs(t) * 100)} %`;
  }
  function bindDrag(track, axis, onValue) {
    const set = (e) => {
      const rc = track.getBoundingClientRect();
      const v = axis === 'x' ? ((e.clientX - rc.left) / rc.width) * 2 - 1 : 1 - ((e.clientY - rc.top) / rc.height) * 2;
      onValue(clamp(v, -1, 1));
      paintHelm();
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      track.classList.add('on');
      set(e);
    });
    track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture && track.hasPointerCapture(e.pointerId)) set(e); });
    const end = () => track.classList.remove('on');
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    track.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function loop(now) {
    if (!Play.running) return;
    try {
      frame(now);
    } catch (err) {
      crashed(err, 'loop');
    }
  }
  // Ett fel i ett spel får aldrig lämna en frusen duk: visa en ruta och rapportera felet (R1-LOG2-1).
  function crashed(err, phase) {
    try { stopGame(); } catch (e) { /* ok */ }
    Play.ended = true;
    console.error(err);
    if (window.RA_REPORT) window.RA_REPORT({ kind: 'engine', game: Play.game && Play.game.id, phase, err });
    const g = Play.game;
    const p = $('#resultPanel');
    $('#introPanel').hidden = true;
    p.replaceChildren(h('div', { class: 'panel' },
      h('h2', { text: 'Hoppsan, spelet kraschade' }),
      h('p', { text: 'Försöket räknas inte. Felet har skickats så att det kan rättas.' }),
      h('div', { class: 'actions' },
        g ? h('button', { class: 'btn', type: 'button', onclick: () => startGame(g.id) }, 'Börja om') : null,
        h('button', { class: 'btn ghost', type: 'button', onclick: quitGame }, 'Startsidan'))));
    p.hidden = false;
  }
  function frame(now) {
    // Spelets tid följer verklig tid även på långsamma telefoner; stegen delas upp i 1/120 s.
    // Taket på 0,25 s gäller bara efter en paus (t.ex. när appen legat i bakgrunden).
    const dt = Math.min(0.25, (now - Play.last) / 1000);
    Play.last = now;
    const g = Play.game, s = Play.s;
    let rem = dt;
    while (rem > 1e-6) {
      const step = Math.min(rem, 1 / 120);
      g.update(s, step, Play.input, Play.view);
      // Tryck och svep ska bara läsas en gång, i första delsteget.
      Play.input.boostPressed = false;
      if (Play.input.events.length) Play.input.events = [];
      rem -= step;
    }
    if (s.vibrate) {
      s.vibrate = false;
      vibrate(140);
    }
    drawFrame();
    updateHud();
    const res = g.result(s);
    if (res && !Play.ended) {
      Play.ended = true;
      finishGame(res);
      return;
    }
    Play.raf = requestAnimationFrame(loop);
  }

  function buildControls(type) {
    const ctl = $('#ctl');
    ctl.replaceChildren();
    Play.els = {};
    if (type === 'sail') {
      const range = h('input', { type: 'range', id: 'skot', min: '0', max: '100', value: String(Math.round(Play.input.skot * 100)), 'aria-label': 'Skot: hem åt vänster, släppt åt höger' });
      range.addEventListener('input', () => { Play.input.skot = range.value / 100; });
      const trimFill = h('i');
      const trimTxt = h('span', { text: 'Trim' });
      const boostLbl = h('span', { text: 'SLAG' });
      const boost = h('button', { class: 'boost', type: 'button', 'data-k': 'boost', 'aria-label': 'Slag' }, boostLbl);
      ctl.append(h('div', { class: 'ctl-sail' },
        h('div', { class: 'pads' },
          h('button', { class: 'pad', type: 'button', 'data-k': 'left', 'aria-label': 'Styr vänster' }, '◀'),
          h('button', { class: 'pad', type: 'button', 'data-k': 'right', 'aria-label': 'Styr höger' }, '▶')),
        h('div', { class: 'skot' },
          h('div', { class: 'skot-top' }, h('span', { text: 'Skot' }), trimTxt),
          h('div', { class: 'trimbar' }, trimFill),
          range,
          h('div', { class: 'skot-ends' }, h('span', { text: 'hem' }), h('span', { text: 'släpp' }))),
        boost));
      Object.assign(Play.els, { range, trimFill, trimTxt, boost, boostLbl });
    } else if (type === 'lr') {
      ctl.append(h('div', { class: 'ctl-lr' },
        h('button', { class: 'pad', type: 'button', 'data-k': 'left', 'aria-label': 'Styr vänster' }, '◀'),
        h('button', { class: 'pad', type: 'button', 'data-k': 'right', 'aria-label': 'Styr höger' }, '▶')));
    } else if (type === 'helm') {
      const rudThumb = h('b', { class: 'thumb' });
      const rudTxt = h('span', { text: 'midskepps' });
      const rudTrack = h('div', { class: 'track track-h', role: 'slider', 'aria-label': 'Roder, babord till vänster, styrbord till höger', tabindex: '0' }, h('i', { class: 'mid' }), rudThumb);
      const thrThumb = h('b', { class: 'thumb' });
      const thrTxt = h('span', { text: 'Neutral' });
      const thrTrack = h('div', { class: 'track track-v', role: 'slider', 'aria-label': 'Gas, fram uppåt och back nedåt', tabindex: '0' },
        h('span', { class: 'end end-fram', text: 'FRAM' }), h('i', { class: 'mid' }), h('span', { class: 'end end-back', text: 'BACK' }), thrThumb);
      ctl.append(h('div', { class: 'ctl-helm' },
        h('div', { class: 'helm-steer' },
          h('div', { class: 'skot-top' }, h('span', { text: 'Roder' }), rudTxt),
          rudTrack,
          h('div', { class: 'skot-ends' }, h('span', { text: 'babord' }), h('span', { text: 'styrbord' }))),
        h('div', { class: 'helm-thr' }, thrTrack, h('div', { class: 'thr-txt' }, thrTxt))));
      Object.assign(Play.els, { rudThumb, rudTxt, thrThumb, thrTxt });
      // Rodret och spaken stannar där tummen släpper, med snäpp till midskepps och neutral.
      bindDrag(rudTrack, 'x', (v) => { Play.input.rudder = Math.abs(v) < 0.1 ? 0 : v; });
      bindDrag(thrTrack, 'y', (v) => { Play.input.throttle = Math.abs(v) < 0.14 ? 0 : v; });
      paintHelm();
    } else if (type === 'lrb') {
      ctl.append(h('div', { class: 'ctl-lrb' },
        h('button', { class: 'pad', type: 'button', 'data-k': 'left', 'aria-label': 'Styr vänster' }, '◀'),
        h('button', { class: 'pad act', type: 'button', 'data-k': 'boost' }, Play.game.actionLabel || 'OK'),
        h('button', { class: 'pad', type: 'button', 'data-k': 'right', 'aria-label': 'Styr höger' }, '▶')));
    } else if (type === 'draw') {
      ctl.append(h('div', { class: 'ctl-draw' },
        h('p', { class: 'ctl-hint', text: Play.game.hint || '' }),
        h('button', { class: 'pad', type: 'button', 'data-k': 'boost', 'aria-label': 'Ångra senaste draget' }, 'Ångra')));
    } else if (type === 'none') {
      ctl.append(h('div', { class: 'ctl-none' }, h('p', { class: 'ctl-hint', text: Play.game.hint || '' })));
    } else {
      ctl.append(h('div', { class: 'ctl-hold' }, h('button', { class: 'pad', type: 'button', 'data-k': 'hold' }, Play.game.holdLabel || 'Håll för att backa')));
    }
    ctl.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const on = (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        el.classList.add('on');
        if (k === 'boost') Play.input.boostPressed = true;
        else Play.input[k] = true;
      };
      const off = () => {
        el.classList.remove('on');
        if (k !== 'boost') Play.input[k] = false;
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // Tryck på själva vattnet: vänster/höger halva i slalom, var som helst för att backa.
  const canvasPointers = new Map();
  function canvasInput() {
    const g = Play.game;
    if (!g) return;
    let l = false, r = false, hold = false;
    for (const x of canvasPointers.values()) {
      if (x < Play.view.w / 2) l = true;
      else r = true;
      hold = true;
    }
    if (g.controls === 'lr' || g.controls === 'lrb') {
      Play.input.cl = l;
      Play.input.cr = r;
    } else if (g.controls === 'hold') {
      Play.input.ch = hold;
    }
  }
  // Spel som ritar, sveper eller trycker på saker får varje händelse i spelets egna koordinater.
  function worldEvent(type, e) {
    const rc = cv.getBoundingClientRect();
    const v = Play.view;
    return { type, id: e.pointerId, x: (e.clientX - rc.left - v.ox) / v.scale, y: (e.clientY - rc.top - v.oy) / v.scale, t: e.timeStamp };
  }
  const wantsPointer = () => Play.running && Play.game && Play.game.pointer;
  cv.addEventListener('pointerdown', (e) => {
    if (!Play.running) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    canvasPointers.set(e.pointerId, e.offsetX);
    canvasInput();
    if (wantsPointer()) Play.input.events.push(worldEvent('down', e));
  });
  cv.addEventListener('pointermove', (e) => {
    if (!wantsPointer() || !canvasPointers.has(e.pointerId)) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const c of list.length ? list : [e]) Play.input.events.push(worldEvent('move', c));
  });
  const cvUp = (e) => {
    if (!canvasPointers.has(e.pointerId)) return;
    canvasPointers.delete(e.pointerId);
    canvasInput();
    if (wantsPointer()) Play.input.events.push(worldEvent('up', e));
  };
  cv.addEventListener('pointerup', cvUp);
  cv.addEventListener('pointercancel', cvUp);
  cv.addEventListener('lostpointercapture', cvUp);

  // Samla knappar, duk och tangentbord till spelets input.
  const keys = { left: false, right: false, hold: false };
  const inputProxy = new Proxy(Play.input, {
    get(t, k) {
      if (k === 'left') return t.left || t.cl || keys.left;
      if (k === 'right') return t.right || t.cr || keys.right;
      if (k === 'hold') return t.hold || t.ch || keys.hold;
      return t[k];
    },
  });

  window.addEventListener('keydown', (e) => {
    if ($('#play').hidden || !Play.running) return;
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') keys.left = true;
    else if (c === 'ArrowRight' || c === 'KeyD') keys.right = true;
    else if (Play.game.controls === 'draw' && (c === 'KeyZ' || c === 'Backspace')) {
      if (!e.repeat) Play.input.boostPressed = true;
    } else if (Play.game.controls === 'helm' && (c === 'ArrowUp' || c === 'KeyW' || c === 'ArrowDown' || c === 'KeyS' || c === 'Space')) {
      // Gasen i steg med piltangenterna, mellanslag lägger i neutral.
      const t = c === 'Space' ? 0 : clamp(Math.round(((Play.input.throttle || 0) + (c === 'ArrowUp' || c === 'KeyW' ? 0.25 : -0.25)) * 4) / 4, -1, 1);
      Play.input.throttle = t;
      paintHelm();
    } else if (c === 'Space' || c === 'Enter') {
      if (!e.repeat) Play.input.boostPressed = true;
      keys.hold = true;
    } else if (c === 'ArrowUp' || c === 'KeyW' || c === 'ArrowDown' || c === 'KeyS') {
      const d = c === 'ArrowUp' || c === 'KeyW' ? -0.06 : 0.06;
      Play.input.skot = clamp(Play.input.skot + d, 0, 1);
      if (Play.els.range) Play.els.range.value = String(Math.round(Play.input.skot * 100));
    } else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false;
    else if (c === 'ArrowRight' || c === 'KeyD') keys.right = false;
    else if (c === 'Space' || c === 'Enter') keys.hold = false;
  });

  // Släpp allt som hålls när fönstret tappar fokus: annars fastnar en tangent eller knapp (R1-APP-7).
  function releaseAll() {
    Object.assign(keys, { left: false, right: false, hold: false });
    Object.assign(Play.input, { left: false, right: false, hold: false, cl: false, cr: false, ch: false });
    for (const id of canvasPointers.keys()) if (wantsPointer()) Play.input.events.push({ type: 'up', id, x: 0, y: 0, t: performance.now(), cancelled: true });
    canvasPointers.clear();
    document.querySelectorAll('#ctl .on').forEach((el) => el.classList.remove('on'));
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') releaseAll(); });

  function resetInput() {
    Object.assign(Play.input, { left: false, right: false, hold: false, boostPressed: false, cl: false, cr: false, ch: false, rudder: 0, throttle: 0, events: [], tiltOk: false, tiltX: 0, tiltY: 0 });
    Object.assign(keys, { left: false, right: false, hold: false });
    canvasPointers.clear();
  }

  // Lutning för spel med tilt: true. Nollan sätts där telefonen hålls när spelet börjar.
  const Tilt = { base: null, on: false };
  function onOrient(e) {
    if (e.beta == null || e.gamma == null || !Play.running) return;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const b = e.beta, g = e.gamma;
    let x = g, y = b;
    if (ang === 90) { x = b; y = -g; } else if (ang === -90 || ang === 270) { x = -b; y = g; } else if (ang === 180) { x = -g; y = -b; }
    if (!Tilt.base) Tilt.base = [x, y];
    Play.input.tiltX = clamp((x - Tilt.base[0]) / 25, -1.5, 1.5);
    Play.input.tiltY = clamp((y - Tilt.base[1]) / 25, -1.5, 1.5);
    Play.input.tiltOk = true;
  }
  // iOS kräver att man ber om lov, och det måste ske i själva trycket på Kör. Spelet väntar på svaret,
  // så att klockan inte går bakom dialogrutan (R1-APP-6).
  function tiltPermission() {
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return DeviceOrientationEvent.requestPermission().then((r) => r === 'granted', () => false);
      }
    } catch (e) { /* inget stöd */ }
    return Promise.resolve(true);
  }
  function tiltOn() {
    Tilt.base = null;
    if (!Tilt.on) window.addEventListener('deviceorientation', onOrient);
    Tilt.on = true;
  }
  function tiltOff() {
    if (Tilt.on) window.removeEventListener('deviceorientation', onOrient);
    Tilt.on = false;
  }

  function startGame(id) {
    if (!getName()) {
      askName(() => startGame(id));
      return;
    }
    const g = GAMES[id];
    Play.game = g;
    Play.ended = false;
    Play.running = false;
    cancelAnimationFrame(Play.raf);
    Play.round = Sync.round.n; // resultatet hör till omgången spelet startade i
    Play.seed = seedFor(id);
    try {
      Play.s = g.create(Play.seed);
    } catch (err) {
      $('#play').hidden = false;
      crashed(err, 'create');
      return;
    }
    resetInput();
    Play.input.skot = 0.45;
    $('#hudTitle').textContent = g.title;
    buildControls(g.controls);
    $('#resultPanel').hidden = true;
    $('#play').hidden = false;
    document.body.style.overflow = 'hidden';
    resize();
    try {
      drawFrame();
      updateHud();
    } catch (err) {
      crashed(err, 'draw');
      return;
    }
    showIntro(g);
  }

  function showIntro(g) {
    const p = $('#introPanel');
    const go = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (go.disabled) return;
      // Har omgången bytts medan introt var öppet? Då gäller den nya banan (R1-APP-3).
      if (Sync.round.n !== Play.round || seedFor(g.id) !== Play.seed) {
        Play.round = Sync.round.n;
        Play.seed = seedFor(g.id);
        try { Play.s = g.create(Play.seed); } catch (err) { crashed(err, 'create'); return; }
      }
      if (!g.tilt) { p.hidden = true; run(); return; }
      const ask = tiltPermission(); // anropas direkt i trycket
      go.disabled = true;
      go.textContent = 'Väntar på tillåtelse…';
      ask.then((ok) => {
        if (Play.game !== g || Play.running) return;
        p.hidden = true;
        if (ok) tiltOn();
        run();
      });
    } }, 'Kör');
    p.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'game-head' }, h('span', { class: 'flag-wrap', svg: flagSVG(g.flag, 48, 32) }), h('div', null, h('div', { class: 'signal', text: Sync.mode === 'local' ? `Omgång ${Sync.round.n} · bara på den här telefonen` : `Omgång ${Sync.round.n} · samma bana för alla` }), h('h2', { text: g.title }))),
      h('ul', { class: 'how' }, g.how.map(([k, t]) => h('li', null, h('b', { text: k }), h('span', { text: t })))),
      h('div', { class: 'actions' }, go, h('button', { class: 'btn ghost', type: 'button', onclick: quitGame }, 'Tillbaka'))));
    p.hidden = false;
    // Fokus utan att rulla: annars öppnar introt längst ner och titeln syns inte (R1-UI-1).
    p.scrollTop = 0;
    setTimeout(() => { go.focus({ preventScroll: true }); p.scrollTop = 0; }, 30);
  }

  function run() {
    Play.running = true;
    Play.last = performance.now();
    requestWakeLock();
    Play.raf = requestAnimationFrame(loop);
  }

  // Ett löpnummer per begäran: avslutas spelet innan låset hunnit komma släpps det direkt (R1-APP-8).
  let lockTok = 0;
  async function requestWakeLock() {
    const t = ++lockTok;
    try {
      if (!navigator.wakeLock || Play.lock) return;
      const l = await navigator.wakeLock.request('screen');
      if (t !== lockTok || !Play.running) { l.release().catch(() => {}); return; }
      Play.lock = l;
      l.addEventListener('release', () => { if (Play.lock === l) Play.lock = null; });
    } catch (e) { /* ingen skärmlåsning */ }
  }
  function releaseWakeLock() {
    lockTok++;
    try { Play.lock && Play.lock.release(); } catch (e) { /* ok */ }
    Play.lock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      Play.last = performance.now();
      if (Play.running) requestWakeLock();
      poll();
    }
  });

  function stopGame() {
    tiltOff();
    Play.running = false;
    cancelAnimationFrame(Play.raf);
    releaseWakeLock();
    resetInput();
  }
  function quitGame() {
    stopGame();
    $('#play').hidden = true;
    $('#introPanel').hidden = true;
    $('#resultPanel').hidden = true;
    document.body.style.overflow = '';
    Play.game = null;
    Play.s = null;
    renderAll(true);
  }
  $('#quitBtn').addEventListener('click', quitGame);

  async function finishGame(res) {
    stopGame();
    const g = Play.game;
    const name = getName();
    const p = $('#resultPanel');
    const status = h('p', { class: 'note', text: 'Sparar…' });
    const pbSlot = h('div');
    const rankLine = h('p', { class: 'note' });
    p.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'signal', text: g.title }),
      h('h2', { text: res.title }),
      h('div', { class: 'big-score', text: res.void ? '–' : fmtScore(g.id, res.score) }),
      h('p', { text: res.detail }),
      pbSlot, rankLine, status,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => startGame(g.id) }, 'Spela igen'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { quitGame(); location.hash = '#topplista'; boardTab = g.id; setView('topplista'); renderBoard(); } }, 'Topplista'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { quitGame(); location.hash = '#spel'; } }, 'Startsidan'))));
    p.hidden = false;
    p.scrollTop = 0;
    if (res.void) {
      status.textContent = 'Försöket sparas inte.';
      return;
    }

    const out = await saveScore(g.id, name, res.score, Play.round);
    if (out.where === 'rejected') {
      status.textContent = 'Resultatet ligger utanför det tillåtna och sparades inte.';
    } else if (out.where === 'stale') {
      status.textContent = 'En ny omgång startade medan du spelade, så resultatet räknades inte. Spela igen på den nya banan.';
    } else if (res.dnf) {
      status.textContent = out.prev && !isDnf(g.id, out.prev.score) ? `Ingen giltig tid. Ditt bästa är fortfarande ${fmtScore(g.id, out.prev.score)}.` : 'Ingen giltig tid. Du står som underkänd tills du klarar alla scener.';
    } else if (out.improved) {
      pbSlot.replaceChildren(h('span', { class: 'pb', text: out.prev ? 'Nytt personbästa' : 'Första resultatet' }));
      status.textContent = out.where === 'shared' ? 'Sparat i topplistan.' : out.where === 'pending' ? 'Sparat på telefonen. Skickas när nätet är tillbaka.' : 'Sparat på den här telefonen.';
    } else {
      status.textContent = `Ditt bästa är fortfarande ${fmtScore(g.id, out.prev.score)}.`;
    }
    const rk = gameRanking(g.id);
    const mine = rk.find((r) => slug(r.name) === slug(name));
    if (mine && out.where !== 'stale' && out.where !== 'rejected') rankLine.textContent = `Plats ${mine.rank + 1} av ${rk.length} i ${g.title}, omgång ${Sync.round.n}.`;
  }

  /* =====================================================================
     KORTLEKEN
     ===================================================================== */
  const Cards = { cat: null, order: {}, pos: {}, timer: { total: 0, left: 0, id: 0, done: false } };
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function drawCard(catId) {
    const cat = CARD_CATS.find((c) => c.id === catId);
    if (!Cards.order[catId] || Cards.pos[catId] >= Cards.order[catId].length) {
      Cards.order[catId] = shuffle(cat.cards.map((_, i) => i));
      Cards.pos[catId] = 0;
    }
    Cards.cat = catId;
    Cards.current = Cards.order[catId][Cards.pos[catId]++];
    stopTimer();
    renderCards();
  }
  function randomCard() {
    const c = CARD_CATS[Math.floor(Math.random() * CARD_CATS.length)];
    drawCard(c.id);
  }
  function stopTimer() {
    clearInterval(Cards.timer.id);
    Cards.timer = { total: 0, left: 0, id: 0, done: false };
  }
  function startTimer(sec) {
    stopTimer();
    Cards.timer.total = sec;
    Cards.timer.left = sec;
    const t0 = Date.now();
    Cards.timer.id = setInterval(() => {
      Cards.timer.left = Math.max(0, sec - (Date.now() - t0) / 1000);
      if (Cards.timer.left <= 0) {
        clearInterval(Cards.timer.id);
        Cards.timer.done = true;
        vibrate([200, 100, 200]);
      }
      paintTimer();
    }, 100);
    paintTimer();
  }
  function paintTimer() {
    const box = $('#timerBox');
    if (!box) return;
    const t = Cards.timer;
    const pct = t.total ? (t.left / t.total) * 100 : 0;
    box.classList.toggle('done', t.done);
    box.querySelector('.timer-dial').style.setProperty('--p', pct.toFixed(1));
    box.querySelector('.timer-dial span').textContent = t.total ? (t.done ? 'Stopp' : String(Math.ceil(t.left))) : '–';
  }

  function renderCards() {
    const root = $('#view-kort');
    root.replaceChildren();
    if (!Cards.cat) {
      root.append(
        h('div', { class: 'hero' },
          h('span', { class: 'eyebrow', text: 'Runt bordet' }),
          h('h1', { text: 'En telefon, hela bordet' }),
          h('p', { class: 'lede', text: 'Lägg telefonen mitt på bordet eller skicka runt den. Inga konton, ingen topplista, bara skratt.' })),
        window.Table ? window.Table.section() : null,
        h('div', { class: 'section-head' }, h('h2', { text: 'Kortleken' }), h('span', { class: 'eyebrow', text: `${CARD_CATS.length} kategorier` })),
        h('p', { class: 'note', text: 'Utmaningarna handlar om hur laget tolkar dig, inte om vem som är bäst. Välj en kategori eller låt slumpen bestämma.' }),
        h('button', { class: 'btn', type: 'button', onclick: randomCard }, 'Slumpa kategori'),
        h('div', { class: 'cat-grid' }, CARD_CATS.map((c) => h('button', { class: 'cat', type: 'button', onclick: () => drawCard(c.id) },
          h('span', { svg: flagSVG(c.flag, 36, 24) }), h('b', { text: c.name }), h('span', { text: `${c.cards.length} kort` })))));
      return;
    }
    const cat = CARD_CATS.find((c) => c.id === Cards.cat);
    const card = cat.cards[Cards.current];
    const timer = h('div', { class: 'timer', id: 'timerBox' },
      h('div', { class: 'timer-dial' }, h('span', { text: '–' })),
      h('div', { class: 'actions' }, [30, 60, 90].map((s) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => startTimer(s) }, `${s} s`))));
    root.append(
      h('div', { class: 'section-head' },
        h('button', { class: 'linkish', type: 'button', onclick: () => { Cards.cat = null; stopTimer(); renderCards(); } }, '◀ Alla kategorier'),
        h('span', { class: 'eyebrow', text: `${Cards.pos[cat.id]} av ${cat.cards.length}` })),
      h('article', { class: 'card', 'aria-live': 'polite' },
        h('div', { class: 'card-top' }, h('span', { class: 'card-cat', text: cat.name }), h('span', { svg: flagSVG(cat.flag, 42, 28) })),
        h('p', { class: 'card-rule', text: cat.rule }),
        h('div', { class: 'card-main', text: card.a }),
        card.b ? h('p', { class: 'card-sub', text: card.b }) : null),
      timer,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => drawCard(cat.id) }, 'Nästa kort'),
        h('button', { class: 'btn ghost', type: 'button', onclick: randomCard }, 'Slumpa')));
    paintTimer();
  }

  /* ---------- delade hjälpare för livespelen och bordsspelen ---------- */
  window.RA = {
    h, $, LS, slug, vibrate, flagSVG, sleep, getName, askName, openSheet, closeSheet, toastSheet,
    saveScore, fmtScore, GAMES, renderAll,
    round: () => Sync.round.n,
    syncMode: () => Sync.mode,
    playing: () => Play.running,
  };

  /* ---------- start ---------- */
  // Spelen ritar text på duken. Se till att typsnitten är laddade även om ingen vanlig text använt dem än.
  try {
    if (document.fonts) ['700 20px Adventor', '400 20px Adventor'].forEach((f) => document.fonts.load(f).catch(() => {}));
  } catch (e) { /* ok */ }
  Play.input = inputProxy; // spelen läser via proxyn
  setView(location.hash.slice(1) || 'spel');
  renderAll(true);
  window.__raBooted = true;
  poll();
  // Var 5:e sekund mot den delade topplistan; finns den inte, titta bara efter den var 30:e sekund.
  let tick = 0;
  setInterval(() => {
    tick++;
    if (document.visibilityState !== 'visible' || Play.running) return;
    if (Sync.mode === 'local' && tick % 6 !== 0) return;
    poll();
  }, 5000);
})();
