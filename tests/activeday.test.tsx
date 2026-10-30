// @vitest-environment jsdom
// Active day in the lists (round 4, item 10): the day selected in the strip is highlighted — League List: that day's
// section (header in the accent, a thin left bar and a faint tint on its rows), Team List: that day's row — by a class
// on the old and the new day only, written when the active day changes (no day section or row re-renders). Never in
// a copied image: the class is lifted while an image is taken.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { suspendForCapture, ACTIVE_DAY } from '../src/components/copyAsImage';
import { teamGames } from '../src/data/model';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LAL = 1610612747;
const active = () => [...document.querySelectorAll<HTMLElement>(`.${ACTIVE_DAY}`)].map((e) => e.dataset.day ?? e.dataset.rowDate);

/** Counts tip-off times formatted (what a game row renders): a highlight change must format none. */
function countTipoffs() {
  const real = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format')!.get!;
  const n = { tipoffs: 0 };
  vi.spyOn(Intl.DateTimeFormat.prototype as unknown as Record<'format', unknown>, 'format', 'get').mockImplementation(function (this: Intl.DateTimeFormat) {
    if (this.resolvedOptions().hour) n.tipoffs++;
    return real.call(this);
  });
  return n;
}

describe('League List', () => {
  it('the top day (the strip\'s selected day) has the class, only it; a strip click moves it to the new day', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    expect(active()).toEqual(['2026-11-17']);
    fireEvent.click(screen.getByRole('tab', { name: /^Thursday, November 19/ }));
    expect(active()).toEqual(['2026-11-19']);
  });

  it('moving the highlight re-renders no day: no tip-off time formatted', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    const days = () => new Set([...document.querySelectorAll<HTMLElement>('[data-testid="league-list"] [data-day]')].map((d) => d.dataset.day!));
    const before = days();
    const n = countTipoffs();
    fireEvent.click(screen.getByRole('tab', { name: /^Wednesday, November 18/ }));
    expect(active()).toEqual(['2026-11-18']);
    // only days that newly came into the rendered window render (one tip-off per game); the days that stay — the old
    // and the new active day among them — don't
    const mounted = [...days()].filter((d) => !before.has(d));
    expect(before.has('2026-11-17') && before.has('2026-11-18')).toBe(true);
    expect(n.tipoffs).toBe(mounted.reduce((k, d) => k + data.byDate.get(d)!.length, 0));
  });
});

/** jsdom has no layout: rows get offsetTop = index × 40 px (as in strip.test.tsx). */
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.rowDate ? [...this.parentElement!.children].indexOf(this) * 40 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => 100_000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
}

describe('Team List', () => {
  it('the row at the top has the class; scrolling moves it without re-rendering rows', async () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    const games = teamGames(data, LAL);
    const next = games.find((g) => Date.parse(g.startTimeUtc!) + 3 * 3_600_000 > NOW)!;
    expect(active()).toEqual([next.dateEt]);
    const n = countTipoffs();
    const list = screen.getByTestId('team-list');
    list.scrollTop = 20 * 40;
    fireEvent.scroll(list);
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(active()).toEqual([games[20]!.dateEt]);
    expect(n.tipoffs).toBe(0);
  });
});

describe('copies', () => {
  it('suspendForCapture lifts the class (on the node and inside it) with no transition, and puts it back', () => {
    const root = document.createElement('div');
    root.className = `ck-lday ${ACTIVE_DAY}`;
    const row = document.createElement('div');
    row.className = ACTIVE_DAY;
    root.append(row);
    const restore = suspendForCapture(root);
    expect(root.classList.contains(ACTIVE_DAY) || row.classList.contains(ACTIVE_DAY)).toBe(false);
    expect(root.style.transition).toBe('none');
    restore();
    expect(root.classList.contains(ACTIVE_DAY) && row.classList.contains(ACTIVE_DAY)).toBe(true);
  });
});
