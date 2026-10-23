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
  fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
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

  // A day's content (time labels + games) is one list that fills down column 1, then column 2 (newspaper order).
  const SP = 'America/Sao_Paulo';
  const cols = (cell: Element) => [...cell.querySelectorAll('.ck-month-day > .ck-mcol')];
  /** Rows of a column: its time labels plus its games. */
  const rows = (col: Element) => col.querySelectorAll('.ck-tlabel, [data-game-id]').length;
  const ids = (root: Element) => [...root.querySelectorAll('[data-game-id]')].map((l) => l.getAttribute('data-game-id'));

  it('Nov 15 at 1920 px: games in both columns, rows about half of the 1-column count (balanced within one row)', () => {
    const one = openMonth(realData, '2026-11-15', WIDE, SP);
    const oneCols = cols(cellOf(one.container, '2026-11-15'));
    expect(oneCols).toHaveLength(1);
    const oneRows = rows(oneCols[0]!);
    expect(oneRows).toBeGreaterThanOrEqual(15); // Nov 15: 9 games in many time groups
    cleanup();
    const el = openMonth(realData, '2026-11-15', XL, SP);
    const [a, b, ...rest] = cols(cellOf(el.container, '2026-11-15'));
    expect(rest).toHaveLength(0);
    expect(ids(a!).length).toBeGreaterThan(0);
    expect(ids(b!).length).toBeGreaterThan(0);
    expect(Math.max(rows(a!), rows(b!))).toBeLessThanOrEqual(Math.ceil(oneRows / 2) + 1);
    expect(Math.abs(rows(a!) - rows(b!))).toBeLessThanOrEqual(2); // one row = a label + its game at most
  });

  it('newspaper order: column 1 top to bottom, then column 2, gives the games in tip-off order (every November day)', () => {
    const el = openMonth(realData, '2026-11-15', XL, SP);
    for (const [date, games] of realData.byDate) {
      if (!date.startsWith('2026-11')) continue;
      const c = cols(cellOf(el.container, date));
      expect(c, date).toHaveLength(2);
      expect(c.flatMap(ids), date).toEqual(games.map((g) => g.gameId));
      if (games.length >= 2) expect(ids(c[1]!).length, date).toBeGreaterThan(0);
    }
  });

  it('no time label ends a column; a split group repeats its label (muted, same style) at the top of column 2', () => {
    const el = openMonth(realData, '2026-11-15', XL, SP);
    for (const date of [...realData.byDate.keys()].filter((d) => d.startsWith('2026-11'))) {
      for (const col of cols(cellOf(el.container, date))) {
        for (const grp of col.querySelectorAll('.ck-tgroup')) expect(grp.querySelectorAll('[data-game-id]').length, date).toBeGreaterThan(0);
        const last = [...col.querySelectorAll('.ck-tlabel, [data-game-id]')].at(-1);
        if (last) expect(last.matches('[data-game-id]'), date).toBe(true);
      }
    }
    cleanup();
    // One 8-game group at 19:00 plus a single late game: the big group has to split.
    const games = Array.from({ length: 8 }, (_, i) => game({ date: '2026-11-20', utc: '2026-11-20T22:00:00Z', away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }));
    games.push(game({ date: '2026-11-20', utc: '2026-11-21T03:00:00Z', away: TEAMS[16]!.id, home: TEAMS[17]!.id }));
    const el2 = openMonth(dataOf(games), '2026-11-20', XL, 'UTC');
    const [a, b] = cols(cellOf(el2.container, '2026-11-20'));
    const labelsA = [...a!.querySelectorAll('.ck-tlabel')];
    const labelsB = [...b!.querySelectorAll('.ck-tlabel')];
    expect(labelsA.map((l) => l.textContent)).toEqual(['22:00']);
    expect(labelsB.map((l) => l.textContent)).toEqual(['22:00', '03:00 (+1)']);
    expect(labelsB[0]!.className).toBe(labelsA[0]!.className); // same muted label style
    expect(labelsB[0]!.getAttribute('data-repeat')).toBe('true');
    expect(labelsA[0]!.getAttribute('data-repeat')).toBeNull();
    expect([...ids(a!), ...ids(b!)]).toEqual(games.map((g) => g.gameId));
    expect(Math.abs(ids(a!).length - (ids(b!).length + 1))).toBeLessThanOrEqual(1); // balanced
  });

  it('a group is not split when an unsplit layout is as balanced', () => {
    // 3 + 3 games in two time groups → one group per column, no repeated label.
    const games = [0, 0, 0, 1, 1, 1].map((h, i) => game({ date: '2026-11-21', utc: `2026-11-21T2${h}:00:00Z`, away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }));
    const el = openMonth(dataOf(games), '2026-11-21', XL, 'UTC');
    const [a, b] = cols(cellOf(el.container, '2026-11-21'));
    expect([...a!.querySelectorAll('.ck-tlabel')].map((l) => l.textContent)).toEqual(['20:00']);
    expect([...b!.querySelectorAll('.ck-tlabel')].map((l) => l.textContent)).toEqual(['21:00']);
    expect(el.container.querySelector('[data-repeat]')).toBeNull();
  });

  it('1-column cells keep one list: every group once, in order', () => {
    const el = openMonth(realData, '2026-11-15', WIDE, SP);
    for (const date of ['2026-11-02', '2026-11-15']) {
      const c = cols(cellOf(el.container, date));
      expect(c).toHaveLength(1);
      expect(ids(c[0]!)).toEqual(realData.byDate.get(date)!.map((g) => g.gameId));
      expect(c[0]!.querySelector('[data-repeat]')).toBeNull();
    }
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
