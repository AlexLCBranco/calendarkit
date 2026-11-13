// Road trips and homestands: RUN_MIN_GAMES or more of a team's games in a row all away (road trip) or all at home
// (homestand). Counted over the team's whole schedule, never a shown range or a filter, so a run crossing a month
// keeps its full length everywhere. A neutral-site game belongs to neither side and breaks a run, and so does a break
// of RUN_BREAK_DAYS or more between two games (the All-Star break: the team goes home in between, whatever the
// schedule's home/away says on either side). Pure; one computation per data set and team.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { addDays, daysBetween, teamGames, type CalendarData } from './model';
import { TEAM_BY_ID } from './teams';

/** The fewest games in a row that make a road trip or a homestand. */
export const RUN_MIN_GAMES = 3;
/** Days between two game dates that end a run (the All-Star break is about a week; a trip's longest gap is ~4). */
export const RUN_BREAK_DAYS = 6;

export type RunKind = 'road' | 'home';

export interface Run {
  kind: RunKind;
  /** The run's games in date order (≥ RUN_MIN_GAMES). */
  games: ScheduleGame[];
  /** First and last game dates (ET, YYYY-MM-DD). */
  from: string;
  to: string;
}

export interface TeamRuns {
  runs: Run[];
  /** gameId → its run and its 0-based place in it. */
  byGame: Map<string, { run: Run; index: number }>;
}

const cache = new WeakMap<CalendarData, Map<number, TeamRuns>>();

/** The side a game is for the team: home, road, or neither (neutral site). */
function sideOf(g: ScheduleGame, teamId: number): RunKind | undefined {
  if (g.isNeutral) return undefined;
  return g.homeTeam.teamId === teamId ? 'home' : 'road';
}

/** The team's road trips and homestands, in date order. */
export function teamRuns(data: CalendarData, teamId: number): TeamRuns {
  let byTeam = cache.get(data);
  if (!byTeam) cache.set(data, (byTeam = new Map()));
  const hit = byTeam.get(teamId);
  if (hit) return hit;
  const runs: Run[] = [];
  let cur: ScheduleGame[] = [];
  let kind: RunKind | undefined;
  const close = () => {
    if (kind && cur.length >= RUN_MIN_GAMES) runs.push({ kind, games: cur, from: cur[0]!.dateEt, to: cur.at(-1)!.dateEt });
    cur = [];
    kind = undefined;
  };
  for (const g of teamGames(data, teamId)) {
    const side = sideOf(g, teamId);
    const gap = cur.length ? daysBetween(cur.at(-1)!.dateEt, g.dateEt) : 0;
    if (side !== kind || gap >= RUN_BREAK_DAYS) close();
    if (!side) continue;
    kind = side;
    cur.push(g);
  }
  close();
  const byGame = new Map<string, { run: Run; index: number }>();
  for (const run of runs) run.games.forEach((g, index) => byGame.set(g.gameId, { run, index }));
  const out = { runs, byGame };
  byTeam.set(teamId, out);
  return out;
}

/** The run covering a date (a game day or a day off between two of its games). */
export function runOn(runs: readonly Run[], date: string): Run | undefined {
  return runs.find((r) => date >= r.from && date <= r.to);
}

/** "Road trip" / "Homestand". */
export const runName = (kind: RunKind) => (kind === 'road' ? 'Road trip' : 'Homestand');

/** The label on each game of a run, its place in it: "Road trip · 3/5". */
export const runLabel = (run: Run, index: number) => `${runName(run.kind)} · ${index + 1}/${run.games.length}`;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/**
 * The label's tooltip, from the game the label stands at (`index`, 0-based): "Road trip · game 3 of 5", the dates,
 * and for a road trip the cities in order (a city played twice in a row once).
 */
export function runTip(run: Run, index: number): string {
  const lines = [`${runName(run.kind)} · game ${index + 1} of ${run.games.length}`, `${day(run.from)} – ${day(run.to)}`];
  if (run.kind === 'road') lines.push(run.games.map((g) => g.arenaCity || TEAM_BY_ID.get(g.homeTeam.teamId)?.city || g.homeTeam.teamTricode).filter((c, i, a) => c !== a[i - 1]).join(' → '));
  return lines.join('\n');
}

/** The tooltip's day strip (tooltip.tsx DayStrip): every day of the run, game days filled, `index`'s game highlighted. */
export function runTipDays(run: Run, index: number): string {
  const games = new Map(run.games.map((g, i) => [g.dateEt, i]));
  const out: string[] = [];
  for (let d = run.from, n = 0; d <= run.to && n < 60; n++) {
    const i = games.get(d);
    out.push(`${d}:${i === undefined ? 'r' : i === index ? 't' : 'g'}`);
    d = addDays(d, 1);
  }
  return out.join(' ');
}
