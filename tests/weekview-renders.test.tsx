// @vitest-environment jsdom
// The league week view renders its game lines once on load. Before, the lines rendered at scale 1, the grid's
// top was measured, the scale changed and every line rendered (and was laid out) again — ~45 ms of the 1920 × 1080 load
// on the Windows PC. Lines counted through leagueFatigue, which each MonthGameLine calls once per render. jsdom has no
// layout, so the grid's top is faked (40 px below the widget's top, as a top bar puts it).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/data/fatigue', async (orig) => {
  const m = await orig<typeof import('../src/data/fatigue')>();
  return { ...m, leagueFatigue: (...a: Parameters<typeof m.leagueFatigue>) => (calls.n++, m.leagueFatigue(...a)) };
});

const { CalendarView } = await import('../src/components/CalendarView');
const { data } = await import('./feed');

afterEach(() => (cleanup(), vi.restoreAllMocks()));

describe('league week view load', () => {
  it('each game line renders once (no second pass after measuring the grid)', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.classList.contains('ck-week-grid') ? 40 : 0;
      return { top, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    calls.n = 0;
    render(<CalendarView data={data} size={{ width: 1920, height: 1080 }} now={Date.parse('2026-11-15T15:00:00Z')} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-15' }} />);
    const lines = document.querySelectorAll('.ck-week-view [data-game-id]').length;
    expect(lines).toBeGreaterThan(30);
    expect(document.querySelector('.ck-week-view')!.getAttribute('data-weeks')).toBe('1');
    // one call per line, plus the view's own (busiest day) and a few outside the lines
    expect(calls.n).toBeLessThanOrEqual(lines + 3);
  });
});
