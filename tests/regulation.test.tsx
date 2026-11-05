// @vitest-environment jsdom
// v1.40.0: Cup tiebreaker 3 (points scored) leaves overtime points out. Regulation totals from a real boxscore of a
// game that went to OT (tests/fixtures/boxscore-0022600110-ot.json: NOP 135 @ DEN 141, Final/OT, 126-126 after four
// periods; saved 2026-11-05 from cdn.nba.com, trimmed to the fields used), the snapshot job's fetch step, the loader,
// the standings and the rules panel.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import box from './fixtures/boxscore-0022600110-ot.json';
import { collectRegulation, regulationFromBoxscore, storedRegulation, type RegulationTotals } from '../src/data/regulation';
import { cupStandings } from '../src/data/cup';
import { loadCalendarData } from '../src/data/load';
import CupView from '../src/components/CupView';
import { TEAMS } from '../src/data/teams';
import { dataOf, game } from './synthetic';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A finished West Group A game, home team first in the score. */
const cupGame = (id: string, home: string, away: string, hs: number, as: number, ot = true) =>
  game({ id, date: '2026-11-07', utc: '2026-11-07T23:00:00Z', home: ID[home], away: ID[away], subtype: 'in-season', subLabel: 'West Group A', final: [as, hs], raw: ot ? { gameStatusText: 'Final/OT' } : {} });

// DEN and DAL both 1-0, never played each other (rule 1 can't split them), both won in OT (0 to rule 2 each), so rule 3
// decides: final scores say DEN (141 > 132), regulation points say DAL (128 > 126).
const GAMES = [cupGame('0022600110', 'DEN', 'HOU', 141, 135), cupGame('0022690001', 'DAL', 'PHX', 132, 130)];
const REG: RegulationTotals = { '0022600110': [126, 126], '0022690001': [128, 128] };
const order = (s: ReturnType<typeof cupStandings>) => s.groups.find((g) => g.group === 'West Group A')!.teams.map((t) => t.tricode);
const line = (s: ReturnType<typeof cupStandings>, tri: string) => s.groups.flatMap((g) => g.teams).find((t) => t.tricode === tri)!;

describe('regulationFromBoxscore', () => {
  it('sums the four regulation periods of a game that went to overtime', () => {
    expect(regulationFromBoxscore(box)).toEqual({ gameId: '0022600110', away: 126, home: 126 });
  });
  it('gives nothing for a game not final, without period scores, or whose periods miss the final score', () => {
    const live = clone(box);
    live.game.gameStatus = 2;
    expect(regulationFromBoxscore(live)).toBeUndefined();
    const noPeriods = clone(box);
    noPeriods.game.homeTeam.periods = [];
    expect(regulationFromBoxscore(noPeriods)).toBeUndefined();
    const half = clone(box);
    half.game.awayTeam.score = 140;
    expect(regulationFromBoxscore(half)).toBeUndefined();
    expect(regulationFromBoxscore(undefined)).toBeUndefined();
  });
});

describe('collectRegulation (daily snapshot job)', () => {
  const notCup = game({ id: '0022690002', date: '2026-11-07', utc: '2026-11-07T23:00:00Z', home: ID.BOS, away: ID.NYK, final: [100, 101], raw: { gameStatusText: 'Final/OT' } });
  const upcoming = game({ id: '0022690003', date: '2026-11-20', utc: '2026-11-21T01:00:00Z', home: ID.UTA, away: ID.DEN, subtype: 'in-season', subLabel: 'West Group A' });

  it('fetches only finished Cup group games not stored yet, and carries stored ones over', async () => {
    const fetchBox = vi.fn(async (id: string) => (id === '0022600110' ? box : Promise.reject(new Error('unexpected'))));
    const { regulation, fetched } = await collectRegulation([...GAMES, notCup, upcoming], { '0022690001': [128, 128] }, fetchBox, () => {});
    expect(fetched).toEqual(['0022600110']);
    expect(fetchBox).toHaveBeenCalledTimes(1);
    expect(regulation).toEqual(REG);
  });
  it('skips a failed or incomplete boxscore with a warning, to try again the next day', async () => {
    const warn = vi.fn();
    const live = clone(box);
    live.game.gameStatus = 2;
    const { regulation } = await collectRegulation(GAMES, {}, async (id) => (id === '0022600110' ? live : Promise.reject(new Error('HTTP 403'))), warn);
    expect(regulation).toEqual({});
    expect(warn.mock.calls.map((c) => c[0])).toEqual([expect.stringContaining('0022600110'), expect.stringContaining('HTTP 403')]);
  });
  it('reads stored totals back from a snapshot, ignoring malformed entries', () => {
    expect(storedRegulation({ calendarkit: { regulation: { a: [1, 2], b: [1], c: 'x' } } })).toEqual({ a: [1, 2] });
    expect(storedRegulation({ meta: {} })).toEqual({});
  });
});

describe('Cup tiebreaker 3 uses regulation points', () => {
  it('counts an OT game’s regulation points, not its final score', () => {
    const s = cupStandings(GAMES, REG);
    expect(line(s, 'DEN')).toMatchObject({ w: 1, diff: 0, points: 126 });
    expect(line(s, 'HOU')).toMatchObject({ l: 1, diff: 0, points: 126 });
    expect(line(s, 'DAL')).toMatchObject({ w: 1, diff: 0, points: 128 });
    expect(order(s).slice(0, 2)).toEqual(['DAL', 'DEN']);
    expect(line(s, 'DAL').tiebreak).toBe('points');
    expect(s.otWithoutRegulation).toBe(0);
  });
  it('falls back to the final score for an OT game with no stored totals (the order before v1.40.0)', () => {
    const s = cupStandings(GAMES);
    expect(line(s, 'DEN').points).toBe(141);
    expect(order(s).slice(0, 2)).toEqual(['DEN', 'DAL']);
    expect(s.otWithoutRegulation).toBe(2);
  });
  it('leaves games without overtime at their final score', () => {
    const s = cupStandings([cupGame('0022690004', 'DEN', 'HOU', 110, 100, false)], { '0022690004': [90, 95] });
    expect(line(s, 'DEN').points).toBe(110);
  });
});

describe('loader and rules panel', () => {
  it('the loader passes the snapshot’s totals to the view data', async () => {
    const feed = (await import('./fixtures/feed-2026-10-23.json')).default;
    const res = { ok: true, json: async () => ({ ...feed, calendarkit: { regulation: REG } }) } as Response;
    const d = await loadCalendarData(`test://regulation-${Math.random()}`, async () => res);
    expect(d.regulation).toEqual(REG);
  });
  it('the rules panel says rule 3 uses regulation points, and names OT games still waiting for them', () => {
    const { unmount } = render(<CupView data={{ ...dataOf(GAMES), regulation: REG }} />);
    const note = screen.getByTestId('cup-ot-note').textContent!;
    expect(note).toContain('only its regulation points in rule 3');
    expect(note).not.toMatch(/only final scores|until the next daily update/);
    unmount();
    render(<CupView data={{ ...dataOf(GAMES), regulation: { '0022600110': [126, 126] } }} />);
    expect(screen.getByTestId('cup-ot-note').textContent).toContain('One OT game counts its final score until the next daily update.');
  });
});
