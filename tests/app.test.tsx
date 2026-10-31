// @vitest-environment jsdom
// App shell: the "Rotations ↗" action is offered only once ROTATIONKIT_BASE_URL is a real URL.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import raw from './fixtures/feed-2026-10-23.json';
import { isRotationkitConfigured, ROTATIONKIT_PLACEHOLDER } from '../src/config';

// The shell reads its config through this mock so each test can pick the base URL.
const rk = vi.hoisted(() => ({ base: '' }));
vi.mock('../src/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config')>();
  return {
    ...real,
    get ROTATIONKIT_BASE_URL() {
      return rk.base;
    },
    isRotationkitConfigured: (base?: string) => real.isRotationkitConfigured(base ?? rk.base),
  };
});

const { App } = await import('../src/App');

// Oct 21 games are long over at this time; the app opens on that day through the e2e hook (the URL's date is ignored).
const NOW = Date.parse('2026-10-23T15:00:00Z');
const PAST_DAY_GAMES = (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[])
  .flatMap((d) => d.games)
  .filter((g) => g.gameDateEst.startsWith('2026-10-21') && g.gameId.startsWith('002'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(raw), { status: 200 }));
  window.history.replaceState(null, '', '/?view=league&date=2026-10-21');
});
afterEach(() => {
  delete (window as { __ckOpenDate?: string }).__ckOpenDate;
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The Oct 21 section (round 8: the only day the list shows).
const pastDay = () => document.querySelector<HTMLElement>('[data-day="2026-10-21"]')!;
const renderApp = async () => {
  (window as { __ckOpenDate?: string }).__ckOpenDate = '2026-10-21';
  render(<App />);
  await screen.findAllByRole('article');
  expect(within(pastDay()).getAllByRole('article')).toHaveLength(PAST_DAY_GAMES.length);
};

describe('isRotationkitConfigured', () => {
  it('false for the placeholder (or anything that is not an http(s) URL), true for a real URL', () => {
    expect(isRotationkitConfigured(ROTATIONKIT_PLACEHOLDER)).toBe(false);
    expect(isRotationkitConfigured('')).toBe(false);
    expect(isRotationkitConfigured('rotationkit.vercel.app')).toBe(false);
    expect(isRotationkitConfigured('https://rotationkit.vercel.app')).toBe(true);
    expect(isRotationkitConfigured('http://localhost:5173/')).toBe(true);
  });
});

describe('App: rotationkit action', () => {
  it('placeholder base URL: no Rotations action, even for finished games', async () => {
    rk.base = ROTATIONKIT_PLACEHOLDER;
    await renderApp();
    expect(screen.queryAllByTestId('open-game')).toHaveLength(0); // anywhere in the list
    expect(document.body.textContent).not.toMatch(/Rotations/);
  });

  it('real base URL: action on finished games, opens BASE/?game=<gameId> via onOpenGame', async () => {
    rk.base = 'https://rotationkit.example.app';
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderApp();
    const buttons = within(pastDay()).getAllByTestId('open-game');
    expect(buttons).toHaveLength(PAST_DAY_GAMES.length);
    const id = buttons[0]!.closest('article')!.getAttribute('data-game-id');
    fireEvent.click(buttons[0]!);
    expect(open).toHaveBeenCalledWith(`https://rotationkit.example.app/?game=${id}`, '_blank', 'noopener');
  });
});

describe('App: URL state for the List | Calendar switch', () => {
  const open = async (search: string) => {
    rk.base = ROTATIONKIT_PLACEHOLDER;
    window.history.replaceState(null, '', `/${search}`);
    render(<App />);
    await screen.findByRole('tablist', { name: 'Layout' });
  };
  const selected = (name: string) => screen.getByRole('tab', { name }).getAttribute('aria-selected') === 'true';

  it('old ?view=team links open Team → Calendar', async () => {
    await open('?view=team&team=BOS');
    expect(selected('Team') && selected('Calendar')).toBe(true);
    expect(screen.getByRole('region', { name: 'Celtics schedule' })).toBeTruthy();
  });

  it('old ?view=league links open League → List, on today: the date in the URL is ignored (round 6)', async () => {
    await open('?view=league&date=2026-11-14');
    expect(selected('League') && selected('List')).toBe(true);
    expect(screen.getByTestId('day-title').textContent).toMatch(/^Fri(day)?, Oct(ober)? 23, 2026$/); // NOW; jsdom has no width: compact title
  });

  it('a bookmark with an old date opens on today, in the List and in the week view; the rest of the URL still counts', async () => {
    await open('?view=league&layout=list&date=2026-10-22');
    expect(screen.getByTestId('day-title').textContent).toMatch(/^Fri(day)?, Oct(ober)? 23, 2026$/);
    cleanup();
    await open('?view=league&layout=calendar&date=2026-12-01&weeks=2');
    fireEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(window.location.search).toMatch(/weeks=2/); // kept from the URL
    expect(screen.getByTestId('day-title').textContent).toMatch(/^Fri(day)?, Oct(ober)? 23, 2026$/); // today, not the URL's Dec 1
    expect(window.location.search).not.toMatch(/date=/); // round 8: the day is never written to the URL
  });

  it('new links: ?view=team&layout=list and ?view=league&layout=calendar', async () => {
    await open('?view=team&layout=list&team=MIA');
    expect(screen.getByRole('region', { name: 'Heat games' })).toBeTruthy();
    cleanup();
    await open('?view=league&layout=calendar&date=2026-11-02');
    expect(screen.getByRole('region', { name: /^(League week|Month navigator)$/ })).toBeTruthy(); // by width
  });

  it('?weeks=2 opens two week rows; links without it get one week; the toggle writes it', async () => {
    const { readUrlState } = await import('../src/App');
    expect(readUrlState('?view=league&layout=calendar&date=2026-11-15&weeks=2')).toMatchObject({ mode: 'league', layout: 'calendar', date: '2026-11-15', weeks: 2 });
    expect(readUrlState('?view=league&layout=calendar&date=2026-11-15').weeks).toBeUndefined();
    expect(readUrlState('?view=league&date=2026-11-15')).toMatchObject({ layout: undefined, weeks: undefined }); // → List
    await open('?view=league&layout=calendar&date=2026-11-15&weeks=2');
    fireEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(window.location.search).toMatch(/weeks=2/); // kept for the next time the calendar opens
  });

  it('the layout and the TV filter are written to the URL and kept across League ↔ Team', async () => {
    await open('?view=league&date=2026-11-14');
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(window.location.search).toMatch(/view=league&layout=calendar/);
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(window.location.search).toMatch(/view=team&layout=calendar/);
    fireEvent.click(screen.getByLabelText('TV games only'));
    expect(window.location.search).toMatch(/tv=1/);
    fireEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(window.location.search).toMatch(/view=team&layout=list/);
    expect(window.location.search).toMatch(/tv=1/);
  });

  it('"Show rest days" is on at every load and never remembered: unchecking lasts until a reload (round 7, 2.2)', async () => {
    const { readUrlState } = await import('../src/App');
    // nothing in a link can force it either way (old links had rest=1; none had rest=0, but neither counts now)
    for (const q of ['', '&rest=1', '&rest=0']) expect(readUrlState(`?view=team&layout=list&team=BOS${q}`).showRest).toBeUndefined();
    // desktop width (jsdom has no layout: the shell would measure 0 px and use the phone layout, which has no toggle)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const box = () => screen.getByLabelText('Show rest days') as HTMLInputElement;
    for (const q of ['', '&rest=1', '&rest=0']) {
      await open(`?view=team&layout=list&team=BOS${q}`);
      expect(box().checked, `opened with "${q}"`).toBe(true);
      expect(document.querySelectorAll('[data-rest]').length).toBeGreaterThan(3); // one month's (round 9)
      cleanup();
    }
    localStorage.clear();
    sessionStorage.clear();
    await open('?view=team&layout=list&team=BOS');
    fireEvent.click(box());
    expect(box().checked).toBe(false);
    expect(document.querySelectorAll('[data-rest]')).toHaveLength(0);
    // stays off while the page is open (another team too), and nothing is saved anywhere
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(box().checked).toBe(false);
    expect(window.location.search).not.toMatch(/rest/);
    expect([localStorage.length, sessionStorage.length, document.cookie]).toEqual([0, 0, '']);
    // a reload (the same URL) brings it back on
    const url = window.location.search;
    cleanup();
    await open(url);
    expect(box().checked).toBe(true);
  });
});
