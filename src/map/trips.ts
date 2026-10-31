// Team map (after round 8): a team's road trips — runs of consecutive games played away from its home metro, by the
// feed's own arena for each game (so SAS's "home" games in Austin and IND's in Mexico City are travel too) — and each
// trip's numbers. Pure; tests/trips.test.ts checks them against the season.

import { metroOf } from '../data/metro';
import { daysBetween, isOver, teamB2BPairs, teamGames, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { Arena } from './arenas';
import { arenaOf, gameLocation, type GameLocation } from './location';
import { STATE_ZONE, type Zone } from './zones';

export interface Trip {
  /** The trip's games in order (1 or more). */
  games: ScheduleGame[];
  /** Index of the trip in the team's season (0-based). */
  index: number;
}

export interface TripStats {
  games: number;
  /** First and last game dates (ET). */
  from: string;
  to: string;
  /** Calendar days from the first game to the last, both counted. */
  days: number;
  /** Straight-line (great-circle) miles home → each stop → home; undefined when a stop's place is unknown. */
  miles?: number;
  /** Time-zone changes along home → stops → home (US/Canada arenas only; undefined when a stop has no known zone). */
  zoneChanges?: number;
  /** The zones visited, in order, without repeats in a row (home first and last). */
  zones: Zone[];
  /** Back-to-back pairs with both nights on the trip. */
  b2b: number;
}

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

/** The game is in the team's home metro (unknown places count as away: they aren't home). */
export function atHome(g: ScheduleGame, home: Arena | undefined): boolean {
  const a = arenaOf(g);
  return !!a && !!home && metroOf(a.city) === metroOf(home.city);
}

/** Every road trip of the team, in order. */
export function teamTrips(data: CalendarData, teamId: number): Trip[] {
  const home = homeArena(data, teamId);
  const out: Trip[] = [];
  let cur: ScheduleGame[] = [];
  for (const g of teamGames(data, teamId)) {
    if (atHome(g, home)) {
      if (cur.length) out.push({ games: cur, index: out.length });
      cur = [];
    } else cur.push(g);
  }
  if (cur.length) out.push({ games: cur, index: out.length });
  return out;
}

/** The trip to show by default: the one under way at `now` (its next game not over), else the next one, else the last. */
export function currentTrip(trips: Trip[], now: number): Trip | undefined {
  return trips.find((t) => t.games.some((g) => !isOver(g, now))) ?? trips.at(-1);
}

/** The trip a game belongs to (undefined for a home game). */
export const tripOf = (trips: Trip[], gameId: string) => trips.find((t) => t.games.some((g) => g.gameId === gameId));

const R_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle distance in miles. */
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

/** A place's time zone: US states from zones.ts, Toronto (ON) ET; elsewhere unknown. */
export const zoneOf = (a: Arena): Zone | undefined => (a.state === 'ON' ? 'ET' : STATE_ZONE[a.state]);

export function tripStats(data: CalendarData, teamId: number, trip: Trip): TripStats {
  const home = homeArena(data, teamId);
  const stops = trip.games.map((g) => arenaOf(g));
  const path = home && stops.every(Boolean) ? [home, ...(stops as Arena[]), home] : undefined;
  let total = 0;
  if (path) for (let i = 1; i < path.length; i++) total += miles(path[i - 1]!, path[i]!);
  const zs = path?.map(zoneOf);
  const zones: Zone[] = [];
  for (const z of zs ?? []) if (z && zones.at(-1) !== z) zones.push(z);
  const ids = new Set(trip.games.map((g) => g.gameId));
  return {
    games: trip.games.length,
    from: trip.games[0]!.dateEt,
    to: trip.games.at(-1)!.dateEt,
    days: daysBetween(trip.games[0]!.dateEt, trip.games.at(-1)!.dateEt) + 1,
    miles: path ? Math.round(total) : undefined,
    zoneChanges: zs && zs.every(Boolean) ? zones.length - 1 : undefined,
    zones,
    b2b: teamB2BPairs(data, teamId).filter((p) => ids.has(p.first.gameId) && ids.has(p.second.gameId)).length,
  };
}

/** A stop on the map: the trip's games at one place (a team can play twice in one city), numbered in trip order. */
export interface Stop {
  loc: GameLocation;
  games: { game: ScheduleGame; n: number }[];
}

export function tripStops(trip: Trip): Stop[] {
  const out: Stop[] = [];
  trip.games.forEach((game, i) => {
    const loc = gameLocation(game);
    const same = loc.kind !== 'unknown' ? out.find((s) => s.loc.kind !== 'unknown' && s.loc.arena === loc.arena) : undefined;
    if (same) same.games.push({ game, n: i + 1 });
    else out.push({ loc, games: [{ game, n: i + 1 }] });
  });
  return out;
}
