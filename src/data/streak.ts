// Round 21 (item 8): the games of a win / loss streak — the ones behind "W6" / "L2" wherever a streak is shown. Pure,
// from the schedule already loaded (no request). Same rule as the season lines (model.ts teamSeason): regular-season
// games with a final score, in date order.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, overtime, teamGames, type CalendarData } from './model';

export interface StreakGame {
  game: ScheduleGame;
  win: boolean;
  home: boolean;
  opponentId: number;
  opponent: string;
  score: number;
  oppScore: number;
  /** "OT", "2OT", or undefined. */
  ot?: string;
}

/**
 * The streak `teamId` takes into `beforeGameId` (or its current streak, without one): its last finished regular-season
 * games of the same result, newest first. Empty before the first result.
 */
export function streakGames(data: CalendarData, teamId: number, beforeGameId?: string): StreakGame[] {
  const all = teamGames(data, teamId);
  const end = beforeGameId ? all.findIndex((g) => g.gameId === beforeGameId) : all.length;
  const done: StreakGame[] = [];
  for (const g of all.slice(0, end < 0 ? all.length : end)) {
    if (g.gameType !== 'regular') continue;
    const r = finalScore(g, teamId);
    if (!r) continue;
    const home = g.homeTeam.teamId === teamId;
    const opp = home ? g.awayTeam : g.homeTeam;
    done.push({ game: g, win: r.win, home, opponentId: opp.teamId, opponent: opp.teamTricode, score: r.score, oppScore: r.oppScore, ot: overtime(g) || undefined });
  }
  const out: StreakGame[] = [];
  for (let i = done.length - 1; i >= 0 && done[i]!.win === done.at(-1)!.win; i--) out.push(done[i]!);
  return out;
}
