// League → List: one game day at a time (round 8), with a week strip; the day changes only by navigation.

import { memo, useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue } from '../data/fatigue';
import { hasNationalTv, leagueRecords, localDate, weekOf, type CalendarData, type TeamRecord } from '../data/model';
import { CopyButton } from './CopyButton';
import { GameCard, type GameLink } from './GameCard';
import { PeriodNav } from './PeriodNav';
import { WeekStrip } from './WeekStrip';
import { FatigueLegend } from './FatigueMark';
import { fmtDate, isCompact, LEAGUE_LIST_COLUMN, LEAGUE_ROW_HEIGHT, leagueSideBySide, leagueZoom, LIST_MAX_WIDTH, plural, type WidgetSize } from './widget';

export interface LeagueListViewProps {
  data: CalendarData;
  /** The day shown (the nearest game day on or after it). */
  date: string;
  /** Raised when the week strip picks another day; the host sets `date`. */
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  /** Today's local date for the week strip (CalendarView passes the clock's, so it follows midnight); default: from `now`. */
  today?: string;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** The "↗" on each game: raised with its id; the host opens the game's page. */
  gameLink?: GameLink;
  /** Own day title and arrows (default); off when the host shows the navigation (CalendarView's top bar). */
  nav?: boolean;
}

/** League List rows get both teams' Fatigue components where the whole LIST_MAX_WIDTH column fits (desktop). */
export const FATIGUE_SLOTS_MIN_WIDTH = LIST_MAX_WIDTH;

export type ListDay = { date: string; games: ScheduleGame[] };

/** The list's game days (only TV games when filtered; days left without games are dropped). */
export function listDays(data: CalendarData, tvOnly: boolean): ListDay[] {
  const out: ListDay[] = [];
  for (const d of data.dates) {
    const all = data.byDate.get(d)!;
    const games = tvOnly ? all.filter(hasNationalTv) : all;
    if (games.length) out.push({ date: d, games });
  }
  return out;
}

/** The list's day for a date: that day, else the next one with games, else the last. */
export const nearestDay = (days: ListDay[], date: string) => (days.find((d) => d.date >= date) ?? days.at(-1))?.date ?? date;

export const listTitle = (date: string, compact: boolean) => fmtDate(date, { weekday: compact ? 'short' : 'long', month: compact ? 'short' : 'long', day: 'numeric', year: 'numeric' });

/**
 * The desktop League List's look (round 8): zoom (LEAGUE_FONT_* ÷ 14), row height and column width, as inline style on
 * the list and on its copies, so an image has the rows as they are on screen. Tablets and phones: none (centered list,
 * rows as before).
 */
export function leagueListStyle(width: number): CSSProperties | undefined {
  if (!leagueSideBySide(width)) return undefined;
  return { zoom: leagueZoom(width), '--ck-row-h': `${LEAGUE_ROW_HEIGHT}px`, width: LEAGUE_LIST_COLUMN, maxWidth: LEAGUE_LIST_COLUMN } as CSSProperties;
}

/**
 * The league schedule one game day at a time: the day's heading ("Sun, Nov 15 · 9 games") and its games. Only the
 * top bar's ← / →, the arrow keys, the date picker, Today and the week strip change the day (round 8); scrolling only
 * scrolls within the day, on busy nights.
 */
export function LeagueListView({ data, date, onSelectDate, tvOnly, size, now, today: todayProp, timeZone, onOpenGame, gameLink, nav = true }: LeagueListViewProps) {
  const compact = isCompact(size);
  const days = useMemo(() => listDays(data, tvOnly), [data, tvOnly]);
  const counts = useMemo(() => new Map(days.map((d) => [d.date, d.games.length])), [days]);
  const today = todayProp ?? localDate(now, timeZone);
  const shown = nearestDay(days, date);
  const day = days.find((d) => d.date === shown);
  const ti = day ? days.indexOf(day) : -1;

  // a new day starts at its top
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [shown]);

  const go = (i: number) => days[i] && onSelectDate(days[i].date);
  const pickRef = useRef(onSelectDate);
  pickRef.current = onSelectDate;
  const pick = useCallback((d: string) => pickRef.current(d), []);
  const strip = useMemo(() => {
    const week = weekOf(shown);
    const before = days.filter((d) => d.date < week[0]!).at(-1)?.date;
    const prevWeekDay = before && days.find((d) => d.date >= weekOf(before)[0]!)?.date;
    const nextWeekDay = days.find((d) => d.date > week[6]!)?.date;
    return {
      days: week.map((d) => ({ date: d, sub: counts.get(d) ? String(counts.get(d)) : '', disabled: !counts.get(d) })),
      // previous / next week with games: its first game day (the strip stays Sun–Sat; it never recenters)
      onPrev: () => prevWeekDay && pickRef.current(prevWeekDay),
      onNext: () => nextWeekDay && pickRef.current(nextWeekDay),
      prevDisabled: !prevWeekDay,
      nextDisabled: !nextWeekDay,
    };
  }, [shown, days, counts]);

  const style = leagueListStyle(size.width);
  return (
    <section className={`ck-league-list${style ? ' ck-league-side' : ''}`} aria-label="League schedule" style={style ? { ...style, maxHeight: size.height / (style.zoom as number) } : { maxHeight: size.height }}>
      {nav && (
        <PeriodNav
          title={listTitle(shown, compact)}
          unit="day"
          testId="day-title"
          onPrev={() => go(ti - 1)}
          onNext={() => go(ti + 1)}
          prevDisabled={ti <= 0}
          nextDisabled={ti < 0 || ti >= days.length - 1}
        />
      )}
      <WeekStrip {...strip} selected={shown} today={today} onPick={pick} />
      <div className="ck-llist" ref={scroller} data-testid="league-list" data-select-scroller>
        {!day && <p className="ck-empty">No games.</p>}
        {day && <ListDaySection key={day.date} day={day} data={data} compact={compact} fatigueSlots={size.width >= FATIGUE_SLOTS_MIN_WIDTH} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} />}
      </div>
      <FatigueLegend component={size.width >= FATIGUE_SLOTS_MIN_WIDTH} />
    </section>
  );
}

const NO_RECORDS: ReadonlyMap<number, TeamRecord> = new Map();
const dayHeading = (date: string, n: number) => `${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${plural(n)}`;

/** One game day of the league list: heading + its game cards, each with a copy button; the day has one too. */
// memo: a re-render of the list (the strip, the clock) skips the day while its props are the same.
// Cup schedule (round 12): its own heading ("Group play · Tue, Nov 10") and a tag per game (cupTag: "West A").
export const ListDaySection = memo(function ListDaySection({ day, data, compact, fatigueSlots = false, now, timeZone, onOpenGame, gameLink, heading, cupTag, dateLabel, columns, tvPill }: { day: ListDay; data: CalendarData; compact: boolean; fatigueSlots?: boolean; now: number; timeZone?: string; onOpenGame?: (gameId: string) => void; gameLink?: GameLink; heading?: string; cupTag?: (g: ScheduleGame) => string | undefined; dateLabel?: (g: ScheduleGame) => string; columns?: number; tvPill?: boolean }) {
  const records = compact ? undefined : leagueRecords(data); // once per data set
  const fatigue = leagueFatigue(data); // once per data set
  const head = heading ?? dayHeading(day.date, day.games.length);
  return (
    <section className="ck-lday" data-day={day.date} aria-label={head}>
      <h3 className="ck-lday-head" data-text={head}>
        {head}
      </h3>
      <CopyButton hover label="Copy day as image" of=".ck-lday" testId="copy-day" />
      {/* Cup group rounds (round 12b): two columns, filled top to bottom (date order reads down the first, then the second) */}
      <div className={`ck-daylist${columns ? ' ck-daylist-cols' : ''}`} style={columns ? ({ '--ck-cols': columns, '--ck-col-rows': Math.ceil(day.games.length / columns) } as CSSProperties) : undefined}>
        {day.games.map((g) => (
          <GameCard key={g.gameId} game={g} fatigue={fatigue.get(g.gameId)} fatigueSlots={fatigueSlots} now={now} timeZone={timeZone} size={compact ? 'compact' : 'regular'} onOpenGame={onOpenGame} logos scores={!compact} records={records && (records.get(g.gameId) ?? NO_RECORDS)} gameLink={gameLink} cupTag={cupTag?.(g)} dateLabel={dateLabel?.(g)} tvPill={tvPill} copyable />
        ))}
      </div>
    </section>
  );
});
