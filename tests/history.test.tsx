// @vitest-environment jsdom
// Round 21 (item 6): every page has its own address and history entry. URL ↔ state round-trips for every view; which
// changes are new pages (push) and which are day steps (replace); back / forward put the whole page back; the in-app
// ← → follow the history (greyed out at the ends, tooltips naming the page). Scroll restore on a real layout:
// e2e/history.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUrlState, urlOf } from '../src/App';
import { CalendarView, type CalendarHandle, type ViewSnapshot } from '../src/components/CalendarView';
import { data } from './feed';
import { goTo, pickScope } from './nav';
import raw from './fixtures/feed-2026-10-23.json';
import { TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const tabs = (name: string) => within(screen.getByRole('tablist', { name }));
const click = (list: string, name: string) => fireEvent.click(tabs(list).getByRole('tab', { name }));

/** A widget that records what it tells the host. */
function open(initial = {}) {
  const calls: { snap: ViewSnapshot; how: 'push' | 'replace'; prev?: ViewSnapshot }[] = [];
  const handle = createRef<CalendarHandle>();
  render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={initial} handle={handle} onNavigate={(snap, how, prev) => calls.push({ snap, how, prev })} />);
  return { calls, handle, last: () => calls.at(-1)! };
}

describe('URL ↔ state round-trips', () => {
  const views: [string, () => void][] = [
    ['league list', () => {}],
    ['league slate', () => click('Layout', 'Slate')],
    ['league week', () => click('Layout', 'Calendar')],
    ['league 2 weeks', () => click('Weeks', '2 weeks')],
    ['TV only', () => fireEvent.click(screen.getByLabelText('TV games only'))],
    ['team calendar', () => pickScope('Boston Celtics')],
    ['team 1 week', () => click('Span', '1 week')],
    ['team 2 weeks', () => click('Span', '2 weeks')],
    ['team list', () => click('Layout', 'List')],
    ['cup groups', () => goTo('Cup')],
    ['cup schedule', () => click('Cup view', 'Schedule')],
    ['cup by date', () => click('Cup layout', 'By date')],
    ['cup team', () => click('Cup list', 'Team')],
    ['standings', () => goTo('Standings')],
  ];
  it('each view: its address read back gives the same view (date aside: a load opens on today)', async () => {
    const { last } = open();
    for (const [name, go] of views) {
      go();
      await act(async () => {});
      const snap = last().snap;
      const url = urlOf(snap, '/calendar/');
      const back = readUrlState(url.slice(url.indexOf('?')));
      const s = snap.state;
      expect(back.mode, name).toBe(s.mode);
      if (s.mode === 'team' || s.mode === 'league') {
        expect(back.layout, name).toBe(s.layout);
        expect(new URLSearchParams(url.split('?')[1]).get('date'), name).toBe(snap.at);
      }
      if (s.mode === 'team') expect(back.teamId, name).toBe(s.teamId);
      expect(!!back.tvOnly, name).toBe(s.tvOnly);
      expect(back.weeks ?? 1, name).toBe(s.weeks);
      expect(back.teamSpan ?? 'month', name).toBe(s.teamSpan);
      if (s.mode === 'cup') {
        expect(back.cup?.tab, name).toBe(snap.cup.tab);
        if (snap.cup.tab === 'schedule') expect(back.cup?.list, name).toBe(snap.cup.list);
        if (snap.cup.tab === 'schedule' && snap.cup.list === 'league') expect(back.cup?.by, name).toBe(snap.cup.by);
      }
    }
  });

  it('the Cup Team list’s team is in the address (ct=)', () => {
    const url = urlOf({ state: { mode: 'cup', layout: 'list', teamId: TEAM.BOS, date: '2026-11-15', tvOnly: false, showRest: true, weeks: 1, teamSpan: 'month' }, cup: { tab: 'schedule', list: 'team', by: 'group', teamId: TEAM.MIA }, leagueMonth: '2026-11', teamMonth: '2026-11', teamWeek: '2026-11-15', teamListMonth: '2026-11', at: '2026-11-15', label: '' }, '/calendar/');
    expect(url).toBe('/calendar/?view=cup&cup=schedule&cl=team&ct=MIA');
    expect(readUrlState('?view=cup&cup=schedule&cl=team&ct=MIA').cup).toEqual({ tab: 'schedule', list: 'team', by: 'group', teamId: TEAM.MIA });
  });

  it('an address opens that view (the Cup sub-view too); its date is still ignored on load (round 6)', async () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={readUrlState('?view=cup&cup=schedule&cl=league&by=date')} />);
    await screen.findByTestId('cup-league');
    expect(screen.getByTestId('cup-league').dataset.by).toBe('date');
  });
});

describe('push or replace', () => {
  it('the first page replaces; a destination, a team, a view, an option are new pages; ‹ › and ← → replace', () => {
    const { calls } = open({ date: '2026-11-15' });
    expect(calls.map((c) => c.how)).toEqual(['replace']);
    fireEvent.click(screen.getByLabelText('Next day'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(calls.map((c) => c.how)).toEqual(['replace', 'replace', 'replace']);
    expect(calls.at(-1)!.snap.state.date).toBe('2026-11-17');
    click('Layout', 'Slate');
    fireEvent.click(screen.getByLabelText('TV games only'));
    pickScope('Boston Celtics');
    goTo('Cup');
    expect(calls.slice(3).map((c) => c.how)).toEqual(['push', 'push', 'push', 'push']);
  });

  it('a picked date and Today are new pages', () => {
    const { calls } = open({ date: '2026-11-15' });
    fireEvent.click(screen.getByTestId('date-pick'));
    fireEvent.click(screen.getByRole('dialog').querySelector<HTMLElement>('[data-date="2026-11-20"]')!);
    expect(calls.at(-1)!.how).toBe('push');
    expect(calls.at(-1)!.snap.state.date).toBe('2026-11-20');
    fireEvent.click(screen.getByTestId('today'));
    expect(calls.at(-1)!.how).toBe('push');
    expect(calls.at(-1)!.snap.state.date).toBe('2026-11-15');
  });

  it('a push hands over the page being left, as it was', () => {
    const { last } = open({ date: '2026-11-15' });
    click('Layout', 'Slate');
    const { prev, snap } = last();
    expect(prev!.state.layout).toBe('list');
    expect(snap.state.layout).toBe('slate');
    expect(prev!.label).toBe('All teams, List · Sun, Nov 15, 2026');
  });

  it('labels: "Boston Celtics, Nov 2026", "Cup · Groups", "Standings"', () => {
    const { last } = open({ date: '2026-11-15' });
    pickScope('Boston Celtics');
    expect(last().snap.label).toMatch(/^Boston Celtics, \w{3} 2026$/);
    goTo('Cup');
    expect(last().snap.label).toBe('Cup · Groups');
    goTo('Standings');
    expect(last().snap.label).toBe('Standings');
  });
});

describe('Alt+← / Alt+→ stay the browser’s', () => {
  it('the day keys leave Alt+arrows alone (not prevented, the day doesn’t move)', () => {
    const { calls } = open({ date: '2026-11-15', layout: 'slate' });
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      const e = new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
    expect(calls).toHaveLength(1);
    expect(screen.getByTestId('day-title').textContent).toBe('Sunday, November 15, 2026');
  });
});

describe('restore', () => {
  it('puts a page back as it was — view, team, date, options, Cup sub-view — and tells nothing', async () => {
    const { calls, handle } = open({ date: '2026-11-15' });
    click('Layout', 'Calendar');
    click('Weeks', '2 weeks');
    const week2 = calls.at(-1)!.snap;
    goTo('Cup');
    click('Cup view', 'Schedule');
    click('Cup layout', 'By date');
    await screen.findByTestId('cup-league');
    const cupByDate = calls.at(-1)!.snap;

    goTo('Schedule');
    pickScope('Miami Heat');
    const n = calls.length;
    act(() => handle.current!.restore(week2));
    expect(screen.getByRole('region', { name: 'League week' }).getAttribute('data-weeks')).toBe('2');
    expect(within(screen.getByTestId('date-block')).getByTestId('period-title').textContent).toBe('Nov 15 – 28, 2026');
    act(() => handle.current!.restore(cupByDate));
    await screen.findByTestId('cup-league');
    expect(screen.getByTestId('cup-league').dataset.by).toBe('date');
    expect(calls.length).toBe(n); // restores are not new pages
    // and the next change after a restore is told again
    goTo('Standings');
    expect(calls.length).toBe(n + 1);

  });
});

describe('the app: real history entries and the in-app ← →', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1600);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(raw), { status: 200 }));
    window.history.replaceState(null, '', '/calendar/?view=league&layout=list');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pushes pages; back / forward restore them; the arrows grey out at the ends and name the page', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    await screen.findByRole('tablist', { name: 'Layout' });
    const back = () => screen.getByTestId('page-back') as HTMLButtonElement;
    const fwd = () => screen.getByTestId('page-forward') as HTMLButtonElement;
    expect([back().disabled, fwd().disabled]).toEqual([true, true]);
    const start = window.history.length;
    click('Layout', 'Calendar');
    expect(window.history.length).toBe(start + 1);
    expect(window.location.search).toMatch(/layout=calendar/);
    expect(back().disabled).toBe(false);
    expect(back().title).toMatch(/^Back to All teams, List · /);
    pickScope('Boston Celtics');
    expect(window.location.search).toMatch(/view=team&layout=calendar&team=BOS/);
    // back: the league calendar again (popstate)
    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    expect(screen.queryByTestId('team-header')).toBeNull();
    expect(tabs('Layout').getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected')).toBe('true');
    expect(fwd().disabled).toBe(false);
    expect(fwd().title).toMatch(/^Forward to Boston Celtics, /);
    // the in-app → goes forward
    await act(async () => {
      fireEvent.click(fwd());
      await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    });
    expect(screen.getByTestId('team-header')).toBeTruthy();
    expect(fwd().disabled).toBe(true);
    // a day step doesn't add an entry
    const len = window.history.length;
    fireEvent.click(within(screen.getByTestId('date-block')).getByLabelText(/^Next /));
    expect(window.history.length).toBe(len);
  });

  it('the ← → look unlike the day arrows: their own group at the far left of row 1', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    await screen.findByRole('tablist', { name: 'Layout' });
    const group = screen.getByTestId('page-history');
    expect(screen.getByTestId('bar-global').firstElementChild).toBe(group);
    expect([...group.querySelectorAll('button')].map((b) => [b.textContent, b.className])).toEqual([
      ['←', 'ck-hist-btn'],
      ['→', 'ck-hist-btn'],
    ]);
    expect(within(screen.getByTestId('date-block')).getAllByRole('button').filter((b) => b.classList.contains('ck-hist-btn'))).toEqual([]);
  });
});
