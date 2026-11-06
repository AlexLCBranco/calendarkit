// Round 21 (items 10, 13): a Cup knockout game's venue and each team's rest / travel before it — from data only.
// Venue: the schedule feed's arena. A quarterfinal / semifinal is played at a team market: once the feed has the teams
// and the arena, the feed's home team is the host; before that, "venue TBD". The Championship is neutral (the feed names
// the arena: Hinkle Fieldhouse, Indianapolis, for 2026). In the simulator a game that isn't set yet is hosted by the
// higher seed (NBA.com "Cup 101"), at that team's home arena (src/map: the feed's arenas, never a guess).
// Rest / travel (item 13): days since the team's previous game before the game's date; for a team not at home, the trip
// from that previous game's arena (the map's arenas: src/data/geo.ts) — miles and time-zone change. A missing date or arena: TBD.

import { arenaOf, homeArena, miles, zoneOf } from './geo';
import type { Arena } from './arenas';
import { cupRound, teamGames, type CalendarData } from './model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { Venue } from '../slate/VenueMarker';

/** The real schedule's venue for a knockout game. */
export function knockoutVenue(g: ScheduleGame): Venue {
  const round = cupRound(g);
  if (round === 'final') return g.arenaName ? { kind: 'neutral', arena: g.arenaName, city: g.arenaCity || undefined } : { kind: 'tbd' };
  if ((round === 'qf' || round === 'sf') && g.homeTeam.teamId && g.awayTeam.teamId && g.arenaName) return { kind: 'host', teamId: g.homeTeam.teamId };
  return { kind: 'tbd' };
}

export interface Prep {
  /** Full days off since its previous game (0 = played yesterday); undefined: no date yet. */
  rest?: number;
  /** For a team not at home: the trip from its previous game's arena. */
  travel?: { miles: number; from?: string; to?: string };
  /** One line: "2d rest · ✈ 1,140 mi, ET→CT"; "TBD" when the date isn't set. */
  text: string;
  /** Details for the tooltip. */
  tip: string;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * `teamId`'s rest and travel before a game on `date` at `venue` (an arena; undefined = unknown). `home`: the team plays
 * at its own arena (no travel). The previous game: its last game in the schedule before `date`.
 */
export function prepFor(data: CalendarData, teamId: number, date: string | undefined, venue: Arena | undefined, restKnown = true): Prep {
  const tri = data.games.find((g) => g.homeTeam.teamId === teamId)?.homeTeam.teamTricode ?? '';
  if (!date) return { text: 'TBD', tip: `${tri}: the game's date isn't set yet` };
  const prev = teamGames(data, teamId).filter((g) => g.dateEt < date).at(-1);
  if (!prev) return { text: 'TBD', tip: `${tri}: no earlier game in the schedule` };
  const rest = daysBetween(prev.dateEt, date) - 1;
  const from = arenaOf(prev);
  const home = homeArena(data, teamId);
  const at = venue && home && venue.arena === home.arena;
  let travel: Prep['travel'];
  // the road team's trip (the host, at its own arena, has none)
  if (venue && from && !at) travel = { miles: Math.round(miles(from, venue)), from: zoneOf(from), to: zoneOf(venue) };
  // the simulator before the matchups have their nights: the trip from the last game is known, the rest isn't
  const restText = restKnown ? `${rest}d rest` : 'rest TBD';
  const travelText = travel && travel.miles >= 1 ? ` · ✈ ${travel.miles.toLocaleString('en-US')} mi${travel.from && travel.to && travel.from !== travel.to ? `, ${travel.from}→${travel.to}` : ''}` : '';
  const tip = `${tri}: last played ${prev.dateEt} (${prev.homeTeam.teamId === teamId ? 'vs' : '@'} ${prev.homeTeam.teamId === teamId ? prev.awayTeam.teamTricode : prev.homeTeam.teamTricode}${from ? `, ${from.city}` : ''}) — ${rest} day${rest === 1 ? '' : 's'} off${travel ? `; ${travel.miles.toLocaleString('en-US')} miles to ${venue!.city}${travel.from && travel.to ? ` (${travel.from}→${travel.to})` : ''}` : venue ? '; no travel (at home)' : '; venue not set'}`;
  return { rest, travel, text: venue || !from ? `${restText}${travelText}` : `${restText} · venue TBD`, tip };
}

/** The arena a real knockout game is played in (the feed's), if the map knows it. */
export const venueArena = (g: ScheduleGame): Arena | undefined => (g.arenaName ? arenaOf(g) : undefined);

/** A hypothetical game hosted by `host` (the simulator): its home arena. */
export const hostArena = (data: CalendarData, host: number) => homeArena(data, host);
