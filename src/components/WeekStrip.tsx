// Compact week strip for the lists (round 4): a fixed Sun–Sat week, no boxes — a small month over the day number, a
// small line under it (the League List's game count, the Team List's opponent), the selected day in a filled pill,
// today's date in blue, ‹ › on the sides for the previous / next week.

import { memo, useSyncExternalStore } from 'react';
import type { ValueStore } from './valueStore';
import { fmtDate } from './widget';

export interface StripDay {
  date: string;
  /** Under the date: "9" (games) or "@ DET" / "vs CHI"; empty shows a dash. */
  sub?: string;
  disabled: boolean;
  /** Instead of the date (Cup group rounds): the small line on top, the big one, and the spoken label. */
  top?: string;
  num?: string;
  aria?: string;
}

export interface WeekStripProps {
  days: StripDay[];
  selected?: string;
  /**
   * The selected date from a store instead (Team List, following the scroll): each day reads whether it is the one, so
   * a change re-renders just the old and the new selected day, not the strip.
   */
  selectedStore?: ValueStore<string>;
  today?: string;
  onPick: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** What ‹ › step by and the days are (Cup schedule, round 12: "night", "Cup nights"); default a week. */
  unit?: string;
  label?: string;
}

// memo: the League List re-renders on every scroll event; the strip only when its week, day or counts change
export const WeekStrip = memo(function WeekStrip({ days, selected, selectedStore, today, onPick, onPrev, onNext, prevDisabled, nextDisabled, unit = 'week', label = 'Week' }: WeekStripProps) {
  return (
    <div className="ck-strip" data-testid="week-strip">
      <button type="button" className="ck-strip-arrow" aria-label={`Previous ${unit}`} disabled={prevDisabled} onClick={onPrev}>
        ‹
      </button>
      <div className="ck-strip-days" role="tablist" aria-label={label}>
        {selectedStore ? <StoreDays store={selectedStore} days={days} today={today} onPick={onPick} /> : days.map((d) => <Day key={d.date} day={d} selected={d.date === selected} today={today} onPick={onPick} />)}
      </div>
      <button type="button" className="ck-strip-arrow" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext}>
        ›
      </button>
    </div>
  );
});

type DayProps = { day: StripDay; today?: string; onPick: (date: string) => void };

const Day = memo(function Day({ day: d, selected, today, onPick }: DayProps & { selected: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={`${d.aria ?? fmtDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}${d.sub ? `: ${d.sub}` : ''}`}
      className={`ck-strip-day${selected ? ' ck-strip-selected' : ''}${d.date === today ? ' ck-strip-today' : ''}`}
      disabled={d.disabled}
      onClick={() => onPick(d.date)}
      data-date={d.date}
    >
      <span className="ck-strip-mon">
        {d.top ?? `${fmtDate(d.date, { weekday: 'short' })} ${fmtDate(d.date, { month: 'short' })}`}
      </span>
      <span className="ck-strip-num">{d.num ?? Number(d.date.slice(8))}</span>
      <span className="ck-strip-sub">{d.sub || '–'}</span>
    </button>
  );
});

/** The days, reading the selected date from the store (one subscriber); only the old and new selected Day re-render. */
function StoreDays({ store, days, today, onPick }: { store: ValueStore<string>; days: StripDay[]; today?: string; onPick: (date: string) => void }) {
  const selected = useSyncExternalStore(store.subscribe, store.get);
  return (
    <>
      {days.map((d) => (
        <Day key={d.date} day={d} selected={d.date === selected} today={today} onPick={onPick} />
      ))}
    </>
  );
}
