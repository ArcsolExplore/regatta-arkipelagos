// Livespel i rum för Regatta Arkipelagos: Startlinjen, Dragkampen och Sjöslaget.
// GET  /api/room?code=ABCD&tok=...        -> { serverNow, room }
// POST /api/room { action, code, tok, ... } -> { serverNow, room, ... }
//   create { game, name }       join { code, name, tok? }     team { team }     leave
//   start { expect }            tap { race, at }              pull { race, n }  fire { race, n, cell }
// Det som flera kan skriva samtidigt (start, tryck, skott) skyddas med SET NX och HSETNX.
// Alla avslag har en 4xx-status; 409-svar har rummet med så klienten kan rita om.

import { store, redis, parse, json, readJson, route, HttpError, cleanName } from './_shared.js';

const TTL = 60 * 60 * 3; // 3 timmar
const GAMES = ['start', 'drag', 'sjo'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 24;
// Nedräkning; hur länge efter skottet man kan trycka; hur mycket klientens tidsstämpel får avvika bakåt/framåt.
const START = { COUNT: 10000, OPEN: 6000, LAG: 1500, AHEAD: 150 };
const DRAG = { LEAD: 3500, LEN: 40000, TARGET: 20, MAXN: 40 };
const SJO = { N: 8, SHIPS: [4, 3, 3, 2, 2] };

function hash(flat) {
  const out = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}
function randInt(n) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}
function randHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const K = (code, ...rest) => ['ra:room', code, ...rest].join(':');
const cleanCode = (c) => (typeof c === 'string' && /^[A-Z]{4}$/.test(c.toUpperCase()) ? c.toUpperCase() : null);

/* ---------- Sjöslaget: flottor ---------- */
function placeFleet() {
  const N = SJO.N;
  for (let attempt = 0; attempt < 400; attempt++) {
    const taken = new Set();
    const halo = new Set();
    const ships = [];
    let ok = true;
    for (const len of SJO.SHIPS) {
      let placed = false;
      for (let t = 0; t < 120 && !placed; t++) {
        const horiz = randInt(2) === 0;
        const x = randInt(horiz ? N - len + 1 : N), y = randInt(horiz ? N : N - len + 1);
        const cells = Array.from({ length: len }, (_, i) => (horiz ? y * N + x + i : (y + i) * N + x));
        // Inga skepp får röra varandra, inte ens på diagonalen (sista försöken släpper på det).
        if (cells.some((c) => taken.has(c) || (attempt < 300 && halo.has(c)))) continue;
        for (const c of cells) {
          taken.add(c);
          const cx = c % N, cy = (c - cx) / N;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N) halo.add(ny * N + nx);
          }
        }
        ships.push(cells);
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return SJO.SHIPS.map((len, i) => Array.from({ length: len }, (_, k) => i * SJO.N + k));
}
const other = (t) => (t === 'red' ? 'blue' : 'red');

// Spela upp skotten i ordning: träff ger ett skott till, miss lämnar över turen.
function sjoReplay(meta, shotsHash) {
  const list = [];
  for (let n = 0; ; n++) {
    const v = parse(shotsHash[String(n)]);
    if (!v) break;
    list.push(v);
  }
  let turn = meta.first || 'red';
  const hits = { red: new Set(), blue: new Set() }; // celler som laget har träffat hos motståndaren
  let winner = null;
  for (const s of list) {
    if (s.hit) {
      hits[s.team].add(s.cell);
      const enemy = meta.ships[other(s.team)];
      if (enemy.every((ship) => ship.every((c) => hits[s.team].has(c)))) winner = s.team;
    } else turn = other(turn);
    if (winner) break;
  }
  return { list, turn, hits, winner };
}

/* ---------- läs ett rum ---------- */
async function readRoom(cfg, code) {
  const [rawMeta, flatPlayers] = await redis(cfg, [['GET', K(code, 'meta')], ['HGETALL', K(code, 'players')]]);
  const meta = parse(rawMeta);
  if (!meta) return null;
  const players = {};
  for (const [pid, v] of Object.entries(hash(flatPlayers))) {
    const p = parse(v);
    if (p) players[pid] = p;
  }
  const room = { meta, players, extra: {} };
  const r = meta.race;
  if (r > 0) {
    if (meta.game === 'start') {
      const [flat] = await redis(cfg, [['HGETALL', K(code, 'res', r)]]);
      room.extra.res = {};
      for (const [pid, v] of Object.entries(hash(flat))) {
        const x = parse(v);
        if (x) room.extra.res[pid] = x;
      }
    } else if (meta.game === 'drag') {
      const [red, blue, win] = await redis(cfg, [['GET', K(code, 'pull', r, 'red')], ['GET', K(code, 'pull', r, 'blue')], ['GET', K(code, 'win', r)]]);
      room.extra.pull = { red: Number(red) || 0, blue: Number(blue) || 0 };
      room.extra.win = win || null;
    } else if (meta.game === 'sjo') {
      const [flat] = await redis(cfg, [['HGETALL', K(code, 'shots', r)]]);
      room.extra.shots = hash(flat);
    }
  }
  return room;
}

function dragDiff(meta, pull) {
  const nr = Math.max(1, meta.sizes ? meta.sizes.red : 1), nb = Math.max(1, meta.sizes ? meta.sizes.blue : 1);
  return pull.red / nr - pull.blue / nb;
}

// Är loppet avgjort? Då får någon starta ett nytt.
function raceOver(room, now) {
  const { meta, players, extra } = room;
  if (!meta.race) return true;
  if (meta.game === 'start') {
    if (now > meta.gunAt + START.OPEN) return true;
    const ids = (meta.racers || Object.keys(players)).filter((id) => players[id]);
    return ids.length > 0 && ids.every((id) => extra.res && extra.res[id]);
  }
  if (meta.game === 'drag') return !!extra.win || now > meta.endAt;
  if (meta.game === 'sjo') return !!sjoReplay(meta, extra.shots || {}).winner;
  return true;
}

// Det klienten får se. Polletter syns aldrig, och motståndarens skepp bara när de sjunkit.
function view(room, me, now) {
  const { meta, players, extra } = room;
  const out = {
    code: meta.code, game: meta.game, race: meta.race, createdAt: meta.createdAt,
    players: Object.entries(players).map(([id, p]) => ({ id, name: p.name, team: p.team, at: p.at })).sort((a, b) => a.at - b.at),
    me: me || null,
    over: raceOver(room, now),
  };
  if (!meta.race) return out;
  if (meta.game === 'start') {
    const done = out.over;
    out.gunAt = meta.gunAt;
    out.openUntil = meta.gunAt + START.OPEN;
    out.results = Object.entries(extra.res || {}).map(([id, r]) => ({
      id, name: players[id] ? players[id].name : r.name || '?',
      // Före avgörandet syns bara vem som har tryckt, inte tiden.
      ...(done || id === me ? { ms: r.ms, ocs: r.ocs } : {}),
    }));
  } else if (meta.game === 'drag') {
    const diff = dragDiff(meta, extra.pull);
    out.startAt = meta.startAt;
    out.endAt = meta.endAt;
    out.sizes = meta.sizes;
    out.pull = extra.pull;
    out.pos = Math.max(-1, Math.min(1, diff / DRAG.TARGET));
    out.target = DRAG.TARGET;
    let win = extra.win;
    if (!win && now > meta.endAt) win = Math.abs(diff) < 0.5 ? 'lika' : diff > 0 ? 'red' : 'blue';
    out.winner = win || null;
  } else if (meta.game === 'sjo') {
    const rp = sjoReplay(meta, extra.shots || {});
    // Laget räknas från ögonblicket loppet startade: den som gått med senare ser ingen flotta (R1-SRV-1).
    const myTeam = me && meta.teams ? meta.teams[me] || null : me && players[me] ? players[me].team : null;
    const sunk = (team) => meta.ships[team].filter((ship) => ship.every((c) => rp.hits[other(team)].has(c)));
    out.turn = rp.winner ? null : rp.turn;
    out.winner = rp.winner;
    out.shots = rp.list.map((s) => ({ team: s.team, cell: s.cell, hit: s.hit, by: players[s.by] ? players[s.by].name : '' }));
    out.n = rp.list.length;
    out.sunk = { red: sunk('red'), blue: sunk('blue') };
    out.fleet = SJO.SHIPS;
    out.size = SJO.N;
    // Det egna lagets flotta syns för laget; när spelet är slut syns allt.
    out.ships = {};
    for (const t of ['red', 'blue']) if (t === myTeam || rp.winner) out.ships[t] = meta.ships[t];
  }
  return out;
}

function findMe(room, tok) {
  if (typeof tok !== 'string' || !tok) return null;
  for (const [id, p] of Object.entries(room.players)) if (p.tok === tok) return id;
  return null;
}
function balancedTeam(players) {
  let red = 0, blue = 0;
  for (const p of Object.values(players)) p.team === 'red' ? red++ : blue++;
  return red <= blue ? 'red' : 'blue';
}
const touch = (code, race) => {
  const keys = [K(code, 'meta'), K(code, 'players')];
  if (race) keys.push(K(code, 'res', race), K(code, 'pull', race, 'red'), K(code, 'pull', race, 'blue'), K(code, 'win', race), K(code, 'shots', race));
  return keys.map((k) => ['EXPIRE', k, String(TTL)]);
};

export const GET = route('room', async (request, ctx) => {
  const cfg = store();
  if (!cfg) return json(ctx, 503, { error: 'no_store' });
  const url = new URL(request.url);
  const code = cleanCode(url.searchParams.get('code'));
  if (!code) throw new HttpError(400, 'bad_code');
  const room = await readRoom(cfg, code);
  const now = Date.now();
  if (!room) throw new HttpError(404, 'no_room');
  return json(ctx, 200, { room: view(room, findMe(room, url.searchParams.get('tok')), now) });
});

export const POST = route('room', async (request, ctx) => {
  const cfg = store();
  if (!cfg) return json(ctx, 503, { error: 'no_store' });
  const body = await readJson(request);
  const a = String(body.action || '');
  ctx.action = a.slice(0, 16);
  if (a === 'create') {
    const game = GAMES.includes(body.game) ? body.game : null;
    const name = cleanName(body.name);
    if (!game || !name) throw new HttpError(400, 'bad_create');
    const now = Date.now();
    for (let i = 0; i < 8; i++) {
      const code = Array.from({ length: 4 }, () => ALPHA[randInt(ALPHA.length)]).join('');
      const meta = { code, game, race: 0, createdAt: now };
      const [ok] = await redis(cfg, [['SET', K(code, 'meta'), JSON.stringify(meta), 'NX', 'EX', String(TTL)]], ctx);
      if (ok !== 'OK') continue;
      const pid = randHex(4), tok = randHex(12);
      await redis(cfg, [['HSET', K(code, 'players'), pid, JSON.stringify({ name, team: 'red', tok, at: now })], ['EXPIRE', K(code, 'players'), String(TTL)]], ctx);
      const room = await readRoom(cfg, code);
      return json(ctx, 200, { code, pid, tok, room: view(room, pid, Date.now()) });
    }
    throw new HttpError(503, 'no_code');
  }

  const code = cleanCode(body.code);
  if (!code) throw new HttpError(400, 'bad_code');
  let room = await readRoom(cfg, code);
  let now = Date.now();
  if (!room) throw new HttpError(404, 'no_room');
  let me = findMe(room, body.tok);
  // Svar med rummet; avslag (status 409) har också rummet med så att klienten kan rita om.
  const reply = async (extra, status = 200) => {
    room = await readRoom(cfg, code);
    now = Date.now();
    if (!room) throw new HttpError(404, 'no_room');
    return json(ctx, status, { room: view(room, me, now), ...(extra || {}) });
  };
  const reject = (error) => reply({ error }, 409);

  if (a === 'join') {
    const name = cleanName(body.name);
    if (!name) throw new HttpError(400, 'bad_name');
    if (me) {
      const p = room.players[me];
      await redis(cfg, [['HSET', K(code, 'players'), me, JSON.stringify({ ...p, name })], ...touch(code)], ctx);
      return reply({ pid: me, tok: p.tok });
    }
    if (Object.keys(room.players).length >= MAX_PLAYERS) throw new HttpError(409, 'room_full');
    const pid = randHex(4), tok = randHex(12);
    await redis(cfg, [['HSET', K(code, 'players'), pid, JSON.stringify({ name, team: balancedTeam(room.players), tok, at: now })], ...touch(code)], ctx);
    me = pid;
    return reply({ pid, tok });
  }

  if (!me) throw new HttpError(403, 'not_in_room');
  const p = room.players[me];
  const over = raceOver(room, now);
  const racing = !room.meta.racers || room.meta.racers.includes(me);
  const myTeam = (room.meta.teams && room.meta.teams[me]) || (p.team === 'blue' ? 'blue' : 'red');

  if (a === 'leave') {
    await redis(cfg, [['HDEL', K(code, 'players'), me]], ctx);
    return json(ctx, 200, { ok: true });
  }

  if (a === 'team') {
    const team = body.team === 'blue' ? 'blue' : 'red';
    if (!over) return reject('race_running');
    await redis(cfg, [['HSET', K(code, 'players'), me, JSON.stringify({ ...p, team })], ...touch(code)], ctx);
    return reply();
  }

  if (a === 'start') {
    if (Number(body.expect) !== room.meta.race) return reject('race_changed');
    if (!over) return reject('race_running');
    const sizes = { red: 0, blue: 0 };
    const teams = {};
    for (const [id, q] of Object.entries(room.players)) {
      const t = q.team === 'blue' ? 'blue' : 'red';
      sizes[t]++;
      teams[id] = t;
    }
    if (room.meta.game !== 'start' && (!sizes.red || !sizes.blue)) throw new HttpError(409, 'need_teams');
    const race = room.meta.race + 1;
    // Ett lås per lopp: trycker två på Starta samtidigt blir det bara ett lopp.
    const lock = K(code, 'lock', race);
    const [got] = await redis(cfg, [['SET', lock, '1', 'NX', 'EX', String(TTL)]], ctx);
    if (got !== 'OK') return reject('race_changed');
    const meta = { ...room.meta, race, sizes, teams, racers: Object.keys(room.players) };
    if (meta.game === 'start') {
      meta.gunAt = now + START.COUNT;
    } else if (meta.game === 'drag') {
      meta.startAt = now + DRAG.LEAD;
      meta.endAt = meta.startAt + DRAG.LEN;
    } else {
      meta.ships = { red: placeFleet(), blue: placeFleet() };
      meta.first = randInt(2) ? 'red' : 'blue';
    }
    try {
      await redis(cfg, [['SET', K(code, 'meta'), JSON.stringify(meta), 'EX', String(TTL)], ...touch(code)], ctx);
    } catch (e) {
      // Utan det här skulle låset blockera rummet i tre timmar (R1-SRV-10).
      await redis(cfg, [['DEL', lock]], ctx).catch(() => {});
      throw e;
    }
    return reply();
  }

  const race = Number(body.race);
  if (race !== room.meta.race || !race) return reject('race_changed');
  if (!racing) return reject('not_racing');

  if (a === 'tap' && room.meta.game === 'start') {
    if (now > room.meta.gunAt + START.OPEN) return reject('too_late');
    // Klienten skickar sin klocka omräknad till serverns. Ligger den för långt ifrån används serverns.
    let at = Number(body.at);
    if (!Number.isFinite(at) || at < now - START.LAG || at > now + START.AHEAD) at = Math.min(now + START.AHEAD, Math.max(now - START.LAG, Number.isFinite(at) ? at : now));
    const ms = Math.round(at - room.meta.gunAt);
    const rec = ms < 0 ? { ocs: true, ms, name: p.name } : { ms, name: p.name };
    const [isNew, stored] = await redis(cfg, [['HSETNX', K(code, 'res', race), me, JSON.stringify(rec)], ['HGET', K(code, 'res', race), me], ['EXPIRE', K(code, 'res', race), String(TTL)]], ctx);
    // Ett upprepat tryck får tillbaka det som sparades först.
    return reply({ first: isNew === 1, mine: parse(stored) || rec });
  }

  if (a === 'pull' && room.meta.game === 'drag') {
    const n = Math.max(0, Math.min(DRAG.MAXN, Math.floor(Number(body.n) || 0)));
    if (!room.extra.win && now >= room.meta.startAt && now <= room.meta.endAt && n > 0) {
      const team = myTeam;
      const [red, blue] = await redis(cfg, [
        ['INCRBY', K(code, 'pull', race, team), String(n)],
        ['GET', K(code, 'pull', race, other(team))],
        ['EXPIRE', K(code, 'pull', race, team), String(TTL)],
      ], ctx).then(([mine, theirs]) => (team === 'red' ? [Number(mine), Number(theirs) || 0] : [Number(theirs) || 0, Number(mine)]));
      const diff = dragDiff(room.meta, { red, blue });
      if (Math.abs(diff) >= DRAG.TARGET) {
        await redis(cfg, [['SET', K(code, 'win', race), diff > 0 ? 'red' : 'blue', 'NX', 'EX', String(TTL)]], ctx);
      }
    }
    return reply();
  }

  if (a === 'fire' && room.meta.game === 'sjo') {
    const rp = sjoReplay(room.meta, room.extra.shots || {});
    const cell = Number(body.cell);
    const team = myTeam;
    if (rp.winner) return reject('over');
    if (team !== rp.turn) return reject('not_your_turn');
    if (Number(body.n) !== rp.list.length) return reject('shot_taken');
    if (!Number.isInteger(cell) || cell < 0 || cell >= SJO.N * SJO.N) throw new HttpError(400, 'bad_cell');
    if (rp.list.some((s) => s.team === team && s.cell === cell)) return reject('already_shot');
    const hit = room.meta.ships[other(team)].some((ship) => ship.includes(cell));
    const [isNew] = await redis(cfg, [
      ['HSETNX', K(code, 'shots', race), String(rp.list.length), JSON.stringify({ team, cell, hit, by: me })],
      ['EXPIRE', K(code, 'shots', race), String(TTL)],
    ], ctx);
    return isNew === 1 ? reply({ shot: { cell, hit } }) : reject('shot_taken');
  }

  throw new HttpError(400, 'bad_action');
});
