// @vitest-environment jsdom
// Streaks wherever a team's record or name has room — League List rows, Team Calendar cells (not the Cup standings:
// the groups and the simulator's tables, nor the Cup schedule's league lists) — all one component (StreakChip): the same rule (a final game's line
// includes it, a game to come shows the streak going in, a view without a game the current streak), the same colours,
// the same popup.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import CupSchedule from '../src/components/CupSchedule';
import { currentStreaks } from '../src/data/streak';
import { TEAMS } from '../src/data/teams';
import { dataOf, game as mk } from './synthetic';

afterEach(cleanup);

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const game = (s: Omit<Parameters<typeof mk>[0], 'utc'>) => mk({ ...s, utc: `${s.date}T23:00:00Z` } as Parameters<typeof mk>[0]);
const cup = { subtype: 'in-season', subLabel: 'East Group C' };

// final = [away, home]. BOS: L at NYK (Nov 3) · W · W · W (Nov 7, a Cup game) · Nov 9 to come (Cup).
// ATL: lost its only game (Nov 7). MIA: no result yet.
const G = [
  game({ date: '2026-11-03', home: ID.NYK!, away: ID.BOS!, final: [99, 111] }),
  game({ date: '2026-11-04', home: ID.BOS!, away: ID.DEN!, final: [104, 118] }),
  game({ date: '2026-11-05', home: ID.LAL!, away: ID.BOS!, final: [120, 108] }),
  game({ date: '2026-11-07', home: ID.BOS!, away: ID.ATL!, final: [97, 101], ...cup }),
  game({ date: '2026-11-09', home: ID.MIA!, away: ID.BOS!, ...cup }),
];
const data = dataOf(G);
const SIZE = { width: 1920, height: 1000 };
const NOW = Date.parse('2026-11-08T15:00:00Z');
const streakOf = (root: ParentNode, gameId: string, testId: string) =>
  [...root.querySelectorAll<HTMLElement>(`[data-game-id="${gameId}"] [data-testid="${testId}"]`)].map((e) => [e.textContent, e.className.match(/ck-streak-[wl]/)?.[0] ?? '', e.dataset.streak ?? '']);

describe('currentStreaks', () => {
  it('each team’s streak through its last final game', () => {
    const s = currentStreaks(data);
    expect(s.get(ID.BOS!)).toEqual({ kind: 'W', n: 3 });
    expect(s.get(ID.ATL!)).toEqual({ kind: 'L', n: 1 });
    expect(s.get(ID.MIA!)).toBeUndefined();
  });
});

describe('League List rows', () => {
  it('each team’s streak outside its record: through a final game, going into one to come', () => {
    const { container, unmount } = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ date: '2026-11-07' }} />);
    expect(streakOf(container, G[3]!.gameId, 'row-streak')).toEqual([
      ['L1', 'ck-streak-l', `${ID.ATL}|${G[3]!.gameId}`],
      ['W3', 'ck-streak-w', `${ID.BOS}|${G[3]!.gameId}`],
    ]);
    unmount();
    const c2 = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ date: '2026-11-09' }} />).container;
    // BOS going in: W3; MIA has no result yet: an empty slot, no popup
    expect(streakOf(c2, G[4]!.gameId, 'row-streak')).toEqual([
      ['W3', 'ck-streak-w', `${ID.BOS}|${G[4]!.gameId}`],
      ['', '', ''],
    ]);
  });
  it('hover opens the streak popup with its games', () => {
    const { container } = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ date: '2026-11-09' }} gameLink={(g) => `https://hj.test/${g.gameId}`} />);
    fireEvent.mouseOver(container.querySelector(`[data-game-id="${G[4]!.gameId}"] [data-streak]`)!);
    expect(screen.getAllByTestId('streak-row')).toHaveLength(3);
    expect(screen.getAllByTestId('streak-row')[0]!.querySelector('a')!.getAttribute('href')).toBe(`https://hj.test/${G[3]!.gameId}`);
  });
});

describe('Team Calendar cells', () => {
  it('the team’s streak in the tags, by the same rule', () => {
    const { container } = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: ID.BOS, date: '2026-11-08' }} />);
    expect(streakOf(container, G[0]!.gameId, 'cell-streak')).toEqual([['L1', 'ck-streak-l', `${ID.BOS}|${G[0]!.gameId}`]]);
    expect(streakOf(container, G[3]!.gameId, 'cell-streak')).toEqual([['W3', 'ck-streak-w', `${ID.BOS}|${G[3]!.gameId}`]]);
    expect(streakOf(container, G[4]!.gameId, 'cell-streak')).toEqual([['W3', 'ck-streak-w', `${ID.BOS}|${G[4]!.gameId}`]]);
  });
});

describe('Cup views', () => {
  it('groups: no streaks in the standings rows', async () => {
    const { container } = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'cup' }} />);
    await screen.findAllByTestId('cup-group');
    expect(container.querySelector('[data-testid="cup-group"] [data-team="BOS"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="cup-group"] [data-streak]')).toHaveLength(0);
  });
  it('schedule (league lists): no streaks — four columns of one-line rows, every game on one screen', () => {
    const d = render(<CupSchedule data={data} list="league" by="date" size={SIZE} now={NOW} today="2026-11-07" timeZone="UTC" />).container;
    expect(d.querySelectorAll('[data-streak]')).toHaveLength(0);
    cleanup();
    const g = render(<CupSchedule data={data} list="league" by="group" size={SIZE} now={NOW} today="2026-11-07" timeZone="UTC" />).container;
    expect(g.querySelectorAll('[data-testid="cg-streak"]')).toHaveLength(0);
  });
  it('simulator tables: no streaks', async () => {
    const { container } = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'cup', cup: { tab: 'simulator' } }} />);
    await screen.findAllByTestId('sim-group');
    expect(container.querySelector('[data-testid="sim-group"] [data-team="BOS"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="sim-group"] [data-streak]')).toHaveLength(0);
  });
});
