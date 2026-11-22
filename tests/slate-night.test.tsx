// @vitest-environment jsdom
// CK-34: the Slate kit gives a night as a list (id, exact start instant) and one game's card on its own — the same
// card the whole-night Slate draws.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { slateNight } from '../src/slate/night';
import { SlateDay, SlateGame } from '../src/slate/SlateCard';
import { slateCardWidth, SLATE_CARD_WIDTH } from '../src/slate/layout';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

describe('slateNight', () => {
  const DATE = '2026-11-19';
  const a = game({ date: DATE, utc: '2026-11-20T03:30:00Z', away: TEAM.LAL, home: TEAM.MIA });
  const b = game({ date: DATE, utc: null, away: TEAM.NYK, home: TEAM.BOS });
  const c = game({ date: DATE, utc: '2026-11-20T00:00:00Z', away: TEAM.BOS, home: TEAM.DEN });
  const d = game({ date: DATE, utc: '2026-11-20T00:00:00Z', away: TEAM.DEN, home: TEAM.NYK, natl: ['ESPN'] });

  it('start-time order, each with its id and its start as an exact instant; a game without a time comes last', () => {
    const night = slateNight(dataOf([a, b, c, d]), DATE);
    expect(night.map((g) => g.id)).toEqual([c.gameId, d.gameId, a.gameId, b.gameId]);
    expect(night.map((g) => g.start)).toEqual([Date.parse('2026-11-20T00:00:00Z'), Date.parse('2026-11-20T00:00:00Z'), Date.parse('2026-11-20T03:30:00Z'), undefined]);
    expect(night.map((g) => g.startIso)).toEqual(['2026-11-20T00:00:00.000Z', '2026-11-20T00:00:00.000Z', '2026-11-20T03:30:00.000Z', undefined]);
    expect(night[0]!.game.gameId).toBe(c.gameId);
  });

  it('TV games only when filtered; [] on a day without games', () => {
    expect(slateNight(dataOf([a, b, c, d]), DATE, true).map((g) => g.id)).toEqual([d.gameId]);
    expect(slateNight(dataOf([a]), '2026-07-01')).toEqual([]);
  });

  it('every night of the season: the Slate’s games, none lost, never out of start order', () => {
    for (const [date, games] of data.byDate) {
      const night = slateNight(data, date);
      expect(night.map((g) => g.id).sort()).toEqual(games.map((g) => g.gameId).sort());
      const starts = night.map((g) => g.start ?? Infinity);
      expect(starts).toEqual([...starts].sort((x, y) => x - y));
      for (const g of night) if (g.start !== undefined) expect(new Date(g.startIso!).getTime()).toBe(g.start);
    }
  });
});

describe('SlateGame', () => {
  // a regular night and a Cup group night of the snapshot
  const regular = [...data.byDate].find(([, games]) => games.length >= 5 && games.every((g) => !g.isCupGroupGame && !g.isCupKnockout))![0];
  const cupNight = [...data.byDate].find(([, games]) => games.some((g) => g.isCupGroupGame))![0];

  const dayCards = (date: string) => {
    const { container, unmount } = render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
    const html = new Map([...container.querySelectorAll('.ck-slate-card')].map((c) => [c.getAttribute('data-game-id')!, c.outerHTML]));
    unmount();
    return html;
  };

  for (const [name, date] of [['a regular night', regular], ['a Cup night', cupNight]] as const)
    it(`${name}: each card drawn alone is the card the whole-night Slate draws`, () => {
      const day = dayCards(date);
      for (const g of slateNight(data, date)) {
        const { container, unmount } = render(<SlateGame data={data} game={g.game} timeZone="UTC" />);
        const one = container.querySelector('[data-testid="slate-one"]')!;
        expect(one.children).toHaveLength(1);
        expect(one.firstElementChild!.outerHTML).toBe(day.get(g.id));
        unmount();
      }
    });

  it('its box is the info-only card’s width (509 px; the night’s Cup track on a Cup night)', () => {
    expect(SLATE_CARD_WIDTH).toBe(509);
    const { container } = render(<SlateGame data={data} game={data.byDate.get(regular)![0]!} timeZone="UTC" />);
    expect((container.querySelector('[data-testid="slate-one"]') as HTMLElement).style.width).toBe('509px');
    cleanup();
    const cup = render(<SlateGame data={data} game={data.byDate.get(cupNight)![0]!} timeZone="UTC" />);
    const box = cup.container.querySelector('[data-testid="slate-one"]') as HTMLElement;
    expect(box.style.width).toBe(`${slateCardWidth(Number(box.getAttribute('data-cup')) as 1 | 2 | 3)}px`);
  });
});
