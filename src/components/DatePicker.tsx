// The lists' date picker (round 4): a calendar icon next to the date title opens a month popup (MonthNavigator) —
// ‹ › months, a day jumps there; keyboard: arrows, Enter, Escape (focus back on the icon). Rendered only while open.

import { useEffect, useRef, useState } from 'react';
import { monthOf, type CalendarData } from '../data/model';
import { MonthNavigator, type MonthNavigatorProps } from './MonthNavigator';

/** The icon button: next to a date title; toggles the popup. */
export const DatePickButton = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
  <button type="button" className="ck-date-pick" data-testid="date-pick" aria-label="Pick a date" aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="4" y="8.5" width="2.2" height="2.2" rx=".4" fill="currentColor" />
    </svg>
  </button>
);

export interface DatePickerProps {
  data: CalendarData;
  /** The day shown now: its month opens, it is focused and marked. */
  date: string;
  tvOnly: boolean;
  today?: string;
  cell?: MonthNavigatorProps['cell'];
  onPick: (date: string) => void;
  /** Closed without a pick (Escape, a click outside); `keyboard`: put the focus back on the icon. */
  onClose: (keyboard: boolean) => void;
}

export function DatePicker({ data, date, tvOnly, today, cell, onPick, onClose }: DatePickerProps) {
  const [month, setMonth] = useState(monthOf(date));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-testid="date-pick"]') && onClose(false);
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  return (
    <div ref={ref} className="ck-popup" role="dialog" aria-label="Pick a date" data-testid="date-picker" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose(true))}>
      <MonthNavigator data={data} month={month} onMonthChange={setMonth} selectedDate={date} onSelectDate={onPick} tvOnly={tvOnly} size={{ width: 360, height: 360 }} today={today} cell={cell} focusDate={date} />
    </div>
  );
}
