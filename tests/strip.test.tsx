// @vitest-environment jsdom
// Compact week strip in both lists (round 4, item 8): a fixed Sun–Sat week, month over day number, the League List's
// game count (TV filter respected) or the Team List's opponent under each date, selected day filled, today blue, ‹ ›
// for the previous / next week with games. Team List: the strip and the date title follow the row at the top through a
// store — scrolling re-renders no row.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { hasNationalTv, teamGames, teamRestDays, weekOf } from '../src/data/model';
import { TEAM_BY_ID } from '../src/data/teams';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LAL = 1610612747;
const strip = () => within(screen.getByTestId('week-strip'));
const days = () => strip().getAllByRole('tab');
const sub = (d: HTMLElement) => d.querySelector('.ck-strip-sub')!.textContent;

describe('League List strip', () => {
  it('Sun–Sat of the top day, "Nov" over "15", count under each date (TV filter too), selected filled, today blue', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    expect(days().map((d) => d.dataset.date)).toEqual(weekOf('2026-11-17'));
    for (const d of days()) {
      const n = data.byDate.get(d.dataset.date!)?.length ?? 0;
      expect(d.querySelector('.ck-strip-mon')!.textContent).toMatch(/ Nov$/);
      expect(d.querySelector('.ck-strip-num')!.textContent).toBe(String(Number(d.dataset.date!.slice(8))));
      expect(sub(d)).toBe(n ? String(n) : '–');
      expect((d as HTMLButtonElement).disabled).toBe(!n);
    }
    const sel = days().find((d) => d.getAttribute('aria-selected') === 'true')!;
    expect([sel.dataset.date, sel.classList.contains('ck-strip-selected')]).toEqual(['2026-11-17', true]);
    expect(days().filter((d) => d.classList.contains('ck-strip-today')).map((d) => d.dataset.date)).toEqual(['2026-11-15']);
    cleanup();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17', tvOnly: true }} />);
    for (const d of days()) {
      const n = (data.byDate.get(d.dataset.date!) ?? []).filter(hasNationalTv).length;
      expect(sub(d), d.dataset.date).toBe(n ? String(n) : '–');
    }
  });

  it('a day click keeps the week (no recentering); › / ‹ jump to the next / previous week with games', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    const week = days().map((d) => d.dataset.date);
    fireEvent.click(days().find((d) => d.dataset.date === '2026-11-20')!);
    expect(screen.getByTestId('day-title').textContent).toBe('Friday, November 20, 2026');
    expect(days().map((d) => d.dataset.date)).toEqual(week);
    fireEvent.click(screen.getByLabelText('Next week'));
    expect(days().map((d) => d.dataset.date)).toEqual(weekOf('2026-11-22'));
    expect(screen.getByTestId('day-title').textContent).toBe('Sunday, November 22, 2026');
    fireEvent.click(screen.getByLabelText('Previous week'));
    expect(days().map((d) => d.dataset.date)).toEqual(week);
    expect(screen.getByTestId('day-title').textContent).toBe('Sunday, November 15, 2026'); // the week's first game day
  });
});

/** jsdom has no layout: rows get offsetTop = index × 40 px in the list, so the row at the top follows scrollTop. */
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.dataset.rowDate) return 0;
    return [...this.parentElement!.children].indexOf(this) * 40;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => 100_000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
}
/** Scrolls the list and waits a frame (the list reads its position once per animation frame). */
const scrollTo = async (y: number) => {
  const list = screen.getByTestId('team-list');
  list.scrollTop = y;
  fireEvent.scroll(list);
  await act(() => new Promise((r) => requestAnimationFrame(r)));
};

describe('Team List strip and title', () => {
  it('desktop: title and strip on the row at the top; opponents under game days; other days disabled', async () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    const games = teamGames(data, LAL);
    // opens at the next game not over (Nov 15 15:00 UTC)
    const next = games.find((g) => Date.parse(g.startTimeUtc!) + 3 * 3_600_000 > NOW)!;
    expect(screen.getByTestId('team-day-title').textContent).toMatch(new RegExp(`${Number(next.dateEt.slice(8))}, 2026$`));
    // scroll to the 10th row: title + strip follow
    await scrollTo(10 * 40);
    const g = games[10]!;
    expect(screen.getByTestId('team-day-title').textContent).toContain(` ${Number(g.dateEt.slice(8))}, `);
    expect(days().map((d) => d.dataset.date)).toEqual(weekOf(g.dateEt));
    for (const d of days()) {
      const game = games.find((x) => x.dateEt === d.dataset.date);
      const opp = game && (game.homeTeam.teamId === LAL ? `vs ${game.awayTeam.teamTricode}` : `@ ${game.homeTeam.teamTricode}`);
      expect(sub(d), d.dataset.date).toBe(opp ?? '–');
      expect((d as HTMLButtonElement).disabled, d.dataset.date).toBe(!game);
    }
  });

  it('a day click scrolls its row to the top; ‹ › go to the previous / next week with a game', async () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    const games = teamGames(data, LAL);
    await scrollTo(10 * 40);
    const target = days().find((d) => !(d as HTMLButtonElement).disabled && d.getAttribute('aria-selected') !== 'true')!;
    fireEvent.click(target);
    const i = games.findIndex((g) => g.dateEt === target.dataset.date);
    expect(screen.getByTestId('team-list').scrollTop).toBe(i * 40);
    fireEvent.click(screen.getByLabelText('Next week'));
    const nextGame = games.find((g) => g.dateEt > weekOf(target.dataset.date!)[6]!)!;
    expect(screen.getByTestId('team-list').scrollTop).toBe(games.indexOf(nextGame) * 40);
    expect(days().map((d) => d.dataset.date)).toEqual(weekOf(nextGame.dateEt));
  });

  it('"Show rest days": rest days in the strip are enabled and scroll to their rest row', () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: true }} />);
    const rest = teamRestDays(data, LAL);
    const visible = days().filter((d) => rest.includes(d.dataset.date!));
    expect(visible.length).toBeGreaterThan(0);
    for (const d of visible) expect((d as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(visible[0]!);
    expect(screen.getByTestId('team-day-title').textContent).toContain(` ${Number(visible[0]!.dataset.date!.slice(8))}, `);
  });

  it('scrolling re-renders no row: a scroll that changes the top row formats no tip-off time', async () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    const real = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format')!.get!;
    let tipoffs = 0;
    vi.spyOn(Intl.DateTimeFormat.prototype as unknown as Record<'format', unknown>, 'format', 'get').mockImplementation(function (this: Intl.DateTimeFormat) {
      if (this.resolvedOptions().hour) tipoffs++;
      return real.call(this);
    });
    const before = screen.getByTestId('team-day-title').textContent;
    await scrollTo(30 * 40);
    expect(screen.getByTestId('team-day-title').textContent).not.toBe(before); // the title followed
    expect(tipoffs).toBe(0);
  });

  it('phones: no strip, no title', () => {
    render(<CalendarView data={data} size={{ width: 390, height: 800 }} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL }} />);
    expect(screen.queryByTestId('week-strip')).toBeNull();
    expect(screen.queryByTestId('team-day-title')).toBeNull();
    expect(TEAM_BY_ID.get(LAL)!.tricode).toBe('LAL');
  });
});
