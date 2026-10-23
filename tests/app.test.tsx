// @vitest-environment jsdom
// App shell: the "Rotations ↗" action is offered only once ROTATIONKIT_BASE_URL is a real URL.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const renderApp = async () => {
  render(<App />);
  await screen.findAllByRole('article');
  expect(screen.getAllByRole('article')).toHaveLength(PAST_DAY_GAMES.length);
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
    expect(screen.queryAllByTestId('open-game')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Rotations/);
  });

  it('real base URL: action on finished games, opens BASE/?game=<gameId> via onOpenGame', async () => {
    rk.base = 'https://rotationkit.example.app';
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderApp();
    const buttons = screen.getAllByTestId('open-game');
    expect(buttons).toHaveLength(PAST_DAY_GAMES.length);
    const id = buttons[0]!.closest('article')!.getAttribute('data-game-id');
    fireEvent.click(buttons[0]!);
    expect(open).toHaveBeenCalledWith(`https://rotationkit.example.app/?game=${id}`, '_blank', 'noopener');
  });
});
