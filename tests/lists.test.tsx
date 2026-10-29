// @vitest-environment jsdom
// List | Calendar switch (League and Team), continuous league list, team list. jsdom has no layout, so the list
// virtualizer runs on its height estimates here; real scrolling is covered by e2e/lists.spec.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView, LeagueListView } from '../src/components/CalendarView';
import { addDays, hasNationalTv, isBackToBack, isOver, markers, nationalTv, teamGames } from '../src/data/model';
import { TEAM_BY_ID } from '../src/data/teams';
import { data } from './feed';
import { TEAM } from './synthetic';

afterEach(cleanup);

const WIDE = { width: 1000, height: 800 };
const WEEK = { width: 1248, height: 800 }; // the week view needs ≥ 1179 px since round 4 (1280 px window)
const PHONE = { width: 360, height: 700 };
const NOW = Date.parse('2026-10-23T15:00:00Z');
const tab = (name: string) => screen.getByRole('tab', { name });
const selected = (name: string) => tab(name).getAttribute('aria-selected') === 'true';
const ids = (root: ParentNode) => [...root.querySelectorAll('[data-game-id]')].map((e) => e.getAttribute('data-game-id'));
const days = (root: ParentNode) => [...root.querySelectorAll('[data-day]')].map((e) => e.getAttribute('data-day')!);

/** Which of the four views is showing. */
function view(): string {
  if (screen.queryByRole('region', { name: 'League schedule' })) return 'league-list';
  if (screen.queryByRole('region', { name: 'League week' }) || screen.queryByRole('region', { name: 'Month navigator' })) return 'league-calendar';
  if (screen.queryByRole('region', { name: /games$/ })) return 'team-list';
  if (screen.queryByRole('region', { name: /schedule$/ })) return 'team-calendar';
  return 'none';
}

describe('List | Calendar switch', () => {
  it('shows both options in League and in Team, current one highlighted', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    for (const mode of ['League', 'Team']) {
      fireEvent.click(tab(mode));
      expect(within(screen.getByRole('tablist', { name: 'Layout' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['List', 'Calendar']);
      expect(selected('List')).toBe(true);
      expect(selected('Calendar')).toBe(false);
    }
    expect(screen.queryByRole('button', { name: 'Month' })).toBeNull();
  });

  it('renders the right view for each of the 4 combinations; the layout is kept across League ↔ Team', () => {
    const onStateChange = vi.fn();
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" onStateChange={onStateChange} />);
    expect(view()).toBe('league-list');
    fireEvent.click(tab('Team'));
    expect(view()).toBe('team-list');
    fireEvent.click(tab('Calendar'));
    expect(view()).toBe('team-calendar');
    expect(selected('Calendar')).toBe(true);
    fireEvent.click(tab('League'));
    expect(view()).toBe('league-calendar');
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'league', layout: 'calendar' }));
    fireEvent.click(tab('List'));
    expect(view()).toBe('league-list');
    fireEvent.click(tab('Team'));
    expect(view()).toBe('team-list');
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'team', layout: 'list' }));
  });

  it('initial layout from the host', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS }} />);
    expect(view()).toBe('team-calendar');
  });

  it('a click on a day in League → Calendar opens the list at that day', () => {
    const el = render(<CalendarView data={data} size={WEEK} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-10' }} />);
    fireEvent.click(within(el.container.querySelector<HTMLElement>('[data-date="2026-11-14"]')!).getByTestId('day-header'));
    expect(view()).toBe('league-list');
    expect(selected('List')).toBe(true);
    expect(screen.getByTestId('day-title').textContent).toBe('Saturday, November 14, 2026');
    expect(days(el.container)).toContain('2026-11-14');
  });
});

describe('TV games only, all four views', () => {
  const tvIds = (date: string) => data.byDate.get(date)!.filter(hasNationalTv).map((g) => g.gameId);

  it('league list', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ tvOnly: true }} />);
    const list = screen.getByTestId('league-list');
    for (const d of days(list)) expect(ids(list.querySelector(`[data-day="${d}"]`)!), d).toEqual(tvIds(d));
    expect(el.container.querySelectorAll('[data-game-id]:not(:has([data-testid="tv-badge"]))')).toHaveLength(0);
  });

  it('league calendar', () => {
    const el = render(<CalendarView data={data} size={WEEK} now={NOW} timeZone="UTC" initial={{ tvOnly: true, layout: 'calendar', date: '2026-11-02' }} />);
    expect(ids(el.container.querySelector('[data-date="2026-11-02"]')!)).toEqual(tvIds('2026-11-02'));
  });

  it('team list and team calendar: only the team’s national TV games; the checkbox is there in Team', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', teamId: TEAM.LAL }} />);
    const all = teamGames(data, TEAM.LAL);
    const tv = all.filter(hasNationalTv);
    expect(tv.length).toBeGreaterThan(0);
    expect(tv.length).toBeLessThan(all.length);
    expect(ids(screen.getByTestId('team-list'))).toEqual(all.map((g) => g.gameId));
    fireEvent.click(screen.getByLabelText('TV games only'));
    expect(ids(screen.getByTestId('team-list'))).toEqual(tv.map((g) => g.gameId));
    fireEvent.click(tab('Calendar'));
    const oct = tv.filter((g) => g.dateEt.startsWith('2026-10')).map((g) => g.gameId);
    expect(ids(el.container.querySelector('[role="grid"]')!)).toEqual(oct);
  });
});

describe('league list (continuous)', () => {
  it('opens on the default day with its header; following game days come after it, each with a header', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    const list = screen.getByTestId('league-list');
    const shown = days(list);
    expect(screen.getByTestId('day-title').textContent).toBe('Friday, October 23, 2026');
    expect(shown).toContain('2026-10-23');
    const i = data.dates.indexOf(shown[0]!);
    expect(shown).toEqual(data.dates.slice(i, i + shown.length)); // consecutive game days, no empty days
    expect(shown.length).toBeGreaterThan(1);
    const n = data.byDate.get('2026-10-23')!.length;
    expect(list.querySelector('[data-day="2026-10-23"] .ck-lday-head')!.textContent).toBe(`Fri, Oct 23 · ${n} games`);
    expect(ids(list.querySelector('[data-day="2026-10-23"]')!)).toEqual(data.byDate.get('2026-10-23')!.map((g) => g.gameId));
    expect(el.container.querySelector('[data-day="2026-10-19"]')).toBeNull(); // no games that day
  });

  it('renders only a bounded number of days, also far into the season', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ date: '2027-02-10' }} />);
    const shown = days(screen.getByTestId('league-list'));
    expect(shown).toContain('2027-02-10');
    expect(shown.length).toBeLessThanOrEqual(12);
    expect(data.dates.length).toBeGreaterThan(100);
  });

  it('scrolling moves the week strip and the date to the day at the top', () => {
    const onStateChange = vi.fn();
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" onStateChange={onStateChange} />);
    const list = screen.getByTestId('league-list');
    let top = 0;
    Object.defineProperty(list, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
    fireEvent.scroll(list); // settle at the current position
    top += 4000;
    fireEvent.scroll(list);
    const title = screen.getByTestId('day-title').textContent!;
    expect(title).not.toBe('Friday, October 23, 2026');
    const date = onStateChange.mock.lastCall![0].date as string;
    expect(date > '2026-10-24').toBe(true);
    expect(days(list)).toContain(date);
    expect(within(screen.getByRole('tablist', { name: 'Week' })).getByRole('tab', { selected: true }).getAttribute('data-date')).toBe(date);
  });

  it('a re-render between a user scroll and its scroll event keeps the new position (no snap back)', () => {
    const props = { data, date: '2026-11-15', onSelectDate: () => {}, tvOnly: false, size: WIDE, timeZone: 'UTC' };
    const el = render(<LeagueListView {...props} now={NOW} />);
    const list = screen.getByTestId('league-list');
    let top = 0;
    Object.defineProperty(list, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
    fireEvent.scroll(list);
    const before = screen.getByTestId('day-title').textContent;
    top = 3000; // the user scrolled; the scroll event is still queued
    el.rerender(<LeagueListView {...props} now={NOW + 60_000} />); // e.g. the clock ticks
    expect(top).toBe(3000);
    fireEvent.scroll(list);
    expect(top).toBe(3000);
    expect(screen.getByTestId('day-title').textContent).not.toBe(before);
  });

  it('week strip click and prev/next arrows jump between game days', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(screen.getByTestId('day-title').textContent).toBe('Saturday, October 24, 2026');
    fireEvent.click(screen.getByLabelText('Previous day'));
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(screen.getByTestId('day-title').textContent).toBe('Thursday, October 22, 2026');
    fireEvent.click(screen.getByRole('tab', { name: /Tue\s*20/ }));
    expect(screen.getByTestId('day-title').textContent).toBe('Tuesday, October 20, 2026');
    expect(days(screen.getByTestId('league-list'))).toContain('2026-10-20');
    expect((screen.getByLabelText('Previous day') as HTMLButtonElement).disabled).toBe(true); // season's first date
    expect((screen.getByRole('tab', { name: /Mon\s*19/ }) as HTMLButtonElement).disabled).toBe(true); // before the season
  });

  it('league list rows show both teams with logos (on the backing) and keep "@"', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    const card = el.container.querySelector('[data-day="2026-10-23"] article')!;
    const g = data.byDate.get('2026-10-23')![0]!;
    const imgs = [...card.querySelectorAll('img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([`/logos/${g.awayTeam.teamTricode}.svg`, `/logos/${g.homeTeam.teamTricode}.svg`]);
    for (const i of imgs) expect(i.parentElement!.classList).toContain('ck-logo-backing');
    expect(card.textContent).toMatch(new RegExp(`${g.awayTeam.teamTricode}.*@.*${g.homeTeam.teamTricode}`));
  });
});

describe('team list', () => {
  const lal = teamGames(data, TEAM.LAL);

  it('every game of the team in order, one row each, opens at the next game not over', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', teamId: TEAM.LAL }} />);
    const list = screen.getByRole('region', { name: 'Lakers games' });
    expect(ids(list)).toEqual(lal.map((g) => g.gameId));
    expect(lal.length).toBeGreaterThanOrEqual(80);
    const next = lal.find((g) => !isOver(g, NOW))!;
    expect(list.querySelector('[data-next]')!.getAttribute('data-game-id')).toBe(next.gameId);
    expect(lal.indexOf(next)).toBeGreaterThan(0); // earlier games are in the list, above it
  });

  it('row: date, local tip-off, selected team first, vs/@, both logos', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="America/Sao_Paulo" initial={{ mode: 'team', teamId: TEAM.LAL }} />);
    const g = lal.find((x) => x.dateEt === '2026-10-28')!; // @ LAC, B2B
    const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
    expect(row.querySelector('.ck-date')!.textContent).toBe('Wed 28/10');
    expect(row.querySelector('[data-testid="tipoff"]')!.textContent).toBe('23:30');
    expect(row.textContent).toMatch(/LAL\s*@\s*LAC/);
    const imgs = [...row.querySelectorAll('img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/logos/LAL.svg', '/logos/LAC.svg']);
    for (const i of imgs) expect(i.parentElement!.classList).toContain('ck-logo-backing');
  });

  it('late tips show (+1); TBD shows TBD', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="America/Sao_Paulo" initial={{ mode: 'team', teamId: TEAM.LAL }} />);
    const late = lal.find((g) => g.homeTeam.teamId === TEAM.LAL && g.startTimeUtc && new Date(g.startTimeUtc).getUTCHours() >= 3)!;
    expect(el.container.querySelector(`[data-game-id="${late.gameId}"] [data-testid="tipoff"]`)!.textContent).toMatch(/^\d\d:\d\d \(\+1\)$/);
    // Cup knockout games: teams TBD, so they're in no team's list; time TBD is covered by the league list.
  });

  it('markers, national TV badge with network names and B2B on exactly the right games', () => {
    for (const teamId of [TEAM.LAL, TEAM.BOS, TEAM.NYK]) {
      const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', teamId }} />);
      for (const g of teamGames(data, teamId)) {
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        const name = `${TEAM_BY_ID.get(teamId)!.tricode} ${g.dateEt}`;
        // night 2 = played the previous calendar day; night 1 = plays the next one (labels: team.test.tsx)
        expect(!!row.querySelector('.ck-b2b-n2'), name).toBe(isBackToBack(data, teamId, g.dateEt));
        expect(!!row.querySelector('.ck-b2b-n1'), name).toBe(teamGames(data, teamId).some((x) => x.dateEt === addDays(g.dateEt, 1)));
        const tv = nationalTv(g);
        expect(row.querySelector('[data-testid="tv-badge"]')?.textContent ?? '', name).toBe(tv.join(' · '));
        expect([...row.querySelectorAll('.ck-cup, .ck-cup-final, .ck-play-in, .ck-playoffs')].map((t) => t.textContent), name).toEqual(markers(g).map((m) => m.long));
      }
      cleanup();
    }
    expect(teamGames(data, TEAM.LAL).some((g) => markers(g).length)).toBe(true);
  });

  it('phone: rows are compact; same team picker as Team → Calendar', () => {
    render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ mode: 'team', teamId: TEAM.BOS }} />);
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(ids(screen.getByRole('region', { name: 'Heat games' }))).toEqual(teamGames(data, TEAM.MIA).map((g) => g.gameId));
    fireEvent.click(tab('Calendar'));
    expect(screen.getByTestId('team-picker').getAttribute('data-team-id')).toBe(String(TEAM.MIA));
  });
});
