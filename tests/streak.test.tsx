// @vitest-environment jsdom
// The streak popup — exactly the streak's games, newest first, for W and L streaks and a 1-game one;
// each row: date, vs / @ + the opponent (team link), "W 118–104, +14", OT; each game a new-tab hoopsjunkie link; it
// opens on hover of a streak and stays while the pointer is in it; never in a copy.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { streakGames } from '../src/data/streak';
import { StreakList } from '../src/slate/streakPopup';
import { dataOf, game as mk, TEAM as T } from './synthetic';
import { TEAMS } from '../src/data/teams';

const TEAM = { ...T, ATL: TEAMS.find((t) => t.tricode === 'ATL')!.id, CHI: TEAMS.find((t) => t.tricode === 'CHI')!.id };
const game = (s: Omit<Parameters<typeof mk>[0], 'utc'>) => mk({ ...s, utc: `${s.date}T23:00:00Z` } as Parameters<typeof mk>[0]);

afterEach(cleanup);

// final = [away, home]. BOS: W in OT (Nov 1) · L at NYK · W +14 · W +12 at LAL · W +4, then a game to come on Nov 9
const G = [
  game({ date: '2026-11-01', home: TEAM.BOS, away: TEAM.MIA, final: [100, 102], raw: { gameStatusText: 'Final/OT' } }),
  game({ date: '2026-11-03', home: TEAM.NYK, away: TEAM.BOS, final: [99, 111] }),
  game({ date: '2026-11-04', home: TEAM.BOS, away: TEAM.DEN, final: [104, 118] }),
  game({ date: '2026-11-06', home: TEAM.LAL, away: TEAM.BOS, final: [120, 108] }),
  game({ date: '2026-11-07', home: TEAM.BOS, away: TEAM.ATL, final: [97, 101] }),
  game({ date: '2026-11-09', home: TEAM.BOS, away: TEAM.MIA }),
];
const data = dataOf(G);

describe('streakGames', () => {
  it('a 3-game winning streak going into the next game: those 3, newest first', () => {
    const s = streakGames(data, TEAM.BOS, G[5]!.gameId);
    expect(s.map((x) => x.game.dateEt)).toEqual(['2026-11-07', '2026-11-06', '2026-11-04']);
    expect(s.every((x) => x.win)).toBe(true);
  });
  it('a losing streak, and 1-game streaks', () => {
    // A final game's streak includes it — through Nov 3: L1 (lost at NYK; the OT win before it is another streak)
    expect(streakGames(data, TEAM.BOS, G[1]!.gameId).map((x) => [x.game.dateEt, x.win])).toEqual([['2026-11-03', false]]);
    // through Nov 1: W1 (its first game, a win → W1); through Nov 4: W1 again (win after a loss)
    expect(streakGames(data, TEAM.BOS, G[0]!.gameId).map((x) => [x.game.dateEt, x.win])).toEqual([['2026-11-01', true]]);
    expect(streakGames(data, TEAM.BOS, G[2]!.gameId).map((x) => [x.game.dateEt, x.win])).toEqual([['2026-11-04', true]]);
    // through Nov 6: W2; through Nov 7: W3 = the game to come on Nov 9 (its streak going in, the current one)
    expect(streakGames(data, TEAM.BOS, G[3]!.gameId)).toHaveLength(2);
    expect(streakGames(data, TEAM.BOS, G[4]!.gameId)).toEqual(streakGames(data, TEAM.BOS, G[5]!.gameId));
    // DEN lost its only game: L1
    expect(streakGames(data, TEAM.DEN).map((x) => [x.game.dateEt, x.win])).toEqual([['2026-11-04', false]]);
    // NYK: W1, current
    expect(streakGames(data, TEAM.NYK).map((x) => x.win)).toEqual([true]);
    // MIA lost Nov 1 (in OT): L1, with the OT marked
    const mia = streakGames(data, TEAM.MIA);
    expect(mia.map((x) => [x.win, x.ot, x.score, x.oppScore, x.home])).toEqual([[false, 'OT', 100, 102, false]]);
    // a team with no result yet: no streak
    expect(streakGames(data, TEAM.CHI)).toEqual([]);
  });
});

describe('the popup', () => {
  it('rows: date, vs / @ + opponent, "W 101–97, +4", OT; each game a new-tab link', () => {
    render(<StreakList data={data} teamId={TEAM.BOS} gameId={G[5]!.gameId} gameLink={(g) => `https://hj.test/${g.gameId}`} />);
    const rows = screen.getAllByTestId('streak-row');
    expect(rows.map((r) => r.textContent)).toEqual(['vsATLSat, Nov 7W 101–97, +4', '@LALFri, Nov 6W 120–108, +12', 'vsDENWed, Nov 4W 118–104, +14']);
    for (const r of rows) {
      const a = r.querySelector<HTMLAnchorElement>('a.ck-streak-game')!;
      expect([a.target, a.href]).toEqual(['_blank', `https://hj.test/${r.dataset.gameId}`]);
    }
    expect(screen.getByText(/3-game winning streak/)).toBeTruthy();
    cleanup();
    render(<StreakList data={data} teamId={TEAM.MIA} />);
    expect(screen.getByTestId('streak-row').textContent).toBe('@BOSSun, Nov 1L 102–100, −2OT');
    expect(screen.getByText(/1-game losing streak/)).toBeTruthy();
  });

  it('opens on hover of a Team List streak, stays while the pointer is in it, closes after leaving; not in copies', async () => {
    render(<CalendarView data={data} size={{ width: 1600, height: 1000 }} now={Date.parse('2026-11-08T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} gameLink={(g) => `https://hj.test/${g.gameId}`} />);
    const streak = document.querySelector<HTMLElement>(`[data-game-id="${G[5]!.gameId}"] [data-streak]`)!;
    expect(streak.textContent).toBe('W3');
    fireEvent.mouseOver(streak);
    const pop = screen.getByTestId('streak-popup');
    expect(pop.dataset.captureExclude).toBe('true');
    expect(screen.getAllByTestId('streak-row')).toHaveLength(3);
    expect(screen.queryByTestId('tooltip')).toBeNull(); // the popup, not the season line's tooltip
    // into the popup: still open
    fireEvent.mouseOver(pop.querySelector('a')!);
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect(screen.getByTestId('streak-popup')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId('streak-popup'));
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect(screen.queryByTestId('streak-popup')).toBeNull();
  });
});
