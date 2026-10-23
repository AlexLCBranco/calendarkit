// @vitest-environment jsdom
// Views with a fixed clock: league list, TV-only toggle, month view jump, team grid, TBD in views.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView, LeagueListView, TeamMonthGrid } from '../src/components/CalendarView';
import { data as realData } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const WIDE = { width: 1000, height: 800 };
const PHONE = { width: 360, height: 800 };
const NOW = Date.parse('2026-10-23T15:00:00Z');
const day = (date: string) => document.querySelector<HTMLElement>(`[data-day="${date}"]`)!;
const ids = (root: HTMLElement) => [...root.querySelectorAll('[data-game-id]')].map((e) => e.getAttribute('data-game-id'));

describe('CalendarView (league)', () => {
  it('opens on the default day and lists that game date', () => {
    render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="America/Sao_Paulo" />);
    expect(screen.getByTestId('day-title').textContent).toBe('Friday, October 23, 2026');
    expect(ids(day('2026-10-23'))).toEqual(realData.byDate.get('2026-10-23')!.map((g) => g.gameId));
  });

  it('TV games only: lists only games with a national broadcaster', () => {
    const onStateChange = vi.fn();
    render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="UTC" onStateChange={onStateChange} />);
    fireEvent.click(screen.getByLabelText('TV games only'));
    const shown = ids(day('2026-10-23'));
    const tv = realData.byDate.get('2026-10-23')!.filter((g) => g.broadcasters.nationalBroadcasters?.length).map((g) => g.gameId);
    expect(tv.length).toBeGreaterThan(0);
    expect(shown).toEqual(tv);
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ tvOnly: true, date: '2026-10-23' }));
  });

  it('prev/next day arrows and the week strip change the date', () => {
    render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="UTC" />);
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(screen.getByTestId('day-title').textContent).toBe('Saturday, October 24, 2026');
    fireEvent.click(screen.getByLabelText('Previous day'));
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(screen.getByTestId('day-title').textContent).toBe('Thursday, October 22, 2026');
    fireEvent.click(screen.getByRole('tab', { name: /Tue\s*20/ }));
    expect(screen.getByTestId('day-title').textContent).toBe('Tuesday, October 20, 2026');
    expect((screen.getByLabelText('Previous day') as HTMLButtonElement).disabled).toBe(true); // season's first date
  });

  it('league week view (wide) jumps to the clicked day header', () => {
    render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="UTC" initial={{ date: '2026-10-28' }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    const nav = screen.getByRole('region', { name: 'League week' });
    const header = within(nav).getByLabelText(`Wednesday, October 28: ${realData.byDate.get('2026-10-28')!.length} games`);
    fireEvent.click(header);
    expect(screen.queryByRole('region', { name: 'League week' })).toBeNull();
    expect(screen.getByTestId('day-title').textContent).toBe('Wednesday, October 28, 2026');
  });
});

describe('views: TBD and +1', () => {
  it('league day: TBD knockout game shows TBD time and TBD teams', () => {
    render(<LeagueListView data={realData} date="2026-12-04" onSelectDate={() => {}} tvOnly={false} size={WIDE} now={NOW} timeZone="UTC" />);
    const qf = within(day('2026-12-04')).getAllByRole('article').filter((a) => a.getAttribute('data-game-id')!.startsWith('002260120'));
    expect(qf).toHaveLength(2);
    for (const a of qf) {
      expect(within(a).getByTestId('tipoff').textContent).toBe('TBD');
      expect(a.textContent).toMatch(/TBD @ TBD/);
      expect(a.textContent).toMatch(/NBA Cup Quarterfinal/);
    }
  });

  it('team grid: late tip shows (+1) but sits in the cell of its NBA date', () => {
    const late = game({ date: '2026-11-02', utc: '2026-11-03T03:30:00Z', home: TEAM.DEN, away: TEAM.BOS });
    const d = dataOf([late]);
    const el = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-11" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="America/Sao_Paulo" />);
    const cell = el.container.querySelector('[data-date="2026-11-02"]')!;
    expect(cell.querySelector('[data-testid="tipoff"]')!.textContent).toBe('00:30 (+1)');
    expect(cell.textContent).toMatch(/@\s*DEN/);
    expect(el.container.querySelector('[data-date="2026-11-03"] [data-game-id]')).toBeNull();
  });

  it('team grid, phone: tapping a game shows its full card (with the rotationkit action when over)', () => {
    const onOpenGame = vi.fn();
    const el = render(<TeamMonthGrid data={realData} teamId={TEAM.LAL} month="2026-10" onMonthChange={() => {}} size={PHONE} now={NOW} timeZone="UTC" onOpenGame={onOpenGame} />);
    expect(el.container.querySelectorAll('.ck-cell [data-testid="open-game"]')).toHaveLength(0);
    fireEvent.click(el.container.querySelector('[data-date="2026-10-21"]')!);
    fireEvent.click(el.container.querySelector('.ck-detail [data-testid="open-game"]')!);
    expect(onOpenGame).toHaveBeenCalledWith(realData.byDate.get('2026-10-21')!.find((g) => g.homeTeam.teamId === TEAM.LAL)!.gameId);
  });

  it('team view: one game per day cell, selected team first and vs/@ from the team side, B2B night labelled', () => {
    const el = render(<CalendarView data={realData} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.LAL }} />);
    const cells = [...el.container.querySelectorAll('.ck-cell-game')];
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) expect(c.querySelectorAll('[data-game-id]')).toHaveLength(1);
    expect(el.container.querySelector('[data-date="2026-10-28"]')!.textContent).toMatch(/LAL\s*@\s*LAC.*2\/2 · HA/);
  });
});
