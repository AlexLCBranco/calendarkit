// @vitest-environment jsdom
// The widget clock without the countdown (round 7, 2.3): no minute tick — one timeout, to the next local midnight
// (right on DST days), then the next; today's date still follows midnight. And no countdown text anywhere.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { nextMidnight } from '../src/components/clock';
import { localDate } from '../src/data/model';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('nextMidnight', () => {
  it('the first second of the next local date, in the given zone, on normal and DST days', () => {
    const cases: [string, string, string][] = [
      // [now (UTC), zone, next midnight (UTC)]
      ['2026-11-15T15:00:00Z', 'America/New_York', '2026-11-16T05:00:00Z'], // EST
      ['2026-10-31T15:00:00Z', 'America/New_York', '2026-11-01T04:00:00Z'], // still EDT
      ['2026-11-01T15:00:00Z', 'America/New_York', '2026-11-02T05:00:00Z'], // the 25-hour day: midnight is EST
      ['2027-03-14T03:00:00Z', 'America/New_York', '2027-03-14T05:00:00Z'], // 22:00 EST on Mar 13
      ['2027-03-14T15:00:00Z', 'America/New_York', '2027-03-15T04:00:00Z'], // the 23-hour day (EDT from 2 am)
      ['2026-11-15T15:00:00Z', 'America/Sao_Paulo', '2026-11-16T03:00:00Z'],
      ['2026-11-15T15:00:00Z', 'UTC', '2026-11-16T00:00:00Z'],
    ];
    for (const [now, tz, want] of cases) expect(new Date(nextMidnight(Date.parse(now), tz, localDate)).toISOString(), `${now} ${tz}`).toBe(new Date(want).toISOString());
  });
});

describe('the clock has no minute tick', () => {
  it('one pending timer (to midnight); an hour passes with no render of the view; at midnight today moves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-15T22:00:00Z')); // 22:00 in the widget zone (UTC)
    render(<CalendarView data={data} size={{ width: 1280, height: 900 }} timeZone="UTC" initial={{ mode: 'league', layout: 'list' }} />);
    expect(vi.getTimerCount(), 'timers').toBeLessThanOrEqual(2); // the midnight timeout (+ the stale stamp's, if any)
    const title = () => screen.getByTestId('day-title').textContent;
    expect(title()).toBe('Sunday, November 15, 2026');
    // the old clock ticked every minute: count clock reads over an hour
    const spy = vi.spyOn(Date, 'now');
    await act(async () => vi.advanceTimersByTime(60 * 60_000));
    expect(spy.mock.calls.length, 'Date.now() calls during an hour before midnight').toBe(0);
    await act(async () => vi.advanceTimersByTime(2 * 60 * 60_000)); // past midnight UTC
    expect(title()).toBe('Monday, November 16, 2026');
  });

  it('no countdown on today\'s games: the time, as on every other day', () => {
    const now = Date.parse('2026-11-15T15:00:00Z');
    render(<CalendarView data={data} size={{ width: 1280, height: 900 }} now={now} timeZone="UTC" initial={{ mode: 'league', layout: 'list', date: '2026-11-15' }} />);
    expect(document.querySelectorAll('.ck-countdown, .ck-time-hidden')).toHaveLength(0);
    const times = [...document.querySelectorAll('.ck-lday[data-day="2026-11-15"] [data-testid="tipoff"]')].map((t) => t.textContent);
    expect(times.length).toBeGreaterThan(3);
    for (const t of times) expect(t).toMatch(/^\d\d:\d\d( \(\+1\))?$|^TBD$/);
  });
});
