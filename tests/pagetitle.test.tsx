// @vitest-environment jsdom
// The browser tab's title follows the page, most specific part first: every destination and view, a day or team
// change, and back / forward (pageTitle.ts; the app shell sets it on every navigation and popstate).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarView, type ViewSnapshot } from '../src/components/CalendarView';
import { pageTitle } from '../src/pageTitle';
import { data } from './feed';
import { goTo, pickScope } from './nav';
import raw from './fixtures/feed-2026-10-23.json';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const tabs = (name: string) => within(screen.getByRole('tablist', { name }));
const click = (list: string, name: string) => fireEvent.click(tabs(list).getByRole('tab', { name }));

function open(initial = {}) {
  const snaps: ViewSnapshot[] = [];
  render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-13', ...initial }} onNavigate={(snap) => snaps.push(snap)} />);
  return () => pageTitle(snaps.at(-1)!);
}

describe('pageTitle: every view', () => {
  it('league, slate, team (month, weeks, list), Cup tabs, Standings', () => {
    const title = open();
    expect(title()).toBe('League · Nov 13 — calendarkit');
    fireEvent.click(within(screen.getByTestId('date-block')).getByLabelText('Next day'));
    expect(title()).toBe('League · Nov 14 — calendarkit');
    click('Layout', 'Slate');
    expect(title()).toBe('Slate · Nov 14 — calendarkit');
    click('Layout', 'Calendar');
    expect(title()).toBe('League · Nov 8 – 14 — calendarkit');
    click('Weeks', '2 weeks');
    expect(title()).toBe('League · Nov 8 – 21 — calendarkit');
    pickScope('Boston Celtics');
    expect(title()).toBe('BOS schedule · Nov 2026 — calendarkit');
    fireEvent.click(within(screen.getByTestId('date-block')).getByLabelText('Next month'));
    expect(title()).toBe('BOS schedule · Dec 2026 — calendarkit');
    pickScope('Miami Heat');
    expect(title()).toMatch(/^MIA schedule · \w{3} 2026 — calendarkit$/);
    click('Span', '1 week');
    expect(title()).toMatch(/^MIA schedule · \w{3} \d+ – (\d+|\w{3} \d+) — calendarkit$/);
    click('Layout', 'List');
    expect(title()).toMatch(/^MIA schedule · \w{3} 2026 — calendarkit$/);
    goTo('Cup');
    expect(title()).toBe('Cup standings — calendarkit');
    click('Cup view', 'Schedule');
    expect(title()).toBe('Cup schedule — calendarkit');
    goTo('Standings');
    expect(title()).toBe('Standings — calendarkit');
  });

  it('crossing a month or a year: "Nov 29 – Dec 5", "Dec 2026 – Jan 2027"', () => {
    const base = { state: { mode: 'league', layout: 'calendar', teamId: 1610612738, date: '2026-11-30', tvOnly: false, showRest: true, weeks: 1, teamSpan: 'month' }, leagueMonth: '2026-11', teamMonth: '2026-12', teamWeek: '2026-11-29', teamListMonth: '2026-12', teamListTo: '2027-01', cup: { tab: 'standings', list: 'league', by: 'group' }, at: '2026-11-30', label: '' } as ViewSnapshot;
    expect(pageTitle(base)).toBe('League · Nov 29 – Dec 5 — calendarkit');
    expect(pageTitle({ ...base, state: { ...base.state, mode: 'team', layout: 'list' } })).toBe('BOS schedule · Dec 2026 – Jan 2027 — calendarkit');
    expect(pageTitle({ ...base, state: { ...base.state, mode: 'team', teamSpan: 2 } })).toBe('BOS schedule · Nov 29 – Dec 12 — calendarkit');
    expect(pageTitle({ ...base, state: { ...base.state, mode: 'cup' }, cup: { ...base.cup, tab: 'history', hs: 2024 } })).toBe('Cup history · 2024 — calendarkit');
  });
});

describe('the app sets document.title on every navigation, back and forward included', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1600);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(raw), { status: 200 }));
    (window as { __ckOpenDate?: string }).__ckOpenDate = '2026-11-13';
    window.history.replaceState(null, '', '/calendar/?view=league&layout=list');
    document.title = 'calendarkit — NBA schedule';
  });
  afterEach(() => {
    delete (window as { __ckOpenDate?: string }).__ckOpenDate;
    vi.unstubAllGlobals();
  });

  it('load, a day step, a team, back, forward', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    await screen.findByRole('tablist', { name: 'Layout' });
    expect(document.title).toBe('League · Nov 13 — calendarkit');
    fireEvent.click(within(screen.getByTestId('date-block')).getByLabelText('Next day'));
    expect(document.title).toBe('League · Nov 14 — calendarkit');
    pickScope('Boston Celtics');
    expect(document.title).toMatch(/^BOS schedule · \w{3} 202\d — calendarkit$/);
    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    expect(document.title).toBe('League · Nov 14 — calendarkit');
    await act(async () => {
      window.history.forward();
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    expect(document.title).toMatch(/^BOS schedule · /);
  });
});
