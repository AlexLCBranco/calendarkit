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

// Oct 21 games are long over at this time; the app opens on that day via the URL.
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
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The list is continuous: count the Oct 21 section only.
const pastDay = () => document.querySelector<HTMLElement>('[data-day="2026-10-21"]')!;
const renderApp = async () => {
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

  it('old ?view=league links open League → List at the date', async () => {
    await open('?view=league&date=2026-11-14');
    expect(selected('League') && selected('List')).toBe(true);
    expect(screen.getByTestId('day-title').textContent).toMatch(/^Sat(urday)?, Nov(ember)? 14, 2026$/); // jsdom has no width: compact title
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

  it('rest=1 round-trips: read, written by the toggle, kept across team changes; old links stay off', async () => {
    const { readUrlState } = await import('../src/App');
    expect(readUrlState('?view=team&layout=list&team=BOS&rest=1').showRest).toBe(true);
    expect(readUrlState('?view=team&layout=list&team=BOS').showRest).toBeUndefined();
    // desktop width (jsdom has no layout: the shell would measure 0 px and use the phone layout, which has no toggle)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    await open('?view=team&layout=list&team=BOS');
    expect((screen.getByLabelText('Show rest days') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Show rest days'));
    expect(window.location.search).toMatch(/rest=1/);
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(window.location.search).toMatch(/team=MIA.*rest=1/);
    cleanup();
    await open('?view=team&layout=list&team=MIA&rest=1');
    expect((screen.getByLabelText('Show rest days') as HTMLInputElement).checked).toBe(true);
    expect(document.querySelectorAll('[data-rest]').length).toBeGreaterThan(60);
  });
});
