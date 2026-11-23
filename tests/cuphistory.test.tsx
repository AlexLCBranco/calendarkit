// @vitest-environment jsdom
// The Cup history — the stored editions are complete (6 groups of 5, 7 knockout games, every group
// game scored), the summary's counts come from the per-season data, venues come from the stored arenas, and the view
// shows the summary first, then the picked season (its URL value), with the shared square and the prize line.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CupHistory, { historyVenue, SEASONS, stageOf, summary } from '../src/components/CupHistory';
import { RULE_NOTES } from '../src/data/cupPast';
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
  it("venues from the stored arenas: a quarterfinal at the home team's arena hosted, the Las Vegas games neutral; the rules note (NBA.com) agrees", () => {
    for (const s of SEASONS) {
      for (const k of s.knockout.filter((x) => x.round === 'qf')) expect(historyVenue(data, k)).toEqual({ kind: 'host', teamId: k.home.teamId });
      for (const k of s.knockout.filter((x) => x.round !== 'qf')) expect(historyVenue(data, k)).toMatchObject({ kind: 'neutral', arena: k.arena });
      const f = s.knockout.find((k) => k.round === 'final')!;
      expect(RULE_NOTES[s.year]!.text).toContain(`${f.arena}, ${f.city}`);
      expect(RULE_NOTES[s.year]!.source).toMatch(/https:\/\/www\.nba\.com\//);
    }
  });
});

describe('the view', () => {
  it('no season: the summary (sorted by appearances, sortable), with the season tabs', () => {
    let year: number | undefined = 0;
    render(<CupHistory data={data} onSeason={(y) => (year = y)} />);
    const apps = () => [...document.querySelectorAll('.ck-hist-table[data-conference="East"] [data-testid="hist-apps"]')].map((e) => Number(e.textContent!.split(' ')[0]));
    expect(apps()).toEqual([...apps()].sort((a, b) => b - a));
    fireEvent.click(within(document.querySelector('.ck-hist-table[data-conference="East"]')!).getByRole('button', { name: 'DIFF' }));
    expect(screen.queryByTestId('hist-season')).toBeNull();
    fireEvent.click(within(screen.getByRole('tablist', { name: 'History season' })).getByRole('tab', { name: '2023' }));
    expect(year).toBe(2023);
  });

  it('a season, Groups: laid out like Cup › Groups (6 cards of 5 pills, 4 squares each), the small bracket, the wild-card race', () => {
    let view = '';
    render(<CupHistory data={data} season={2024} onSeason={() => {}} onView={(v) => (view = v)} />);
    expect(screen.getByTestId('hist-season').dataset.view).toBe('groups');
    expect(screen.getByTestId('hist-season').textContent).toMatch(/2024-25 NBA Cup · Final group tables/);
    expect(screen.getAllByTestId('cup-group')).toHaveLength(6);
    expect(document.querySelectorAll('[data-testid="hist-season"] .ck-cup-pill')).toHaveLength(30);
    expect(document.querySelectorAll('[data-testid="hist-season"] .ck-cup-slot')).toHaveLength(120);
    // the NBA's final places: each group's winner first with the star; the two wild cards marked
    for (const card of screen.getAllByTestId('cup-group')) expect(card.querySelector('.ck-cup-pill')!.getAttribute('data-status')).toBe('leader');
    expect(document.querySelectorAll('[data-testid="hist-season"] .ck-cup-pill[data-status="wild-card"]')).toHaveLength(2);
    // the small bracket: all 8 teams, 7 games, the champion (2024: MIL)
    const mini = screen.getByTestId('hist-bracket');
    expect(mini.querySelectorAll('.ck-hb-mgame')).toHaveLength(7);
    expect(new Set([...mini.querySelectorAll('.ck-hb-mteam')].map((e) => e.getAttribute('data-team'))).size).toBe(8);
    expect(within(mini).getByTestId('hist-champion').textContent).toMatch(/MIL/);
    expect(within(mini).getByTestId('cup-prize').textContent).toMatch(/QF loss \$51,497 \/ player/);
    // the race: the wild card first in each conference (the NBA's order)
    for (const race of document.querySelectorAll('.ck-cup-race')) expect(race.querySelector('.ck-cup-holder')).toBe(race.querySelector('.ck-cup-race-row'));
    // a game link doesn't open the bracket; the panel's empty area and its title do
    fireEvent.click(within(mini).getAllByTestId('hist-game-link')[0]!);
    expect(view).toBe('');
    fireEvent.click(mini);
    expect(view).toBe('bracket');
    view = '';
    fireEvent.click(within(mini).getByTestId('hist-bracket-open'));
    expect(view).toBe('bracket');
  });

  it('a season, Bracket: 7 games, 8 teams, each with date, venue, how it got there, seed, record going in, rest', () => {
    render(<CupHistory data={data} season={2025} view="bracket" onSeason={() => {}} />);
    expect(screen.getByTestId('hist-season').dataset.view).toBe('bracket');
    const shown = document.querySelectorAll('.ck-hb-game');
    expect(shown).toHaveLength(7);
    expect(new Set([...document.querySelectorAll('[data-testid="hb-team"]')].map((e) => e.getAttribute('data-team'))).size).toBe(8);
    for (const g of shown) {
      expect(g.querySelector('[data-testid="hb-date"]')!.textContent).toMatch(/^(QF|SF|Final) · \w{3}, Dec \d+$/);
      expect(g.querySelector('[data-testid="hb-venue"]')!.textContent).toMatch(/\w/);
      expect(g.querySelector<HTMLAnchorElement>('[data-testid="hb-game-link"]')!.href).toMatch(/^https:\/\//);
      for (const t of g.querySelectorAll('[data-testid="hb-team"]'))
        for (const id of ['hb-seed', 'hb-record', 'hb-qualified', 'ko-prep']) expect(t.querySelector(`[data-testid="${id}"]`), `${t.getAttribute('data-team')} ${id}`).not.toBeNull();
    }
    // the hosted quarterfinals carry HOST on the home team; the Las Vegas games the neutral badge
    expect(document.querySelectorAll('.ck-hb-game [data-testid="venue-host"]')).toHaveLength(4);
    expect(document.querySelectorAll('.ck-hb-game [data-testid="venue-neutral"]')).toHaveLength(3);
    expect(screen.getByTestId('hist-champion').dataset.team).toBe('NYK');
    // OKC before the West semifinal: 24-1, 2 days off after its quarterfinal at home, then to Las Vegas
    const okc = [...document.querySelectorAll('[data-testid="hb-sf"] [data-testid="hb-team"]')].find((e) => e.getAttribute('data-team') === 'OKC')!;
    expect(okc.querySelector('[data-testid="hb-record"]')!.textContent).toBe('24-1');
    expect(okc.querySelector('[data-testid="ko-prep"]')!.textContent).toMatch(/^2d rest · ✈ \d{3} mi, CT→PT$/);
    expect(okc.querySelector('[data-testid="hb-seed"]')!.textContent).toBe('1');
  });
});
