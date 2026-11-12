// @vitest-environment jsdom
// The Cup history — the stored editions are complete (6 groups of 5, 7 knockout games, every group
// game scored), the summary's counts come from the per-season data, venues come from the stored arenas, and the view
// shows the summary first, then the picked season (its URL value), with the shared square and the prize line.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CupHistory, { formatNotes, historyVenue, SEASONS, stageOf, summary } from '../src/components/CupHistory';
import { data } from './feed';

afterEach(cleanup);

describe('the stored editions', () => {
  it('2023, 2024, 2025: 6 groups of 5, 6 group winners + 2 wild cards, 4 QF + 2 SF + 1 final, every game scored', () => {
    expect(SEASONS.map((s) => s.year)).toEqual([2023, 2024, 2025]);
    for (const s of SEASONS) {
      const groups = new Map<string, number>();
      for (const t of s.teams) groups.set(t.group, (groups.get(t.group) ?? 0) + 1);
      expect([...groups.values()], s.season).toEqual([5, 5, 5, 5, 5, 5]);
      expect(s.teams.filter((t) => t.groupWinner)).toHaveLength(6);
      expect(s.teams.filter((t) => t.wildCard)).toHaveLength(2);
      expect(s.knockout.map((k) => k.round).sort()).toEqual(['final', 'qf', 'qf', 'qf', 'qf', 'sf', 'sf']);
      for (const t of s.teams) {
        expect(t.games, `${s.season} ${t.tricode}`).toHaveLength(4);
        for (const g of t.games) expect(g.score != null && g.oppScore != null && g.win === g.score! > g.oppScore!).toBe(true);
        expect(t.w + t.l).toBe(4);
      }
      // every knockout team qualified (a group winner or a wild card)
      const qualified = new Set(s.teams.filter((t) => t.groupWinner || t.wildCard).map((t) => t.teamId));
      for (const k of s.knockout.filter((x) => x.round === 'qf')) for (const id of [k.home.teamId, k.away.teamId]) expect(qualified.has(id)).toBe(true);
      expect(s.sources.every((u) => u.startsWith('https://stats.nba.com/'))).toBe(true);
    }
  });
});

describe('summary', () => {
  const rows = summary();
  it('knockout appearances and totals = the per-season data', () => {
    for (const r of rows) {
      const per = SEASONS.map((s) => s.teams.find((t) => t.teamId === r.teamId)!);
      expect(r.apps).toBe(SEASONS.filter((s) => { const t = s.teams.find((x) => x.teamId === r.teamId)!; return t.groupWinner || t.wildCard; }).length);
      expect([r.w, r.l, r.diff]).toEqual([per.reduce((n, t) => n + t.w, 0), per.reduce((n, t) => n + t.l, 0), per.reduce((n, t) => n + t.diff, 0)]);
    }
    expect(rows.reduce((n, r) => n + r.apps, 0)).toBe(8 * SEASONS.length);
  });
  it('stages: one champion, one runner-up, two SF and four QF exits a season', () => {
    for (const s of SEASONS) {
      const st = s.teams.map((t) => stageOf(s, t.teamId));
      expect(['Champion', 'Final', 'SF', 'QF', 'Group'].map((x) => st.filter((y) => y === x).length)).toEqual([1, 1, 2, 4, 22]);
    }
    const lal = SEASONS.find((s) => s.year === 2023)!;
    expect(stageOf(lal, lal.knockout.find((k) => k.round === 'final')!.home.score > lal.knockout.find((k) => k.round === 'final')!.away.score ? lal.knockout.find((k) => k.round === 'final')!.home.teamId : lal.knockout.find((k) => k.round === 'final')!.away.teamId)).toBe('Champion');
  });
  it('venues from the stored arenas: a quarterfinal at the home team\'s arena hosted, the Las Vegas games neutral; the format note says so', () => {
    for (const s of SEASONS) {
      for (const k of s.knockout.filter((x) => x.round === 'qf')) expect(historyVenue(data, k)).toEqual({ kind: 'host', teamId: k.home.teamId });
      for (const k of s.knockout.filter((x) => x.round !== 'qf')) expect(historyVenue(data, k)).toMatchObject({ kind: 'neutral', arena: k.arena });
      expect(formatNotes(data, s, { groupDates: [] })).toContain(`Semifinals and final at ${s.knockout.find((k) => k.round === 'final')!.arena}, ${s.knockout.find((k) => k.round === 'final')!.city}`);
    }
  });
});

describe('the view', () => {
  it('summary first (sorted by appearances, sortable), then the season picked: tables with squares, bracket, prize', () => {
    let year = 2024;
    const { rerender } = render(<CupHistory data={data} season={year} onSeason={(y) => (year = y)} />);
    const apps = () => [...document.querySelectorAll('.ck-hist-table[data-conference="East"] [data-testid="hist-apps"]')].map((e) => Number(e.textContent!.split(' ')[0]));
    expect(apps()).toEqual([...apps()].sort((a, b) => b - a));
    fireEvent.click(within(document.querySelector('.ck-hist-table[data-conference="East"]')!).getByRole('button', { name: 'DIFF' }));
    expect(screen.getByTestId('hist-season').dataset.year).toBe('2024');
    expect(screen.getAllByTestId('hist-group')).toHaveLength(6);
    expect(document.querySelectorAll('[data-testid="hist-season"] .ck-cup-slot')).toHaveLength(120);
    expect(screen.getAllByTestId('cup-prize')[0]!.textContent).toBe('QF loss $51,497 / player');
    fireEvent.click(within(screen.getByRole('tablist', { name: 'History season' })).getByRole('tab', { name: '2023' }));
    expect(year).toBe(2023);
    rerender(<CupHistory data={data} season={year} onSeason={(y) => (year = y)} />);
    expect(screen.getByTestId('hist-season').textContent).toMatch(/2023-24 In-Season Tournament/);
  });
});
