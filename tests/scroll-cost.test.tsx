// @vitest-environment jsdom
// Cost of scrolling the League List (profiled 2026-10-24 in headed Chrome: half the CPU went into constructing
// Intl.DateTimeFormat objects, and every scroll event re-rendered every visible day): date/time formatters are built
// once and reused, and a scroll that doesn't change which days are rendered doesn't re-render them.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { fmtDate } from '../src/components/widget';
import { localDate, tipoff } from '../src/data/model';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Replaces Intl.DateTimeFormat with a subclass that counts constructions and format() calls. */
function countIntl() {
  const Real = Intl.DateTimeFormat;
  const n = { made: 0, formatted: 0 };
  class Counting extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      n.made++;
    }
    format(d?: number | Date) {
      n.formatted++;
      return super.format(d);
    }
  }
  vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Counting });
  return n;
}

describe('date/time formatters are reused', () => {
  it('tipoff, localDate and fmtDate over a month of games build only a handful of formatters', () => {
    const n = countIntl();
    const games = data.games.slice(0, 300);
    const first = games.map((g) => tipoff(g, 'America/Sao_Paulo').label);
    for (const zone of ['America/Sao_Paulo', 'America/New_York', undefined]) for (const g of games) tipoff(g, zone);
    for (const g of games) localDate(Date.parse(g.startTimeUtc || '2026-11-01T00:00:00Z'), 'UTC');
    for (const d of data.dates.slice(0, 60)) fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' });
    expect(n.made).toBeLessThanOrEqual(10);
    // same results as before (tz tests cover the values; here: stable across calls)
    expect(games.map((g) => tipoff(g, 'America/Sao_Paulo').label)).toEqual(first);
  });
});

describe('League List scroll', () => {
  it('a scroll that keeps the same days rendered re-renders none of them (no tip-off time or day heading formatted)', () => {
    render(<CalendarView data={data} size={{ width: 1840, height: 1000 }} now={Date.parse('2026-11-15T15:00:00Z')} timeZone="UTC" initial={{ date: '2026-11-01' }} />);
    const list = screen.getByTestId('league-list');
    const before = [...list.querySelectorAll('[data-day]')].map((d) => d.getAttribute('data-day'));
    expect(before.length).toBeGreaterThan(1);
    // every formatter, cached or not (spying on the prototype reaches instances made before this line too); format is
    // a getter, read on every call. Counted: tip-off times (hour) and day headings (month, no year) — what a day
    // section renders. The list's own week strip (weekday names, today's date) re-renders with the list; cheap.
    const real = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format')!.get!;
    let daySection = 0;
    const format = vi.spyOn(Intl.DateTimeFormat.prototype as unknown as Record<'format', unknown>, 'format', 'get').mockImplementation(function (this: Intl.DateTimeFormat) {
      const o = this.resolvedOptions();
      if (o.hour || (o.month && !o.year)) daySection++;
      return real.call(this);
    });
    // jsdom has no scrolling: set the position and send the event the browser would
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: list.scrollTop + 10 });
    fireEvent.scroll(list);
    expect([...list.querySelectorAll('[data-day]')].map((d) => d.getAttribute('data-day'))).toEqual(before);
    expect(format).toHaveBeenCalled(); // the spy works (week strip)
    expect(daySection).toBe(0);
    format.mockRestore();
  });
});
