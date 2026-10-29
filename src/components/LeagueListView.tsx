// League → List: the season as one continuous, virtualized list of game days, with a week strip.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue } from '../data/fatigue';
import { hasNationalTv, leagueRecords, localDate, weekOf, type CalendarData, type TeamRecord } from '../data/model';
import { CopyButton } from './CopyButton';
import { GameCard } from './GameCard';
import { PeriodNav } from './PeriodNav';
import { WeekStrip } from './WeekStrip';
import { FatigueLegend } from './FatigueMark';
import { fmtDate, isCompact, plural, type WidgetSize } from './widget';

export interface LeagueListViewProps {
  data: CalendarData;
  /** Day to show at the top: on open, and whenever the host changes it. */
  date: string;
  /** Raised when another day reaches the top of the list (scrolling, week strip, arrows). */
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** Own day title and arrows (default); off when the host shows the navigation (CalendarView's top bar). */
  nav?: boolean;
}

/** Height estimates (px) for a day not measured yet: sticky header + one card row per game (+ 6 px gap). */
const LIST_HEAD = 38;
const listRow = (compact: boolean) => (compact ? 27 : 35) + 6;
/** Days stay rendered this far (in viewport heights) above and below the visible part. */
const LIST_OVERSCAN = 0.75;

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

/** Index of the day at scroll offset `y` (tops = cumulative day tops, plus the total at the end). */
function dayAt(tops: number[], y: number): number {
  let i = 0;
  while (i < tops.length - 2 && tops[i + 1]! <= y + 1) i++;
  return i;
}

export const listTitle = (date: string, compact: boolean) => fmtDate(date, { weekday: compact ? 'short' : 'long', month: compact ? 'short' : 'long', day: 'numeric', year: 'numeric' });

/**
 * The league schedule as one continuous list of game days, each under a sticky header ("Sun, Nov 15 · 9 games").
 * Only the days near the viewport are rendered; the rest are spacers sized from measured (or estimated) heights,
 * and the day at the top stays put while heights above it get measured. The week strip follows the day at the top.
 */
export function LeagueListView({ data, date, onSelectDate, tvOnly, size, now, timeZone, onOpenGame, nav = true }: LeagueListViewProps) {
  const compact = isCompact(size);
  const days = useMemo(() => listDays(data, tvOnly), [data, tvOnly]);
  const index = useMemo(() => new Map(days.map((d, i) => [d.date, i])), [days]);
  const counts = useMemo(() => new Map(days.map((d) => [d.date, d.games.length])), [days]);
  const today = localDate(now, timeZone);

  // Measured day heights, keyed by date and game count; dropped when the width changes (cards rewrap).
  const heights = useRef({ width: size.width, map: new Map<string, number>() });
  if (heights.current.width !== size.width) heights.current = { width: size.width, map: new Map() };
  const hKey = (d: ListDay) => `${d.date}/${d.games.length}`;
  const [measured, setMeasured] = useState(0);
  const tops = useMemo(() => {
    const out = [0];
    for (const d of days) out.push(out.at(-1)! + (heights.current.map.get(hKey(d)) ?? LIST_HEAD + d.games.length * listRow(compact)));
    return out;
    // `measured` signals a change inside the heights ref
  }, [days, compact, measured, size.width]);

  const scroller = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(size.height);
  // The day at the top and how far into it the list is scrolled: kept in place across re-measuring.
  const anchor = useRef({ date: nearestDay(days, date), within: 0 });
  const [topDay, setTopDay] = useState(anchor.current.date);
  const [scrollTop, setScrollTop] = useState(() => tops[index.get(anchor.current.date) ?? 0] ?? 0);
  const reported = useRef(date);

  const jump = (d: string) => {
    const day = nearestDay(days, d);
    anchor.current = { date: day, within: 0 };
    setTopDay(day);
    setScrollTop(tops[index.get(day) ?? 0] ?? 0);
  };

  // The layout the browser last showed and the scroll position it was left at: a scroll is read against these.
  const painted = useRef({ tops, y: 0 });
  const follow = (y: number) => {
    const t = painted.current.tops;
    const i = dayAt(t, y);
    if (!days[i]) return;
    anchor.current = { date: days[i].date, within: y - t[i]! };
    painted.current.y = y;
    setTopDay(days[i].date);
  };
  const onScroll = () => {
    const y = scroller.current!.scrollTop;
    follow(y);
    setScrollTop(y);
  };

  // Host moved the date (e.g. a day picked in the calendar, the top bar's arrows): scroll there. Our own reports
  // are skipped.
  useEffect(() => {
    if (date !== reported.current) {
      reported.current = date;
      jump(date);
    }
  }, [date]);
  useEffect(() => {
    if (topDay !== reported.current) {
      reported.current = topDay;
      onSelectDate(topDay);
    }
  }, [topDay, onSelectDate]);

  // After every render: measure the rendered days; once heights are stable, put the anchor day back in place.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.clientHeight && el.clientHeight !== viewH) setViewH(el.clientHeight);
    // a user scroll whose event hasn't arrived yet: take it in first, or restoring the anchor would undo it
    if (Math.abs(el.scrollTop - painted.current.y) > 0.5) follow(el.scrollTop);
    let changed = false;
    for (const node of el.querySelectorAll<HTMLElement>('[data-day]')) {
      const h = node.getBoundingClientRect().height; // not offsetHeight: rows can be 28.5 px, rounding would drift
      const k = node.dataset.key!;
      if (h && Math.abs((heights.current.map.get(k) ?? 0) - h) > 0.01) {
        heights.current.map.set(k, h);
        changed = true;
      }
    }
    if (changed) return setMeasured((m) => m + 1);
    let i = index.get(anchor.current.date);
    if (i === undefined) {
      // the filter removed the anchor day: the nearest day that's left
      const day = nearestDay(days, anchor.current.date);
      anchor.current = { date: day, within: 0 };
      setTopDay(day);
      i = index.get(day) ?? 0;
    }
    const want = (tops[i] ?? 0) + anchor.current.within;
    if (Math.abs(el.scrollTop - want) > 0.5) el.scrollTop = want;
    painted.current = { tops, y: el.scrollTop };
    setScrollTop(want);
  });

  const lo = scrollTop - viewH * LIST_OVERSCAN;
  const hi = scrollTop + viewH * (1 + LIST_OVERSCAN);
  let start = 0;
  while (start < days.length - 1 && tops[start + 1]! <= lo) start++;
  let end = start;
  while (end < days.length && tops[end]! < hi) end++;
  const total = tops[days.length]!;
  const lastH = days.length ? total - tops[days.length - 1]! : 0;
  // room after the last day, so every day can reach the top
  const tail = Math.max(0, viewH - lastH);

  const ti = index.get(topDay) ?? 0;
  const go = (i: number) => days[i] && jump(days[i].date);
  // the strip's props stay the same objects while scrolling within a day, so it doesn't re-render (WeekStrip is memo)
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const pick = useCallback((d: string) => jumpRef.current(d), []);
  const strip = useMemo(() => {
    const week = weekOf(topDay);
    const before = days.filter((d) => d.date < week[0]!).at(-1)?.date;
    const prevWeekDay = before && days.find((d) => d.date >= weekOf(before)[0]!)?.date;
    const nextWeekDay = days.find((d) => d.date > week[6]!)?.date;
    return {
      days: week.map((d) => ({ date: d, sub: counts.get(d) ? String(counts.get(d)) : '', disabled: !counts.get(d) })),
      // previous / next week with games: its first game day (the strip stays Sun–Sat; it never recenters)
      onPrev: () => prevWeekDay && jumpRef.current(prevWeekDay),
      onNext: () => nextWeekDay && jumpRef.current(nextWeekDay),
      prevDisabled: !prevWeekDay,
      nextDisabled: !nextWeekDay,
    };
  }, [topDay, days, counts]);

  return (
    <section className="ck-league-list" aria-label="League schedule" style={{ maxHeight: size.height }}>
      {nav && (
        <PeriodNav
          title={listTitle(topDay, compact)}
          unit="day"
          testId="day-title"
          onPrev={() => go(ti - 1)}
          onNext={() => go(ti + 1)}
          prevDisabled={ti <= 0}
          nextDisabled={ti >= days.length - 1}
        />
      )}
      <WeekStrip {...strip} selected={topDay} today={today} onPick={pick} />
      <div className="ck-llist" ref={scroller} onScroll={onScroll} data-testid="league-list" data-select-scroller>
        {days.length === 0 && <p className="ck-empty">No games.</p>}
        <div style={{ height: tops[start] }} aria-hidden="true" />
        {days.slice(start, end).map((d) => (
          <ListDaySection key={d.date} day={d} dataKey={hKey(d)} data={data} compact={compact} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
        ))}
        <div style={{ height: total - tops[end]! + tail }} aria-hidden="true" />
      </div>
      <FatigueLegend />
    </section>
  );
}

const NO_RECORDS: ReadonlyMap<number, TeamRecord> = new Map();
const dayHeading = (date: string, n: number) => `${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${plural(n)}`;

/** One game day of the league list: heading + its game cards, each with a copy button; the day has one too. */
// memo: the list re-renders on every scroll event; a day whose props haven't changed (the same day object from
// `days`, same clock) is skipped. Re-rendering every visible day's cards per scroll event cost frames (2026-10-24).
export const ListDaySection = memo(function ListDaySection({ day, dataKey, data, compact, now, timeZone, onOpenGame }: { day: ListDay; dataKey?: string; data: CalendarData; compact: boolean; now: number; timeZone?: string; onOpenGame?: (gameId: string) => void }) {
  const records = compact ? undefined : leagueRecords(data); // once per data set
  const fatigue = leagueFatigue(data); // once per data set
  return (
    <section className="ck-lday" data-day={day.date} data-key={dataKey} aria-label={dayHeading(day.date, day.games.length)}>
      <h3 className="ck-lday-head">{dayHeading(day.date, day.games.length)}</h3>
      <CopyButton hover label="Copy day as image" of=".ck-lday" testId="copy-day" />
      <div className="ck-daylist">
        {day.games.map((g) => (
          <GameCard key={g.gameId} game={g} fatigue={fatigue.get(g.gameId)} now={now} timeZone={timeZone} size={compact ? 'compact' : 'regular'} onOpenGame={onOpenGame} logos scores={!compact} records={records && (records.get(g.gameId) ?? NO_RECORDS)} copyable />
        ))}
      </div>
    </section>
  );
});

/** League list for an image: every game day of the week of `date`, all rendered (no scrolling, no virtualizing). */
export function LeagueListWeek({ data, date, tvOnly, size, now, timeZone }: { data: CalendarData; date: string; tvOnly: boolean; size: WidgetSize; now: number; timeZone?: string }) {
  const week = new Set(weekOf(date));
  const days = listDays(data, tvOnly).filter((d) => week.has(d.date));
  return (
    <section className="ck-league-list" aria-label="League schedule">
      <div className="ck-llist">
        {days.length === 0 && <p className="ck-empty">No games.</p>}
        {days.map((d) => (
          <ListDaySection key={d.date} day={d} data={data} compact={isCompact(size)} now={now} timeZone={timeZone} />
        ))}
      </div>
    </section>
  );
}
