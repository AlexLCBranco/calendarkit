// CK-19: offensive and defensive rating — points scored and allowed per 100 possessions — for Standings' Ratings set.
// Possessions and points scored come from public/data/ratings.json (ESPN's team statistics, written daily by
// scripts/update-ratings.ts). Points allowed come from the schedule: the team's first `gp` games that count in the
// standings, so both sides cover the same games even when the schedule has moved on since ESPN's numbers.
// DRtg uses the team's own possessions (a team and its opponent have about the same number in a game).

import { CALENDARKIT_BASE } from './address';
import type { CalendarData } from './model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { countsInStandings } from './standings';
import { TEAMS } from './teams';

export const RATINGS_URL = `${CALENDARKIT_BASE}data/ratings.json`;

/** Per team (NBA tricode): [games played, possessions, points scored], regular season so far. */
export interface RatingsFile {
  source: string;
  season: string;
  teams: Record<string, [gp: number, poss: number, pts: number]>;
}

export interface TeamRating {
  ortg: number;
  drtg: number;
  net: number;
  /** League ranks, 1 = best: highest ORtg, lowest DRtg, highest Net. */
  ortgRank: number;
  drtgRank: number;
  netRank: number;
}

type Stat = { name: string; value: number };
/** [gp, possessions, points] from one ESPN team-statistics answer; throws when a number is missing. */
export function parseRatingsStats(json: unknown): [number, number, number] {
  const cats = (json as { splits?: { categories?: { stats: Stat[] }[] } }).splits?.categories ?? [];
  const val = (name: string) => {
    for (const c of cats) for (const s of c.stats) if (s.name === name && Number.isFinite(s.value)) return s.value;
    throw new Error(`ESPN team statistics: no ${name}`);
  };
  return [val('gamesPlayed'), Math.round(val('possessions') * 10) / 10, val('points')];
}

/** Points per 100 possessions, to one decimal. */
export const per100 = (points: number, poss: number) => Math.round((points / poss) * 1000) / 10;

/** Rank by value, 1 = best; equal values share a rank. */
function ranks(values: Map<number, number>, lowerIsBetter: boolean): Map<number, number> {
  const sorted = [...values.values()].sort((a, b) => (lowerIsBetter ? a - b : b - a));
  return new Map([...values].map(([id, v]) => [id, sorted.indexOf(v) + 1]));
}

/** Each team's ratings; a team with no games (or missing from the file) is left out. */
export function teamRatings(games: readonly ScheduleGame[], file: RatingsFile): Map<number, TeamRating> {
  const counted = games.filter(countsInStandings).sort((a, b) => a.dateEt.localeCompare(b.dateEt) || (a.startTimeUtc ?? '').localeCompare(b.startTimeUtc ?? ''));
  const base = new Map<number, { ortg: number; drtg: number; net: number }>();
  for (const t of TEAMS) {
    const row = file.teams[t.tricode];
    if (!row) continue;
    const [gp, poss, pts] = row;
    if (!gp || !poss) continue;
    const mine = counted.filter((g) => g.homeTeam.teamId === t.id || g.awayTeam.teamId === t.id).slice(0, gp);
    if (!mine.length) continue;
    const allowed = mine.reduce((s, g) => s + (g.homeTeam.teamId === t.id ? g.awayTeam.score : g.homeTeam.score), 0);
    // the schedule behind ESPN (rare): the same share of the possessions
    const ortg = per100(pts, poss);
    const drtg = per100(allowed, (poss * mine.length) / gp);
    base.set(t.id, { ortg, drtg, net: Math.round((ortg - drtg) * 10) / 10 });
  }
  const pick = (k: 'ortg' | 'drtg' | 'net') => new Map([...base].map(([id, r]) => [id, r[k]]));
  const [o, d, n] = [ranks(pick('ortg'), false), ranks(pick('drtg'), true), ranks(pick('net'), false)];
  return new Map([...base].map(([id, r]) => [id, { ...r, ortgRank: o.get(id)!, drtgRank: d.get(id)!, netRank: n.get(id)! }]));
}

const cache = new WeakMap<CalendarData, WeakMap<RatingsFile, Map<number, TeamRating>>>();
export function leagueRatings(data: CalendarData, file: RatingsFile): Map<number, TeamRating> {
  let byFile = cache.get(data);
  if (!byFile) cache.set(data, (byFile = new WeakMap()));
  let out = byFile.get(file);
  if (!out) byFile.set(file, (out = teamRatings(data.games, file)));
  return out;
}

let loading: Promise<RatingsFile> | undefined;
/** The file, fetched once per page (a failure is forgotten, so the next visit tries again). */
export function loadRatings(fetcher: (url: string) => Promise<RatingsFile> = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<RatingsFile>) : Promise.reject(new Error(`ratings ${r.status}`))))): Promise<RatingsFile> {
  loading ??= fetcher(RATINGS_URL).catch((e: unknown) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
