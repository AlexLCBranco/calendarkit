// League → Calendar at narrow widths (and the week and date picker popups): a month of game counts per day.

import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { addDays, countsByDate, monthCells, monthOf, seasonMonths, type CalendarData } from '../data/model';
import { monthNav, PeriodNav } from './PeriodNav';
import { fmtDate, isCompact, plural, WEEKDAYS, type WidgetSize } from './widget';

export interface MonthNavigatorProps {
  data: CalendarData;
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate?: string;
  /** Days to highlight (e.g. the week shown). */
  selectedDates?: string[];
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  /** Local calendar date to highlight as today. */
  today?: string;
  /** Own month header (default); off when the host shows the navigation. */
  nav?: boolean;
  /**
   * What a day shows and whether it can be picked (default: its game count; days without games disabled). The Team
   * List's picker shows the opponent and lets a day without a game go to the next one.
   */
  cell?: (date: string) => { enabled: boolean; label?: string };
  /**
   * Popups: the day to focus first. Keyboard (always): ← → a day, ↑ ↓ a week, skipping days that can't be picked and
   * turning the month; Enter picks (each day is a button).
   */
  focusDate?: string;
}

/** Month overview for navigation only: number of games per day; clicking a day jumps to it. */
export function MonthNavigator({ data, month, onMonthChange, selectedDate, selectedDates, onSelectDate, tvOnly, size, today, nav = true, cell, focusDate }: MonthNavigatorProps) {
  const compact = isCompact(size);
  const counts = useMemo(() => countsByDate(data, tvOnly), [data, tvOnly]);
  const sel = new Set(selectedDates ?? (selectedDate ? [selectedDate] : []));
  const cells = monthCells(month);
  const info = (date: string) => {
    if (cell) return cell(date);
    const n = counts.get(date) ?? 0;
    return { enabled: n > 0, label: n ? String(n) : undefined };
  };
  // keyboard focus: the day to focus after the next render (opening, or an arrow that turned the month)
  const grid = useRef<HTMLDivElement>(null);
  const pending = useRef(focusDate);
  useEffect(() => {
    if (!pending.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-date="${pending.current}"]`)?.focus();
    pending.current = undefined;
  });
  const lo = addDays(data.dates[0] ?? month, -6);
  const hi = addDays(data.dates.at(-1) ?? month, 6);
  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    const from = (e.target as HTMLElement).dataset?.date;
    if (!step || !from) return;
    e.preventDefault();
    // the next day in that direction that can be picked, inside the season
    let d = addDays(from, step);
    while (d >= lo && d <= hi && !info(d).enabled) d = addDays(d, step);
    if (d < lo || d > hi) return;
    if (monthOf(d) !== month) {
      pending.current = d;
      onMonthChange(monthOf(d));
    } else grid.current?.querySelector<HTMLElement>(`[data-date="${d}"]`)?.focus();
  };
  return (
    <section className="ck-month-nav" aria-label="Month navigator">
      {nav && <PeriodNav {...monthNav(month, seasonMonths(data), onMonthChange)} />}
      <div ref={grid} className="ck-grid ck-count-grid" role="grid" style={{ gridTemplateRows: `auto repeat(${cells.length / 7}, 1fr)` }} onKeyDown={onKey}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const n = counts.get(date) ?? 0;
          const { enabled, label } = info(date);
          return (
            <button
              key={date}
              type="button"
              className={`ck-cell ck-count-cell${label ? ' ck-cell-game' : ''}${sel.has(date) ? ' ck-cell-selected' : ''}${today === date ? ' ck-cell-today' : ''}`}
              disabled={!enabled}
              onClick={() => onSelectDate(date)}
              data-date={date}
              aria-label={`${fmtDate(date, { month: 'long', day: 'numeric' })}: ${cell ? label || 'no game' : plural(n)}`}
            >
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {label && <span className={`ck-count${cell ? " ck-count-label" : ""}`}>{label}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
