// NBA Cup schedule (round 12): the Cup's nights and each team's Cup games, from the schedule already loaded. Pure: no UI,
// no clock of its own; the Cup view calls it only when its Schedule tab is opened.
//
// What the feed gives for knockout games (checked 2026-10-31): gameSubtype "in-season-knockout", gameSubLabel
// "Quarterfinal" / "Semifinal" / "Championship" (the Final also has gameId prefix 006 → gameType "cup-final"). Until the
// teams are known both sides are teamId 0 with null tricode, name, city and slug, seed 0 — no placeholder text such as
// "Winner West A" — and the QF/SF games have no time ("TBD") and no arena. So undecided sides show "TBD", and a team's
// knockout games appear only once the feed puts the team in them (never predicted from the standings).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { cupRound, cupTag, dateFormat, teamGames, type CalendarData, type CupRound } from './model';

export const CUP_ROUNDS: readonly { round: CupRound; label: string }[] = [
  { round: 'group', label: 'Group play' },
  { round: 'qf', label: 'Quarterfinals' },
  { round: 'sf', label: 'Semifinals' },
  { round: 'final', label: 'Final' },
];
export const CUP_ROUND_LABEL = Object.fromEntries(CUP_ROUNDS.map((r) => [r.round, r.label])) as Record<CupRound, string>;

export const isCupGame = (g: ScheduleGame) => cupRound(g) !== undefined;

/** One night with Cup games: only its Cup games (a knockout night's other games are left out), in tip-off order. */
export interface CupNight {
  date: string;
  round: CupRound;
  games: ScheduleGame[];
}

const nightsCache = new WeakMap<CalendarData, CupNight[]>();

/** Every night with Cup games, in date order (once per data set). A night's round is its latest-stage Cup game's. */
export function cupNights(data: CalendarData): CupNight[] {
  let out = nightsCache.get(data);
  if (out) return out;
  out = [];
  for (const date of data.dates) {
    const games = data.byDate.get(date)!.filter(isCupGame);
    if (!games.length) continue;
    const order = CUP_ROUNDS.map((r) => r.round);
    const round = games.map((g) => cupRound(g)!).reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a));
    out.push({ date, round, games });
  }
  nightsCache.set(data, out);
  return out;
}

/** The night the League list opens on: today if it has Cup games, else the next one; after the Final, the last night. */
export function cupOpeningNight(nights: CupNight[], today: string): string | undefined {
  return (nights.find((n) => n.date >= today) ?? nights.at(-1))?.date;
}

/** A round's first night (undefined while the feed has none). */
export const roundFirstNight = (nights: CupNight[], round: CupRound) => nights.find((n) => n.round === round)?.date;

/** The night's heading: "Group play · Tue, Nov 10". */
export const cupNightHeading = (n: Pick<CupNight, 'date' | 'round'>) =>
  `${CUP_ROUND_LABEL[n.round]} · ${dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${n.date}T12:00:00Z`))}`;

/** One team's Cup games in date order, split into finished ones and the rest. */
export function teamCupGames(data: CalendarData, teamId: number): { played: ScheduleGame[]; remaining: ScheduleGame[] } {
  const games = teamGames(data, teamId).filter(isCupGame);
  return { played: games.filter((g) => g.status === 'final'), remaining: games.filter((g) => g.status !== 'final') };
}

// ---------------------------------------------------------------- group play by round (round 12b, Alex: "sort by round 1 2 3 4")
//
// The NBA plays group play on shared Cup nights, not in rounds: in 2026-27, 16 of the 60 group games are one team's Nth
// group game and the other's (N+1)th (e.g. Nov 6, CHA @ WAS: CHA's 2nd, WAS's 1st). Round N here = every team's Nth group
// game (Alex's pick): each team appears exactly once per round, and a game whose teams are on different numbers is in both
// rounds, its tag "East C · G2/G1" (away team's number / home team's, the row's order; round 12b: the team names made the
// tag too wide for a two-column row at 1600 px).

const numbersCache = new WeakMap<CalendarData, Map<string, { away: number; home: number }>>();

/** Each group game's number for each team (1–4): the team's own group games in date and tip-off order (once per data set). */
export function cupGroupNumbers(data: CalendarData): Map<string, { away: number; home: number }> {
  let out = numbersCache.get(data);
  if (out) return out;
  const count = new Map<number, number>();
  const next = (teamId: number) => {
    const n = (count.get(teamId) ?? 0) + 1;
    count.set(teamId, n);
    return n;
  };
  out = new Map();
  for (const g of data.games) if (g.isCupGroupGame) out.set(g.gameId, { away: next(g.awayTeam.teamId), home: next(g.homeTeam.teamId) });
  numbersCache.set(data, out);
  return out;
}

/**
 * What the League list steps through: group play's rounds (Round 1–4, key "r1"…), then the knockout nights (key = the
 * date). `first` / `last`: the ET dates its games span.
 */
export interface CupStop {
  key: string;
  round: CupRound;
  /** Group play: 1–4. */
  group?: number;
  games: ScheduleGame[];
  first: string;
  last: string;
}

const stopsCache = new WeakMap<CalendarData, CupStop[]>();

export function cupStops(data: CalendarData): CupStop[] {
  let out = stopsCache.get(data);
  if (out) return out;
  const numbers = cupGroupNumbers(data);
  const rounds = Math.max(0, ...[...numbers.values()].flatMap((n) => [n.away, n.home]));
  out = [];
  for (let r = 1; r <= rounds; r++) {
    const games = data.games.filter((g) => {
      const n = numbers.get(g.gameId);
      return n && (n.away === r || n.home === r);
    });
    out.push({ key: `r${r}`, round: 'group', group: r, games, first: games[0]!.dateEt, last: games.at(-1)!.dateEt });
  }
  for (const n of cupNights(data)) {
    const games = n.games.filter((g) => !g.isCupGroupGame);
    if (games.length) out.push({ key: n.date, round: cupRound(games.at(-1)!)!, games, first: n.date, last: n.date });
  }
  stopsCache.set(data, out);
  return out;
}

/** Where the League list opens: the first round or knockout night with a game today or later (a round still being played
 * included); after the Final, the Final. */
export const cupOpeningStop = (stops: CupStop[], today: string) => (stops.find((s) => s.last >= today) ?? stops.at(-1))?.key;

const day = (date: string, opts: Intl.DateTimeFormatOptions) => dateFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));

/** "Group play · Round 2 · Nov 6 – 13", "Quarterfinals · Fri, Dec 4". */
export function cupStopHeading(s: CupStop): string {
  if (s.group === undefined) return cupNightHeading({ date: s.first, round: s.round });
  const a = day(s.first, { month: 'short', day: 'numeric' });
  const span = s.first === s.last ? a : s.first.slice(0, 7) === s.last.slice(0, 7) ? `${a} – ${day(s.last, { day: 'numeric' })}` : `${a} – ${day(s.last, { month: 'short', day: 'numeric' })}`;
  return `Group play · Round ${s.group} · ${span}`;
}

const groupShort = (g: ScheduleGame) => (g.gameSubLabel ?? '').replace(/\s+Group\s+/i, ' ').trim();

/** League list tag: the group ("East C"), and each team's game number when they differ ("East C · G2/G1": away / home). */
export const cupLeagueTag = (data: CalendarData) => (g: ScheduleGame) => {
  const n = g.isCupGroupGame ? cupGroupNumbers(data).get(g.gameId) : undefined;
  if (!n) return cupTag(g);
  const split = n.away !== n.home ? ` · G${n.away}/G${n.home}` : '';
  return `${groupShort(g)}${split}`;
};

/** Team list tag: the team's own round ("Group round 2 · East C"), or the knockout round. */
export const cupTeamTag = (data: CalendarData, teamId: number) => (g: ScheduleGame) => {
  const n = g.isCupGroupGame ? cupGroupNumbers(data).get(g.gameId) : undefined;
  if (!n) return cupTag(g);
  return `Group round ${g.homeTeam.teamId === teamId ? n.home : n.away} · ${groupShort(g)}`;
};
