// "3 games in 4 nights" per team game. Ported from rotationkit (private repo AlexLCBranco/rotationkit,
// src/domain/scheduleTags.ts at 5a531d5; chip text and tooltip from src/components/ScheduleChips.tsx at 1401d85).
// Same rules: a set = 3 consecutive games of the team whose first and last game dates are at most 3 days apart
// (within 4 calendar days); each game gets its position in the set; a game in several overlapping sets shows its
// highest position and keeps all its sets (for the tooltip); unplayed games count. Differences: dates are the
// module's ET `dateEt` (the same calendar-day rule as calendarkit's back-to-backs), and the games are calendarkit's
// shown games (regular, cup-final, play-in, playoffs), which is rotationkit's "everything but preseason (001) and
// the All-Star game (003)". Always from all the team's games, never the TV filter.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { daysBetween, teamGames, type CalendarData } from './model';

export type Position = 1 | 2 | 3;

export interface ThreeInFourSet {
  /** The three games' ids and ET dates, oldest first. */
  ids: [string, string, string];
  dates: [string, string, string];
  /** This game's place in the set. */
  position: Position;
}

export interface ThreeInFour {
  /** Every set of 3 consecutive team games within 4 days that includes this game, in date order. */
  sets: ThreeInFourSet[];
  /** Highest position over those sets (the most fatigue-relevant). */
  position: Position;
}

export const ORDINAL: Record<Position, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

const cache = new WeakMap<CalendarData, Map<number, Map<string, ThreeInFour>>>();
/** A team's 3-in-4 games by gameId (games in no set are absent). Computed once per team and data set. */
export function teamThreeInFour(data: CalendarData, teamId: number): Map<string, ThreeInFour> {
  let byTeam = cache.get(data);
  if (!byTeam) cache.set(data, (byTeam = new Map()));
  let t = byTeam.get(teamId);
  if (!t) byTeam.set(teamId, (t = threeInFour(teamGames(data, teamId))));
  return t;
}

/** 3-in-4 sets over one team's games (sorted by date). */
export function threeInFour(games: ScheduleGame[]): Map<string, ThreeInFour> {
  const out = new Map<string, ThreeInFour>();
  for (let i = 0; i + 2 < games.length; i++) {
    const trio = [games[i]!, games[i + 1]!, games[i + 2]!];
    if (daysBetween(trio[0]!.dateEt, trio[2]!.dateEt) > 3) continue;
    trio.forEach((g, k) => {
      const position = (k + 1) as Position;
      const set: ThreeInFourSet = { ids: trio.map((x) => x.gameId) as ThreeInFourSet['ids'], dates: trio.map((x) => x.dateEt) as ThreeInFourSet['dates'], position };
      const t = out.get(g.gameId);
      if (t) {
        t.sets.push(set);
        t.position = Math.max(t.position, position) as Position;
      } else out.set(g.gameId, { sets: [set], position });
    });
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 21" (rotationkit's shortDate). */
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Chip text: "3-in-4 · 3rd". */
export const threeInFourLabel = (t: ThreeInFour) => `3-in-4 · ${ORDINAL[t.position]}`;

/** Tooltip: "3 games in 4 days — set:" (or "N sets:"), then one line per set: "Oct 21, Oct 22, Oct 24 (3rd game)". */
export function threeInFourTip(t: ThreeInFour, team?: string): string {
  const sets = t.sets.map((s) => `${s.dates.map(shortDate).join(', ')} (${ORDINAL[s.position]} game)`).join('\n');
  return `${team ? `${team}: ` : ''}3 games in 4 days — ${t.sets.length === 1 ? 'set' : `${t.sets.length} sets`}:\n${sets}`;
}
