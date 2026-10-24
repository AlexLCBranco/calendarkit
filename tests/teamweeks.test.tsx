// @vitest-environment jsdom
// Team → Calendar "1 week | 2 weeks | Month": control, start week, navigation, Today, Month ↔ weeks, every game in its
// cell, B2B bars (incl. week-break and edge halves), TV filter. Expected cells/bars are worked out here independently.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readUrlState } from '../src/App';
import { CalendarView } from '../src/components/CalendarView';
import { hasNationalTv, teamGames } from '../src/data/model';
import { data } from './feed';
import { TEAM } from './synthetic';

afterEach(cleanup);

const WIDE = { width: 1200, height: 900 };
const NOW = Date.parse('2026-11-15T15:00:00Z'); // a Sunday; BOS plays that week
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
const sunday = (d: string) => add(d, -new Date(`${d}T00:00:00Z`).getUTCDay());

const spanTab = (name: string) => within(screen.getByRole('tablist', { name: 'Span' })).getByRole('tab', { name });
const title = () => screen.getByTestId('period-title').textContent;
const shownDates = () => [...document.querySelectorAll<HTMLElement>('.ck-team-grid [data-date]')].map((c) => c.dataset.date!);
const open = (initial: object = {}, size = WIDE) => render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS, ...initial }} />);

describe('control + URL', () => {
  it('"1 week | 2 weeks | Month" only in Team → Calendar; Month by default; kept across teams and List ↔ Calendar', () => {
    open();
    expect(within(screen.getByRole('tablist', { name: 'Span' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['1 week', '2 weeks', 'Month']);
    expect(spanTab('Month').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.ck-team-month')!.getAttribute('data-span')).toBe('month');
    fireEvent.click(spanTab('2 weeks'));
    expect(document.querySelector('.ck-team-month')!.getAttribute('data-span')).toBe('2w');
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(document.querySelector('.ck-team-month')!.getAttribute('data-span')).toBe('2w');
    fireEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(screen.queryByRole('tablist', { name: 'Span' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(document.querySelector('.ck-team-month')!.getAttribute('data-span')).toBe('2w');
    fireEvent.click(screen.getByRole('tab', { name: 'League' }));
    expect(screen.queryByRole('tablist', { name: 'Span' })).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Weeks' })).toBeTruthy(); // the league's own control is unchanged
  });

  it('URL: span=1w / 2w; old links (no span) open Month', () => {
    expect(readUrlState('?view=team&layout=calendar&team=BOS&span=1w').teamSpan).toBe(1);
    expect(readUrlState('?view=team&layout=calendar&team=BOS&span=2w').teamSpan).toBe(2);
    expect(readUrlState('?view=team&layout=calendar&team=BOS').teamSpan).toBeUndefined();
    expect(readUrlState('?view=team&team=BOS').teamSpan).toBeUndefined();
    const states: { teamSpan: unknown }[] = [];
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS }} onStateChange={(s) => states.push(s)} />);
    fireEvent.click(spanTab('1 week'));
    fireEvent.click(spanTab('2 weeks'));
    fireEvent.click(spanTab('Month'));
    expect(states.map((s) => s.teamSpan)).toEqual([1, 2, 'month']);
  });

  it('phones keep the month grid (no control)', () => {
    open({ teamSpan: 2 }, { width: 390, height: 800 });
    expect(screen.queryByRole('tablist', { name: 'Span' })).toBeNull();
    expect(document.querySelector('.ck-team-month')!.getAttribute('data-span')).toBe('month');
  });
});

describe('start week, navigation, Today, Month ↔ weeks', () => {
  it('from Month: the week of today if today is in the shown month, else the month’s first week', () => {
    open();
    expect(title()).toBe('November 2026');
    fireEvent.click(spanTab('1 week'));
    expect(shownDates()).toEqual(Array.from({ length: 7 }, (_, i) => add('2026-11-15', i)));
    expect(title()).toBe('Nov 15 – 21, 2026');
    fireEvent.click(spanTab('Month'));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(title()).toBe('December 2026');
    fireEvent.click(spanTab('2 weeks'));
    expect(shownDates()[0]).toBe('2026-11-29'); // the week containing Dec 1
    expect(shownDates()).toHaveLength(14);
    expect(title()).toBe('Nov 29 – Dec 12, 2026');
    // back to Month: the month of the first shown day
    fireEvent.click(spanTab('Month'));
    expect(title()).toBe('November 2026');
  });

  it('prev/next move by 1 or 2 weeks, disabled at the season’s ends; 1 ↔ 2 weeks keeps the first day', () => {
    open({ teamSpan: 1 });
    const first = sunday(data.dates[0]!);
    const last = data.dates.at(-1)!;
    const prev = () => screen.getByRole('button', { name: /^Previous (week|2 weeks)$/ });
    const next = () => screen.getByRole('button', { name: /^Next (week|2 weeks)$/ });
    const start = shownDates()[0]!;
    fireEvent.click(next());
    expect(shownDates()[0]).toBe(add(start, 7));
    fireEvent.click(spanTab('2 weeks'));
    expect(shownDates()[0]).toBe(add(start, 7));
    fireEvent.click(next());
    expect(shownDates()[0]).toBe(add(start, 21));
    fireEvent.click(prev());
    expect(shownDates()[0]).toBe(add(start, 7));
    for (let i = 0; i < 40 && !(prev() as HTMLButtonElement).disabled; i++) fireEvent.click(prev());
    expect((prev() as HTMLButtonElement).disabled).toBe(true);
    expect(shownDates()[0]! <= first).toBe(true);
    expect(add(shownDates()[0]!, -14) < first).toBe(true);
    for (let i = 0; i < 40 && !(next() as HTMLButtonElement).disabled; i++) fireEvent.click(next());
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    expect(shownDates().at(-1)! >= last || shownDates().includes(last)).toBe(true);
  });

  it('Today jumps to the current week (1 and 2 weeks) and is disabled there', () => {
    open({ teamSpan: 2 });
    const today = () => screen.getByTestId('today') as HTMLButtonElement;
    fireEvent.click(screen.getByRole('button', { name: 'Next 2 weeks' }));
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(shownDates()[0]).toBe('2026-11-15');
    expect(today().disabled).toBe(true);
    fireEvent.click(spanTab('1 week'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(today());
    expect(shownDates()[0]).toBe('2026-11-15');
  });
});

describe('cells and bars', () => {
  it('every week of the season, 1 and 2 weeks, BOS and LAL: every game in its cell, nothing else', () => {
    for (const teamId of [TEAM.BOS, TEAM.LAL]) {
      for (const span of [1, 2] as const) {
        open({ teamId, teamSpan: span });
        const games = teamGames(data, teamId);
        const byDate = new Map(games.map((g) => [g.dateEt, g.gameId]));
        while (!(screen.getByRole('button', { name: /^Previous/ }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: /^Previous/ }));
        const seen: string[] = [];
        for (let guard = 0; guard < 40; guard++) {
          const dates = shownDates();
          expect(dates).toHaveLength(7 * span);
          for (const d of dates) {
            const cell = document.querySelector(`.ck-team-grid [data-date="${d}"]`)!;
            const ids = [...cell.querySelectorAll('[data-game-id]')].map((e) => e.getAttribute('data-game-id'));
            expect(ids, d).toEqual(byDate.has(d) ? [byDate.get(d)] : []);
            seen.push(...(ids as string[]));
          }
          const next = screen.getByRole('button', { name: /^Next/ }) as HTMLButtonElement;
          if (next.disabled) break;
          fireEvent.click(next);
        }
        expect(new Set(seen)).toEqual(new Set(games.map((g) => g.gameId)));
        cleanup();
      }
    }
  });

  it('B2B bars: full bar inside a week row, Sat → Sun halves on consecutive rows (2 weeks), edge halves', () => {
    const games = teamGames(data, TEAM.BOS);
    const dates = new Set(games.map((g) => g.dateEt));
    const pairs = games.filter((g) => dates.has(add(g.dateEt, 1))).map((g) => g.dateEt); // night 1 dates
    const satSun = pairs.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6)!;
    expect(satSun).toBeTruthy();
    // 2 weeks starting the week before: Sat in row 1 col 7, Sun in row 2 col 1
    open({ teamSpan: 2 });
    const start = sunday(satSun);
    const nav = (target: string) => {
      for (let i = 0; i < 40 && shownDates()[0]! > target; i++) fireEvent.click(screen.getByRole('button', { name: 'Previous 2 weeks' }));
      for (let i = 0; i < 40 && shownDates()[0]! < target; i++) fireEvent.click(screen.getByRole('button', { name: 'Next 2 weeks' }));
    };
    nav(start);
    if (shownDates()[0] !== start) {
      // align the 2-week window so the Saturday is in its first row
      fireEvent.click(spanTab('1 week'));
      for (let i = 0; i < 60 && shownDates()[0]! !== start; i++) fireEvent.click(screen.getByRole('button', { name: shownDates()[0]! > start ? 'Previous week' : 'Next week' }));
      fireEvent.click(spanTab('2 weeks'));
    }
    expect(shownDates()[0]).toBe(start);
    const bars = () => [...document.querySelectorAll<HTMLElement>('[data-b2b-bar]')].map((b) => ({ kind: b.dataset.b2bBar, pair: b.dataset.pair, row: b.style.gridRow, col: b.style.gridColumn }));
    const mine = bars().filter((b) => b.pair === `${satSun}/${add(satSun, 1)}`);
    expect(mine).toEqual([
      { kind: 'start', pair: `${satSun}/${add(satSun, 1)}`, row: '2', col: '7 / span 1' },
      { kind: 'end', pair: `${satSun}/${add(satSun, 1)}`, row: '3', col: '1 / span 1' },
    ]);
    // every pair fully inside the window: one full bar per pair inside a row, halves across the week break
    const shown = new Set(shownDates());
    for (const d of pairs.filter((x) => shown.has(x) && shown.has(add(x, 1)))) {
      const b = bars().filter((x) => x.pair === `${d}/${add(d, 1)}`);
      const sat = new Date(`${d}T00:00:00Z`).getUTCDay() === 6;
      expect(b.map((x) => x.kind), d).toEqual(sat ? ['start', 'end'] : ['full']);
    }
    // 1 week starting on the Sunday: that pair's Sunday night is the first cell → an "end" half (arrow to the hidden Saturday)
    fireEvent.click(spanTab('1 week'));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(shownDates()[0]).toBe(add(satSun, 1));
    expect(bars().filter((b) => b.pair === `${satSun}/${add(satSun, 1)}`)).toEqual([{ kind: 'end', pair: `${satSun}/${add(satSun, 1)}`, row: '2', col: '1 / span 1' }]);
    // and the week before: its Saturday is the last cell → a "start" half
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(bars().filter((b) => b.pair === `${satSun}/${add(satSun, 1)}`)).toEqual([{ kind: 'start', pair: `${satSun}/${add(satSun, 1)}`, row: '2', col: '7 / span 1' }]);
  });

  it('TV filter: only national TV games in the cells; rest of the week empty', () => {
    open({ teamId: TEAM.LAL, teamSpan: 2, tvOnly: true });
    const tv = new Set(teamGames(data, TEAM.LAL).filter(hasNationalTv).map((g) => g.gameId));
    let n = 0;
    while (!(screen.getByRole('button', { name: 'Previous 2 weeks' }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: 'Previous 2 weeks' }));
    for (let guard = 0; guard < 20; guard++) {
      for (const e of document.querySelectorAll('.ck-team-grid [data-game-id]')) {
        expect(tv.has(e.getAttribute('data-game-id')!)).toBe(true);
        n++;
      }
      const next = screen.getByRole('button', { name: 'Next 2 weeks' }) as HTMLButtonElement;
      if (next.disabled) break;
      fireEvent.click(next);
    }
    expect(n).toBe(tv.size);
  });
});
