// @vitest-environment jsdom
// CK-16: the cold-weather flag — the threshold rule, the 30 arenas' coordinates, the Open-Meteo request and answer,
// and the mark on the card / the line in the game's pop-up.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { coldOf, coldRequest, COLD_FEELS_LIKE_C, fmtTemp, isCold } from '../src/data/cold';
import { arenaOf, homeArena } from '../src/data/geo';
import { TEAMS } from '../src/data/teams';
import { SlateCopy, SlateDay } from '../src/slate/SlateCard';
import { createColdStore } from '../src/slate/weather';
import { useGameLinksPopup } from '../src/slate/gameLinks';
import type { CalendarData } from '../src/data/model';
import type { SlateCold } from '../src/slate/weather';
import { data } from './feed';

afterEach(cleanup);

describe('the rule', () => {
  it('flagged at or below −10 °C feels-like, in one constant', () => {
    expect(COLD_FEELS_LIKE_C).toBe(-10);
    expect(isCold(-10)).toBe(true);
    expect(isCold(-14.6)).toBe(true);
    expect(isCold(-9.9)).toBe(false);
    expect(isCold(5)).toBe(false);
    expect(isCold(undefined)).toBe(false);
    expect(fmtTemp(-14.6)).toBe('−15 °C');
  });
  it('all 30 home arenas have coordinates, each with its source', () => {
    for (const t of TEAMS) {
      const a = homeArena(data, t.id);
      expect(a, t.tricode).toBeTruthy();
      expect(Number.isFinite(a!.lat) && Number.isFinite(a!.lon), t.tricode).toBe(true);
      expect(a!.source, t.tricode).toMatch(/^wikidata:Q\d+@\d+$/);
    }
  });
});

const date = [...data.byDate.keys()].sort()[20]!;
const games = data.byDate.get(date)!;

describe('Open-Meteo', () => {
  it('one request for the night: every placed game, feels-like hourly, the ET date to two days on', () => {
    const u = new URL(coldRequest(date, games)!);
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('hourly')).toBe('apparent_temperature');
    expect(u.searchParams.get('latitude')!.split(',')).toHaveLength(games.filter((g) => arenaOf(g) && g.startTimeUtc).length);
    expect(u.searchParams.get('start_date')).toBe(date);
  });
  it('the answer: the tip-off hour of each game', () => {
    const g = games.find((x) => x.startTimeUtc && arenaOf(x))!;
    const placed = games.filter((x) => arenaOf(x) && x.startTimeUtc);
    const hour = g.startTimeUtc!.slice(0, 13);
    const answer = placed.map((x) => ({ hourly: { time: [`${hour}:00`, 'x'], apparent_temperature: [x === g ? -18 : 3, 0] } }));
    const m = coldOf(games, answer);
    expect(m.get(g.gameId)).toBe(-18);
  });
});

/** A store that answers at once with `t` for every game of the night. */
const storeWith = (t: (gameId: string) => number): SlateCold => {
  const placed = games.filter((x) => arenaOf(x) && x.startTimeUtc);
  return createColdStore(
    async () => placed.map((x) => ({ hourly: { time: [`${x.startTimeUtc!.slice(0, 13)}:00`], apparent_temperature: [t(x.gameId)] } })),
    () => Date.parse(`${date}T15:00:00Z`),
  );
};

function Host({ data, cold }: { data: CalendarData; cold: SlateCold }) {
  const pop = useGameLinksPopup(data, { cold });
  return (
    <div {...pop.handlers}>
      <SlateDay data={data} date={date} width={1840} timeZone="UTC" gameMenu cold={cold} />
      {pop.node}
    </div>
  );
}

describe('on the card', () => {
  it('a cold game: "❄" on its button, the temperature and the credit in its pop-up; nothing on the others', async () => {
    const cold = games.find((x) => arenaOf(x) && x.startTimeUtc)!.gameId;
    const store = storeWith((id) => (id === cold ? -16 : 2));
    render(<Host data={data} cold={store} />);
    await act(async () => {});
    const buttons = screen.getAllByTestId('game-menu');
    const marked = buttons.filter((b) => b.textContent === '❄');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.closest('[data-game-id]')!.getAttribute('data-game-id')).toBe(cold);
    expect(buttons.filter((b) => b.textContent === '⋯')).toHaveLength(buttons.length - 1);
    fireEvent.mouseOver(marked[0]!);
    expect(screen.getByTestId('cold-line').textContent).toMatch(/^❄ Feels like −16 °C at tip-off in .+ · Weather data by Open-Meteo\.com$/);
    fireEvent.mouseOver(buttons.find((b) => b.textContent === '⋯')!);
    expect(screen.queryByTestId('cold-line')).toBeNull();
  });
  it('in a copy: the mark without a button', () => {
    const cold = games.find((x) => arenaOf(x) && x.startTimeUtc)!.gameId;
    render(<SlateCopy data={data} games={games} cols={2} cardWidth={500} timeZone="UTC" cold={new Map([[cold, -12]])} />);
    expect(screen.getAllByTestId('cold-mark')).toHaveLength(1);
    expect(screen.queryAllByTestId('game-menu')).toHaveLength(0);
  });
  it('no store, or a night out of the forecast\'s range: no request', async () => {
    let asked = 0;
    const store = createColdStore(async () => (asked++, []), () => Date.parse('2027-03-01T00:00:00Z'));
    store.show(date, games);
    expect(asked).toBe(0);
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" gameMenu />);
    expect(screen.queryAllByText('❄')).toHaveLength(0);
  });
});
