// Round 8 (3.2): a hovered game's back-to-back travel, per team: on the 2nd night, from where it played yesterday to
// tonight's game; on the 1st night, from tonight's game to where it plays tomorrow. Both ends are the feed's own
// location for each game (gameLocation), never the home arena. Shown only for the hovered game (3.3).

import { leagueFatigue } from '../data/fatigue';
import type { CalendarData } from '../data/model';
import { teamLabel } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { gameLocation, type GameLocation } from './location';

export interface TravelLine {
  teamId: number;
  team: string;
  /** Which side of tonight's game the team is: the line's colour. */
  side: 'away' | 'home';
  /** 2: came from yesterday's game; 1: goes on to tomorrow's. */
  night: 1 | 2;
  /** The other night's game. */
  other: ScheduleGame;
  from: GameLocation;
  to: GameLocation;
  /** Both ends at the same arena (a home stand, or two road games in one building): nothing to draw. */
  stays: boolean;
}

const sameArena = (a: GameLocation, b: GameLocation) => a.kind !== 'unknown' && b.kind !== 'unknown' && a.arena === b.arena;

/** The travel lines of `game` (0–4: each team, night 2 and/or night 1), away team first, then night 2 before night 1. */
export function travelLines(data: CalendarData, game: ScheduleGame): TravelLine[] {
  const f = leagueFatigue(data).get(game.gameId);
  const here = gameLocation(game);
  const out: TravelLine[] = [];
  for (const [side, t] of [['away', game.awayTeam], ['home', game.homeTeam]] as const) {
    const pairs = f?.get(t.teamId)?.pairs ?? [];
    for (const night of [2, 1] as const) {
      const pair = pairs.find((p) => (night === 2 ? p.second : p.first).gameId === game.gameId);
      if (!pair) continue;
      const other = night === 2 ? pair.first : pair.second;
      const there = gameLocation(other);
      const [from, to] = night === 2 ? [there, here] : [here, there];
      out.push({ teamId: t.teamId, team: teamLabel(t), side, night, other, from, to, stays: sameArena(from, to) });
    }
  }
  return out;
}
