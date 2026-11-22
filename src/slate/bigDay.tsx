// A day that gets extra attention in the US (a national holiday, a big NBA date: src/data/holidays.ts), as shown in
// the views: a small label on the day (calendar cells, list day headings, the Slate's header) and a star on that
// day's game cards. Hover: one plain sentence on why the day matters (the shared [data-tip] tooltip).
// The label is also the way to that day's league Slate: a link under a `BigDayLinkContext` provider (calendarkit's
// CalendarView, which handles every label with one click handler on its root: `bigDayLinkTarget`), else the plain
// text it always was (images, a host's Slate widget). The Slate's own header label is on that day already: `plain`.

import { createContext, useContext } from 'react';
import { bigDayOf } from '../data/holidays';
import type { CalendarData } from '../data/model';

export interface BigDayLinks {
  /** The league Slate's URL for a day ('' = no link). */
  href: (date: string) => string;
}
export const BigDayLinkContext = createContext<BigDayLinks | undefined>(undefined);

export const BIG_DAY_LINK_TIP = 'Open this day’s Slate';
export const BIG_DAY_LINK_SELECTOR = '[data-bigday-link]';

/** The big-day label an event happened on, with its date, or undefined. */
export function bigDayLinkTarget(target: EventTarget | null): { el: HTMLElement; date: string } | undefined {
  const el = target instanceof Element ? target.closest<HTMLElement>(BIG_DAY_LINK_SELECTOR) : null;
  return el?.dataset.bigdayLink ? { el, date: el.dataset.bigdayLink } : undefined;
}

/**
 * The day's label ("Christmas", "MLK Day"), or nothing on an ordinary day. `plain`: never a link (the Slate's header).
 * `inButton`: the label sits inside a <button> (a month navigator's day), where an <a> isn't allowed: the same link
 * as a span.
 */
export function BigDayLabel({ data, date, className = '', plain = false, inButton = false }: { data: CalendarData; date: string; className?: string; plain?: boolean; inButton?: boolean }) {
  const links = useContext(BigDayLinkContext);
  const d = bigDayOf(data, date);
  if (!d) return null;
  const href = plain ? '' : (links?.href(date) ?? '');
  const tip = d.tip.replace(/\n/g, '. ');
  if (!href)
    return (
      <span className={`ck-bigday${className}`} data-testid="big-day" data-day={date} data-tip={d.tip} aria-label={tip}>
        {d.label}
      </span>
    );
  const shared = { className: `ck-bigday ck-bigday-link${className}`, 'data-testid': 'big-day', 'data-day': date, 'data-bigday-link': date, 'data-tip': d.tip, 'aria-label': `${tip}. ${BIG_DAY_LINK_TIP}` };
  return inButton ? (
    <span {...shared} role="link">
      {d.label}
    </span>
  ) : (
    <a {...shared} href={href} draggable={false} tabIndex={-1}>
      {d.label}
    </a>
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
