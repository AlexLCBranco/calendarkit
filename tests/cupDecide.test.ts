// @vitest-environment jsdom
// Round 21 (item 2): "IN" / "OUT" only when mathematically certain — every completion of the conference's remaining
// games run through the shared engine with margins unknown. Clinched, eliminated and still-alive cases, wild cards
// included, and nothing claimed while too many games are left.
import { describe, expect, it } from 'vitest';
import { CUP_GROUP_TEAMS, LAST_SEASON_WINS } from '../src/data/cup';
import { decide, MAX_OPEN, type OpenGame } from '../src/data/cupDecide';
import type { CupGroup, GroupResult } from '../src/data/cupEngine';
import { TEAMS } from '../src/data/teams';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUPS = new Map(Object.entries(CUP_GROUP_TEAMS).map(([g, ts]) => [g as CupGroup, ts.map((t) => ID[t]!)]));
let n = 0;
/** `w` beat `l` at home by 10 (real: margin and points known). */
const W = (w: string, l: string): GroupResult => ({ gameId: `k${++n}`, home: ID[w]!, away: ID[l]!, winner: ID[w]!, margin: 10, points: [100, 110] });
const open = (a: string, b: string): OpenGame => ({ gameId: `o${++n}`, home: ID[a]!, away: ID[b]! });

// West B: MIN 4-0, OKC 2-2 (2nd on head-to-head over NOP); West C: GSW 4-0, SAS 2-2 (2nd: a 2-2 circle with POR and SAC,
// equal differentials and points, 2025-26 record)
const B = [W('MIN', 'OKC'), W('MIN', 'NOP'), W('MIN', 'MEM'), W('MIN', 'LAC'), W('OKC', 'NOP'), W('OKC', 'MEM'), W('NOP', 'MEM'), W('NOP', 'LAC'), W('MEM', 'LAC'), W('LAC', 'OKC')];
const C = [W('GSW', 'SAS'), W('GSW', 'POR'), W('GSW', 'SAC'), W('GSW', 'LAL'), W('SAS', 'POR'), W('SAS', 'SAC'), W('POR', 'SAC'), W('POR', 'LAL'), W('SAC', 'LAL'), W('LAL', 'SAS')];
const fate = (d: ReturnType<typeof decide>, tri: string) => d.fate.get(ID[tri]!);

describe('decide (IN / OUT)', () => {
  it('clinched and eliminated with one game left: DEN leads whatever happens (head-to-head over DAL), DAL holds the wild card at 3-1', () => {
    // West A: DEN 3-0 (beat DAL, UTA, HOU), DEN–PHX to play; DAL 3-1; UTA 2-2; HOU 1-3; PHX 0-3
    const A = [W('DEN', 'DAL'), W('DEN', 'UTA'), W('DEN', 'HOU'), W('DAL', 'UTA'), W('DAL', 'HOU'), W('DAL', 'PHX'), W('UTA', 'HOU'), W('UTA', 'PHX'), W('HOU', 'PHX')];
    const d = decide(GROUPS, [...A, ...B, ...C], [open('DEN', 'PHX')], LAST_SEASON_WINS);
    expect(['DEN', 'DAL', 'MIN', 'GSW'].map((t) => fate(d, t))).toEqual(['in', 'in', 'in', 'in']);
    expect(['UTA', 'HOU', 'PHX', 'OKC', 'NOP', 'MEM', 'LAC', 'SAS', 'POR', 'SAC', 'LAL'].map((t) => fate(d, t))).toEqual(Array(11).fill('out'));
  });

  it('still alive: a wild card a margin would decide is never claimed either way', () => {
    // West A with DAL 2-1: if DAL loses to PHX it is 2-2 2nd, level with OKC and SAS for the wild card — decided by the
    // point differential, which the open games' margins change
    const A = [W('DEN', 'DAL'), W('DEN', 'UTA'), W('DEN', 'HOU'), W('DAL', 'UTA'), W('DAL', 'HOU'), W('UTA', 'HOU'), W('UTA', 'PHX'), W('HOU', 'PHX')];
    const d = decide(GROUPS, [...A, ...B, ...C], [open('DEN', 'PHX'), open('DAL', 'PHX')], LAST_SEASON_WINS);
    expect(fate(d, 'DEN')).toBe('in'); // 3-0 + h2h over DAL: 1st whatever happens
    expect(fate(d, 'DAL')).toBeUndefined(); // alive: wins → 3-1 WC; loses → depends on margins
    expect(fate(d, 'OKC')).toBeUndefined(); // could take the wild card on a margin
    expect(fate(d, 'SAS')).toBeUndefined();
    expect(fate(d, 'LAL')).toBe('out');
  });

  it('a wild card by record alone is certain', () => {
    // DAL 3-1 with everything known but HOU–PHX; B's and C's 2nd places are 2-2: DAL holds the wild card on record
    const A = [W('DEN', 'DAL'), W('DEN', 'UTA'), W('DEN', 'HOU'), W('DEN', 'PHX'), W('DAL', 'UTA'), W('DAL', 'HOU'), W('DAL', 'PHX'), W('UTA', 'HOU'), W('UTA', 'PHX')];
    const d = decide(GROUPS, [...A, ...B, ...C], [open('HOU', 'PHX')], LAST_SEASON_WINS);
    expect(fate(d, 'DAL')).toBe('in');
    expect(fate(d, 'OKC')).toBe('out');
  });

  it('too many games left: nothing claimed in that conference', () => {
    const opens = Array.from({ length: MAX_OPEN + 1 }, (_, k) => open(['DEN', 'DAL', 'UTA', 'HOU', 'PHX'][k % 5]!, ['MIN', 'OKC', 'NOP', 'MEM', 'LAC'][k % 5]!));
    const d = decide(GROUPS, [], opens, LAST_SEASON_WINS);
    expect(d.skipped).toContain('West');
    expect([...d.fate.keys()].filter((id) => ['DEN', 'DAL', 'MIN'].map((t) => ID[t]).includes(id))).toEqual([]);
  });
});

// ---- on the Slate (synthetic late group play: West all played but tonight's DEN–PHX)
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SlateDay } from '../src/slate/SlateCard';
import { dataOf, game } from './synthetic';

const GROUP_OF = Object.fromEntries(Object.entries(CUP_GROUP_TEAMS).flatMap(([g, ts]) => ts.map((t) => [t, g])));
const sg = (w: string, l: string, date: string, final = true) =>
  game({ date, utc: `${date}T23:00:00Z`, home: ID[w], away: ID[l], subtype: 'in-season', subLabel: GROUP_OF[w], final: final ? [100, 110] : undefined });

describe('IN / OUT on the Slate', () => {
  it('a decided team gets its tag after the squares (OUT dims the row); an undecided team none', async () => {
    const pairs = [['DEN', 'DAL'], ['DEN', 'UTA'], ['DEN', 'HOU'], ['DAL', 'UTA'], ['DAL', 'HOU'], ['DAL', 'PHX'], ['UTA', 'HOU'], ['UTA', 'PHX'], ['HOU', 'PHX'],
      ['MIN', 'OKC'], ['MIN', 'NOP'], ['MIN', 'MEM'], ['MIN', 'LAC'], ['OKC', 'NOP'], ['OKC', 'MEM'], ['NOP', 'MEM'], ['NOP', 'LAC'], ['MEM', 'LAC'], ['LAC', 'OKC'],
      ['GSW', 'SAS'], ['GSW', 'POR'], ['GSW', 'SAC'], ['GSW', 'LAL'], ['SAS', 'POR'], ['SAS', 'SAC'], ['POR', 'SAC'], ['POR', 'LAL'], ['SAC', 'LAL'], ['LAL', 'SAS']];
    const games = [...pairs.map(([w, l]) => sg(w!, l!, '2026-11-20')), sg('DEN', 'PHX', '2026-11-27', false)];
    const data = dataOf(games);
    render(createElement(SlateDay, { data, date: '2026-11-27', timeZone: 'UTC', width: 1840 }));
    await waitFor(() => expect(screen.getAllByTestId('cup-fate').length).toBeGreaterThan(0));
    const fateOfRow = (tri: string) => document.querySelector<HTMLElement>(`[data-testid="slate-cup"][data-team="${tri}"] [data-testid="cup-fate"]`)!.dataset.fate;
    expect(fateOfRow('DEN')).toBe('in');
    expect(fateOfRow('PHX')).toBe('out');
    expect(document.querySelector(`[data-testid="slate-cup"][data-team="PHX"]`)!.closest('.ck-slate-row')!.classList).toContain('ck-cup-out-row');
    expect(document.querySelector('.ck-slate-grid')!.getAttribute('data-cols')).toBe('2');
    cleanup();
  });
});
