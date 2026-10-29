// @vitest-environment jsdom
// Date picker (round 4, item 9): a calendar icon button next to the date title in the League List and the Team List
// opens a month popup (MonthNavigator): ‹ › months, a date jumps there. League List: game count per day (TV filter);
// Team List: game days marked with the opponent, a day without a game goes to the next game. Keyboard: arrows move
// between days (across months), Enter picks, Escape closes (focus back on the icon). Rendered only while open.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { addDays, hasNationalTv, teamGames } from '../src/data/model';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LAL = 1610612747;
const popup = () => screen.getByRole('dialog', { name: 'Pick a date' });
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));

describe('League List', () => {
  it('icon next to the title; popup only while open; counts per day (TV filter too); a date jumps there', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const icon = screen.getByRole('button', { name: 'Pick a date' });
    expect(icon.getAttribute('aria-expanded')).toBe('false');
    // right after the title
    expect(screen.getByTestId('day-title').nextElementSibling).toBe(icon);
    open();
    expect(icon.getAttribute('aria-expanded')).toBe('true');
    expect(within(popup()).getByText('November 2026')).toBeTruthy();
    for (const c of popup().querySelectorAll<HTMLButtonElement>('[data-date]')) {
      const n = data.byDate.get(c.dataset.date!)?.length ?? 0;
      expect(c.querySelector('.ck-count')?.textContent ?? '', c.dataset.date).toBe(n ? String(n) : '');
      expect(c.disabled).toBe(!n);
    }
    fireEvent.click(within(popup()).getByLabelText('Next month'));
    expect(within(popup()).getByText('December 2026')).toBeTruthy();
    fireEvent.click(popup().querySelector('[data-date="2026-12-16"]')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('day-title').textContent).toBe('Wednesday, December 16, 2026');
    cleanup();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17', tvOnly: true }} />);
    open();
    for (const c of popup().querySelectorAll<HTMLButtonElement>('[data-date]')) {
      const n = (data.byDate.get(c.dataset.date!) ?? []).filter(hasNationalTv).length;
      expect(c.querySelector('.ck-count')?.textContent ?? '', c.dataset.date).toBe(n ? String(n) : '');
    }
  });

  it('keyboard: focus on the shown day; ← → ↑ ↓ move between game days (into the next month); Escape closes, focus back', async () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    open();
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-17');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-18');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-25');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-17');
    // into December: the popup turns the month and keeps the focus on the day
    for (let i = 0; i < 3; i++) fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await act(async () => {});
    expect(within(popup()).getByText('December 2026')).toBeTruthy();
    expect((document.activeElement as HTMLElement).dataset.date).toBe(addDays('2026-11-17', 21));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pick a date' }));
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
  it('opponent on game days; a game day jumps to its row; a day without a game goes to the next game', () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL }} />);
    const games = teamGames(data, LAL);
    expect(screen.getByTestId('team-day-title').nextElementSibling).toBe(screen.getByRole('button', { name: 'Pick a date' }));
    open();
    for (const c of popup().querySelectorAll<HTMLButtonElement>('[data-date]')) {
      const g = games.find((x) => x.dateEt === c.dataset.date);
      const opp = g && (g.homeTeam.teamId === LAL ? `vs ${g.awayTeam.teamTricode}` : `@ ${g.homeTeam.teamTricode}`);
      expect(c.querySelector('.ck-count')?.textContent ?? '', c.dataset.date).toBe(opp ?? '');
    }
    const game = games.find((g) => g.dateEt >= '2026-11-20')!;
    fireEvent.click(popup().querySelector(`[data-date="${game.dateEt}"]`)!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('team-list').scrollTop).toBe(games.indexOf(game) * 40);
    // a day without a game → the next game
    open();
    const restDay = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'].find((d) => !games.some((g) => g.dateEt === d))!;
    fireEvent.click(popup().querySelector(`[data-date="${restDay}"]`)!);
    const next = games.find((g) => g.dateEt > restDay)!;
    expect(screen.getByTestId('team-list').scrollTop).toBe(games.indexOf(next) * 40);
  });
});
