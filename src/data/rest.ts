// Abnormal rest. Rest between two of a team's games = the difference of their game dates (the NBA's
// ET game date, as everywhere in the app; tip-off times don't matter, an early tip-off counts as a full day): a
// back-to-back is 1, one empty day between is 2, two empty days 3. A gap of REST_FLAG_DAYS (3) or more is flagged on BOTH
// games — the one before the break ("before": the break comes after it) and the one after it ("after": it comes off the
// break). Example: DET plays PHI on Nov 4, next LAL on Nov 8 = 4 days → both games flagged. Pure, from all the team's
// shown games (never a filter: a TV filter would invent breaks).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { daysBetween, sideLabel, teamGames, type CalendarData } from './model';

/** The smallest gap (in days between game dates) that is flagged. */
export const REST_FLAG_DAYS = 3;

export interface RestGap {
  /** Days between the two game dates (≥ REST_FLAG_DAYS). */
  days: number;
  /** The game on the other side of the break: the previous game for "after", the next one for "before". */
  other: ScheduleGame;
}

export interface RestFlag {
  /** The team this flag is for. */
  teamId: number;
  /** This game comes off a break: the gap since the team's previous game. */
  after?: RestGap;
  /** A break follows this game: the gap until the team's next game. */
  before?: RestGap;
}

/** Days between two game dates (the rule above; exported for the tests). */
export const restDays = (a: ScheduleGame, b: ScheduleGame) => Math.abs(daysBetween(a.dateEt, b.dateEt));

/** gameId → the team's rest flag, only for flagged games. */
export function teamRestFlags(data: CalendarData, teamId: number): Map<string, RestFlag> {
  const games = teamGames(data, teamId);
  const out = new Map<string, RestFlag>();
  for (let i = 1; i < games.length; i++) {
    const prev = games[i - 1]!;
    const g = games[i]!;
    const days = restDays(prev, g);
    if (days < REST_FLAG_DAYS) continue;
    out.set(prev.gameId, { ...out.get(prev.gameId), teamId, before: { days, other: g } });
    out.set(g.gameId, { ...out.get(g.gameId), teamId, after: { days, other: prev } });
  }
  return out;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** "4 days off, last played Mon, Nov 4 @ PHI" / "4 days off next, plays again Sat, Nov 8 vs LAL" — one line per side. */
export function restLines(f: RestFlag, teamId = f.teamId): string[] {
  const lines: string[] = [];
  if (f.after) lines.push(`${f.after.days} days off, last played ${day(f.after.other.dateEt)} ${sideLabel(f.after.other, teamId)}`);
  if (f.before) lines.push(`${f.before.days} days off next, plays again ${day(f.before.other.dateEt)} ${sideLabel(f.before.other, teamId)}`);
  return lines;
}
