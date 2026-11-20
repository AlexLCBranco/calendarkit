// @vitest-environment jsdom
// The tooltip day strips (3-in-4 stretch, road trip / homestand): bigger squares with the matchup ("vs NYK" /
// "@ LAL", the opponent's logo) on game days, rest days empty, tonight highlighted; a game square is the game's
// hoopsjunkie page, and the tooltip stays while the pointer moves onto it. The season-series popup's squares say
// where each meeting is played ("BOS @ DEN" with the home logo). The always-visible chips don't change.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { STRIP_CLOSE_MS } from '../src/slate/tooltip';
import { stripGamesOf } from '../src/slate/stripGames';
import { dataOf, game as mk, TEAM } from './synthetic';

afterEach(cleanup);

const game = (s: Omit<Parameters<typeof mk>[0], 'utc'>) => mk({ ...s, utc: `${s.date}T23:00:00Z` } as Parameters<typeof mk>[0]);
// BOS: vs NYK Nov 1, @ LAL Nov 2, vs DEN Nov 4 — 3 games in 4 days, Nov 3 a rest day
const G = [
  game({ date: '2026-11-01', home: TEAM.BOS, away: TEAM.NYK }),
  game({ date: '2026-11-02', home: TEAM.LAL, away: TEAM.BOS }),
  game({ date: '2026-11-04', home: TEAM.BOS, away: TEAM.DEN }),
];
const data = dataOf(G);
const link = (g: { gameId: string }) => `https://hj.test/${g.gameId}`;
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe('stripGamesOf', () => {
  it('each game day from the shared team’s side, with its page', () => {
    const m = stripGamesOf(data, link)(G.map((g) => g.gameId))!;
    expect([...m]).toEqual([
      ['2026-11-01', { at: 'vs', opponentId: TEAM.NYK, opponent: 'NYK', url: link(G[0]!), game: G[0] }],
      ['2026-11-02', { at: '@', opponentId: TEAM.LAL, opponent: 'LAL', url: link(G[1]!), game: G[1] }],
      ['2026-11-04', { at: 'vs', opponentId: TEAM.DEN, opponent: 'DEN', url: link(G[2]!), game: G[2] }],
    ]);
    expect(stripGamesOf(data, link)([G[0]!.gameId])).toBeUndefined(); // one game: whose side is unknown
  });
});

describe('the day strip in the tooltip', () => {
  const open = () => {
    render(<CalendarView data={data} size={{ width: 1600, height: 1000 }} now={Date.parse('2026-10-30T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} gameLink={link} />);
    // the 3-in-4 chip of BOS's Nov 2 game (2nd of the stretch)
    const chip = document.querySelector<HTMLElement>(`[data-game-id="${G[1]!.gameId}"] [data-tip-days][data-tip-games]`)!;
    fireEvent.mouseOver(chip);
    return chip;
  };
  it('a square per day: the matchup on game days (links), the rest day empty, tonight highlighted', () => {
    open();
    const days = [...screen.getByTestId('tooltip').querySelectorAll<HTMLElement>('[data-testid="tip-day"]')];
    expect(days.map((d) => [d.dataset.date, d.dataset.kind, d.querySelector('.ck-tip-sq')!.textContent!.trim()])).toEqual([
      ['2026-11-01', 'game', 'vs NYK'],
      ['2026-11-02', 'tonight', '@ LAL'],
      ['2026-11-03', 'rest', ''],
      ['2026-11-04', 'game', 'vs DEN'],
    ]);
    const links = [...screen.getByTestId('tooltip').querySelectorAll<HTMLAnchorElement>('a[data-testid="tip-game"]')];
    expect(links.map((a) => [a.getAttribute('href'), a.target])).toEqual(G.map((g) => [link(g), '_blank']));
    expect(days[2]!.querySelector('a')).toBeNull();
    expect(days[0]!.querySelector('img')).toBeTruthy(); // the opponent's logo
  });
  it('stays while the pointer moves onto it; closes after it leaves', async () => {
    const chip = open();
    const tip = screen.getByTestId('tooltip');
    fireEvent.mouseLeave(chip.closest('.ck-root')!);
    fireEvent.mouseEnter(tip);
    fireEvent.mouseOver(tip.querySelector('a')!);
    await wait(STRIP_CLOSE_MS + 60);
    expect(screen.getByTestId('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId('tooltip'));
    expect(screen.getByTestId('tooltip')).toBeTruthy(); // a moment, to cross the gap to the next square
    await wait(STRIP_CLOSE_MS + 60);
    expect(screen.queryByTestId('tooltip')).toBeNull();
  });
  it('a text tooltip without a strip still closes at once', () => {
    render(<CalendarView data={data} size={{ width: 1600, height: 1000 }} now={Date.parse('2026-10-30T15:00:00Z')} timeZone="UTC" />);
    const el = document.createElement('span');
    el.setAttribute('data-tip', 'plain');
    document.querySelector('.ck-root')!.appendChild(el);
    fireEvent.mouseOver(el);
    expect(screen.getByTestId('tooltip').textContent).toBe('plain');
    fireEvent.mouseLeave(document.querySelector('.ck-root')!);
    expect(screen.queryByTestId('tooltip')).toBeNull();
  });
});

describe('season-series popup squares', () => {
  it('each meeting says where it is played, with the home team’s logo', () => {
    const S = [
      game({ date: '2026-11-01', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
      game({ date: '2026-11-20', home: TEAM.NYK, away: TEAM.BOS }),
    ];
    render(<CalendarView data={dataOf(S)} size={{ width: 1600, height: 1000 }} now={Date.parse('2026-11-10T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} gameLink={link} />);
    fireEvent.mouseOver(document.querySelector(`[data-game-id="${S[1]!.gameId}"] [data-testid="series-chip"]`)!);
    const sq = [...screen.getByTestId('series-popup').querySelectorAll<HTMLElement>('[data-testid="series-match"]')];
    expect(sq.map((s) => s.textContent)).toEqual(['NYK @ BOS', 'BOS @ NYK']);
    expect(sq.every((s) => s.querySelector('img'))).toBe(true);
  });
});
