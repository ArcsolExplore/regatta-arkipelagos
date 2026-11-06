// Score rules as the server and the app currently define them (single source arrives in Fas 2).
import { readObjectLiteral } from './load.js';
export const SERVER_GAMES = readObjectLiteral('api/state.js', 'GAMES');
export const APP_RANGE = readObjectLiteral('public/app.js', 'RANGE');
export const SOLO = ['kryss', 'slalom', 'fortoj', 'parkera', 'navigator', 'fyr', 'tamp', 'grill', 'mas', 'svall', 'lots'];
export function inRange(id, v) {
  const r = SERVER_GAMES[id];
  return Number.isInteger(v) && ((r.dnf !== undefined && v === r.dnf) || (v >= r.min && v <= r.max));
}
