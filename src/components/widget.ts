// Shared pieces of the calendar widgets: widget size, date formatting, the clock, back-to-back lookups.

import { useEffect, useMemo, useState } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { dateFormat, teamB2BPairs, type CalendarData } from '../data/model';
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
/**
 * League List rows on desktop (round 8, 1.5): one day at a time, bigger, left-aligned, the map beside them. The whole
 * list (strip, day header, rows) is drawn at a CSS zoom of `font ÷ 14` (14 px = the rows' base font everywhere else),
 * so every per-row part grows together. Tune here:
 * - LEAGUE_FONT_MIN / _MAX: the rows' base font (px) at a widget LEAGUE_ZOOM_FROM / _TO wide (1280 / 1920 windows
 *   minus the page padding); linear between, clamped outside. Alex (2026-10-30): "scale rows by width".
 * - LEAGUE_ROW_HEIGHT: a row's height at the 14 px base (before the zoom); was 35 px.
 * - LEAGUE_LIST_COLUMN: the list column at the 14 px base. The widest row of the season measured 844 px (GSW @ DEN
 *   Oct 23, played), and an unplayed 836 px row gains ~66 px of score slots when it's played: 910 keeps every row on
 *   one line. The map gets what's left of the width.
 */
export const LEAGUE_FONT_MIN = 14;
export const LEAGUE_FONT_MAX = 18.2;
export const LEAGUE_ZOOM_FROM = 1248;
export const LEAGUE_ZOOM_TO = 1840;
export const LEAGUE_ROW_HEIGHT = 40;
export const LEAGUE_LIST_COLUMN = 910;
/** The League List's zoom for a widget this wide (1 on tablets/phones: they keep their rows). */
export function leagueZoom(width: number): number {
  const t = Math.min(1, Math.max(0, (width - LEAGUE_ZOOM_FROM) / (LEAGUE_ZOOM_TO - LEAGUE_ZOOM_FROM)));
  return Math.round(((LEAGUE_FONT_MIN + t * (LEAGUE_FONT_MAX - LEAGUE_FONT_MIN)) / 14) * 1000) / 1000;
}
/** Room beside the list for the map: LEAGUE_MAP_MIN px at least, after a LEAGUE_MAP_GAP gap. */
export const LEAGUE_MAP_MIN = 260;
export const LEAGUE_MAP_GAP = 24;
/** Desktop League List: left-aligned column with the map on its right, when the map gets LEAGUE_MAP_MIN; else (tablets) the centered list. */
export const leagueSideBySide = (width: number) => width >= LEAGUE_LIST_COLUMN * leagueZoom(width) + LEAGUE_MAP_GAP + LEAGUE_MAP_MIN;

/**
 * Team List column cap: wider than the League List so a row with the fatigue columns stays on one line with every
 * part at a fixed x. Measured 2026-10-24 over every row of all 30 teams at 1920 px: widest tags 239.7 px (DEN vs DAL
 * Nov 24: Cup group label + "NBC · Peacock"), widest matchup 211.0 px ("GSW 108 vs MEM 111"), season line 110.6 px;
 * with the fixed columns and 7 gaps of 8 px a row needs 1055 px (+ the 10 px bracket gutter): 1080 left ~15 px.
 * 2026-10-28: 1110, so the matchup slot fits an overtime marker ("MEM 188 vs MEM 188 2OT", 242.5 px; slot 214 → 244).
 */
export const TEAM_LIST_MAX_WIDTH = 1110;

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
