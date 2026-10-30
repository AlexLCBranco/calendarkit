// @vitest-environment jsdom
// Today in the Team Calendar (round 7, 2.1): the cell of today (the clock's local date — the day strip's and the Today
// buttons' today) carries the week view's today highlight in Month, 1 week and 2 weeks; it moves at midnight.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { data } from './feed';

const LAL = 1610612747;
const DESKTOP = { width: 1280, height: 900 };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const todays = () => [...document.querySelectorAll<HTMLElement>('.ck-team-grid .ck-cell-today')].map((c) => c.dataset.date);

describe('Team Calendar: today highlighted', () => {
  it('exactly today\'s cell in Month, 1 week and 2 weeks (a game day and a day without a game)', () => {
    for (const [now, day] of [
      ['2026-11-15T15:00:00Z', '2026-11-15'],
      ['2026-11-16T15:00:00Z', '2026-11-16'],
    ] as const) {
      render(<CalendarView data={data} size={DESKTOP} now={Date.parse(now)} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: LAL }} />);
      expect(todays(), `month, ${day}`).toEqual([day]);
      for (const span of ['1 week', '2 weeks'] as const) {
        fireEvent.click(screen.getByRole('tab', { name: span }));
        expect(todays(), `${span}, ${day}`).toEqual([day]);
      }
      cleanup();
    }
  });

  it('the local date in the viewer\'s zone: 01:00 UTC on Nov 16 is still Nov 15 in São Paulo', () => {
    render(<CalendarView data={data} size={DESKTOP} now={Date.parse('2026-11-16T01:00:00Z')} timeZone="America/Sao_Paulo" initial={{ mode: 'team', layout: 'calendar', teamId: LAL }} />);
    expect(todays()).toEqual(['2026-11-15']);
  });

  it('a month without today has none', () => {
    render(<CalendarView data={data} size={DESKTOP} now={Date.parse('2026-11-15T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: LAL }} />);
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(todays()).toEqual([]);
  });

  it('moves at midnight (the clock\'s midnight timer), in the month and in 1 week', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-14T23:58:00Z')); // a Saturday: midnight also starts a new week
    render(<CalendarView data={data} size={DESKTOP} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: LAL }} />);
    expect(todays()).toEqual(['2026-11-14']);
    await act(async () => vi.advanceTimersByTime(3 * 60_000));
    expect(todays()).toEqual(['2026-11-15']);
    fireEvent.click(screen.getByRole('tab', { name: '1 week' }));
    expect(todays()).toEqual(['2026-11-15']);
    await act(async () => vi.advanceTimersByTime(24 * 3_600_000)); // a whole day with the page open
    expect(todays()).toEqual(['2026-11-16']);
  });
});
