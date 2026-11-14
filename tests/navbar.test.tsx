// @vitest-environment jsdom
// The top bar's controls and what they do: the destinations; Schedule's date block (‹ date › · calendar · Today, in
// every view), List · Calendar · Slate (always) and the scope picker; the Cup's views; the Standings' column sets; ⓘ,
// Quick standings and Copy everywhere. The bar is in flux (PROJECT.md, Test tiers): which controls exist and what they
// do is tested, never where they sit or in what order.
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
const block = () => screen.getByTestId('date-block');
/** The date block's controls, in any order: ‹, title, ›, calendar, Today. */
const blockParts = () => [...block().querySelector('.ck-period')!.children].map((e) => (e.classList.contains('ck-nav-title') ? 'title' : e.getAttribute('data-testid') ?? e.getAttribute('aria-label')?.split(' ')[0])).sort();
/** The shell's controls every destination has: the destinations, ⓘ, Quick standings, Copy. */
const globals = () => [screen.queryAllByRole('tablist', { name: 'Destination' }).length, ...['bar-info', 'standings-button', 'copy-view'].map((id) => screen.queryAllByTestId(id).length)];

describe('top bar, global controls', () => {
  it('in Schedule, Cup and Standings: the destinations; ⓘ, Quick standings and Copy as icon buttons', async () => {
    open();
    expect(globals()).toEqual([1, 1, 1, 1]);
    expect(tabs('Destination').getAllByRole('tab').map((t) => t.textContent)).toEqual(['Schedule', 'Cup', 'Standings']);
    const st = screen.getByTestId('standings-button');
    expect([st.textContent, st.getAttribute('title'), st.getAttribute('aria-label')]).toEqual(['', 'Quick standings', 'Quick standings']);
    const copy = screen.getByTestId('copy-view');
    expect([copy.textContent, copy.getAttribute('title'), copy.getAttribute('aria-label')]).toEqual(['', 'Copy as image', 'Copy as image']);
    // no standalone text in the bar: the time zone and the data stamp are in ⓘ's title, its popover (and its
    // screen-reader text)
    const info = screen.getByTestId('bar-info');
    expect(info.getAttribute('title')).toBe('Times in UTC\nData updated Nov 15, 11:00');
    expect(info.contains(screen.getByTestId('tz-note')) && info.contains(screen.getByTestId('data-updated'))).toBe(true);
    expect(screen.getByTestId('bar-info-pop').hidden).toBe(true);
    fireEvent.click(info);
    expect(screen.getByTestId('bar-info-pop').hidden).toBe(false);
    expect(screen.getByTestId('bar-info-pop').textContent).toMatch(/^Times in UTCData updated Nov 15, 11:00.*Menu \(trial\)RailPacked bar$/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('bar-info-pop').hidden).toBe(true);
    // "Standings" is a destination only (the popup button says "Quick standings")
    expect(screen.getAllByText('Standings')).toHaveLength(1);
    goTo('Cup');
    await screen.findByTestId('cup');
    expect(globals()).toEqual([1, 1, 1, 1]);
    goTo('Standings');
    expect(globals()).toEqual([1, 1, 1, 1]);
    goTo('Schedule');
    pickScope('Boston Celtics');
    expect(globals()).toEqual([1, 1, 1, 1]);
  });

  it('the menu switch in ⓘ: Rail puts ← → and the destinations in a rail, remembered; Packed bar brings them back', () => {
    open();
    expect(screen.queryByTestId('rail')).toBeNull();
    expect(screen.getByTestId('top-bar').getAttribute('data-menu')).toBe('packed');
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Menu layout', hidden: true })).getByRole('tab', { name: 'Rail', hidden: true }));
    const rail = screen.getByTestId('rail');
    expect(within(rail).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Schedule', 'Cup', 'Standings']);
    expect(screen.queryByTestId('bar-global')).toBeNull(); // no second set of destinations in the bar
    expect(localStorage.getItem('ck:menu:v1')).toBe('rail');
    // the rail's destinations work
    fireEvent.click(within(rail).getByRole('tab', { name: 'Standings' }));
    expect(screen.getByRole('tablist', { name: 'Standings columns' })).toBeTruthy();
    cleanup();
    // a new page opens with the rail (remembered), and Packed bar goes back
    open();
    expect(screen.getByTestId('rail')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Menu layout', hidden: true })).getByRole('tab', { name: 'Packed bar', hidden: true }));
    expect(screen.queryByTestId('rail')).toBeNull();
    expect(screen.getByTestId('bar-global')).toBeTruthy();
    expect(localStorage.getItem('ck:menu:v1')).toBe('packed');
  });

  it('Options: one popover with TV games only (and Rest days in the Team List); the button shows a filter that is on; Schedule only', async () => {
    open();
    const button = () => screen.getByTestId('options-button');
    const pop = () => within(screen.getByTestId('options-button-pop'));
    expect(button().classList.contains('ck-opt-on')).toBe(false);
    fireEvent.click(button());
    expect(pop().queryByLabelText('Show rest days')).toBeNull();
    fireEvent.click(pop().getByLabelText('TV games only'));
    expect(button().classList.contains('ck-opt-on')).toBe(true);
    expect(button().getAttribute('title')).toBe(null); // open: no title over the popover
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(button().getAttribute('title')).toBe('Options — TV games only is on');
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'List' }));
    pickScope('Boston Celtics');
    expect((pop().getByLabelText('Show rest days') as HTMLInputElement).checked).toBe(true);
    goTo('Cup');
    await screen.findByTestId('cup');
    expect(screen.queryByTestId('options-button')).toBeNull();
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

describe('Schedule controls', () => {
  const views: [string, () => void][] = [
    ['League List', () => {}],
    ['Slate', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Slate' }))],
    ['League Calendar', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }))],
    ['League Calendar 2 weeks', () => fireEvent.click(tabs('Weeks').getByRole('tab', { name: '2 weeks' }))],
    ['Team Calendar', () => pickScope('Boston Celtics')],
    ['Team Calendar 1 week', () => fireEvent.click(tabs('Span').getByRole('tab', { name: '1 week' }))],
    ['Team List', () => fireEvent.click(tabs('Layout').getByRole('tab', { name: 'List' }))],
  ];

  it('every view: ‹ date › · calendar · Today; List · Calendar · Slate (always); the scope picker', () => {
    open();
    for (const [name, go] of views) {
      go();
      expect(screen.getAllByTestId('date-block'), name).toHaveLength(1);
      expect(screen.getAllByTestId('team-picker'), name).toHaveLength(1);
      expect(globals(), name).toEqual([1, 1, 1, 1]);
      expect(blockParts(), name).toEqual(['Next', 'Previous', 'date-pick', 'title', 'today']);
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

  it('the scope picker: "All teams" or the team (full name, tricode on narrow windows) with × ; picking a team keeps the view; × and "All teams" go back to the league', () => {
    open({ layout: 'calendar' });
    expect(screen.getByTestId('team-picker').textContent).toMatch(/^All teams/);
    expect(screen.queryByTestId('scope-clear')).toBeNull();
    pickScope('Boston Celtics');
    expect(screen.getByTestId('team-picker').querySelector('.ck-picker-full')!.textContent).toBe('Boston Celtics');
    expect(screen.getByTestId('team-picker').querySelector('.ck-picker-tri')!.textContent).toBe('BOS');
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

describe('Cup and Standings controls', () => {
  it('Cup: Groups · Schedule · Simulator · History and the stage label; Standings: the column sets', async () => {
    open({ mode: 'cup' });
    await screen.findByTestId('cup');
    expect(tabs('Cup view').getAllByRole('tab').map((t) => t.textContent)).toEqual(['Groups', 'Schedule', 'Simulator', 'History']);
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
