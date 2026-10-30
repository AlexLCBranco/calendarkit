// "3 games in 4 nights" per team game. Ported from rotationkit (private repo AlexLCBranco/rotationkit,
// src/domain/scheduleTags.ts at 5a531d5; chip text and tooltip from src/components/ScheduleChips.tsx at 1401d85).
// Same rules: a set = 3 consecutive games of the team whose first and last game dates are at most 3 days apart
// (within 4 calendar days); each game gets its position in the set; a game in several overlapping sets shows its
// highest position and keeps all its sets (for the tooltip); unplayed games count. Differences: dates are the
// module's ET `dateEt` (the same calendar-day rule as calendarkit's back-to-backs), and the games are calendarkit's
// shown games (regular, cup-final, play-in, playoffs), which is rotationkit's "everything but preseason (001) and
// the All-Star game (003)". Always from all the team's games, never the TV filter.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { addDays, daysBetween, teamGames, type CalendarData } from './model';

export type Position = 1 | 2 | 3;

export interface ThreeInFourSet {
  /** The three games' ids and ET dates, oldest first. */
  ids: [string, string, string];
  dates: [string, string, string];
  /** This game's place in the set. */
  position: Position;
}

/**
 * Round 6: the team's 3-in-4 sets that overlap (share a game), chained, as one stretch: "4in6" = 4 games in the 6 days
 * from the first to the last (inclusive), and tonight's place in it. A set that overlaps no other is its own stretch.
 */
export interface MergedThreeInFour {
  /** The stretch's games' ids and ET dates, oldest first. */
  ids: string[];
  dates: string[];
  /** Days from the first game to the last, inclusive. */
  days: number;
  /** This game's place in the stretch (1 = first). */
  position: number;
}

export interface ThreeInFour {
  /** Every set of 3 consecutive team games within 4 days that includes this game, in date order. */
  sets: ThreeInFourSet[];
  /** Highest position over those sets (the most fatigue-relevant). */
  position: Position;
  /** The merged stretch this game is in (round 6). */
  merged: MergedThreeInFour;
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

/** 3-in-4 sets over one team's games (sorted by date), each game's merged stretch with them. */
export function threeInFour(games: ScheduleGame[]): Map<string, ThreeInFour> {
  const out = new Map<string, ThreeInFour>();
  const starts: number[] = []; // the first game of every set
  for (let i = 0; i + 2 < games.length; i++) {
    const trio = [games[i]!, games[i + 1]!, games[i + 2]!];
    if (daysBetween(trio[0]!.dateEt, trio[2]!.dateEt) > 3) continue;
    starts.push(i);
    trio.forEach((g, k) => {
      const position = (k + 1) as Position;
      const set: ThreeInFourSet = { ids: trio.map((x) => x.gameId) as ThreeInFourSet['ids'], dates: trio.map((x) => x.dateEt) as ThreeInFourSet['dates'], position };
      const t = out.get(g.gameId);
      if (t) {
        t.sets.push(set);
        t.position = Math.max(t.position, position) as Position;
      } else out.set(g.gameId, { sets: [set], position, merged: undefined! });
    });
  }
  // Sets of consecutive games overlap exactly when their first games are at most 2 apart; a run of such sets (chained:
  // A overlaps B, B overlaps C) is one stretch, from the first set's first game to the last set's last game.
  for (let a = 0; a < starts.length; ) {
    let b = a;
    while (b + 1 < starts.length && starts[b + 1]! - starts[b]! <= 2) b++;
    const stretch = games.slice(starts[a], starts[b]! + 3);
    const ids = stretch.map((g) => g.gameId);
    const dates = stretch.map((g) => g.dateEt);
    const days = daysBetween(dates[0]!, dates.at(-1)!) + 1;
    stretch.forEach((g, k) => (out.get(g.gameId)!.merged = { ids, dates, days, position: k + 1 }));
    a = b + 1;
  }
  return out;
}

/** "1st", "2nd", "3rd", "4th" … (stretches run to 7 games in the 2026-27 season). */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** The merged stretch's label: "4in6" (games in days, first to last game inclusive). */
export const mergedLabel = (m: MergedThreeInFour) => `${m.ids.length}in${m.days}`;

/** The Fatigue component's chip (round 6): "4in6 · 2nd" — the stretch, then tonight's place in it. */
export const mergedChip = (m: MergedThreeInFour) => `${mergedLabel(m)} · ${ordinal(m.position)}`;

/** Pop-up line: "4 games in 6 days (Oct 28 – Nov 2), tonight the 2nd". */
export const mergedTip = (m: MergedThreeInFour) => `${m.ids.length} games in ${m.days} days (${shortDate(m.dates[0]!)} – ${shortDate(m.dates.at(-1)!)}), tonight the ${ordinal(m.position)}`;

/**
 * The pop-up's day strip (round 6): every day from the stretch's first game to its last — "g" a game day, "r" a rest
 * day, "t" tonight — as "YYYY-MM-DD:k" joined by spaces (an attribute the shared tooltip draws, Tooltip.tsx).
 */
export function mergedDays(m: MergedThreeInFour): string {
  const games = new Set(m.dates);
  const tonight = m.dates[m.position - 1];
  const out: string[] = [];
  for (let d = m.dates[0]!; d <= m.dates.at(-1)!; d = addDays(d, 1)) out.push(`${d}:${d === tonight ? 't' : games.has(d) ? 'g' : 'r'}`);
  return out.join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 21" (rotationkit's shortDate). */
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Chip text: "3-in-4 · 3rd"; `short` (calendar cells): "3in4·3rd". */
export const threeInFourLabel = (t: ThreeInFour, short = false) => (short ? `3in4·${ORDINAL[t.position]}` : `3-in-4 · ${ORDINAL[t.position]}`);

/** Tooltip: "3 games in 4 days — set:" (or "N sets:"), then one line per set: "Oct 21, Oct 22, Oct 24 (3rd game)". */
export function threeInFourTip(t: ThreeInFour, team?: string): string {
  const sets = t.sets.map((s) => `${s.dates.map(shortDate).join(', ')} (${ORDINAL[s.position]} game)`).join('\n');
  return `${team ? `${team}: ` : ''}3 games in 4 days — ${t.sets.length === 1 ? 'set' : `${t.sets.length} sets`}:\n${sets}`;
}
