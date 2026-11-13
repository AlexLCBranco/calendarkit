// The widget's state and page types, and the pure helpers the shell (CalendarView) and its destinations share. Kept
// apart from CalendarView.tsx so the destination files and the shell can import them without importing each other.

import { dateFormat, hasNationalTv, isOver, teamGames, type CalendarData } from '../data/model';
import type { WeekCount } from './LeagueWeekView';
import type { ValueStore } from './valueStore';
import { fmtMonth } from './widget';

/** League, Team, or (desktop) Cup: the NBA Cup group standings, or (desktop) Standings. */
export type CalendarMode = 'team' | 'league' | 'cup' | 'standings';
/** List, Calendar, or (League, desktop) Slate: a day of games as cards. */
export type CalendarLayout = 'list' | 'calendar' | 'slate';
/** Team → Calendar: a month grid (default) or 1 or 2 week rows. */
export type TeamSpan = 'month' | 1 | 2;

export interface CalendarState {
  mode: CalendarMode;
  /** List, Calendar or Slate; kept when switching League ↔ Team (Team shows its List while it is Slate). */
  layout: CalendarLayout;
  teamId: number;
  /** League views: the day at the top of the list; the week view shows this day's week. */
  date: string;
  tvOnly: boolean;
  /** Team → List: a quiet row for each day without a game. On by default; the app shell never stores it. */
  showRest: boolean;
  /** League → Calendar: 1 or 2 week rows. */
  weeks: WeekCount;
  /** Team → Calendar: month, 1 week or 2 weeks; kept across teams and List ↔ Calendar. */
  teamSpan: TeamSpan;
}

/** The top bar's destinations; Schedule is League or Team by the scope picker. */
export type Destination = 'schedule' | 'cup' | 'standings';
export type CupState = { tab: 'standings' | 'schedule' | 'simulator' | 'history'; /** The History season */ hs?: number; list: 'league' | 'team'; by: 'group' | 'date'; teamId?: number; night?: string };
export const CUP_START: CupState = { tab: 'standings', list: 'league', by: 'group' };

/** Everything a page of the widget is — enough to put it back as it was. */
export interface ViewSnapshot {
  state: CalendarState;
  leagueMonth: string;
  teamMonth: string;
  teamWeek: string;
  teamListMonth: string;
  /** The Team List's last loaded month. */
  teamListTo?: string;
  cup: CupState;
  /** Team List: the row at the top. */
  top?: string;
  /** The view's scroller (by its data-testid) and how far it was scrolled. */
  scroll?: { id: string; top: number };
  /** The date looked at (YYYY-MM-DD), for the address. */
  at: string;
  /** For the ← → tooltips: "Boston Celtics, Oct 2026". */
  label: string;
}

export interface CalendarHandle {
  restore: (snap: ViewSnapshot) => void;
  /** The page on screen now, with the scroll position and the Team List's row at the top (the host keeps it for a reload). */
  snap: () => ViewSnapshot;
}

/** A page snapshot read back from storage (a reloaded tab's history entry): usable only if it has the fields a page needs. */
export function isViewSnapshot(x: unknown): x is ViewSnapshot {
  const s = x as ViewSnapshot | undefined;
  const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const month = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
  return !!s && !!s.state && typeof s.state.mode === 'string' && day(s.state.date) && month(s.leagueMonth) && month(s.teamMonth) && day(s.teamWeek) && month(s.teamListMonth) && !!s.cup && typeof s.cup.tab === 'string';
}

/** The in-app ← →: the labels of the pages before / after (undefined: nothing there), in a store only the buttons read. */
export interface PageHistoryLabels {
  back?: string;
  forward?: string;
}
export interface PageHistory {
  labels: ValueStore<PageHistoryLabels>;
  onBack: () => void;
  onForward: () => void;
}

/** Team List or Team Calendar (a team link opens the Calendar: CalendarView TEAM_LINK_LAYOUT). */
export type TeamLayout = 'list' | 'calendar';

/** Where a team link goes: the team, in a Team mode, on the date being looked at; `state` for the rest of the URL. */
export interface TeamTarget {
  teamId: number;
  layout: TeamLayout;
  date: string;
  state: CalendarState;
}

/** Older than this, the "Data updated" stamp turns orange: the daily update (~11:00 UTC) may have failed. */
export const STALE_AFTER_MS = 36 * 3_600_000;

/** The width under which the one-row bar uses its short labels (it fits one row down to ~1240 px). */
export const BAR_SHORT_BELOW = 1560;

/** The league views' day for the local date `today` (the page always opens on it): today, kept inside the season. */
export function seasonDay(data: CalendarData, today: string): string {
  const first = data.dates[0];
  const last = data.dates.at(-1);
  return !first || !last ? today : today < first ? first : today > last ? last : today;
}

/**
 * The Team List row a team link opens at for `date`: that day (a game, or a rest day while rest days show and it
 * is inside the team's season), else the team's next game after it, else its last game.
 */
export function teamListTarget(data: CalendarData, teamId: number, tvOnly: boolean, showRest: boolean, date: string): string {
  const games = teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g));
  const first = games[0]?.dateEt;
  const last = games.at(-1)?.dateEt;
  if (!first || !last) return date;
  if (showRest && date >= first && date <= last) return date;
  return games.find((g) => g.dateEt >= date)?.dateEt ?? last;
}

/** Team view opens on the month of the team's next game not over yet (else its last game). */
export function teamDefaultDate(data: CalendarData, teamId: number, now: number): string | undefined {
  const games = teamGames(data, teamId);
  return (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt;
}

/** "November 2026", "October – November 2026", "December 2026 – January 2027". */
export function fmtMonthSpan(from: string, to: string): string {
  if (from === to) return fmtMonth(from);
  const [a, b] = [fmtMonth(from), fmtMonth(to)];
  return from.slice(0, 4) === to.slice(0, 4) ? `${a.replace(/ \d{4}$/, '')} – ${b}` : `${a} – ${b}`;
}

/** "Nov 2026". */
export const fmtShortMonth = (month: string) => dateFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${month}-15T12:00:00Z`));
