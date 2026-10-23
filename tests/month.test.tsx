// @vitest-environment jsdom
// League → Month: full month calendar listing every game (desktop/tablet), grouped by local tip-off time, in as
// many columns as fit; TV pill, B2B marks, logo backing. Count navigator on narrow widths.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as CV from '../src/components/CalendarView';
import { hasNationalTv, nationalTv, tipoff } from '../src/data/model';
import { data as realData } from './feed';
import { dataOf, game, TEAM } from './synthetic';
import { TEAMS } from '../src/data/teams';
import type { CalendarData } from '../src/data/model';

afterEach(cleanup);

const { CalendarView } = CV;
// Looked up loosely so the file still loads (and the other checks run) against a build without it.
const monthColumns = (w: number) => ((CV as Record<string, unknown>).monthColumns as ((w: number) => number) | undefined)?.(w);

const WIDE = { width: 1000, height: 800 }; // 1 column
const XL = { width: 1840, height: 1000 }; // 1920 px window: 2 columns
const NOW = Date.parse('2026-10-23T15:00:00Z');

function openMonth(data: CalendarData, date: string, size = WIDE, timeZone = 'UTC') {
  const el = render(<CalendarView data={data} size={size} now={NOW} timeZone={timeZone} initial={{ date }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  return el;
}
const cellOf = (root: ParentNode, date: string) => root.querySelector(`[data-date="${date}"]`)!;
const lines = (root: ParentNode, date: string) => [...root.querySelectorAll(`[data-date="${date}"] [data-game-id]`)];
const tris = (line: Element) => [...line.querySelectorAll('.ck-mtri')].map((t) => t.getAttribute('data-tricode'));

describe('league month view (wide)', () => {
  it('a 15-game day (real feed, Nov 2) lists all 15 games in tip-off order, none hidden', () => {
    const el = openMonth(realData, '2026-11-02');
    const day = realData.byDate.get('2026-11-02')!;
    expect(day).toHaveLength(15);
    expect(lines(el.container, '2026-11-02').map((l) => l.getAttribute('data-game-id'))).toEqual(day.map((g) => g.gameId));
    expect(el.container.textContent).not.toMatch(/\+\s*\d+\s*more/i);
  });

  it('each line: away logo + AWAY on the left, home logo + HOME on the right, no "@"; legend "Away · Home"', () => {
    const tips = [5, 2, 9, 0, 14, 7, 1, 12, 3, 10, 6, 13, 4, 11, 8];
    const games = tips.map((h, i) =>
      game({ date: '2026-11-10', utc: new Date(Date.UTC(2026, 10, 10, 23, 0) + h * 600_000).toISOString(), away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }),
    );
    const d = dataOf(games);
    const el = openMonth(d, '2026-11-10');
    const shown = lines(el.container, '2026-11-10');
    expect(shown).toHaveLength(15);
    expect(shown.map((l) => l.getAttribute('data-game-id'))).toEqual(d.byDate.get('2026-11-10')!.map((g) => g.gameId));
    for (const l of shown) {
      const g = games.find((x) => x.gameId === l.getAttribute('data-game-id'))!;
      expect(tris(l)).toEqual([g.awayTeam.teamTricode, g.homeTeam.teamTricode]);
      expect(l.textContent).not.toMatch(/@/);
      expect([...l.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([`/logos/${g.awayTeam.teamTricode}.svg`, `/logos/${g.homeTeam.teamTricode}.svg`]);
    }
    expect(screen.getByTestId('month-legend').textContent).toBe('Away · Home');
    const cell = cellOf(el.container, '2026-11-10');
    expect(cell.querySelector('[data-testid="tipoff"], [data-testid="tv-badge"], [data-testid="open-game"], .ck-tag')).toBeNull();
  });

  it('TBD teams show "TBD" with no <img>', () => {
    const el = openMonth(realData, '2026-12-04');
    const qf = lines(el.container, '2026-12-04').filter((l) => l.getAttribute('data-game-id')!.startsWith('002260120'));
    expect(qf).toHaveLength(2);
    for (const l of qf) {
      expect(tris(l)).toEqual(['TBD', 'TBD']);
      expect(l.querySelector('img')).toBeNull();
    }
    cleanup();
    const half = game({ date: '2026-12-11', utc: '2026-12-12T01:00:00Z', away: 0, home: TEAM.LAL });
    const el2 = openMonth(dataOf([half]), '2026-12-11');
    const [l] = lines(el2.container, '2026-12-11');
    expect(tris(l!)).toEqual(['TBD', 'LAL']);
    expect([...l!.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/logos/LAL.svg']);
  });

  it('every logo sits on the light backing', () => {
    const el = openMonth(realData, '2026-11-02');
    const imgs = [...el.container.querySelectorAll('.ck-month-full img')];
    expect(imgs.length).toBeGreaterThan(300);
    for (const i of imgs) expect(i.parentElement!.classList).toContain('ck-logo-backing');
  });

  it('TV games only: lists only national-TV games', () => {
    const el = openMonth(realData, '2026-11-02');
    fireEvent.click(screen.getByLabelText('TV games only'));
    for (const [date, games] of realData.byDate) {
      if (!date.startsWith('2026-11')) continue;
      expect(lines(el.container, date).map((l) => l.getAttribute('data-game-id')), date).toEqual(games.filter(hasNationalTv).map((g) => g.gameId));
    }
    expect(lines(el.container, '2026-11-02').length).toBeLessThan(15);
  });

  it('clicking a day opens it in the day view', () => {
    const el = openMonth(realData, '2026-11-02');
    fireEvent.click(cellOf(el.container, '2026-11-14'));
    expect(screen.queryByRole('region', { name: 'League month' })).toBeNull();
    expect(screen.getByTestId('day-title').textContent).toBe('Saturday, November 14, 2026');
  });

  it("today's cell is highlighted; days without games stay empty (day number only)", () => {
    const el = openMonth(realData, '2026-10-23');
    expect(cellOf(el.container, '2026-10-23').classList).toContain('ck-cell-today');
    expect(el.container.querySelectorAll('.ck-cell-today')).toHaveLength(1);
    const empty = cellOf(el.container, '2026-10-19');
    expect(empty.querySelector('[data-game-id]')).toBeNull();
    expect(empty.textContent).toBe('19');
  });
});

describe('time groups', () => {
  for (const tz of ['America/Sao_Paulo', 'America/New_York']) {
    it(`${tz}: every game under the label of its local tip-off, groups in time order`, () => {
      const el = openMonth(realData, '2026-11-02', WIDE, tz);
      for (const date of ['2026-11-02', '2026-11-04', '2026-11-27']) {
        const groups = [...cellOf(el.container, date).querySelectorAll('.ck-tgroup')];
        const labels = groups.map((g) => g.querySelector('.ck-tlabel')!.textContent);
        expect(new Set(labels).size, date).toBe(labels.length); // one group per time
        const want = [...new Set(realData.byDate.get(date)!.map((g) => tipoff(g, tz).label))];
        expect(labels, date).toEqual(want);
        for (const grp of groups) {
          const label = grp.querySelector('.ck-tlabel')!.textContent;
          for (const li of grp.querySelectorAll('[data-game-id]')) {
            const g = realData.games.find((x) => x.gameId === li.getAttribute('data-game-id'))!;
            expect(tipoff(g, tz).label).toBe(label);
          }
        }
      }
    });
  }

  it('after-midnight games are labelled with (+1) and stay on their NBA date', () => {
    const el = openMonth(realData, '2026-11-02', WIDE, 'America/Sao_Paulo');
    const labels = [...cellOf(el.container, '2026-11-02').querySelectorAll('.ck-tlabel')].map((l) => l.textContent);
    expect(labels.at(-1)).toMatch(/^00:\d\d \(\+1\)$/);
    expect(labels.filter((l) => l!.includes('(+1)')).length).toBeGreaterThan(0);
  });

  it('TBD-time games are grouped under "TBD", after the timed groups', () => {
    const el = openMonth(realData, '2026-12-04');
    const labels = [...cellOf(el.container, '2026-12-04').querySelectorAll('.ck-tlabel')].map((l) => l.textContent);
    expect(labels.at(-1)).toBe('TBD');
    const tbd = [...cellOf(el.container, '2026-12-04').querySelectorAll('.ck-tgroup')].at(-1)!;
    expect(tbd.querySelectorAll('[data-game-id]')).toHaveLength(2);
  });
});

describe('columns', () => {
  it('column count from the widget width: 1 at a 1280 px window, 2 at 1920 px', () => {
    expect(monthColumns(1248)).toBe(1);
    expect(monthColumns(1000)).toBe(1);
    expect(monthColumns(1840)).toBe(2);
    expect(monthColumns(718)).toBe(1);
  });

  it('2-column group fills down: first ceil(n/2) games in column 1, in time order', () => {
    const el = openMonth(realData, '2026-11-02', XL, 'America/New_York');
    const day = cellOf(el.container, '2026-11-02');
    expect(day.querySelector('.ck-month-day')!.getAttribute('data-cols')).toBe('2');
    const big = [...day.querySelectorAll('.ck-tgroup')].sort((a, b) => b.querySelectorAll('li').length - a.querySelectorAll('li').length)[0]!;
    const items = [...big.querySelectorAll('li')];
    expect(items.length).toBeGreaterThanOrEqual(3);
    const ul = big.querySelector('ul')!;
    const rows = Math.ceil(items.length / 2);
    expect(ul.style.gridTemplateRows).toBe(`repeat(${rows}, auto)`);
    expect(ul.style.gridAutoFlow).toBe('column');
    // DOM order = fill order (down column 1, then column 2) = tip-off order
    const ids = items.map((i) => i.getAttribute('data-game-id'));
    expect(ids).toEqual(realData.byDate.get('2026-11-02')!.filter((g) => ids.includes(g.gameId)).map((g) => g.gameId));
  });
});

describe('TV pill and B2B marks', () => {
  it('national-TV games: pill text exactly "TV", tooltip = network names; others: empty reserved slot; no network names as text', () => {
    const el = openMonth(realData, '2026-11-02');
    const month = el.container.querySelector('.ck-month-full')!;
    let tv = 0;
    for (const li of month.querySelectorAll('[data-game-id]')) {
      const g = realData.games.find((x) => x.gameId === li.getAttribute('data-game-id'))!;
      const pill = li.querySelector('.ck-tv-pill');
      const slot = li.querySelector('.ck-tv-slot')!;
      expect(slot, g.gameId).toBeTruthy();
      if (hasNationalTv(g)) {
        tv++;
        expect(pill!.textContent).toBe('TV');
        expect(pill!.getAttribute('data-tip')).toBe(nationalTv(g).join(', '));
      } else {
        expect(pill).toBeNull();
        expect(slot.textContent).toBe('');
      }
    }
    expect(tv).toBeGreaterThan(10);
    expect(month.textContent).not.toMatch(/ESPN|NBC|Peacock|Prime Video|NBA TV|ABC|Telemundo/);
  });

  it('B2B mark on the correct team tricode only; two marks when both teams are on a B2B', () => {
    const d = dataOf([
      game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
      game({ date: '2026-11-01', utc: '2026-11-01T23:30:00Z', home: TEAM.DEN, away: TEAM.MIA }),
      game({ id: '0022609901', date: '2026-11-02', utc: '2026-11-03T00:00:00Z', home: TEAM.LAL, away: TEAM.BOS }), // BOS on B2B
      game({ id: '0022609902', date: '2026-11-02', utc: '2026-11-03T00:30:00Z', home: TEAM.DEN, away: TEAM.NYK }), // both
    ]);
    const el = openMonth(d, '2026-11-02');
    const one = el.container.querySelector('[data-game-id="0022609901"]')!;
    expect([...one.querySelectorAll('.ck-b2b-mark')].map((m) => m.closest('.ck-mtri')!.getAttribute('data-tricode'))).toEqual(['BOS']);
    expect(one.querySelector('.ck-b2b-mark')!.getAttribute('data-tip')).toBe('Back-to-back');
    const both = el.container.querySelector('[data-game-id="0022609902"]')!;
    expect([...both.querySelectorAll('.ck-b2b-mark')].map((m) => m.closest('.ck-mtri')!.getAttribute('data-tricode'))).toEqual(['NYK', 'DEN']);
    expect(lines(el.container, '2026-11-01').flatMap((l) => [...l.querySelectorAll('.ck-b2b-mark')])).toHaveLength(0);
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
