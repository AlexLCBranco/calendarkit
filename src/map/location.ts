// Round 8 (2.4, 2.5): where a game is played, from the feed's own location fields (arenaName / arenaCity /
// arenaState) — not the home team's usual arena, so neutral-site and international games land where they're played.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { ARENAS, type Arena } from './arenas';
import { MAP_H, MAP_W } from './basemap';
import { inMap, project } from './project';

export type GameLocation =
  /** On the map: x, y in map units. */
  | { kind: 'map'; arena: Arena; x: number; y: number; label: string }
  /** A known place outside the drawn area: a marker on the map's edge, pointing its way. */
  | { kind: 'edge'; arena: Arena; x: number; y: number; arrow: '←' | '→' | '↑' | '↓'; label: string }
  /** The feed names no arena (e.g. Cup knockout games not scheduled yet) or one not in ARENAS: never guessed. */
  | { kind: 'unknown'; label: string };

const key = (name: string, city: string) => `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
const BY_KEY = new Map(ARENAS.map((a) => [key(a.arena, a.city), a]));

/** The table entry for the feed's arena, if any. */
export const arenaOf = (g: Pick<ScheduleGame, 'arenaName' | 'arenaCity'>) => BY_KEY.get(key(g.arenaName ?? '', g.arenaCity ?? ''));

/** "Oklahoma City, OK", "Toronto, ON", "Paris, France". */
export const placeName = (a: Arena) => a.place ?? (a.state ? `${a.city}, ${a.state}` : a.city);

/** Edge markers sit this far (map units) inside the frame: at the 1280 px map (299 px) still 9 px, half a label. */
const EDGE = 30;

export function gameLocation(g: Pick<ScheduleGame, 'arenaName' | 'arenaCity' | 'arenaState'>): GameLocation {
  const a = arenaOf(g);
  if (!a) return { kind: 'unknown', label: g.arenaName ? `${g.arenaName}, ${g.arenaCity}` : 'Arena not set' };
  const p = project(a.lon, a.lat);
  if (inMap(p)) return { kind: 'map', arena: a, x: p[0], y: p[1], label: placeName(a) };
  // outside: across the Atlantic → the right edge (east); otherwise the edge the point lies beyond
  if (a.lon > -50) return { kind: 'edge', arena: a, x: MAP_W - EDGE, y: MAP_H * 0.3, arrow: '→', label: placeName(a) };
  const [x, y] = p;
  const cx = Math.min(MAP_W - EDGE, Math.max(EDGE, x));
  const cy = Math.min(MAP_H - EDGE, Math.max(EDGE, y));
  const arrow = y > MAP_H - EDGE ? '↓' : y < EDGE ? '↑' : x < EDGE ? '←' : '→';
  return { kind: 'edge', arena: a, x: cx, y: cy, arrow, label: placeName(a) };
}
