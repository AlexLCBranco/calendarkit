// @vitest-environment jsdom
// Round 21 (item 7): the two-row top bar. Row 1 is the same in every destination (destinations, notes, Quick standings,
// a labelled Copy); row 2 belongs to the destination — Schedule: scope picker, date block (‹ date › · calendar · Today,
// in every view), List · Calendar · Slate always, then the view's options; Cup: Groups · Schedule + the stage label;
// Standings: the column sets. Pixel positions are checked in e2e/navbar.spec.ts.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { cupNights, cupStageLabel } from '../src/data/cupSchedule';
import { data } from './feed';
import { clearScope, goTo, pickScope, scopeTeam } from './nav';
import { TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const open = (initial = {}) => render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" note="Times in UTC" updatedAt="2026-11-15T11:00:00Z" initial={initial} />);
const tabs = (name: string) => within(screen.getByRole('tablist', { name }));
const selected = (list: string, name: string) => tabs(list).getByRole('tab', { name }).getAttribute('aria-selected') === 'true';
const row1 = () => screen.getByTestId('bar-global');
const row1Shape = () => [...row1().querySelectorAll('button, [data-testid="tz-note"], [data-testid="data-updated"]')].map((e) => e.getAttribute('aria-label') ?? e.textContent).join(' | ');
const block = () => screen.getByTestId('date-block');
/** The date block's pieces in order: ‹, title, ›, calendar, Today. */
const blockShape = () => [...block().querySelector('.ck-period')!.children].map((e) => (e.classList.contains('ck-nav-title') ? 'title' : e.getAttribute('data-testid') ?? e.getAttribute('aria-label')?.split(' ')[0]));

describe('top bar row 1 (global)', () => {
  it('is the same in Schedule, Cup and Standings: destinations, notes, Quick standings, a labelled Copy', async () => {
    open();
    const shape = row1Shape();
    expect(tabs('Destination').getAllByRole('tab').map((t) => t.textContent)).toEqual(['Schedule', 'Cup', 'Standings']);
    expect(screen.getByTestId('standings-button').textContent).toBe('Quick standings');
    const copy = screen.getByTestId('copy-view');
    expect([copy.textContent, copy.getAttribute('title'), copy.getAttribute('aria-label')]).toEqual(['Copy', 'Copy as image', 'Copy as image']);
    // "Standings" is a destination only (the popup button says "Quick standings")
    expect(screen.getAllByText('Standings')).toHaveLength(1);
    goTo('Cup');
    await screen.findByTestId('cup');
    expect(row1Shape()).toBe(shape);
    goTo('Standings');
    expect(row1Shape()).toBe(shape);
    goTo('Schedule');
    pickScope('Boston Celtics');
    expect(row1Shape()).toBe(shape);
  });

  it('League and Team are one destination: Schedule comes back to the scope used last', () => {
    open();
    pickScope('Boston Celtics');
    expect(selected('Destination', 'Schedule')).toBe(true);
    goTo('Standings');
    goTo('Schedule');
    expect(scopeTeam()).toBe(TEAM.BOS);
    clearScope();
    expect(scopeTeam()).toBeUndefined();
    goTo('Standings');
    goTo('Schedule');
    expect(scopeTeam()).toBeUndefined();
  });
});

describe('Schedule row 2', () => {
  const views: [string, () => void][] = [
    ['League List', () => {}],
    ['Slate', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Slate' }))],
    ['League Calendar', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }))],
    ['League Calendar 2 weeks', () => fireEvent.click(tabs('Weeks').getByRole('tab', { name: '2 weeks' }))],
    ['Team Calendar', () => pickScope('Boston Celtics')],
    ['Team Calendar 1 week', () => fireEvent.click(tabs('Span').getByRole('tab', { name: '1 week' }))],
    ['Team List', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'List' }))],
  ];

  it('every view: scope picker, then ‹ date › · calendar · Today, then List · Calendar · Slate (Slate always offered)', () => {
    open();
    for (const [name, go] of views) {
      go();
      const bar = screen.getByTestId('bar-local');
      const order = [...bar.children].map((c) => (c.classList.contains('ck-picker') ? 'scope' : c.getAttribute('data-testid') ?? c.getAttribute('aria-label') ?? c.className));
      expect(order.slice(0, 3), name).toEqual(['scope', 'date-block', 'Layout']);
      expect(blockShape(), name).toEqual(['Previous', 'title', 'Next', 'date-pick', 'today']);
      expect(tabs('Layout').getAllByRole('tab').map((t) => t.textContent), name).toEqual(['List', 'Calendar', 'Slate']);
    }
  });

  it('Today is always there and disabled (not removed) when already on today', () => {
    open({ date: '2026-11-15' });
    const today = () => within(block()).getByTestId('today') as HTMLButtonElement;
    expect(today().disabled).toBe(true);
    fireEvent.click(within(block()).getByLabelText('Next day'));
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(today().disabled).toBe(true);
  });

  it('the Team Calendar has the calendar picker too: a date shows its month (or its week)', () => {
    open({ mode: 'team', layout: 'calendar', teamId: TEAM.BOS });
    fireEvent.click(within(block()).getByTestId('date-pick'));
    const popup = screen.getByRole('dialog');
    fireEvent.click(within(popup).getByLabelText('Next month'));
    fireEvent.click(popup.querySelector<HTMLElement>('[data-date="2026-12-16"]')!);
    expect(within(block()).getByTestId('period-title').textContent).toBe('December 2026');
    fireEvent.click(tabs('Span').getByRole('tab', { name: '1 week' }));
    fireEvent.click(within(block()).getByTestId('date-pick'));
    const week = screen.getByRole('dialog');
    if (!week.querySelector('[data-date="2026-12-23"]')) fireEvent.click(within(week).getByLabelText('Next month')); // opens on the shown week's month
    fireEvent.click(week.querySelector<HTMLElement>('[data-date="2026-12-23"]')!);
    expect(within(block()).getByTestId('period-title').textContent).toBe('Dec 20 – 26, 2026');
  });

  it('the scope picker: "All teams" or a tricode with × ; picking a team keeps the view; × and "All teams" go back to the league', () => {
    open({ layout: 'calendar' });
    expect(screen.getByTestId('team-picker').textContent).toMatch(/^All teams/);
    expect(screen.queryByTestId('scope-clear')).toBeNull();
    pickScope('Boston Celtics');
    expect(screen.getByTestId('team-picker').textContent).toMatch(/^BOS/);
    expect(selected('Layout', 'Calendar')).toBe(true);
    expect(screen.getByTestId('team-header')).toBeTruthy();
    pickScope('All teams');
    expect(scopeTeam()).toBeUndefined();
    expect(screen.queryByTestId('team-header')).toBeNull();
    pickScope('Miami Heat');
    clearScope();
    expect(scopeTeam()).toBeUndefined();
  });

  it('Slate from a team: All teams on the date looked at, the team’s game highlighted; gone on another day', () => {
    // BOS's next game (the row its list opens at)
    open({ mode: 'team', layout: 'list', teamId: TEAM.BOS });
    const date = screen.getByTestId('team-day-title').textContent;
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Slate' }));
    expect(scopeTeam()).toBeUndefined();
    expect(selected('Layout', 'Slate')).toBe(true);
    expect(screen.getByTestId('day-title').textContent).toBe(date);
    const day = screen.getByTestId('slate').closest('[data-day]')!.getAttribute('data-day')!;
    const game = data.byDate.get(day)!.find((g) => g.homeTeam.teamId === TEAM.BOS || g.awayTeam.teamId === TEAM.BOS)!;
    expect(document.querySelector('.ck-slate-focus')!.getAttribute('data-game-id')).toBe(game.gameId);
    expect(screen.queryByTestId('slate-no-team')).toBeNull();
    fireEvent.click(within(block()).getByLabelText('Next day'));
    expect(document.querySelector('.ck-slate-focus')).toBeNull();
  });

  // "XXX doesn't play today" needs the Team List's row at the top, which only a real layout gives: e2e/navbar.spec.ts
});

describe('Cup and Standings row 2', () => {
  it('Cup: Groups · Schedule and the stage label; Standings: the column sets', async () => {
    open({ mode: 'cup' });
    await screen.findByTestId('cup');
    expect(tabs('Cup view').getAllByRole('tab').map((t) => t.textContent)).toEqual(['Groups', 'Schedule']);
    expect(screen.getByTestId('cup-stage').textContent).toBe(cupStageLabel(cupNights(data), '2026-11-15'));
    expect(screen.queryByTestId('date-block')).toBeNull();
    goTo('Standings');
    expect(screen.getByRole('tablist', { name: 'Standings columns' })).toBeTruthy();
  });
});

describe('cupStageLabel', () => {
  const nights = cupNights(data);
  const group = nights.filter((n) => n.round === 'group');
  it('before, on and between group nights; knockout; after', () => {
    expect(cupStageLabel(nights, '2026-10-20')).toBe('Group play starts Fri, Oct 30');
    expect(cupStageLabel(nights, group[1]!.date)).toBe(`Group play · night 2 of ${group.length}`);
    expect(cupStageLabel(nights, '2026-11-07')).toBe(`Group play · next night Fri, Nov 13 (3 of ${group.length})`);
    expect(cupStageLabel(nights, '2026-12-04')).toBe('Quarterfinals · tonight');
    expect(cupStageLabel(nights, '2026-12-06')).toBe('Semifinals · Tue, Dec 8');
    expect(cupStageLabel(nights, '2026-12-11')).toBe('Final · tonight');
    expect(cupStageLabel(nights, '2026-12-12')).toBe('Cup complete');
    expect(cupStageLabel([], '2026-12-12')).toBe('');
  });
});
