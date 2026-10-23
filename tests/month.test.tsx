// @vitest-environment jsdom
// League → Month: full month calendar listing every game (desktop/tablet); count navigator on narrow widths.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { hasNationalTv, teamLabel } from '../src/data/model';
import { data as realData } from './feed';
import { dataOf, game, TEAM } from './synthetic';
import { TEAMS } from '../src/data/teams';
import type { CalendarData } from '../src/data/model';

afterEach(cleanup);

const WIDE = { width: 1000, height: 800 };
const NOW = Date.parse('2026-10-23T15:00:00Z');

function openMonth(data: CalendarData, date: string, size = WIDE) {
  const el = render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ date }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  return el;
}
const lines = (root: ParentNode, date: string) => [...root.querySelectorAll(`[data-date="${date}"] [data-game-id]`)];

describe('league month view (wide)', () => {
  it('a 15-game day (real feed, Nov 2) lists all 15 games in tip-off order, none hidden', () => {
    const el = openMonth(realData, '2026-11-02');
    const day = realData.byDate.get('2026-11-02')!;
    expect(day).toHaveLength(15);
    const shown = lines(el.container, '2026-11-02');
    expect(shown.map((l) => l.getAttribute('data-game-id'))).toEqual(day.map((g) => g.gameId));
    expect(el.container.textContent).not.toMatch(/\+\s*\d+\s*more/i);
  });

  it('each line: away logo, AWAY, @, home logo, HOME (local logo files); nothing else', () => {
    // 15 games, every team once, given out of tip-off order.
    const tips = [5, 2, 9, 0, 14, 7, 1, 12, 3, 10, 6, 13, 4, 11, 8];
    const games = tips.map((h, i) =>
      game({ date: '2026-11-10', utc: new Date(Date.UTC(2026, 10, 10, 23, 0) + h * 600_000).toISOString(), away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id, natl: i % 3 ? [] : ['ESPN'] }),
    );
    const d = dataOf(games);
    const el = openMonth(d, '2026-11-10');
    const shown = lines(el.container, '2026-11-10');
    expect(shown).toHaveLength(15);
    expect(shown.map((l) => l.getAttribute('data-game-id'))).toEqual(d.byDate.get('2026-11-10')!.map((g) => g.gameId));
    for (const l of shown) {
      const g = games.find((x) => x.gameId === l.getAttribute('data-game-id'))!;
      expect(l.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}`);
      const imgs = [...l.querySelectorAll('img')].map((i) => i.getAttribute('src'));
      expect(imgs).toEqual([`/logos/${g.awayTeam.teamTricode}.svg`, `/logos/${g.homeTeam.teamTricode}.svg`]);
    }
    const cell = el.container.querySelector('[data-date="2026-11-10"]')!;
    expect(cell.querySelector('[data-testid="tipoff"], [data-testid="tv-badge"], [data-testid="open-game"], .ck-tag')).toBeNull();
    expect(cell.textContent).not.toMatch(/\d\d:\d\d|ESPN/);
  });

  it('TBD teams show "TBD" with no <img>', () => {
    const el = openMonth(realData, '2026-12-04');
    const qf = lines(el.container, '2026-12-04').filter((l) => l.getAttribute('data-game-id')!.startsWith('002260120'));
    expect(qf).toHaveLength(2);
    for (const l of qf) {
      expect(l.textContent!.replace(/\s+/g, ' ').trim()).toBe('TBD @ TBD');
      expect(l.querySelector('img')).toBeNull();
    }
    cleanup();
    const half = game({ date: '2026-12-11', utc: '2026-12-12T01:00:00Z', away: 0, home: TEAM.LAL });
    const el2 = openMonth(dataOf([half]), '2026-12-11');
    const [l] = lines(el2.container, '2026-12-11');
    expect(l!.textContent!.replace(/\s+/g, ' ').trim()).toBe('TBD @ LAL');
    expect([...l!.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/logos/LAL.svg']);
  });

  it('TV games only: lists only national-TV games', () => {
    const el = openMonth(realData, '2026-11-02');
    fireEvent.click(screen.getByLabelText('TV games only'));
    for (const [date, games] of realData.byDate) {
      if (!date.startsWith('2026-11')) continue;
      const want = games.filter(hasNationalTv).map((g) => g.gameId);
      expect(lines(el.container, date).map((l) => l.getAttribute('data-game-id')), date).toEqual(want);
    }
    expect(lines(el.container, '2026-11-02').length).toBeLessThan(15);
  });

  it('clicking a day opens it in the day view', () => {
    const el = openMonth(realData, '2026-11-02');
    fireEvent.click(el.container.querySelector('[data-date="2026-11-14"]')!);
    expect(screen.queryByRole('region', { name: 'League month' })).toBeNull();
    expect(screen.getByTestId('day-title').textContent).toBe('Saturday, November 14, 2026');
  });

  it("today's cell is highlighted; days without games stay empty (day number only)", () => {
    const el = openMonth(realData, '2026-10-23');
    expect(el.container.querySelector('[data-date="2026-10-23"]')!.classList).toContain('ck-cell-today');
    expect(el.container.querySelectorAll('.ck-cell-today')).toHaveLength(1);
    const empty = el.container.querySelector('[data-date="2026-10-19"]')!;
    expect(empty.querySelector('[data-game-id]')).toBeNull();
    expect(empty.textContent).toBe('19');
  });
});

describe('league month view (narrow widths)', () => {
  for (const width of [360, 700]) {
    it(`${width} px: count-per-day navigator, no matchup lines`, () => {
      const el = openMonth(realData, '2026-11-02', { width, height: 800 });
      expect(screen.getByRole('region', { name: 'Month navigator' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'League month' })).toBeNull();
      expect(screen.getByLabelText('November 2: 15 games')).toBeTruthy();
      expect(el.container.querySelectorAll('[data-date] [data-game-id]')).toHaveLength(0);
    });
  }
});

it('teamLabel (sanity for TBD rendering)', () => expect(teamLabel({ teamId: 0, teamTricode: '' } as never)).toBe('TBD'));
