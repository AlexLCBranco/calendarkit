// A day that gets extra attention in the US (a national holiday, a big NBA date: src/data/holidays.ts), as shown in
// the views: a small label on the day (calendar cells, list day headings, the Slate's header) and a star on that
// day's game cards. Hover: one plain sentence on why the day matters (the shared [data-tip] tooltip).

import { bigDayOf } from '../data/holidays';
import type { CalendarData } from '../data/model';

/** The day's label ("Christmas", "MLK Day"), or nothing on an ordinary day. */
export function BigDayLabel({ data, date, className = '' }: { data: CalendarData; date: string; className?: string }) {
  const d = bigDayOf(data, date);
  if (!d) return null;
  return (
    <span className={`ck-bigday${className}`} data-testid="big-day" data-day={date} data-tip={d.tip} aria-label={d.tip.replace(/\n/g, '. ')}>
      {d.label}
    </span>
  );
}

/** The star on a game card of such a day (the day's label is in its tooltip, before the sentence). */
export function BigDayMark({ data, date }: { data: CalendarData; date: string }) {
  const d = bigDayOf(data, date);
  if (!d) return null;
  return (
    <span className="ck-bigday-mark" data-testid="big-day-mark" data-tip={d.tip} aria-label={d.tip.replace(/\n/g, '. ')} role="img">
      ★
    </span>
  );
}
