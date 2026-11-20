// CK-24: past NBA seasons — final standings, play-in and the playoff bracket — from public/data/history/ (built by
// scripts/make-nba-history.ts from ESPN's free feeds). Loaded only when a past season is opened.

import { CALENDARKIT_BASE } from './address';

/** The seasons kept, by the year they end (2002 = 2001-02 … 2026 = 2025-26). Written out so the season strip needs
 * no request; a unit test keeps them equal to index.json. */
export const HISTORY_FIRST = 2002;
export const HISTORY_LAST = 2026;
export const HISTORY_YEARS: number[] = Array.from({ length: HISTORY_LAST - HISTORY_FIRST + 1 }, (_, i) => HISTORY_LAST - i);
/** "2015-16" for 2016. */
export const seasonLabel = (year: number) => `${year - 1}-${String(year).slice(2)}`;

export interface HistRow { t: string; seed: number; w: number; l: number; pct: number; gb: number; home: string; road: string; conf: string; l10?: string; streak?: string; diff: number; clincher?: string }
export interface HistGame { id: string; date: string; away: string; home: string; as: number; hs: number; ot?: string; note?: string }
export interface HistSeries { round: 1 | 2 | 3 | 4; conf?: 'East' | 'West'; a: string; b: string; aSeed: number; bSeed: number; winner: string; wins: [number, number]; games: HistGame[] }
export interface HistSeason { year: number; label: string; names: Record<string, string>; standings: Record<'East' | 'West', HistRow[]>; playIn: HistGame[]; series: HistSeries[] }
export interface HistIndexRow { year: number; label: string; champion: string; runnerUp: string; finals: [number, number]; east: string; west: string }

const cache = new Map<string, Promise<unknown>>();
const load = <T>(file: string) => {
  if (!cache.has(file)) cache.set(file, fetch(`${CALENDARKIT_BASE}data/history/${file}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${file}: HTTP ${r.status}`)))));
  return cache.get(file)! as Promise<T>;
};
export const loadSeason = (year: number) => load<HistSeason>(`${year}.json`);
export const loadIndex = () => load<{ seasons: HistIndexRow[] }>('index.json').then((x) => x.seasons);

export const ROUND_NAMES: Record<number, string> = { 1: 'First round', 2: 'Conference semifinals', 3: 'Conference finals', 4: 'NBA Finals' };

/**
 * A conference's bracket, top to bottom: first round in bracket order (1v8, 4v5, 3v6, 2v7), the semifinals (the
 * 1/8–4/5 side first), the final.
 */
export function bracketOf(series: HistSeries[], conf: 'East' | 'West'): HistSeries[][] {
  const mine = series.filter((s) => s.conf === conf);
  const r1 = [1, 4, 3, 2].map((top) => mine.find((s) => s.round === 1 && Math.min(s.aSeed, s.bSeed) === top)!).filter(Boolean);
  const from = (s: HistSeries | undefined) => (s ? [s.a, s.b] : []);
  const r2 = [0, 2].map((i) => mine.find((s) => s.round === 2 && [...from(r1[i]), ...from(r1[i + 1])].some((t) => t === s.a || t === s.b))!).filter(Boolean);
  const r3 = mine.filter((s) => s.round === 3);
  return [r1, r2, r3];
}

/** A play-in game's place: "7th v 8th", "9th v 10th", "for the 8th seed" (the third game of the conference). */
export function playInLabel(games: HistGame[], g: HistGame): string {
  const n = /(\d+)(?:st|nd|rd|th) Place vs (\d+)/i.exec(g.note ?? '');
  if (n) return `${n[1]}th v ${n[2]}th`;
  return /8th Seed|Seed/i.test(g.note ?? '') || games.indexOf(g) >= 4 ? 'For the 8th seed' : 'Play-in';
}

/** A past game's page: NBA.com's scores of that day (hoopsjunkie's coverage of past seasons couldn't be checked). */
export const pastGameUrl = (g: HistGame) => `https://www.nba.com/games?date=${g.date}`;

/** A series' key in a season: its round and its two teams (the bracket's boxes carry it). */
export const seriesKey = (s: HistSeries) => `${s.round}|${s.a}|${s.b}`;

/** Two teams' playoff meetings in a past season: their series (one at most) and their play-in games. */
export interface PastPlayoffs {
  year: number;
  series?: HistSeries;
  playIn: HistGame[];
}
export function pastPlayoffs(season: HistSeason, a: string, b: string): PastPlayoffs {
  const both = (x: string, y: string) => (x === a && y === b) || (x === b && y === a);
  return { year: season.year, series: season.series.find((s) => both(s.a, s.b)), playIn: season.playIn.filter((g) => both(g.away, g.home)) };
}

const ROUND_SHORT: Record<number, string> = { 1: '1st round', 2: 'semis', 3: 'finals' };
/** "Playoffs · West semis · DEN won 4-2" / "Playoffs · NBA Finals · BOS won 4-1": never mixed up with the regular season's count. */
export function playoffLine(s: HistSeries): string {
  const round = s.round === 4 ? 'NBA Finals' : `${s.conf ?? ''} ${ROUND_SHORT[s.round]}`.trim();
  return `Playoffs · ${round} · ${s.winner} won ${Math.max(...s.wins)}-${Math.min(...s.wins)}`;
}
