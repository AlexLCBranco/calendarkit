// Shared pieces of the calendar widgets: widget size, date formatting, the clock, back-to-back lookups.

import { useEffect, useMemo, useState } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { dateFormat, isBackToBack, teamB2BPairs, type CalendarData } from '../data/model';
import type { Team } from '../data/teams';
import type { B2BNight } from './GameCard';

export interface WidgetSize {
  width: number;
  height: number;
}

/** Below this width the widgets switch to their compact layout (phones, small board widgets). */
export const COMPACT_WIDTH = 640;
export const isCompact = (size: WidgetSize) => size.width < COMPACT_WIDTH;

/** List layouts: content column width cap (centered); calendars use the full width. */
export const LIST_MAX_WIDTH = 960;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar-date formatting (the date is already an NBA game date; no time zone conversion). */
export const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => dateFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
export const fmtMonth = (month: string) => fmtDate(`${month}-01`, { month: 'long', year: 'numeric' });
export const plural = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

/** "Nov 15 – 21, 2026", "Nov 29 – Dec 5, 2026", "Dec 27, 2026 – Jan 2, 2027". */
export function fmtRange(from: string, to: string): string {
  const md = (d: string) => fmtDate(d, { month: 'short', day: 'numeric' });
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${md(from)}, ${from.slice(0, 4)} – ${md(to)}, ${to.slice(0, 4)}`;
  const end = from.slice(0, 7) === to.slice(0, 7) ? String(Number(to.slice(8))) : md(to);
  return `${md(from)} – ${end}, ${to.slice(0, 4)}`;
}

/** The given clock, or a live one ticking every minute. */
export function useNow(fixed?: number): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return setNow(fixed);
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixed]);
  return fixed ?? now;
}

export const b2bIds = (data: CalendarData, g: ScheduleGame) =>
  [g.homeTeam.teamId, g.awayTeam.teamId].filter((id) => isBackToBack(data, id, g.dateEt));

/** A team's back-to-back nights by gameId (a game can in theory be night 2 of one pair and night 1 of the next). */
export function useTeamB2B(data: CalendarData, teamId: number) {
  return useMemo(() => {
    const pairs = teamB2BPairs(data, teamId);
    const byGame = new Map<string, B2BNight[]>();
    const add = (g: ScheduleGame, n: B2BNight) => byGame.set(g.gameId, [...(byGame.get(g.gameId) ?? []), n]);
    for (const pair of pairs) {
      add(pair.first, { pair, night: 1 });
      add(pair.second, { pair, night: 2 });
    }
    return { pairs, byGame };
  }, [data, teamId]);
}

/** Clamp a fixed-position popup/tooltip of width `w` into the viewport. */
export const clampX = (x: number, w: number) => Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8));

export const fullName = (t: Team) => `${t.city} ${t.name}`;
