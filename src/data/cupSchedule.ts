// NBA Cup schedule (round 12): the Cup's nights and each team's Cup games, from the schedule already loaded. Pure: no UI,
// no clock of its own; the Cup view calls it only when its Schedule tab is opened.
//
// What the feed gives for knockout games (checked 2026-10-31): gameSubtype "in-season-knockout", gameSubLabel
// "Quarterfinal" / "Semifinal" / "Championship" (the Final also has gameId prefix 006 → gameType "cup-final"). Until the
// teams are known both sides are teamId 0 with null tricode, name, city and slug, seed 0 — no placeholder text such as
// "Winner West A" — and the QF/SF games have no time ("TBD") and no arena. So undecided sides show "TBD", and a team's
// knockout games appear only once the feed puts the team in them (never predicted from the standings).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { CUP_GROUPS } from './cup';
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

/** The night's heading: "Group play · Tue, Nov 10". */
export const cupNightHeading = (n: Pick<CupNight, 'date' | 'round'>) =>
  `${CUP_ROUND_LABEL[n.round]} · ${dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${n.date}T12:00:00Z`))}`;

/** One team's Cup games in date order, split into finished ones and the rest. */
export function teamCupGames(data: CalendarData, teamId: number): { played: ScheduleGame[]; remaining: ScheduleGame[] } {
  const games = teamGames(data, teamId).filter(isCupGame);
  return { played: games.filter((g) => g.status === 'final'), remaining: games.filter((g) => g.status !== 'final') };
}

// ---------------------------------------------------------------- group play by group and by date (round 18)
//
// Round 18 (Alex): the rounds are gone as navigation — the feed has no rounds (group games are on shared Cup nights; 16 of
// the 60 are one team's Nth group game and the other's (N+1)th), so "Round 1" mixed dates and listed split games twice.
// The League list now shows group play by group (6 panels of 10 games + the knockout) or by date (the real Cup nights).
// A team's group game number stays, in the game's tooltip ("CHA's 2nd group game, WAS's 1st") and the Team list's tag.

/** The feed's group label shortened: "West Group A" → "West A". */
export const groupShort = (label: string | undefined) => (label ?? '').replace(/\s+Group\s+/i, ' ').trim();

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

const groupRank = (g: ScheduleGame) => {
  if (!g.isCupGroupGame) return CUP_GROUPS.length + ['qf', 'sf', 'final'].indexOf(cupRound(g) ?? 'final');
  const i = (CUP_GROUPS as readonly string[]).indexOf(g.gameSubLabel ?? '');
  return i < 0 ? CUP_GROUPS.length - 0.5 : i;
};

export interface CupBoard {
  /** Each group's games in date and tip-off order (a group missing from the feed: no entry). */
  groups: { label: string; games: ScheduleGame[] }[];
  qf: ScheduleGame[];
  sf: ScheduleGame[];
  final: ScheduleGame[];
}

const boardCache = new WeakMap<CalendarData, CupBoard>();

/** By group: the six groups' games, then the knockout games by round (once per data set). */
export function cupBoard(data: CalendarData): CupBoard {
  let out = boardCache.get(data);
  if (out) return out;
  const by = new Map<string, ScheduleGame[]>();
  const ko: Record<'qf' | 'sf' | 'final', ScheduleGame[]> = { qf: [], sf: [], final: [] };
  for (const g of data.games) {
    const r = cupRound(g);
    if (!r) continue;
    if (r === 'group') {
      const k = g.gameSubLabel ?? '';
      by.set(k, [...(by.get(k) ?? []), g]);
    } else ko[r].push(g);
  }
  const labels = [...CUP_GROUPS.filter((l) => by.has(l)), ...[...by.keys()].filter((l) => !(CUP_GROUPS as readonly string[]).includes(l))];
  out = { groups: labels.map((label) => ({ label, games: by.get(label)! })), ...ko };
  boardCache.set(data, out);
  return out;
}

/** By date: a night's Cup games grouped by group (West A … East C, then the knockout), tip-off order inside a group. */
export const nightByGroup = (n: CupNight) => n.games.map((g, i) => ({ g, i })).sort((a, b) => groupRank(a.g) - groupRank(b.g) || a.i - b.i).map((x) => x.g);

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** For a game's tooltip: "CHA's 2nd group game, WAS's 1st" / "both teams' 1st group game"; undefined for other games. */
export function groupNumberLine(data: CalendarData, g: ScheduleGame): string | undefined {
  const n = g.isCupGroupGame ? cupGroupNumbers(data).get(g.gameId) : undefined;
  if (!n) return undefined;
  const a = g.awayTeam.teamTricode ?? 'TBD';
  const h = g.homeTeam.teamTricode ?? 'TBD';
  return n.away === n.home ? `Both teams' ${ord(n.away)} group game` : `${a}'s ${ord(n.away)} group game, ${h}'s ${ord(n.home)}`;
}

/** Team list tag: the team's own group game ("Group round 2 · East C"), or the knockout round. */
export const cupTeamTag = (data: CalendarData, teamId: number) => (g: ScheduleGame) => {
  const n = g.isCupGroupGame ? cupGroupNumbers(data).get(g.gameId) : undefined;
  if (!n) return cupTag(g);
  return `Group round ${g.homeTeam.teamId === teamId ? n.home : n.away} · ${groupShort(g.gameSubLabel)}`;
};
