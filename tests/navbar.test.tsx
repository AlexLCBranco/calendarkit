// @vitest-environment jsdom
// The header's and page rows' controls and what they do: the Where tabs and the breadcrumb; Schedule's date block
// (‹ date › · calendar · Today, in every view), List · Calendar · Slate (always) and the team chips; the Cup's views; the
// Standings' column sets; Go anywhere, ⓘ, Quick standings and Copy everywhere. Which controls exist and what they do is
// tested, never where they sit (the layout's own checks are e2e/nav.spec.ts).
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
const globals = () => [screen.queryAllByTestId('where-tabs').length, ...['go-anywhere', 'bar-info', 'standings-button', 'copy-view'].map((id) => screen.queryAllByTestId(id).length)];
const ALL = [1, 1, 1, 1, 1];
const where = () => within(screen.getByTestId('where-tabs')).getAllByRole('button');
const placeOn = (name: string) => within(screen.getByTestId('where-tabs')).getByRole('button', { name }).getAttribute('aria-current') === 'page';
const crumbs = () => screen.getAllByTestId('crumb-btn').map((b) => b.textContent);

describe('top bar, global controls', () => {
  it('in Schedule, Cup and Standings: the destinations; ⓘ, Quick standings and Copy as icon buttons', async () => {
    open();
    expect(globals()).toEqual(ALL);
    expect(where().map((t) => t.textContent)).toEqual(['Schedule', 'Cup', 'Standings']);
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
    expect(screen.getByTestId('bar-info-pop').textContent).toMatch(/^Times in UTCData updated Nov 15, 11:00/);
    expect(screen.getByTestId("bar-info-pop").textContent).not.toMatch(/Menu .trial./);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('bar-info-pop').hidden).toBe(true);
    // "Standings" is a destination only (the popup button says "Quick standings")
    expect(screen.getAllByText('Standings')).toHaveLength(1);
    goTo('Cup');
    await screen.findByTestId('cup');
    expect(globals()).toEqual(ALL);
    goTo('Standings');
    expect(globals()).toEqual(ALL);
    goTo('Schedule');
    pickScope('Boston Celtics');
    expect(globals()).toEqual(ALL);
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
    expect(placeOn('Schedule')).toBe(true);
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

  it('every view: ‹ date › · calendar · Today; List · Calendar · Slate (always); the team chips', () => {
    open();
    for (const [name, go] of views) {
      go();
      expect(screen.getAllByTestId('date-block'), name).toHaveLength(1);
      expect(screen.getAllByTestId('team-chips'), name).toHaveLength(1);
      expect(screen.getAllByTestId('team-chip'), name).toHaveLength(30);
      expect(globals(), name).toEqual(ALL);
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

  it('the team chips: "All teams" and every team, grouped East | West by division; picking a team keeps the view; "All teams" goes back to the league', () => {
    open({ layout: 'calendar' });
    expect(screen.getByTestId('team-chip-all').getAttribute('aria-checked')).toBe('true');
    const groups = screen.getByTestId('team-chips').querySelectorAll('[role="group"][aria-label$="Conference"]');
    expect([...groups].map((g) => g.getAttribute('aria-label'))).toEqual(['Eastern Conference', 'Western Conference']);
    expect([...groups[0]!.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Atlantic division', 'Central division', 'Southeast division']);
    expect([...groups[0]!.querySelectorAll('[data-testid="team-chip"]')].slice(0, 5).map((c) => c.textContent)).toEqual(['BOS', 'BKN', 'NYK', 'PHI', 'TOR']);
    expect(crumbs()).toEqual(['Schedule', 'All teams', 'Calendar']);
    pickScope('Boston Celtics');
    expect(scopeTeam()).toBe(TEAM.BOS);
    expect(screen.getByTestId('team-chip-all').getAttribute('aria-checked')).toBe('false');
    expect(crumbs()).toEqual(['Schedule', 'Boston Celtics', 'Calendar']);
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

describe('the pinned header: breadcrumb and Go anywhere', () => {
  const crumb = (id: string) => document.querySelector<HTMLElement>(`[data-crumb="${id}"]`)!;
  const jump = (id: string, label: string) => {
    fireEvent.click(within(crumb(id)).getByTestId('crumb-btn'));
    fireEvent.click(within(within(crumb(id)).getByTestId('crumb-menu')).getByRole('menuitem', { name: label }));
  };

  it('every breadcrumb part opens its siblings and jumps there', async () => {
    open();
    expect(crumbs()).toEqual(['Schedule', 'All teams', 'List']);
    jump('team', 'Miami Heat');
    expect(scopeTeam()).toBe(TEAM.MIA);
    jump('view', 'Calendar');
    expect(selected('Layout', 'Calendar')).toBe(true);
    expect(crumbs()).toEqual(['Schedule', 'Miami Heat', 'Calendar']);
    jump('team', 'All teams');
    expect(scopeTeam()).toBeUndefined();
    jump('place', 'Cup');
    await screen.findByTestId('cup');
    expect(crumbs()).toEqual(['Cup', 'Groups']);
    jump('cup-view', 'History');
    expect(crumbs()).toEqual(['Cup', 'History', '2025']);
    jump('cup-season', '2023');
    expect(await screen.findByTestId('hist-season')).toBeTruthy();
    expect(screen.getByTestId('hist-season').getAttribute('data-year')).toBe('2023');
    jump('cup-view', 'Schedule');
    jump('cup-list', 'Team');
    pickScope('Boston Celtics');
    expect(crumbs()).toEqual(['Cup', 'Schedule', 'Team', 'Boston Celtics']);
    jump('place', 'Standings');
    expect(crumbs()).toEqual(['Standings', 'This season', 'Main']);
    jump('standings-set', 'Splits');
    expect(selected('Standings columns', 'Splits')).toBe(true);
    // a past season (CK-24) from the season part, and back
    jump('standings-season', '2015-16');
    expect(crumbs()).toEqual(['Standings', '2015-16']);
    expect(screen.getByTestId('season-strip').querySelector('[aria-checked="true"]')!.textContent).toBe('2015-16');
    jump('standings-season', 'This season');
    // the current part is marked in its own list, and a click on it changes nothing
    fireEvent.click(within(crumb('standings-set')).getByTestId('crumb-btn'));
    expect(within(crumb('standings-set')).getByRole('menuitem', { name: 'Splits' }).getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(crumb('standings-set')).queryByTestId('crumb-menu')).toBeNull();
  });

  it('Go anywhere: Ctrl+K opens it; typing finds teams, views, Cup seasons and column sets; Enter goes there', async () => {
    open();
    const search = (q: string) => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(screen.getByTestId('go-input'), { target: { value: q } });
      return screen.queryAllByTestId('go-item').map((i) => i.firstChild!.textContent);
    };
    const enter = () => fireEvent.keyDown(screen.getByTestId('go-input'), { key: 'Enter' });
    // nothing typed: the places
    fireEvent.click(screen.getByTestId('go-anywhere'));
    expect(screen.getAllByTestId('go-item').map((i) => i.firstChild!.textContent)).toEqual(['Schedule', 'Cup', 'Standings']);
    fireEvent.keyDown(screen.getByTestId('go-input'), { key: 'Escape' });
    expect(screen.queryByTestId('go-dialog')).toBeNull();
    expect(search('mia')[0]).toBe('Miami Heat');
    enter();
    expect(screen.queryByTestId('go-dialog')).toBeNull();
    expect(scopeTeam()).toBe(TEAM.MIA);
    expect(selected('Layout', 'Calendar')).toBe(true);
    expect(search('celtics list')[0]).toBe('Boston Celtics · List');
    enter();
    expect([scopeTeam(), selected('Layout', 'List')]).toEqual([TEAM.BOS, true]);
    expect(search('slate')[0]).toBe('All teams · Slate');
    enter();
    expect([scopeTeam(), selected('Layout', 'Slate')]).toEqual([undefined, true]);
    expect(search('cup 2024')[0]).toBe('NBA Cup 2024');
    enter();
    expect((await screen.findByTestId('hist-season')).getAttribute('data-year')).toBe('2024');
    expect(search('standings ratings')[0]).toBe('Standings · Ratings');
    enter();
    expect(selected('Standings columns', 'Ratings')).toBe(true);
    expect(search('zzz')).toEqual([]);
    expect(screen.getByTestId('go-list').textContent).toBe('Nothing matches "zzz"');
  });
});
