// The maps' travel view: for a focused game, for each of its two teams, the leg from the team's previous game to
// this one and from this one to its next game. Both ends are the feed's own arena for each game (gameLocation), so
// neutral-site and international games land where they're played. Rest = days between the two game dates (rest.ts
// restDays: the same count as the lists' rest chips; a back-to-back is 1). Time-zone change = the two arenas' UTC offsets at the
// later game's tip-off (so a DST switch in between isn't counted). Straight-line (great-circle) miles.
// Pure; worked out once per game (cached per data set): hovering rows never recomputes it.

import { arenaOf, miles } from '../data/geo';
import { leagueFatigue } from '../data/fatigue';
import type { CalendarData } from '../data/model';
import { dateFormat, teamLabel } from '../data/model';
import { restDays } from '../data/rest';
import { mergedChip } from '../data/scheduleTags';
import type { Arena } from '../data/arenas';
import { STATE_ZONE } from '../data/zones';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { gameLocation, type GameLocation } from './location';

export interface Leg {
  /** The team's other game: the previous one (for `prev`) or the next one (for `next`). */
  game: ScheduleGame;
  loc: GameLocation;
  /** Straight-line miles between the two arenas (0 when the same); undefined when either place is unknown. */
  miles?: number;
  /** Both games in one arena: no line to draw. */
  stays: boolean;
  /** Days between the two game dates (1 = back-to-back). */
  rest: number;
  /** Hours the clock moves going from the earlier game's place to the later one's (+3: LA → Boston); undefined if unknown. */
  tz?: number;
}

export interface TeamTravel {
  teamId: number;
  team: string;
  /** The team's side in the focused game. */
  side: 'away' | 'home';
  /** undefined: the season opener. */
  prev?: Leg;
  /** undefined: no next game in the schedule. */
  next?: Leg;
  /** The merged 3-in-4 stretch label ("3in4 · 2nd"), as the lists' chip; and its position (1–3+), for the chip's tint. */
  tif?: { label: string; position: number };
}

export interface GameTravel {
  game: ScheduleGame;
  loc: GameLocation;
  /** Away team first. */
  teams: TeamTravel[];
}

/** IANA zone of an arena (US by state; Arizona keeps standard time; the few places abroad by country / city). */
export function ianaZone(a: Arena): string | undefined {
  if (a.state === 'AZ') return 'America/Phoenix';
  if (a.state === 'ON') return 'America/Toronto';
  if (a.state === 'MX') return 'America/Mexico_City';
  if (a.state === 'FR') return 'Europe/Paris';
  if (a.city === 'Manchester' || a.city === 'London') return 'Europe/London';
  const z = STATE_ZONE[a.state];
  return z && { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' }[z];
}

/** UTC offset in hours of `zone` at `ms` ("GMT-05:00" → -5). */
export function utcOffset(zone: string, ms: number): number {
  const s = dateFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(s);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2]! + +m[3]! / 60) : 0;
}

const when = (g: ScheduleGame) => (g.startTimeUtc ? Date.parse(g.startTimeUtc) : Date.parse(`${g.dateEt}T12:00:00Z`));

/** Clock change (hours) from game a's place to game b's (a before b); undefined if either place has no known zone. */
export function tzChange(a: ScheduleGame, b: ScheduleGame): number | undefined {
  const [x, y] = [arenaOf(a), arenaOf(b)];
  const [zx, zy] = [x && ianaZone(x), y && ianaZone(y)];
  if (!zx || !zy) return undefined;
  // both at the later tip-off: a DST switch between the games is no travel
  return utcOffset(zy, when(b)) - utcOffset(zx, when(b));
}

const legOf = (other: ScheduleGame, earlier: ScheduleGame, later: ScheduleGame): Leg => {
  const [a, b] = [arenaOf(earlier), arenaOf(later)];
  const stays = !!a && a === b;
  return { game: other, loc: gameLocation(other), miles: a && b ? Math.round(miles(a, b)) : undefined, stays, rest: restDays(earlier, later), tz: tzChange(earlier, later) };
};

/** Per data set: each team's games in order, and the travel of each game asked for. */
const cache = new WeakMap<CalendarData, { teams: Map<number, ScheduleGame[]>; games: Map<string, GameTravel> }>();
const cacheOf = (data: CalendarData) => {
  let c = cache.get(data);
  if (!c) cache.set(data, (c = { teams: new Map(), games: new Map() }));
  return c;
};

function gamesOf(data: CalendarData, teamId: number): ScheduleGame[] {
  const c = cacheOf(data);
  let t = c.teams.get(teamId);
  if (!t) c.teams.set(teamId, (t = data.games.filter((g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId)));
  return t;
}

/** The travel view of a game (both teams' previous → this → next). Cached per game. */
export function gameTravel(data: CalendarData, game: ScheduleGame): GameTravel {
  const c = cacheOf(data);
  const hit = c.games.get(game.gameId);
  if (hit) return hit;
  const fatigue = leagueFatigue(data).get(game.gameId);
  const teams: TeamTravel[] = [];
  for (const [side, t] of [['away', game.awayTeam], ['home', game.homeTeam]] as const) {
    if (!t.teamId) continue;
    const games = gamesOf(data, t.teamId);
    const i = games.findIndex((g) => g.gameId === game.gameId);
    const prev = i > 0 ? games[i - 1] : undefined;
    const next = i >= 0 ? games[i + 1] : undefined;
    const m = fatigue?.get(t.teamId)?.tif?.merged;
    teams.push({
      teamId: t.teamId,
      team: teamLabel(t),
      side,
      ...(prev ? { prev: legOf(prev, prev, game) } : {}),
      ...(next ? { next: legOf(next, game, next) } : {}),
      ...(m ? { tif: { label: mergedChip(m), position: m.position } } : {}),
    });
  }
  const out = { game, loc: gameLocation(game), teams };
  c.games.set(game.gameId, out);
  return out;
}

/** "+3h", "−2h", "+0.5h", "none"; undefined → "?". */
export const tzLabel = (h: number | undefined) => (h === undefined ? '?' : h === 0 ? 'none' : `${h > 0 ? '+' : '−'}${Math.abs(h)}h`);
