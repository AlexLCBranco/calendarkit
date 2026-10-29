// @vitest-environment jsdom
// Countdown on today's games (round 4, item 11): a game of today (viewer's zone) that hasn't tipped off shows
// "in 2h 35m" ("in 35m" under an hour) in place of its time in the League List and the Team List, the time again once
// it has started. One timer per widget, ticking on the minute; a tick updates only the countdown texts (no row or list
// re-renders). Images keep the plain time.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { countdownLabel } from '../src/components/clock';
import { suspendForCapture } from '../src/components/copyAsImage';
import { dataOf, game, TEAM } from './synthetic';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const XL = { width: 1840, height: 1000 };
// Nov 15, 2026, 15:00 UTC = 12:00 in Sao Paulo; games at 17:35 UTC (14:35 local), 15:20 UTC (12:20 local), 22:00 UTC
// (19:00 local), one this morning (13:00 UTC = 10:00 local, started) and one tomorrow
const NOW = Date.parse('2026-11-15T15:00:00Z');
const g1 = game({ date: '2026-11-15', utc: '2026-11-15T17:35:00Z', away: TEAM.NYK, home: TEAM.BOS });
const g2 = game({ date: '2026-11-15', utc: '2026-11-15T15:20:00Z', away: TEAM.LAL, home: TEAM.DEN });
const g3 = game({ date: '2026-11-15', utc: '2026-11-15T22:00:00Z', away: TEAM.MIA, home: TEAM.LAL });
const g0 = game({ date: '2026-11-15', utc: '2026-11-15T13:00:00Z', away: TEAM.DEN, home: TEAM.NYK });
const g4 = game({ date: '2026-11-16', utc: '2026-11-16T22:00:00Z', away: TEAM.BOS, home: TEAM.MIA });
const data = dataOf([g0, g1, g2, g3, g4]);
const SP = 'America/Sao_Paulo';
/** What the time column shows: the countdown, or the time (the plain time stays in the DOM, hidden, for images). */
const timeOf = (id: string) => {
  const t = document.querySelector(`.ck-card[data-game-id="${id}"] [data-testid="tipoff"]`)!;
  return (t.querySelector('.ck-countdown') ?? t.querySelector('.ck-time-plain'))!.textContent!.replace(/\s+/g, ' ').trim();
};

describe('countdownLabel', () => {
  it('"in 2h 35m", "in 2h", "in 35m", "in 1m"; nothing once started', () => {
    const t = NOW + (2 * 60 + 35) * 60_000;
    expect(countdownLabel(t, NOW)).toBe('in 2h 35m');
    expect(countdownLabel(NOW + 120 * 60_000, NOW)).toBe('in 2h');
    expect(countdownLabel(NOW + 35 * 60_000, NOW)).toBe('in 35m');
    expect(countdownLabel(NOW + 30_000, NOW)).toBe('in 1m');
    expect(countdownLabel(NOW, NOW)).toBeUndefined();
    expect(countdownLabel(NOW - 60_000, NOW)).toBeUndefined();
  });
});

describe('League List and Team List', () => {
  it('today\'s games not started show the countdown in place of the time; started and tomorrow\'s keep the time', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    render(<CalendarView data={data} size={XL} timeZone={SP} initial={{ date: '2026-11-15' }} />);
    expect(timeOf(g1.gameId)).toBe('in 2h 35m');
    expect(timeOf(g2.gameId)).toBe('in 20m');
    expect(timeOf(g3.gameId)).toBe('in 7h');
    expect(timeOf(g0.gameId)).toBe('10:00');
    cleanup();
    render(<CalendarView data={data} size={XL} timeZone={SP} initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    expect(timeOf(g1.gameId)).toBe('in 2h 35m');
    expect(timeOf(g4.gameId)).toBe('19:00');
  });

  it('one timer per widget, on the minute; a tick updates only the countdowns (no row formats its time)', () => {
    vi.useFakeTimers({ now: NOW + 25_000, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    render(<CalendarView data={data} size={XL} timeZone={SP} initial={{ date: '2026-11-15' }} />);
    // the clock's own timer: the next minute boundary, 35 s away
    const minuteTimers = timeout.mock.calls.filter(([, ms]) => ms === 35_000);
    expect(minuteTimers).toHaveLength(1);
    const real = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format')!.get!;
    let tipoffs = 0;
    vi.spyOn(Intl.DateTimeFormat.prototype as unknown as Record<'format', unknown>, 'format', 'get').mockImplementation(function (this: Intl.DateTimeFormat) {
      if (this.resolvedOptions().hour) tipoffs++;
      return real.call(this);
    });
    act(() => vi.advanceTimersByTime(35_000)); // 15:01:00
    expect(timeOf(g2.gameId)).toBe('in 19m');
    expect(timeOf(g1.gameId)).toBe('in 2h 34m');
    act(() => vi.advanceTimersByTime(19 * 60_000)); // 15:20: started
    expect(timeOf(g2.gameId)).toBe('12:20');
    expect(tipoffs).toBe(0);
  });

  it('images keep the plain time: the countdown hides while capturing', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    render(<CalendarView data={data} size={XL} timeZone={SP} initial={{ date: '2026-11-15' }} />);
    const card = document.querySelector<HTMLElement>(`.ck-card[data-game-id="${g1.gameId}"]`)!;
    expect(card.querySelector('.ck-time-plain')!.textContent).toBe('14:35');
    const restore = suspendForCapture(card);
    expect(card.classList.contains('ck-capturing')).toBe(true);
    restore();
    expect(card.classList.contains('ck-capturing')).toBe(false);
    expect(screen.getAllByTestId('tipoff').length).toBeGreaterThan(0);
  });
});
