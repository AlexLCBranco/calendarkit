// @vitest-environment jsdom
// The simulator's playable knockout bracket: picks advance a team QF → SF → Final → champion; the semifinal is hosted
// by the higher seed, the Final is neutral; a pick whose team left its game (the seeds moved, an earlier pick changed)
// is dropped and only that one; a knockout game the feed has played is its real result; in the view, clicks advance,
// the detailed mode takes a margin, group picks that move the seeds clear only the stale knockout picks, and the
// tables and the bracket are on screen together.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { bracketOf, type BracketKey, type BracketPick } from '../src/data/cupBracket';
import type { EngineResult, Seed } from '../src/data/cupEngine';
import { TEAMS } from '../src/data/teams';
import { data as realData } from './feed';
import { game } from './synthetic';

afterEach(cleanup);

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const seed = (tri: string, n: 1 | 2 | 3 | 4): Seed => ({ seed: n, teamId: ID[tri]!, group: 'West Group A', wildCard: n === 4 });
const engineOf = (west: string[], east: string[]): Pick<EngineResult, 'seeds' | 'quarterfinals'> => {
  const W = west.map((t, i) => seed(t, (i + 1) as 1 | 2 | 3 | 4));
  const E = east.map((t, i) => seed(t, (i + 1) as 1 | 2 | 3 | 4));
  const qf = (c: 'West' | 'East', s: Seed[]) => [
    { conference: c, high: s[0]!, low: s[3]!, host: s[0]!.teamId },
    { conference: c, high: s[1]!, low: s[2]!, host: s[1]!.teamId },
  ];
  return { seeds: { West: W, East: E }, quarterfinals: [...qf('West', W), ...qf('East', E)] };
};
const picks = (o: Partial<Record<BracketKey, string | [string, number]>>) =>
  new Map(Object.entries(o).map(([k, v]) => [k as BracketKey, (Array.isArray(v) ? { winner: ID[v[0]]!, margin: v[1] } : { winner: ID[v!]! }) as BracketPick]));
const tri = (id?: number) => TEAMS.find((t) => t.id === id)?.tricode;
const E1 = engineOf(['OKC', 'DEN', 'LAL', 'GSW'], ['BOS', 'NYK', 'CLE', 'MIA']);

describe('bracketOf', () => {
  it('no picks: the quarterfinals 1 v 4 and 2 v 3, hosted by seeds 1 and 2; nothing later', () => {
    const b = bracketOf(E1, new Map());
    expect([tri(b.matches['QF-West-1'].a?.teamId), tri(b.matches['QF-West-1'].b?.teamId), tri(b.matches['QF-West-1'].host)]).toEqual(['OKC', 'GSW', 'OKC']);
    expect([tri(b.matches['QF-West-2'].a?.teamId), tri(b.matches['QF-West-2'].b?.teamId), tri(b.matches['QF-West-2'].host)]).toEqual(['DEN', 'LAL', 'DEN']);
    expect(b.matches['SF-West'].a).toBeUndefined();
    expect(b.champion).toBeUndefined();
  });
  it('picks advance to a champion; the semifinal at the higher seed, the Final neutral', () => {
    const b = bracketOf(E1, picks({ 'QF-West-1': 'GSW', 'QF-West-2': 'LAL', 'QF-East-1': 'BOS', 'QF-East-2': 'NYK', 'SF-West': 'GSW', 'SF-East': 'BOS', F: ['GSW', 7] }));
    expect([tri(b.matches['SF-West'].a?.teamId), tri(b.matches['SF-West'].b?.teamId), tri(b.matches['SF-West'].host)]).toEqual(['GSW', 'LAL', 'LAL']); // 3 hosts 4
    expect(tri(b.matches['SF-East'].host)).toBe('BOS');
    expect([tri(b.matches.F.a?.teamId), tri(b.matches.F.b?.teamId), b.matches.F.host]).toEqual(['GSW', 'BOS', undefined]);
    expect([tri(b.champion), b.matches.F.margin]).toEqual(['GSW', 7]);
    expect(b.picks.size).toBe(7);
  });
  it('one QF winner known: it waits in its slot; the semifinal can\'t be picked yet', () => {
    const b = bracketOf(E1, picks({ 'QF-West-2': 'DEN', 'SF-West': 'DEN' }));
    expect([b.matches['SF-West'].a, tri(b.matches['SF-West'].b?.teamId)]).toEqual([undefined, 'DEN']);
    expect(b.matches['SF-West'].winner).toBeUndefined();
    expect([...b.picks.keys()]).toEqual(['QF-West-2']); // the early SF pick is dropped
  });
  it('the seeds move: only the picks whose team left its game are dropped (and what hung on them)', () => {
    const before = picks({ 'QF-West-1': 'OKC', 'QF-West-2': 'DEN', 'SF-West': 'OKC', 'QF-East-1': 'BOS', 'QF-East-2': 'NYK', 'SF-East': 'NYK', F: 'NYK' });
    // DEN and LAL swap seeds 2 and 3: QF 2 is still DEN v LAL (DEN's pick stays); the West is unchanged otherwise
    expect(bracketOf(engineOf(['OKC', 'LAL', 'DEN', 'GSW'], ['BOS', 'NYK', 'CLE', 'MIA']), before).picks.size).toBe(7);
    // GSW out of the top 4 (PHX in): QF 1 is OKC v PHX — OKC's pick stays; East untouched
    expect(bracketOf(engineOf(['OKC', 'DEN', 'LAL', 'PHX'], ['BOS', 'NYK', 'CLE', 'MIA']), before).picks.size).toBe(7);
    // DEN out of the bracket (PHX in its place): DEN's QF pick goes, and so do the West semifinal and the Final
    // that hung on it; the East's picks stay
    const out = bracketOf(engineOf(['OKC', 'PHX', 'LAL', 'GSW'], ['BOS', 'NYK', 'CLE', 'MIA']), before);
    expect([...out.picks.keys()].sort()).toEqual(['QF-East-1', 'QF-East-2', 'QF-West-1', 'SF-East']);
    expect(out.champion).toBeUndefined();
  });
  it('a knockout game the feed has played is its real result, whatever was picked', () => {
    const qf = game({ date: '2026-12-04', utc: '2026-12-05T00:00:00Z', home: ID.OKC, away: ID.GSW, subtype: 'in-season-knockout', subLabel: 'Quarterfinal', final: [118, 110] });
    const b = bracketOf(E1, picks({ 'QF-West-1': 'OKC' }), [qf]);
    expect([tri(b.matches['QF-West-1'].winner), b.matches['QF-West-1'].real?.score, b.matches['QF-West-1'].margin]).toEqual(['GSW', [110, 118], 8]);
    expect(b.picks.has('QF-West-1')).toBe(false);
  });
});

describe('the bracket in the simulator', () => {
  const open = async () => {
    render(<CalendarView data={realData} size={{ width: 1920, height: 1000 }} now={Date.parse('2026-11-01T15:00:00Z')} timeZone="UTC" initial={{ mode: 'cup', cup: { tab: 'simulator' } }} />);
    await screen.findByTestId('cup-sim');
  };
  const match = (key: BracketKey) => document.querySelector<HTMLElement>(`[data-key="${key}"]`)!;
  const teams = (key: BracketKey) => [...match(key).querySelectorAll<HTMLElement>('[data-testid="kb-team"]')].map((t) => t.dataset.team ?? '');
  const click = (key: BracketKey, team: string) => fireEvent.click(match(key).querySelector(`button[data-team="${team}"]`)!);

  it('tables and bracket together; clicks advance a team to champion, again takes it back', async () => {
    await open();
    expect(screen.getAllByTestId('sim-group')).toHaveLength(6);
    expect(screen.getByTestId('sim-bracket')).toBeTruthy();
    const [, w4] = teams('QF-West-1');
    const [w2] = teams('QF-West-2');
    const [e1] = teams('QF-East-1');
    const [, e3] = teams('QF-East-2');
    expect(teams('SF-West')).toEqual(['', '']); // waiting for the quarterfinals
    click('QF-West-1', w4!);
    click('QF-West-2', w2!);
    expect(teams('SF-West')).toEqual([w4, w2]);
    expect(match('SF-West').dataset.host).toBe(w2); // seed 2 hosts seed 4
    click('SF-West', w4!);
    click('QF-East-1', e1!);
    click('QF-East-2', e3!);
    click('SF-East', e3!);
    expect(teams('F')).toEqual([w4, e3]);
    expect(match('F').dataset.host).toBeUndefined();
    click('F', w4!);
    expect(screen.getByTestId('kb-champion').dataset.team).toBe(w4);
    click('F', w4!); // again: taken back
    expect(screen.getByTestId('kb-champion').dataset.team).toBeUndefined();
    // reset clears the bracket too
    fireEvent.click(screen.getByTestId('sim-reset'));
    expect(teams('SF-West')).toEqual(['', '']);
  });

  it('detailed mode: a margin for the picked winner', async () => {
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Detailed' }));
    const [w1] = teams('QF-West-1');
    const input = () => match('QF-West-1').querySelector<HTMLInputElement>('input.ck-sim-margin')!;
    expect(input().disabled).toBe(true);
    click('QF-West-1', w1!);
    fireEvent.change(input(), { target: { value: '9' } });
    expect(match('QF-West-1').querySelector('.ck-kb-won .ck-kb-score')!.textContent).toBe('+9');
  });

  it('group picks that move the seeds clear only the knockout picks that no longer fit', async () => {
    await open();
    const [, w4] = teams('QF-West-1');
    const [e1] = teams('QF-East-1');
    click('QF-West-1', w4!);
    click('QF-East-1', e1!);
    // the West's wild card (seed 4) loses every game it has left: it falls out of the bracket
    for (const g of [...document.querySelectorAll<HTMLElement>('[data-testid="sim-game"]:not(.ck-sim-real)')]) {
      const btns = [...g.querySelectorAll<HTMLButtonElement>('button.ck-sim-pick')];
      const other = btns.find((b) => b.dataset.team !== w4);
      if (btns.some((b) => b.dataset.team === w4) && other) await act(async () => fireEvent.click(other));
    }
    expect(teams('QF-West-1')[1]).not.toBe(w4);
    expect(match('QF-West-1').dataset.winner).toBeUndefined();
    expect(match('QF-East-1').dataset.winner).toBe(e1);
  });
});
