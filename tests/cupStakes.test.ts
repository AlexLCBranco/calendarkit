// @vitest-environment jsdom
// The stakes chips — only when tonight can settle something: "Win = clinch", "Loss = out",
// "Win + help" (naming the result needed), the margin that passes a rival ("+11 to pass DAL", the math in the tip),
// "depends on …" when another game's margin matters, and nothing early in group play.
import { describe, expect, it } from 'vitest';
import { CUP_GROUP_TEAMS, LAST_SEASON_WINS } from '../src/data/cup';
import type { OpenGame } from '../src/data/cupDecide';
import type { CupGroup, GroupResult } from '../src/data/cupEngine';
import { stakes } from '../src/data/cupStakes';
import { TEAMS } from '../src/data/teams';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUPS = new Map(Object.entries(CUP_GROUP_TEAMS).map(([g, ts]) => [g as CupGroup, ts.map((t) => ID[t]!)]));
let n = 0;
const W = (w: string, l: string): GroupResult => ({ gameId: `k${++n}`, home: ID[w]!, away: ID[l]!, winner: ID[w]!, margin: 10, points: [100, 110] });
const open = (home: string, away: string): OpenGame => ({ gameId: `o${++n}`, home: ID[home]!, away: ID[away]! });
const B = [W('MIN', 'OKC'), W('MIN', 'NOP'), W('MIN', 'MEM'), W('MIN', 'LAC'), W('OKC', 'NOP'), W('OKC', 'MEM'), W('NOP', 'MEM'), W('NOP', 'LAC'), W('MEM', 'LAC'), W('LAC', 'OKC')];
const C = [W('GSW', 'SAS'), W('GSW', 'POR'), W('GSW', 'SAC'), W('GSW', 'LAL'), W('SAS', 'POR'), W('SAS', 'SAC'), W('POR', 'SAC'), W('POR', 'LAL'), W('SAC', 'LAL'), W('LAL', 'SAS')];
const texts = (m: Map<number, { text: string }[]>, tri: string) => (m.get(ID[tri]!) ?? []).map((c) => c.text);

describe('stakes', () => {
  // West A before tonight's DEN–DAL (its last game): DAL 3-0 +30, UTA 3-1 +20 (lost at DAL), DEN 2-1 +10 (lost at UTA)
  const A = [W('DAL', 'UTA'), W('DAL', 'HOU'), W('DAL', 'PHX'), W('UTA', 'DEN'), W('UTA', 'HOU'), W('UTA', 'PHX'), W('DEN', 'HOU'), W('DEN', 'PHX'), W('HOU', 'PHX')];
  const tonight = open('DEN', 'DAL');
  const s = stakes(GROUPS, [...A, ...B, ...C], [tonight], new Set([tonight.gameId]), LAST_SEASON_WINS);

  it('DAL: a win clinches the group (4-0)', () => {
    expect(texts(s, 'DAL')).toContain('Win = clinch');
  });

  it('DEN: a loss ends it (2-2, 3rd); a win makes a 3-1 circle with DAL and UTA, decided by point differential: +11 passes both', () => {
    expect(texts(s, 'DEN')).toContain('Loss = out');
    // DEN +10 + m beats DAL +30 − m (m ≥ 11) and UTA +20 (m ≥ 11)
    const margin = s.get(ID.DEN!)!.find((c) => c.kind === 'margin')!;
    expect(margin.text).toMatch(/^\+11 to pass (DAL|UTA)$/);
    expect(margin.tip).toMatch(/^Point differential: DEN \+10, (DAL \+30|UTA \+20) — a win by 11 or more takes 1st in West A$/);
  });

  it('"depends on …" when another game tonight shares the margin that decides it', () => {
    // as above, but UTA–HOU is also tonight (UTA 2-1): the circle's differentials depend on both margins
    const A2 = A.filter((r) => !(r.home === ID.UTA && r.away === ID.HOU));
    const uh = open('UTA', 'HOU');
    const s2 = stakes(GROUPS, [...A2, ...B, ...C], [tonight, uh], new Set([tonight.gameId, uh.gameId]), LAST_SEASON_WINS);
    expect(texts(s2, 'DEN')).toContain('depends on HOU–UTA');
    expect(texts(s2, 'DEN')).not.toContain(expect.stringMatching(/^\+\d+ to pass/));
  });

  it('nothing in early group play (too many games left) and nothing for teams already settled', () => {
    const many = Array.from({ length: 13 }, (_, k) => open(['DEN', 'DAL', 'UTA', 'HOU', 'PHX'][k % 5]!, ['MIN', 'OKC', 'NOP', 'MEM', 'LAC'][k % 5]!));
    expect(stakes(GROUPS, [], many, new Set([many[0]!.gameId]), LAST_SEASON_WINS).size).toBe(0);
    // MIN (4-0, done) plays nobody tonight; GSW neither: no chips
    expect(texts(s, 'MIN')).toEqual([]);
  });
});

// ---- on the Slate: the same night as real games (DEN–DAL tonight, everything else in the West played)
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SlateDay } from '../src/slate/SlateCard';
import { dataOf, game } from './synthetic';

const GROUP_OF = Object.fromEntries(Object.entries(CUP_GROUP_TEAMS).flatMap(([g, ts]) => ts.map((t) => [t, g])));
const sg = (w: string, l: string, date: string, final = true) =>
  game({ date, utc: `${date}T23:00:00Z`, home: ID[w], away: ID[l], subtype: 'in-season', subLabel: GROUP_OF[w], final: final ? [100, 110] : undefined });

describe('stakes on the Slate', () => {
  it('tonight\'s Cup teams show their chips beside the squares (the tooltip has the details); the card keeps 2 columns', async () => {
    const pairs = [['DAL', 'UTA'], ['DAL', 'HOU'], ['DAL', 'PHX'], ['UTA', 'DEN'], ['UTA', 'HOU'], ['UTA', 'PHX'], ['DEN', 'HOU'], ['DEN', 'PHX'], ['HOU', 'PHX'],
      ['MIN', 'OKC'], ['MIN', 'NOP'], ['MIN', 'MEM'], ['MIN', 'LAC'], ['OKC', 'NOP'], ['OKC', 'MEM'], ['NOP', 'MEM'], ['NOP', 'LAC'], ['MEM', 'LAC'], ['LAC', 'OKC'],
      ['GSW', 'SAS'], ['GSW', 'POR'], ['GSW', 'SAC'], ['GSW', 'LAL'], ['SAS', 'POR'], ['SAS', 'SAC'], ['POR', 'SAC'], ['POR', 'LAL'], ['SAC', 'LAL'], ['LAL', 'SAS']];
    const data = dataOf([...pairs.map(([w, l]) => sg(w!, l!, '2026-11-20')), sg('DEN', 'DAL', '2026-11-27', false)]);
    render(createElement(SlateDay, { data, date: '2026-11-27', timeZone: 'UTC', width: 1840 }));
    await waitFor(() => expect(screen.getAllByTestId('stake-chips').length).toBe(2));
    const chipsOf = (tri: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="slate-cup"][data-team="${tri}"] .ck-stake`)].map((c) => [c.textContent, !!c.dataset.tip]);
    expect(chipsOf('DAL')).toEqual([['Win = clinch', true]]);
    expect(chipsOf('DEN')[0]).toEqual(['Loss = out', true]);
    expect(document.querySelector('.ck-slate-grid')!.getAttribute('data-cols')).toBe('2');
    cleanup();
  });
});
