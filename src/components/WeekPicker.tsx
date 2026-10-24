// Month popup of the week view: game counts per day; a click jumps to that day's week.

import { useEffect, useRef, useState } from 'react';
import { addDays, monthOf, type CalendarData } from '../data/model';
import type { WeekCount } from './LeagueWeekView';
import { MonthNavigator } from './MonthNavigator';
import type { WidgetSize } from './widget';

/** Month popup of the week view: game counts per day; a click jumps to that day's week. */
export function WeekPicker({ data, start, weeks, tvOnly, size, today, onPick, onClose }: { data: CalendarData; start: string; weeks: WeekCount; tvOnly: boolean; size: WidgetSize; today: string; onPick: (date: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(monthOf(addDays(start, 3)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.ck-cell-selected:not([disabled]), .ck-count-cell:not([disabled])')?.focus();
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-testid="period-title"]') && onClose();
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  return (
    <div ref={ref} className="ck-popup" role="dialog" aria-label="Jump to a week" data-testid="week-picker" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <MonthNavigator
        data={data}
        month={month}
        onMonthChange={setMonth}
        selectedDates={Array.from({ length: 7 * weeks }, (_, i) => addDays(start, i))}
        onSelectDate={onPick}
        tvOnly={tvOnly}
        size={{ width: Math.min(size.width, 360), height: 360 }}
        today={today}
      />
    </div>
  );
}
