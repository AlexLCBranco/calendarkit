// Where a game is, how far apart two arenas are and in which time zone — the pure part of the map's
// location / trip logic (src/map/location.ts, trips.ts re-export these), in the data layer so the Slate part can use it
// without the map's drawing code.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { ARENAS, type Arena } from './arenas';
import { teamGames, type CalendarData } from './model';
import { STATE_ZONE, type Zone } from './zones';

const key = (name: string, city: string) => `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
const BY_KEY = new Map(ARENAS.map((a) => [key(a.arena, a.city), a]));

/** The table entry for the feed's arena, if any. */
export const arenaOf = (g: Pick<ScheduleGame, 'arenaName' | 'arenaCity'>) => BY_KEY.get(key(g.arenaName ?? '', g.arenaCity ?? ''));

/** The team's home arena: where most of its home games in the feed are played. */
export function homeArena(data: CalendarData, teamId: number): Arena | undefined {
  const counts = new Map<Arena, number>();
  for (const g of teamGames(data, teamId)) {
    if (g.homeTeam.teamId !== teamId) continue;
    const a = arenaOf(g);
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0];
}

const R_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle distance in miles. */
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

/** A place's time zone: US states from zones.ts, Toronto (ON) ET; elsewhere unknown. */
export const zoneOf = (a: Arena): Zone | undefined => (a.state === 'ON' ? 'ET' : STATE_ZONE[a.state]);
