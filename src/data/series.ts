// The regular-season series between two teams — which meeting a game is ("G2/4") and how the series
// stands. Counts regular-season games only (the feed's gameType "regular"): NBA Cup group games and the Cup's
// quarterfinals and semifinals included, the Cup Championship (gameType "cup-final"), play-in and playoffs not — NBA.com
// "NBA Cup 101": every Cup game counts toward the regular-season standings except the Championship. A knockout game
// joins a series only once the feed names both teams. From the loaded schedule; once per data set.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, teamGames, type CalendarData } from './model';

export interface Series {
  /** The meetings in date / tip-off order. */
  games: ScheduleGame[];
  /** The two teams, the lower team id first. */
  teams: [number, number];
}
export interface SeriesGame {
  series: Series;
  /** 1-based: this game is meeting `n` of `series.games.length`. */
  n: number;
}

const cache = new WeakMap<CalendarData, Map<string, SeriesGame>>();
const order = (a: ScheduleGame, b: ScheduleGame) => a.dateEt.localeCompare(b.dateEt) || (a.startTimeUtc ?? '').localeCompare(b.startTimeUtc ?? '') || a.gameId.localeCompare(b.gameId);

/** Every regular-season game's place in its series (gameId → SeriesGame). */
export function leagueSeries(data: CalendarData): Map<string, SeriesGame> {
  let out = cache.get(data);
  if (out) return out;
  out = new Map();
  const pairs = new Map<string, ScheduleGame[]>();
  for (const teamId of data.teamDates.keys())
    for (const g of teamGames(data, teamId)) {
      if (g.gameType !== 'regular' || !g.homeTeam.teamId || !g.awayTeam.teamId || g.homeTeam.teamId !== teamId) continue;
      const key = [g.homeTeam.teamId, g.awayTeam.teamId].sort((a, b) => a - b).join('-');
      (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(g);
    }
  for (const [key, games] of pairs) {
    games.sort(order);
    const [a, b] = key.split('-').map(Number) as [number, number];
    const series: Series = { games, teams: [a, b] };
    games.forEach((g, i) => out!.set(g.gameId, { series, n: i + 1 }));
  }
  cache.set(data, out);
  return out;
}

/** "G2/4". */
export const seriesChip = (s: SeriesGame) => `G${s.n}/${s.series.games.length}`;

/** Wins per team over the series' final games. */
export function seriesWins(s: Series): Map<number, number> {
  const w = new Map<number, number>(s.teams.map((t) => [t, 0]));
  for (const g of s.games) {
    const r = finalScore(g, s.teams[0]);
    if (!r) continue;
    const winner = r.win ? s.teams[0] : s.teams[1];
    w.set(winner, w.get(winner)! + 1);
  }
  return w;
}

/**
 * The series' state in words, from the games final so far: "DET leads 1–0", "Series tied 1–1", "BOS won 3–1" (all
 * played), "Only meeting" / "No games played yet" before any.
 */
export function seriesStatus(s: Series, tricode: (teamId: number) => string): string {
  const w = seriesWins(s);
  const [a, b] = s.teams;
  const wa = w.get(a)!;
  const wb = w.get(b)!;
  if (wa + wb === 0) return s.games.length === 1 ? 'Only meeting' : 'No games played yet';
  const done = wa + wb === s.games.length;
  if (wa === wb) return `Series ${done ? 'split' : 'tied'} ${wa}–${wb}`;
  const [lead, hi, lo] = wa > wb ? [a, wa, wb] : [b, wb, wa];
  return `${tricode(lead)} ${done ? 'won' : 'leads'} ${hi}–${lo}`;
}

/**
 * A back-to-back meeting for one team: its previous game (`prev`) or its next one (`next`) is against the same
 * opponent — consecutive in that team's own schedule, any number of days apart (not only calendar back-to-backs).
 * Checked per team: if BOS played MIA twice in a row but MIA played someone else in between, only BOS has it.
 */
export interface Rematch {
  teamId: number;
  /** The same opponent in this team's previous game (this is the rematch). */
  prev?: ScheduleGame;
  /** The same opponent in this team's next game (this is the first of the pair). */
  next?: ScheduleGame;
}

const rematchCache = new WeakMap<CalendarData, Map<string, Rematch[]>>();
const opponentOf = (g: ScheduleGame, teamId: number) => (g.homeTeam.teamId === teamId ? g.awayTeam.teamId : g.homeTeam.teamId);

/** Every series game with a back-to-back meeting: gameId → one entry per marked team. Once per data set. */
export function leagueRematches(data: CalendarData): Map<string, Rematch[]> {
  const cached = rematchCache.get(data);
  if (cached) return cached;
  const out = new Map<string, Rematch[]>();
  const series = leagueSeries(data);
  for (const teamId of data.teamDates.keys()) {
    // the team's whole schedule: a game of any kind in between breaks the run
    const games = teamGames(data, teamId).slice().sort(order);
    for (let i = 1; i < games.length; i++) {
      const a = games[i - 1]!;
      const b = games[i]!;
      const opp = opponentOf(a, teamId);
      if (!opp || opp !== opponentOf(b, teamId) || !series.has(a.gameId) || !series.has(b.gameId)) continue;
      for (const [g, key, other] of [[a, 'next', b], [b, 'prev', a]] as const) {
        const list: Rematch[] = out.get(g.gameId) ?? out.set(g.gameId, []).get(g.gameId)!;
        const r = list.find((x) => x.teamId === teamId) ?? (list.push({ teamId }), list[list.length - 1]!);
        r[key] = other;
      }
    }
  }
  for (const list of out.values()) list.sort((x, y) => x.teamId - y.teamId);
  rematchCache.set(data, out);
  return out;
}

/**
 * The marked teams of a game's chip: every marked team, or — in a team's own views (`focus`) — that team only
 * when it is marked.
 */
export const rematchesShown = (all: Rematch[] | undefined, focus?: number) => (all ?? []).filter((r) => !focus || r.teamId === focus);
