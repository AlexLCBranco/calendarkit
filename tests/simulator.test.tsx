// @vitest-environment jsdom
// The Cup simulator — with no picks it is the real standings (the same engine); quick picks never
// guess a margin ("depends on margin", pointing at the games); detailed margins settle it; modes switch without losing
// picks; reset and per-game undo; picks survive leaving the Cup and coming back; played games are hoopsjunkie links,
// unplayed ones are picks with a separate link icon; the bracket's QF hosts are seeds 1 and 2.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { simulate, type SimPicks } from '../src/components/CupSimulator';
import { CUP_GROUP_TEAMS, cupStandings } from '../src/data/cup';
import { TEAMS } from '../src/data/teams';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { data as realData } from './feed';
import { dataOf, game } from './synthetic';
import { goTo } from './nav';

afterEach(cleanup);

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUP_OF = Object.fromEntries(Object.entries(CUP_GROUP_TEAMS).flatMap(([g, ts]) => ts.map((t) => [t, g])));
const cupGame = (away: string, home: string, date: string, score?: [number, number]): ScheduleGame =>
  game({ date, utc: `${date}T23:00:00Z`, home: ID[home], away: ID[away], subtype: 'in-season', subLabel: GROUP_OF[home], final: score });

// West A: DEN beat HOU (played); to play: DEN–DAL... DAL beat PHX (played)
const G = [cupGame('HOU', 'DEN', '2026-10-30', [100, 110]), cupGame('PHX', 'DAL', '2026-10-30', [95, 105]), cupGame('UTA', 'DEN', '2026-11-06'), cupGame('UTA', 'DAL', '2026-11-13')];
const data = dataOf(G);

describe('simulate', () => {
  it('no picks = the real standings (one engine)', () => {
    const sim = simulate(realData, new Map());
    const real = cupStandings(realData.games, realData.regulation);
    expect(sim.groups.map((g) => g.teams.map((t) => t.tricode))).toEqual(real.groups.map((g) => g.teams.map((t) => t.tricode)));
    expect(sim.wildCards.map((w) => w.teams.map((t) => t.tricode))).toEqual(real.wildCards.map((w) => w.teams.map((t) => t.tricode)));
  });

  it('quick picks: a tie that needs the margin says so, naming the picked games; detailed margins decide it', () => {
    const quick: SimPicks = new Map([[G[2]!.gameId, { winner: ID.DEN! }], [G[3]!.gameId, { winner: ID.DAL! }]]);
    let a = simulate(data, quick).groups.find((g) => g.group === 'West Group A')!;
    // DEN and DAL 2-0, no game between them: point differential, unknown
    for (const t of a.teams.slice(0, 2)) expect(t.undecided).toEqual({ rule: 'diff', games: expect.arrayContaining([G[2]!.gameId, G[3]!.gameId]) });
    const detailed: SimPicks = new Map([[G[2]!.gameId, { winner: ID.DEN!, margin: 2 }], [G[3]!.gameId, { winner: ID.DAL!, margin: 20 }]]);
    a = simulate(data, detailed).groups.find((g) => g.group === 'West Group A')!;
    // DEN +10 +2 = +12, DAL +10 +20 = +30
    expect(a.teams.slice(0, 2).map((t) => [t.tricode, t.diff, t.tiebreak, t.undecided])).toEqual([
      ['DAL', 30, 'diff', undefined],
      ['DEN', 12, 'diff', undefined],
    ]);
  });
});

describe('the simulator view', () => {
  const open = () => render(<CalendarView data={data} size={{ width: 1920, height: 1000 }} now={Date.parse('2026-11-01T15:00:00Z')} timeZone="UTC" initial={{ mode: 'cup', cup: { tab: 'simulator' } }} gameLink={(g) => `https://hj.test/${g.gameId}`} />);
  const gameRow = (g: ScheduleGame) => document.querySelector<HTMLElement>(`[data-testid="sim-game"][data-game-id="${g.gameId}"]`)!;
  const pick = (g: ScheduleGame, tri: string) => fireEvent.click(within(gameRow(g)).getByRole('button', { name: tri }));

  it('labelled a simulation; played games are links; unplayed: pick buttons and a separate ↗', async () => {
    open();
    await screen.findByTestId('cup-sim');
    expect(screen.getByTestId('sim-banner').textContent).toBe('SIMULATION');
    const played = gameRow(G[0]!);
    expect([played.tagName, (played as HTMLAnchorElement).href, (played as HTMLAnchorElement).target]).toEqual(['A', `https://hj.test/${G[0]!.gameId}`, '_blank']);
    const row = gameRow(G[2]!);
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['UTA', 'DEN']);
    expect(row.querySelector<HTMLAnchorElement>('a.ck-slate-link')!.href).toBe(`https://hj.test/${G[2]!.gameId}`);
  });

  it('quick → "depends on margin" in the table and the bracket, the games outlined; detailed margins clear it; modes keep picks; undo; reset', async () => {
    open();
    await screen.findByTestId('cup-sim');
    pick(G[2]!, 'DEN');
    pick(G[3]!, 'DAL');
    const dens = () => document.querySelector(`[data-testid="sim-group"][data-group="West A"] [data-team="DEN"]`)!;
    expect(dens().querySelector('[data-testid="sim-depends"]')!.textContent).toBe('depends on margin');
    expect(gameRow(G[2]!).classList).toContain('ck-sim-needs');
    expect(screen.getByTestId('sim-bracket').textContent).toMatch(/depends on margin/);
    // detailed: type the margins
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Pick mode' })).getByRole('tab', { name: 'Detailed' }));
    expect(gameRow(G[2]!).dataset.picked).toBe('DEN'); // the picks stayed
    fireEvent.change(within(gameRow(G[2]!)).getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.change(within(gameRow(G[3]!)).getByRole('spinbutton'), { target: { value: '20' } });
    expect(dens().querySelector('[data-testid="sim-depends"]')).toBeNull();
    expect(document.querySelector(`[data-testid="sim-group"][data-group="West A"] [data-team="DAL"]`)!.getAttribute('title')).toBe('won on point differential');
    // back to quick: margins kept (a detailed pick stays detailed)
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Pick mode' })).getByRole('tab', { name: 'Quick' }));
    expect(dens().querySelector('[data-testid="sim-depends"]')).toBeNull();
    // undo one, then reset all
    fireEvent.click(within(gameRow(G[3]!)).getByRole('button', { name: 'Undo this pick' }));
    expect(gameRow(G[3]!).dataset.picked).toBeUndefined();
    expect(gameRow(G[2]!).dataset.picked).toBe('DEN');
    fireEvent.click(screen.getByTestId('sim-reset'));
    expect(gameRow(G[2]!).dataset.picked).toBeUndefined();
  });

  it('picks survive leaving the Cup and coming back (not a reload)', async () => {
    open();
    await screen.findByTestId('cup-sim');
    pick(G[2]!, 'UTA');
    goTo('Schedule');
    goTo('Cup');
    await act(async () => {});
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Cup view' })).getByRole('tab', { name: 'Simulator' }));
    await screen.findByTestId('cup-sim');
    expect(gameRow(G[2]!).dataset.picked).toBe('UTA');
  });

  it('the bracket: quarterfinals 1 v 4 and 2 v 3, hosted by seeds 1 and 2; the final neutral (from the feed) or "venue TBD"', async () => {
    render(<CalendarView data={realData} size={{ width: 1920, height: 1000 }} now={Date.parse('2026-11-01T15:00:00Z')} timeZone="UTC" initial={{ mode: 'cup', cup: { tab: 'simulator' } }} />);
    await screen.findByTestId('cup-sim');
    const qf = screen.getAllByTestId('sim-qf');
    expect(qf).toHaveLength(4);
    for (const q of qf) {
      const seeds = [...q.querySelectorAll('.ck-sim-seed')].map((s) => s.textContent);
      expect(['1,4', '2,3']).toContain(seeds.join(','));
      expect(q.querySelectorAll('[data-testid="venue-host"]')).toHaveLength(1);
    }
    const final = screen.getByTestId('sim-final');
    const cupFinal = realData.games.find((g) => g.gameType === 'cup-final');
    if (cupFinal?.arenaName) expect(final.querySelector('[data-testid="venue-neutral"]')!.textContent).toContain(cupFinal.arenaName);
    else expect(final.querySelector('[data-testid="venue-tbd"]')).toBeTruthy();
    expect(final.querySelector('[data-testid="venue-host"]')).toBeNull();
  });
});
