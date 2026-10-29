// @vitest-environment jsdom
// League → Calendar: week view (1 or 2 week rows, 7 equal day columns, every game of each day at full line size,
// grouped by local tip-off time; 2 weeks flow into as many columns as fit), week navigation and month popup, TV
// pill, B2B dots. Count grid below the measured width cutoff.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as CV from '../src/components/CalendarView';
import { addDays, hasNationalTv, nationalTv, tipoff, weekOf } from '../src/data/model';
import { data as realData } from './feed';
import { dataOf, game, TEAM } from './synthetic';
import { TEAMS } from '../src/data/teams';
import type { CalendarData } from '../src/data/model';

afterEach(cleanup);

const { CalendarView, monthColumns } = CV;
const WEEK_MIN_WIDTH = (CV as Record<string, unknown>).WEEK_MIN_WIDTH as number | undefined;

const WIDE = { width: 1000, height: 800 }; // 1 game column per day cell
const XL = { width: 1840, height: 1000 }; // 1920 px window: 2 columns in 2-week mode
const NOW = Date.parse('2026-10-23T15:00:00Z');

function openWeek(data: CalendarData, date: string, size = WIDE, timeZone = 'UTC', weeks: 1 | 2 = 1, onStateChange?: (s: CV.CalendarState) => void) {
  const el = render(<CalendarView data={data} size={size} now={NOW} timeZone={timeZone} initial={{ date, layout: 'calendar', weeks }} onStateChange={onStateChange} />);
  return el;
}
const region = () => screen.getByRole('region', { name: 'League week' });
const cellOf = (root: ParentNode, date: string) => root.querySelector(`[data-date="${date}"]`)!;
const lines = (root: ParentNode, date: string) => [...root.querySelectorAll(`[data-date="${date}"] [data-game-id]`)];
const tris = (line: Element) => [...line.querySelectorAll('.ck-mtri')].map((t) => t.getAttribute('data-tricode'));
const shownDates = () => [...region().querySelectorAll('[role="gridcell"]')].map((c) => c.getAttribute('data-date'));
const title = () => screen.getByTestId('period-title').textContent!.replace('▾', '').trim();

describe('week view: structure', () => {
  it('opens on the default day’s week: 7 day cells Sun–Sat, every game of each day, none hidden', () => {
    render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="UTC" initial={{ layout: 'calendar' }} />);
    const week = weekOf('2026-10-23');
    expect(shownDates()).toEqual(week);
    expect(title()).toBe('Oct 18 – 24, 2026');
    for (const d of week) expect(lines(region(), d).map((l) => l.getAttribute('data-game-id')), d).toEqual((realData.byDate.get(d) ?? []).map((g) => g.gameId));
    expect(region().textContent).not.toMatch(/\+\s*\d+\s*more/i);
  });

  it('game count per week matches the data, for every week of the season, in 1- and 2-week mode', () => {
    for (const weeks of [1, 2] as const) {
      openWeek(realData, realData.dates[0]!, WIDE, 'UTC', weeks);
      let start = weekOf(realData.dates[0]!)[0]!;
      let guard = 0;
      while (start <= realData.dates.at(-1)! && guard++ < 60) {
        const want = Array.from({ length: 7 * weeks }, (_, i) => realData.byDate.get(addDays(start, i))?.length ?? 0).reduce((a, b) => a + b, 0);
        expect(region().querySelectorAll('[data-game-id]').length, `${weeks}w ${start}`).toBe(want);
        expect(shownDates()).toHaveLength(7 * weeks);
        const next = screen.getByLabelText(weeks === 1 ? 'Next week' : 'Next 2 weeks') as HTMLButtonElement;
        if (next.disabled) break;
        fireEvent.click(next);
        start = addDays(start, 7 * weeks);
      }
      expect(guard).toBeGreaterThan(weeks === 1 ? 25 : 12);
      cleanup();
    }
    // ~110 renders of a full week in jsdom take 4–6 s: above Vitest's 5 s default on a busy machine
  }, 30_000);

  it('a 15-game day (Nov 2) lists all 15 games in tip-off order', () => {
    const el = openWeek(realData, '2026-11-02');
    const day = realData.byDate.get('2026-11-02')!;
    expect(day).toHaveLength(15);
    expect(lines(el.container, '2026-11-02').map((l) => l.getAttribute('data-game-id'))).toEqual(day.map((g) => g.gameId));
  });

  it('each line: away logo + AWAY, "@", home logo + HOME — every line; no legend', () => {
    const tips = [5, 2, 9, 0, 14, 7, 1, 12, 3, 10, 6, 13, 4, 11, 8];
    const games = tips.map((h, i) =>
      game({ date: '2026-11-10', utc: new Date(Date.UTC(2026, 10, 10, 23, 0) + h * 600_000).toISOString(), away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }),
    );
    const d = dataOf(games);
    const el = openWeek(d, '2026-11-10');
    const shown = lines(el.container, '2026-11-10');
    expect(shown).toHaveLength(15);
    expect(shown.map((l) => l.getAttribute('data-game-id'))).toEqual(d.byDate.get('2026-11-10')!.map((g) => g.gameId));
    for (const l of shown) {
      const g = games.find((x) => x.gameId === l.getAttribute('data-game-id'))!;
      expect(tris(l)).toEqual([g.awayTeam.teamTricode, g.homeTeam.teamTricode]);
      expect(l.textContent).toBe(`${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode}`);
      expect([...l.children].map((c) => c.className.split(' ')[0])).toEqual(['ck-logo-backing', 'ck-mtri', 'ck-at', 'ck-logo-backing', 'ck-mtri', 'ck-tv-slot']);
      expect([...l.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([`/logos/${g.awayTeam.teamTricode}.svg`, `/logos/${g.homeTeam.teamTricode}.svg`]);
    }
    expect(screen.queryByTestId('month-legend')).toBeNull();
    expect(cellOf(el.container, '2026-11-10').querySelector('[data-testid="tipoff"], [data-testid="tv-badge"], [data-testid="open-game"], .ck-tag')).toBeNull();
  });

  it('TBD teams show "TBD" with no <img>', () => {
    const el = openWeek(realData, '2026-12-04');
    const qf = lines(el.container, '2026-12-04').filter((l) => l.getAttribute('data-game-id')!.startsWith('002260120'));
    expect(qf).toHaveLength(2);
    for (const l of qf) {
      expect(tris(l)).toEqual(['TBD', 'TBD']);
      expect(l.querySelector('img')).toBeNull();
    }
  });

  it('every logo sits on the light backing', () => {
    const el = openWeek(realData, '2026-11-02');
    const imgs = [...el.container.querySelectorAll('.ck-week-view img')];
    expect(imgs.length).toBeGreaterThan(80);
    for (const i of imgs) expect(i.parentElement!.classList).toContain('ck-logo-backing');
  });

  it("today's cell is highlighted; days without games show the header only", () => {
    const el = openWeek(realData, '2026-10-23');
    expect(cellOf(el.container, '2026-10-23').classList).toContain('ck-cell-today');
    expect(el.container.querySelectorAll('.ck-cell-today')).toHaveLength(1);
    const empty = cellOf(el.container, '2026-10-19');
    expect(empty.querySelector('[data-game-id]')).toBeNull();
    expect((within(empty as HTMLElement).getByTestId('day-header') as HTMLButtonElement).disabled).toBe(true);
  });

  it('rows are equal (1fr each) and the 7 columns equal', () => {
    for (const weeks of [1, 2] as const) {
      openWeek(realData, '2026-11-15', XL, 'UTC', weeks);
      const grid = region().querySelector<HTMLElement>('[role="grid"]')!;
      expect(grid.style.gridTemplateRows).toBe(`repeat(${weeks}, 1fr)`);
      expect(grid.classList).toContain('ck-grid'); // repeat(7, minmax(0, 1fr)) columns (calendar.css)
      cleanup();
    }
  });
});

describe('week view: navigation', () => {
  it('prev/next by 1 week, or by 2 weeks in 2-week mode; disabled at the season’s ends', () => {
    const onStateChange = vi.fn();
    openWeek(realData, '2026-11-15', WIDE, 'UTC', 1, onStateChange);
    expect(title()).toBe('Nov 15 – 21, 2026');
    fireEvent.click(screen.getByLabelText('Next week'));
    expect(title()).toBe('Nov 22 – 28, 2026');
    fireEvent.click(screen.getByLabelText('Next week'));
    expect(title()).toBe('Nov 29 – Dec 5, 2026');
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-11-29', weeks: 1 }));
    fireEvent.click(screen.getByRole('tab', { name: '2 weeks' }));
    expect(shownDates()).toEqual(Array.from({ length: 14 }, (_, i) => addDays('2026-11-29', i)));
    expect(title()).toBe('Nov 29 – Dec 12, 2026');
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ weeks: 2 }));
    fireEvent.click(screen.getByLabelText('Previous 2 weeks'));
    expect(title()).toBe('Nov 15 – 28, 2026');
    fireEvent.click(screen.getByRole('tab', { name: '1 week' }));
    expect(title()).toBe('Nov 15 – 21, 2026');
    cleanup();
    openWeek(realData, realData.dates[0]!);
    expect((screen.getByLabelText('Previous week') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    openWeek(realData, realData.dates.at(-1)!);
    expect((screen.getByLabelText('Next week') as HTMLButtonElement).disabled).toBe(true);
    expect(title()).toMatch(/2027$/);
  });

  it('title across a year: "Dec 27, 2026 – Jan 2, 2027"', () => {
    openWeek(realData, '2026-12-30');
    expect(title()).toBe('Dec 27, 2026 – Jan 2, 2027');
  });

  it('period title opens a month popup with counts per day; a day jumps to its week; Escape closes', () => {
    openWeek(realData, '2026-11-15');
    fireEvent.click(screen.getByTestId('period-title'));
    const popup = screen.getByRole('dialog', { name: 'Jump to a week' });
    expect(within(popup).getByLabelText(`November 2: 15 games`)).toBeTruthy();
    expect(within(popup).getByText('November 2026')).toBeTruthy();
    for (const d of weekOf('2026-11-15')) expect(popup.querySelector(`[data-date="${d}"]`)!.classList).toContain('ck-cell-selected');
    fireEvent.click(within(popup).getByLabelText('Next month'));
    expect(within(popup).getByText('December 2026')).toBeTruthy();
    fireEvent.click(within(popup).getByLabelText(`December 16: ${realData.byDate.get('2026-12-16')!.length} games`));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(title()).toBe('Dec 13 – 19, 2026');
    fireEvent.click(screen.getByTestId('period-title'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(title()).toBe('Dec 13 – 19, 2026');
  });

  it('a day header opens League → List at that day', () => {
    const el = openWeek(realData, '2026-11-15');
    fireEvent.click(within(cellOf(el.container, '2026-11-18') as HTMLElement).getByTestId('day-header'));
    expect(screen.queryByRole('region', { name: 'League week' })).toBeNull();
    expect(screen.getByTestId('day-title').textContent).toBe('Wednesday, November 18, 2026');
    expect(screen.getByRole('tab', { name: 'List' }).getAttribute('aria-selected')).toBe('true');
  });

  it('TV games only: every day lists only national-TV games, and never more than all games', () => {
    const el = openWeek(realData, '2026-11-15', WIDE, 'UTC', 2);
    const all = new Map(shownDates().map((d) => [d!, lines(el.container, d!).length]));
    fireEvent.click(screen.getByLabelText('TV games only'));
    for (const d of shownDates()) {
      const ids = lines(el.container, d!).map((l) => l.getAttribute('data-game-id'));
      expect(ids, d!).toEqual((realData.byDate.get(d!) ?? []).filter(hasNationalTv).map((g) => g.gameId));
      expect(ids.length).toBeLessThanOrEqual(all.get(d!)!);
    }
  });
});

describe('time groups', () => {
  for (const tz of ['America/Sao_Paulo', 'America/New_York']) {
    it(`${tz}: every game under the label of its local tip-off, groups in time order`, () => {
      const el = openWeek(realData, '2026-11-02', WIDE, tz);
      for (const date of ['2026-11-02', '2026-11-04', '2026-11-07']) {
        const groups = [...cellOf(el.container, date).querySelectorAll('.ck-tgroup')];
        const labels = groups.map((g) => g.querySelector('.ck-tlabel')!.textContent);
        expect(new Set(labels).size, date).toBe(labels.length);
        expect(labels, date).toEqual([...new Set(realData.byDate.get(date)!.map((g) => tipoff(g, tz).label))]);
        for (const grp of groups) {
          const label = grp.querySelector('.ck-tlabel')!.textContent;
          for (const li of grp.querySelectorAll('[data-game-id]')) expect(tipoff(realData.games.find((x) => x.gameId === li.getAttribute('data-game-id'))!, tz).label).toBe(label);
        }
      }
    });
  }

  it('after-midnight games are labelled with (+1) and stay on their NBA date', () => {
    const el = openWeek(realData, '2026-11-02', WIDE, 'America/Sao_Paulo');
    const labels = [...cellOf(el.container, '2026-11-02').querySelectorAll('.ck-tlabel')].map((l) => l.textContent);
    expect(labels.at(-1)).toMatch(/^00:\d\d \(\+1\)$/);
  });

  it('TBD-time games are grouped under "TBD", after the timed groups', () => {
    const el = openWeek(realData, '2026-12-04');
    const labels = [...cellOf(el.container, '2026-12-04').querySelectorAll('.ck-tlabel')].map((l) => l.textContent);
    expect(labels.at(-1)).toBe('TBD');
  });
});

describe('columns', () => {
  const SP = 'America/Sao_Paulo';
  const cols = (cell: Element) => [...cell.querySelectorAll('.ck-month-day > .ck-mcol')];
  const rows = (col: Element) => col.querySelectorAll('.ck-tlabel, [data-game-id]').length;
  const ids = (root: Element) => [...root.querySelectorAll('[data-game-id]')].map((l) => l.getAttribute('data-game-id'));

  it('column count: 1 week → one column per day; 2 weeks → as many as fit (2 at 1920 px, 1 at 1280 px)', () => {
    expect(monthColumns(1840)).toBe(2);
    expect(monthColumns(1248)).toBe(1);
    openWeek(realData, '2026-11-15', XL, SP, 1);
    expect(cols(cellOf(region(), '2026-11-15'))).toHaveLength(1);
    cleanup();
    openWeek(realData, '2026-11-15', XL, SP, 2);
    expect(cols(cellOf(region(), '2026-11-15'))).toHaveLength(2);
    cleanup();
    openWeek(realData, '2026-11-15', { width: 1248, height: 800 }, SP, 2);
    expect(cols(cellOf(region(), '2026-11-15'))).toHaveLength(1);
  });

  it('2 weeks at 1920 px, Nov 15: both columns used, balanced within one row', () => {
    const one = openWeek(realData, '2026-11-15', XL, SP, 1);
    const oneRows = rows(cols(cellOf(one.container, '2026-11-15'))[0]!);
    expect(oneRows).toBeGreaterThanOrEqual(15);
    cleanup();
    const el = openWeek(realData, '2026-11-15', XL, SP, 2);
    const [a, b, ...rest] = cols(cellOf(el.container, '2026-11-15'));
    expect(rest).toHaveLength(0);
    expect(ids(a!).length).toBeGreaterThan(0);
    expect(ids(b!).length).toBeGreaterThan(0);
    expect(Math.max(rows(a!), rows(b!))).toBeLessThanOrEqual(Math.ceil(oneRows / 2) + 1);
    expect(Math.abs(rows(a!) - rows(b!))).toBeLessThanOrEqual(2);
  });

  it('newspaper order: column 1 then column 2 gives the games in tip-off order (every day of two weeks)', () => {
    const el = openWeek(realData, '2026-11-15', XL, SP, 2);
    for (const date of shownDates()) {
      const games = realData.byDate.get(date!) ?? [];
      const c = cols(cellOf(el.container, date!));
      if (!games.length) continue;
      expect(c.flatMap(ids), date!).toEqual(games.map((g) => g.gameId));
      if (games.length >= 2) expect(ids(c[1]!).length, date!).toBeGreaterThan(0);
      for (const col of c) {
        const last = [...col.querySelectorAll('.ck-tlabel, [data-game-id]')].at(-1);
        if (last) expect(last.matches('[data-game-id]'), date!).toBe(true); // no label ends a column
      }
    }
  });

  it('a split group repeats its label (same muted style) at the top of column 2', () => {
    const games = Array.from({ length: 8 }, (_, i) => game({ date: '2026-11-20', utc: '2026-11-20T22:00:00Z', away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }));
    games.push(game({ date: '2026-11-20', utc: '2026-11-21T03:00:00Z', away: TEAMS[16]!.id, home: TEAMS[17]!.id }));
    const el = openWeek(dataOf(games), '2026-11-20', XL, 'UTC', 2);
    const [a, b] = cols(cellOf(el.container, '2026-11-20'));
    const labelsA = [...a!.querySelectorAll('.ck-tlabel')];
    const labelsB = [...b!.querySelectorAll('.ck-tlabel')];
    expect(labelsA.map((l) => l.textContent)).toEqual(['22:00']);
    expect(labelsB.map((l) => l.textContent)).toEqual(['22:00', '03:00 (+1)']);
    expect(labelsB[0]!.className).toBe(labelsA[0]!.className);
    expect(labelsB[0]!.getAttribute('data-repeat')).toBe('true');
    expect([...ids(a!), ...ids(b!)]).toEqual(games.map((g) => g.gameId));
  });

  it('a group is not split when an unsplit layout is as balanced', () => {
    const games = [0, 0, 0, 1, 1, 1].map((h, i) => game({ date: '2026-11-21', utc: `2026-11-21T2${h}:00:00Z`, away: TEAMS[2 * i]!.id, home: TEAMS[2 * i + 1]!.id }));
    const el = openWeek(dataOf(games), '2026-11-21', XL, 'UTC', 2);
    const [a, b] = cols(cellOf(el.container, '2026-11-21'));
    expect([...a!.querySelectorAll('.ck-tlabel')].map((l) => l.textContent)).toEqual(['20:00']);
    expect([...b!.querySelectorAll('.ck-tlabel')].map((l) => l.textContent)).toEqual(['21:00']);
    expect(el.container.querySelector('[data-repeat]')).toBeNull();
  });
});

describe('TV pill and fatigue marks (league)', () => {
  it('national-TV games: pill text exactly "TV", tooltip = network names; others: empty reserved slot', () => {
    const el = openWeek(realData, '2026-11-02');
    let tv = 0;
    for (const li of region().querySelectorAll('[data-game-id]')) {
      const g = realData.games.find((x) => x.gameId === li.getAttribute('data-game-id'))!;
      const pill = li.querySelector('.ck-tv-pill');
      expect(li.querySelector('.ck-tv-slot'), g.gameId).toBeTruthy();
      if (hasNationalTv(g)) {
        tv++;
        expect(pill!.textContent).toBe('TV');
        expect(pill!.getAttribute('data-tip')).toBe(nationalTv(g).join(', '));
      } else expect(pill).toBeNull();
    }
    expect(tv).toBeGreaterThan(3);
    expect(region().textContent).not.toMatch(/ESPN|NBC|Peacock|Prime Video|NBA TV|ABC|Telemundo/);
    // the floating tooltip shows the names on hover and on focus
    const pill = el.container.querySelector<HTMLElement>('.ck-tv-pill')!;
    fireEvent.mouseOver(pill);
    expect(screen.getByRole('tooltip').textContent).toBe(pill.getAttribute('data-tip'));
    fireEvent.mouseLeave(el.container.querySelector('.ck-root')!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(pill);
    expect(screen.getByRole('tooltip').textContent).toBe(pill.getAttribute('data-tip'));
  });

  it('fatigue marks (round 4): fill on the 2/2 team, ring on the 1/2 team, both teams marked; no dot, labels or bars', () => {
    const d = dataOf([
      game({ id: '0022609801', date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
      game({ id: '0022609802', date: '2026-11-01', utc: '2026-11-01T23:30:00Z', home: TEAM.DEN, away: TEAM.MIA }),
      game({ id: '0022609901', date: '2026-11-02', utc: '2026-11-03T00:00:00Z', home: TEAM.LAL, away: TEAM.BOS }),
      game({ id: '0022609902', date: '2026-11-02', utc: '2026-11-03T00:30:00Z', home: TEAM.DEN, away: TEAM.NYK }),
    ]);
    const el = openWeek(d, '2026-11-02');
    const marks = (id: string, cls: string) => [...el.container.querySelectorAll(`[data-game-id="${id}"] .${cls}`)].map((m) => m.closest('.ck-mtri')!.getAttribute('data-tricode'));
    expect(marks('0022609901', 'ck-fm-n2')).toEqual(['BOS']);
    expect(marks('0022609902', 'ck-fm-n2')).toEqual(['NYK', 'DEN']);
    expect(marks('0022609801', 'ck-fm-n1')).toEqual(['NYK', 'BOS']);
    expect(marks('0022609802', 'ck-fm-n1')).toEqual(['DEN']);
    expect(el.container.querySelector('.ck-b2b-mark, .ck-b2b-label, .ck-b2b-bar')).toBeNull();
  });
});

describe('narrow widths: count grid', () => {
  it(`cutoff ${WEEK_MIN_WIDTH} px: a full-size line (119 px with "@") just fits a 7-column cell`, () => {
    expect(CV.MONTH_LINE_WIDTH).toBe(119);
    expect(WEEK_MIN_WIDTH).toBe(887);
    expect(CV.monthCellInner(887)).toBeGreaterThanOrEqual(CV.MONTH_LINE_WIDTH);
    expect(CV.monthCellInner(886)).toBeLessThan(CV.MONTH_LINE_WIDTH);
  });

  for (const width of [360, 700, 886]) {
    it(`${width} px: count-per-day grid (month), no game lines; a day opens the list`, () => {
      const el = openWeek(realData, '2026-11-02', { width, height: 800 });
      expect(screen.getByRole('region', { name: 'Month navigator' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'League week' })).toBeNull();
      expect(screen.getByTestId('period-title').textContent).toBe('November 2026');
      expect(el.container.querySelectorAll('[data-date] [data-game-id]')).toHaveLength(0);
      fireEvent.click(screen.getByLabelText('November 2: 15 games'));
      expect(screen.getByRole('region', { name: 'League schedule' })).toBeTruthy();
    });
  }

  it('887 px: week view', () => {
    openWeek(realData, '2026-11-02', { width: 887, height: 800 });
    expect(region()).toBeTruthy();
  });
});
