// The Slate's "⏱ Countdown" link: halftime-timer opened on a timer that ends at the night's first tip-off — or, once
// that game has started, at the next one that hasn't. Pure: the time looked at comes in (`now`), nothing ticks here.
// Link format: halftime-timer's README ("Open a countdown from a link").

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { dateFormat, teamLabel, tipoff } from '../data/model';

export const HALFTIME_TIMER_URL = 'https://halftime-timer.vercel.app/';

/** `ms` as an ISO date-time with the offset `timeZone` (default: the browser's) has then: "2026-11-19T20:00:00-05:00". */
export function isoWithOffset(ms: number, timeZone?: string): string {
  const parts = dateFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const p = (type: string) => parts.find((x) => x.type === type)!.value;
  const local = `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}`;
  // the zone's wall clock read as UTC, less the instant: the offset (whole minutes)
  const off = Math.round((Date.parse(`${local}Z`) - Math.floor(ms / 1000) * 1000) / 60_000);
  const abs = Math.abs(off);
  return `${local}${off < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export interface CountdownTarget {
  game: ScheduleGame;
  /** The game's tip-off (ms). */
  start: number;
  /** The night's first game (false: that one has started, this is the next that hasn't). */
  first: boolean;
}

/**
 * The game the countdown runs to at `now`: the night's earliest game that hasn't started (games without a set time
 * are left out; a game the feed has as live or final has started, whatever its time says). Undefined when none is left.
 */
export function countdownTarget(games: readonly ScheduleGame[], now: number): CountdownTarget | undefined {
  const timed = games.flatMap((g) => (g.startTimeUtc ? [{ game: g, start: Date.parse(g.startTimeUtc) }] : [])).sort((a, b) => a.start - b.start);
  const next = timed.find((t) => t.start > now && t.game.status !== 'final' && t.game.status !== 'live');
  return next && { ...next, first: next === timed[0] };
}

/** "First game · BOS @ DET 20:00" ("Next game · …" once the first has started); the time as the cards show it. */
export const countdownName = (t: CountdownTarget, timeZone?: string) => `${t.first ? 'First' : 'Next'} game · ${teamLabel(t.game.awayTeam)} @ ${teamLabel(t.game.homeTeam)} ${tipoff(t.game, timeZone).time}`;

/** The halftime-timer link for `t`: `?end=<ISO with offset>&name=<text>`, both URL-encoded ("+" as %2B). */
export const countdownUrl = (t: CountdownTarget, timeZone?: string) => `${HALFTIME_TIMER_URL}?end=${isoWithOffset(t.start, timeZone).replace('+', '%2B')}&name=${encodeURIComponent(countdownName(t, timeZone))}`;
