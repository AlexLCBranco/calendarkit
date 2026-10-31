// NBA Cup schedule (round 12): the Cup's nights and each team's Cup games, from the schedule already loaded. Pure: no UI,
// no clock of its own; the Cup view calls it only when its Schedule tab is opened.
//
// What the feed gives for knockout games (checked 2026-10-31): gameSubtype "in-season-knockout", gameSubLabel
// "Quarterfinal" / "Semifinal" / "Championship" (the Final also has gameId prefix 006 → gameType "cup-final"). Until the
// teams are known both sides are teamId 0 with null tricode, name, city and slug, seed 0 — no placeholder text such as
// "Winner West A" — and the QF/SF games have no time ("TBD") and no arena. So undecided sides show "TBD", and a team's
// knockout games appear only once the feed puts the team in them (never predicted from the standings).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { cupRound, dateFormat, teamGames, type CalendarData, type CupRound } from './model';

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
