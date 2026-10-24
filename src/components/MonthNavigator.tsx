// League → Calendar at narrow widths (and the week picker popup): a month of game counts per day.

import { useMemo } from 'react';
import { countsByDate, monthCells, seasonMonths, type CalendarData } from '../data/model';
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
}

/** Month overview for navigation only: number of games per day; clicking a day jumps to it. */
export function MonthNavigator({ data, month, onMonthChange, selectedDate, selectedDates, onSelectDate, tvOnly, size, today, nav = true }: MonthNavigatorProps) {
  const compact = isCompact(size);
  const counts = useMemo(() => countsByDate(data, tvOnly), [data, tvOnly]);
  const sel = new Set(selectedDates ?? (selectedDate ? [selectedDate] : []));
  const cells = monthCells(month);
  return (
    <section className="ck-month-nav" aria-label="Month navigator">
      {nav && <PeriodNav {...monthNav(month, seasonMonths(data), onMonthChange)} />}
      <div className="ck-grid ck-count-grid" role="grid" style={{ gridTemplateRows: `auto repeat(${cells.length / 7}, 1fr)` }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const n = counts.get(date) ?? 0;
          return (
            <button
              key={date}
              type="button"
              className={`ck-cell ck-count-cell${n ? ' ck-cell-game' : ''}${sel.has(date) ? ' ck-cell-selected' : ''}${today === date ? ' ck-cell-today' : ''}`}
              disabled={!n}
              onClick={() => onSelectDate(date)}
              data-date={date}
              aria-label={`${fmtDate(date, { month: 'long', day: 'numeric' })}: ${plural(n)}`}
            >
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {n > 0 && <span className="ck-count">{n}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
