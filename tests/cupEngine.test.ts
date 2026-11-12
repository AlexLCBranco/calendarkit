// The shared Cup rules engine (src/data/cupEngine.ts) — beyond the group rules tests/cup.test.ts checks through
// cupStandings: picks without a margin are never guessed (the rule they'd need is named, with the games), knockout seeds
// (3 group winners by record then the tiebreakers, the wild card 4th), the quarterfinals (1 v 4, 2 v 3, the better
// record hosting) and the semifinals (the higher seed hosting).
import { describe, expect, it } from 'vitest';
import { CUP_GROUP_TEAMS, cupGroupsOf, cupStandings, LAST_SEASON_WINS } from '../src/data/cup';
import { computeCup, semifinal, type CupGroup, type GroupResult } from '../src/data/cupEngine';
import { TEAMS } from '../src/data/teams';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUPS = new Map(Object.entries(CUP_GROUP_TEAMS).map(([g, ts]) => [g as CupGroup, ts.map((t) => ID[t]!)]));
let n = 0;
/** `w` beat `l` (at home), by `margin` (undefined: a quick pick). */
const r = (w: string, l: string, margin?: number, picked = margin === undefined): GroupResult => ({ gameId: `g${++n}`, home: ID[w]!, away: ID[l]!, winner: ID[w]!, margin, points: picked ? undefined : [100, 100 + (margin ?? 0)], picked });

describe('picks without a margin', () => {
  it('a tie that point differential would break is "undecided": the rule and the games that need a margin', () => {
    // West A: DEN and DAL both 2-0 and never met; DEN's win over UTA is a quick pick
    const quick = r('DEN', 'UTA');
    const res = computeCup(GROUPS, [quick, r('DEN', 'HOU', 5), r('DAL', 'PHX', 10), r('DAL', 'UTA', 3)], LAST_SEASON_WINS);
    const a = res.groups.find((g) => g.group === 'West Group A')!;
    const top = a.teams.slice(0, 2);
    expect(top.map((t) => t.tricode).sort()).toEqual(['DAL', 'DEN']);
    for (const t of top) expect(t.undecided).toEqual({ rule: 'diff', games: [quick.gameId] });
    // the seeding of the group winner says so too
    expect(res.seeds.West.find((s) => [ID.DEN, ID.DAL].includes(s.teamId))!.undecided?.rule).toBe('diff');
  });

  it('a quick pick never matters when head-to-head or the record already decides', () => {
    const res = computeCup(GROUPS, [r('DEN', 'DAL'), r('DEN', 'UTA'), r('DAL', 'PHX', 4), r('DAL', 'HOU', 6)], LAST_SEASON_WINS); // DEN 2-0 (beat DAL), DAL 2-1
    const a = res.groups.find((g) => g.group === 'West Group A')!;
    expect(a.teams[0]).toMatchObject({ tricode: 'DEN', undecided: undefined });
    expect(a.teams[1]).toMatchObject({ tricode: 'DAL', undecided: undefined });
  });

  it('real results (with margins) never are undecided', () => {
    const s = cupStandings([]);
    for (const g of s.engine.groups) for (const t of g.teams) expect(t.undecided).toBeUndefined();
  });
});

describe('knockout seeds and hosts', () => {
  // one winner per West group with different records; the best 2nd place: DAL
  const res = computeCup(
    GROUPS,
    [
      r('DEN', 'UTA', 10), r('DEN', 'HOU', 10), r('DEN', 'PHX', 10), r('DAL', 'UTA', 5), r('DAL', 'HOU', 5), r('DEN', 'DAL', 1), // DEN 4-0... 3-0 +31
      r('MIN', 'OKC', 3), r('MIN', 'NOP', 3), r('OKC', 'MEM', 2), // MIN 2-0
      r('GSW', 'SAS', 1), r('GSW', 'POR', 1), r('GSW', 'SAC', 1), r('SAS', 'LAL', 1), // GSW 3-0 +3
    ],
    LAST_SEASON_WINS,
  );
  it('seeds 1–3: the group winners by record, then the tiebreakers; seed 4: the wild card', () => {
    expect(res.seeds.West.map((s) => [s.seed, TEAMS.find((t) => t.id === s.teamId)!.tricode, s.wildCard])).toEqual([
      [1, 'DEN', false],
      [2, 'GSW', false],
      [3, 'MIN', false],
      [4, 'DAL', true],
    ]);
  });
  it('quarterfinals 1 v 4 and 2 v 3, the better record hosting', () => {
    const qf = res.quarterfinals.filter((q) => q.conference === 'West');
    expect(qf.map((q) => [q.high.seed, q.low.seed, q.host === q.high.teamId])).toEqual([
      [1, 4, true],
      [2, 3, true],
    ]);
  });
  it('the semifinal: the higher seed hosts, whichever way the quarterfinals went', () => {
    expect(semifinal(res.seeds.West, ID.DAL!, ID.MIN!)).toEqual({ high: ID.MIN, low: ID.DAL, host: ID.MIN });
    expect(semifinal(res.seeds.West, ID.GSW!, ID.DEN!)).toEqual({ high: ID.DEN, low: ID.GSW, host: ID.DEN });
  });
});

describe('one engine', () => {
  it('cupStandings is the engine over the real results (same order, same wild cards)', () => {
    const s = cupStandings([]);
    const e = computeCup(cupGroupsOf([]), [], LAST_SEASON_WINS);
    expect(s.groups.map((g) => g.teams.map((t) => t.tricode))).toEqual(e.groups.map((g) => g.teams.map((t) => t.tricode)));
    expect(s.wildCards.map((w) => w.teams[0]!.tricode)).toEqual(e.wildCards.map((w) => w.teams[0]!.tricode));
  });
});
