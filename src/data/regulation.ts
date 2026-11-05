// v1.40.0: regulation-time totals for Cup group games that went to overtime. The schedule feed has only final scores;
// the NBA's per-game boxscore (cdn.nba.com/static/json/liveData/boxscore/boxscore_<gameId>.json) has period scores.
// The daily snapshot job (scripts/update-schedule.ts) fetches the boxscore of every finished Cup group game it hasn't
// stored yet and keeps the regulation totals in the snapshot under `calendarkit.regulation`; the site only reads them
// (no extra request). No network here: the job passes its fetch in.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { isCountedCupGame } from './cup';

/** gameId → [away, home] points after the 4 regulation periods. */
export type RegulationTotals = Record<string, [away: number, home: number]>;

/** Where the snapshot keeps the totals (next to the feed's own `meta` and `leagueSchedule`). */
export interface SnapshotExtras {
  calendarkit?: { regulation?: RegulationTotals };
}

interface BoxPeriod {
  period?: unknown;
  periodType?: unknown;
  score?: unknown;
}
interface BoxTeam {
  score?: unknown;
  periods?: BoxPeriod[];
}

/** Sum of the REGULAR periods 1–4; undefined unless all four are there with numeric scores. */
function regulationOf(t: BoxTeam | undefined): number | undefined {
  const reg = (t?.periods ?? []).filter((p) => p.periodType === 'REGULAR' && typeof p.period === 'number' && p.period >= 1 && p.period <= 4);
  if (reg.length !== 4 || reg.some((p) => typeof p.score !== 'number')) return undefined;
  return reg.reduce((s, p) => s + (p.score as number), 0);
}

/**
 * Regulation totals from a boxscore response, or undefined when the game isn't final (gameStatus 3) or the period
 * scores are missing. Also checks the periods add up to the final score, so a half-updated boxscore is never stored.
 */
export function regulationFromBoxscore(box: unknown): { gameId: string; away: number; home: number } | undefined {
  const g = (box as { game?: { gameId?: unknown; gameStatus?: unknown; homeTeam?: BoxTeam; awayTeam?: BoxTeam } } | undefined)?.game;
  if (!g || typeof g.gameId !== 'string' || g.gameStatus !== 3) return undefined;
  const away = regulationOf(g.awayTeam);
  const home = regulationOf(g.homeTeam);
  if (away === undefined || home === undefined) return undefined;
  const total = (t: BoxTeam | undefined) => (t?.periods ?? []).reduce((s, p) => s + (typeof p.score === 'number' ? p.score : 0), 0);
  if (total(g.awayTeam) !== g.awayTeam?.score || total(g.homeTeam) !== g.homeTeam?.score) return undefined;
  return { gameId: g.gameId, away, home };
}

/** The stored totals in a snapshot (or an empty map), keeping only well-formed entries. */
export function storedRegulation(snapshot: unknown): RegulationTotals {
  const r = (snapshot as SnapshotExtras | undefined)?.calendarkit?.regulation;
  const out: RegulationTotals = {};
  if (r && typeof r === 'object') {
    for (const [id, v] of Object.entries(r)) if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) out[id] = [v[0], v[1]];
  }
  return out;
}

/**
 * The snapshot job's step: carries the previous snapshot's totals over and fetches the boxscore of each finished Cup
 * group game (isCountedCupGame) that has none yet. A failed or incomplete boxscore is skipped (warned) and tried again
 * the next day; the site counts that game's final score until then. Returns the totals and the ids fetched.
 */
export async function collectRegulation(
  games: readonly ScheduleGame[],
  previous: RegulationTotals,
  fetchBox: (gameId: string) => Promise<unknown>,
  warn: (msg: string) => void = console.warn,
): Promise<{ regulation: RegulationTotals; fetched: string[] }> {
  const regulation: RegulationTotals = {};
  const fetched: string[] = [];
  for (const g of games) {
    if (!isCountedCupGame(g)) continue;
    const kept = previous[g.gameId];
    if (kept) {
      regulation[g.gameId] = kept;
      continue;
    }
    fetched.push(g.gameId);
    try {
      const r = regulationFromBoxscore(await fetchBox(g.gameId));
      if (r && r.gameId === g.gameId) regulation[g.gameId] = [r.away, r.home];
      else warn(`boxscore ${g.gameId}: not final or no period scores yet; trying again tomorrow`);
    } catch (e) {
      warn(`boxscore ${g.gameId}: ${(e as Error).message}; trying again tomorrow`);
    }
  }
  return { regulation, fetched };
}
