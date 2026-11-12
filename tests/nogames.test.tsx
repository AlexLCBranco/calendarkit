// @vitest-environment jsdom
// Days without games inside the season are never skipped — League List and Slate show "No games …",
// ← / → (top bar and keys), the day strip and the date picker reach them; the season's edges stop the navigation; the
// week view shows them as empty days. Nov 3, 2026 is such a day (no NBA game, checked in the feed below).

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { listDays } from '../src/components/LeagueListView';
import { data } from './feed';

afterEach(cleanup);
const NOW = Date.parse('2026-11-15T15:00:00Z');
const WIDE = { width: 1600, height: 900 };
const NOV3 = '2026-11-03';
const first = data.dates[0]!;
const last = data.dates.at(-1)!;
const title = () => screen.getByTestId('day-title').textContent;
const view = (layout: 'list' | 'slate', date: string, tvOnly = false) => render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout, date, tvOnly }} />);
const arrow = (dir: 'Previous' | 'Next') => document.querySelector<HTMLButtonElement>(`.ck-toolbar button[aria-label="${dir} day"]`)!;

describe('the day list', () => {
  it('every calendar day from the first game day to the last, game-less days with no games; nothing outside', () => {
    expect(data.byDate.has(NOV3)).toBe(false); // the feed has no game on Nov 3
    const days = listDays(data, false);
    expect(days[0]!.date).toBe(first);
    expect(days.at(-1)!.date).toBe(last);
    for (let i = 1; i < days.length; i++) expect(Date.parse(days[i]!.date) - Date.parse(days[i - 1]!.date)).toBe(86_400_000);
    expect(days.find((d) => d.date === NOV3)!.games).toEqual([]);
    for (const d of days) expect(d.games).toEqual(data.byDate.get(d.date) ?? []);
  });
});

describe('League List and Slate', () => {
  it('→ from Nov 2 lands on Nov 3 ("No games on Tuesday, November 3"), → again on Nov 4; ← back', () => {
    view('list', '2026-11-02');
    fireEvent.click(arrow('Next'));
    expect(title()).toBe('Tuesday, November 3, 2026');
    expect(screen.getByTestId('no-games').textContent).toBe('No games on Tuesday, November 3');
    expect(screen.getByTestId('league-list').querySelectorAll('article')).toHaveLength(0);
    fireEvent.click(arrow('Next'));
    expect(title()).toBe('Wednesday, November 4, 2026');
    fireEvent.click(arrow('Previous'));
    fireEvent.click(arrow('Previous'));
    expect(title()).toBe('Monday, November 2, 2026');
  });

  it('the arrow keys step through Nov 3 too, in the List and the Slate', () => {
    for (const layout of ['list', 'slate'] as const) {
      view(layout, '2026-11-02');
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(title()).toBe('Tuesday, November 3, 2026');
      expect(screen.getByTestId('no-games').textContent).toBe('No games on Tuesday, November 3');
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(title()).toBe('Wednesday, November 4, 2026');
      cleanup();
    }
  });

  it('"today" without games says so; the TV filter: a day with games but no TV game says "No national TV games …"', () => {
    render(<CalendarView data={data} size={WIDE} now={Date.parse('2026-11-03T15:00:00Z')} timeZone="UTC" initial={{ mode: 'league', layout: 'list' }} />);
    expect(screen.getByTestId('no-games').textContent).toBe('No games today');
    cleanup();
    const noTv = listDays(data, true).find((d) => !d.games.length && data.byDate.has(d.date))!;
    view('list', noTv.date, true);
    expect(screen.getByTestId('no-games').textContent).toMatch(/^No national TV games on /);
  });

  it('the strip: Nov 3 can be picked ("–" under it); the date picker: Nov 3 enabled and picked', () => {
    view('list', '2026-11-02');
    const strip = screen.getByTestId('league-list').closest('section')!;
    const day = strip.querySelector<HTMLButtonElement>(`.ck-strip [data-date="${NOV3}"], [data-date="${NOV3}"]`)!;
    expect(day.disabled).toBe(false);
    expect(day.textContent).toContain('–');
    fireEvent.click(day);
    expect(title()).toBe('Tuesday, November 3, 2026');
    cleanup();
    view('list', '2026-11-02');
    fireEvent.click(screen.getByTestId('date-pick'));
    const pop = screen.getByTestId('date-picker');
    const cell = within(pop).getAllByRole('button').find((b) => b.dataset.date === NOV3)! as HTMLButtonElement;
    expect(cell.disabled).toBe(false);
    fireEvent.click(cell);
    expect(title()).toBe('Tuesday, November 3, 2026');
  });

  it('the season\'s edges: ← disabled on opening night, → on the last day; the picker\'s days outside the season disabled', () => {
    view('list', first);
    expect(arrow('Previous').disabled).toBe(true);
    expect(title()).toContain(new Date(`${first}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }));
    fireEvent.click(screen.getByTestId('date-pick'));
    const before = new Date(Date.parse(`${first}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const cell = screen.getByTestId('date-picker').querySelector<HTMLButtonElement>(`[data-date="${before}"]`);
    if (cell) expect(cell.disabled).toBe(true);
    cleanup();
    view('list', last);
    expect(arrow('Next').disabled).toBe(true);
  });
});

describe('week view', () => {
  it('the week of Nov 1 shows Nov 3 as an empty day: its cell is there, with its header, and no game lines', () => {
    render(<CalendarView data={data} size={{ width: 1840, height: 1000 }} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout: 'calendar', date: '2026-11-02' }} />);
    const cell = document.querySelector<HTMLElement>(`.ck-month-day[data-date="${NOV3}"], [data-date="${NOV3}"]`)!;
    expect(cell).toBeTruthy();
    expect(cell.querySelectorAll('.ck-month-game')).toHaveLength(0);
    expect(cell.textContent).toMatch(/3/);
  });
});
