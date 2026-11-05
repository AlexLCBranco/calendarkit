// Standings (round 17): src/data/standings.ts against NBA.com's own standings for one date, then targeted tie-break,
// split and schedule cases on synthetic games.
// Fixture: tests/fixtures/standings-feed-2026-11-05.json = the live schedule feed fetched 2026-11-05 (regular-season +
// Cup final games, through the Nov 4 games); tests/fixtures/nba-standings-2026-11-05.json = NBA's standings at the same
// moment, stats.nba.com/stats/leaguestandingsv3 (LeagueID 00, Season 2026-27, Regular Season) — the data behind
// nba.com/standings.

import { describe, expect, it } from 'vitest';
import feed from './fixtures/standings-feed-2026-11-05.json';
import nba from './fixtures/nba-standings-2026-11-05.json';
import { computeStandings, fmtRec, leagueStandings, markClinches, tieText, type SeededTeam } from '../src/data/standings';
import { buildCalendarData } from '../src/data/model';
import { parseSchedule, type ScheduleGame } from '../src/shared/nba-schedule/parse';
import { TEAMS } from '../src/data/teams';
import { game } from './synthetic';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
let day = 0;
/** Two days apart from the last one (no back-to-backs), from Oct 20. */
const nextDate = () => new Date(Date.UTC(2026, 9, 20) + 2 * 86_400_000 * day++).toISOString().slice(0, 10);

/** A final: winner, loser; the winner at home unless `away`. */
function fin(winner: string, loser: string, opts: { by?: number; away?: boolean; ot?: boolean; prefix?: string; subtype?: string; neutral?: boolean } = {}): ScheduleGame {
  const date = nextDate();
  const ws = 110;
  const ls = ws - (opts.by ?? 10);
  const home = !opts.away;
  return game({
    date,
    utc: `${date}T23:30:00Z`,
    home: home ? ID[winner] : ID[loser],
    away: home ? ID[loser] : ID[winner],
    final: home ? [ls, ws] : [ws, ls],
    prefix: opts.prefix,
    subtype: opts.subtype,
    raw: { ...(opts.ot ? { gameStatusText: 'Final/OT' } : {}), ...(opts.neutral ? { isNeutral: true } : {}) },
  });
}
const seedOf = (s: SeededTeam[], tri: string) => s.find((t) => t.tricode === tri)!;
const steps = (t: SeededTeam) => t.tie?.steps.map((x) => x.criterion);

describe('matches NBA.com standings for 2026-11-05 (games through Nov 4)', () => {
  const data = buildCalendarData(parseSchedule(feed));
  const s = computeStandings(data.games);
  const rs = (nba as unknown as { resultSets: { headers: string[]; rowSet: unknown[][] }[] }).resultSets[0]!;
  const col = (r: unknown[], k: string) => String(r[rs.headers.indexOf(k)]).trim();
  it('counts every finished game through Nov 4', () => {
    expect(s.through).toBe('2026-11-04');
    expect(s.games * 2).toBe(rs.rowSet.reduce((n, r) => n + Number(col(r, 'WINS')) + Number(col(r, 'LOSSES')), 0));
  });
  for (const r of rs.rowSet) {
    const tri = TEAMS.find((t) => t.id === Number(col(r, 'TeamID')))!.tricode;
    it(`${tri}: record, splits, form, points, seed, GB`, () => {
      const t = [...s.West, ...s.East].find((x) => x.tricode === tri)!;
      expect({
        wl: fmtRec(t), home: fmtRec(t.home), road: fmtRec(t.road), neutral: fmtRec(t.neutral), conf: fmtRec(t.conf), div: fmtRec(t.div),
        l10: fmtRec(t.last10), ot: fmtRec(t.ot), close3: fmtRec(t.close3), over500: fmtRec(t.over500), streak: t.streak,
        pf: t.pf, pa: t.pa, ppg: t.ppg.toFixed(1), oppg: t.oppg.toFixed(1), seed: t.seed, gb: t.gb,
      }).toEqual({
        wl: `${col(r, 'WINS')}-${col(r, 'LOSSES')}`, home: col(r, 'HOME'), road: col(r, 'ROAD'), neutral: col(r, 'NEUTRAL'), conf: col(r, 'ConferenceRecord'), div: col(r, 'DivisionRecord'),
        l10: col(r, 'L10'), ot: col(r, 'OT'), close3: col(r, 'ThreePTSOrLess'), over500: col(r, 'OppOver500'), streak: col(r, 'strCurrentStreak').replace(' ', ''),
        pf: Number(col(r, 'TotalPoints')), pa: Number(col(r, 'OppTotalPoints')), ppg: Number(col(r, 'PointsPG')).toFixed(1), oppg: Number(col(r, 'OppPointsPG')).toFixed(1),
        seed: Number(col(r, 'PlayoffRank')), gb: col(r, 'ConferenceGamesBack') === '-' ? 0 : Number(col(r, 'ConferenceGamesBack')),
      });
    });
  }
  it('real ties: 3-way MEM/OKC/SAS (win % among them: OKC 1-0, SAS 0-1, MEM 0-0) and 4-way CLE/NYK/TOR/WAS', () => {
    expect(['OKC', 'SAS', 'MEM'].map((x) => steps(seedOf(s.West, x)))).toEqual([['h2h'], ['h2h'], ['h2h']]);
    expect(seedOf(s.West, 'MEM').tie!.steps[0]!.value).toBe('0-0');
    expect(['TOR', 'CLE', 'WAS', 'NYK'].map((x) => seedOf(s.East, x).seed)).toEqual([5, 6, 7, 8]);
    expect(seedOf(s.East, 'WAS').tie!.steps[0]).toMatchObject({ criterion: 'h2h', value: '0-2' });
    expect(tieText(seedOf(s.West, 'SAS'))).toMatch(/^Tied at \.750 with (OKC, MEM|MEM, OKC)/);
  });
  it('is computed once per data set', () => {
    expect(leagueStandings(data)).toBe(leagueStandings(data));
  });
});

describe('tie-breakers (NBA L.2)', () => {
  it('2 teams: head-to-head first', () => {
    // DEN 2-1 and LAL 2-1, both lead their division; DEN won their game
    const s = computeStandings([fin('DEN', 'LAL'), fin('LAL', 'SAC'), fin('LAL', 'GSW'), fin('DEN', 'BOS'), fin('MIA', 'DEN')]);
    const den = seedOf(s.West, 'DEN');
    const lal = seedOf(s.West, 'LAL');
    expect([fmtRec(den), fmtRec(lal)]).toEqual(['2-1', '2-1']);
    expect(den.seed + 1).toBe(lal.seed);
    expect(steps(den)).toEqual(['h2h']);
    expect(tieText(den)).toContain('Head-to-head: 1-0');
  });
  it('2 teams: a division leader beats a non-leader when head-to-head is even (any divisions)', () => {
    // PHX 3-0 leads the Pacific; DEN 2-1 leads the Northwest; LAL 2-1 is 2nd in the Pacific but 2-0 in the conference
    const s = computeStandings([
      fin('PHX', 'BOS'), fin('PHX', 'NYK'), fin('PHX', 'MIA'),
      fin('DEN', 'BOS'), fin('DEN', 'NYK'), fin('MIA', 'DEN'),
      fin('LAL', 'SAC'), fin('LAL', 'GSW'), fin('MIA', 'LAL'),
    ]);
    const den = seedOf(s.West, 'DEN');
    const lal = seedOf(s.West, 'LAL');
    expect(den.divisionLeader).toBe(true);
    expect(lal.divisionLeader).toBe(false);
    expect(lal.conf).toEqual({ w: 2, l: 0 });
    expect(den.seed + 1).toBe(lal.seed);
    expect(steps(den)).toEqual(['division-winner']);
    expect(tieText(lal)).toContain("Division leader: doesn't lead the Pacific");
  });
  it('3+ teams: division leader first, then the two left restart with the 2-team list (head-to-head)', () => {
    const s = computeStandings([
      fin('PHX', 'BOS'), fin('PHX', 'NYK'), fin('PHX', 'MIA'),
      fin('SAS', 'ATL'), fin('SAS', 'CHA'), fin('SAS', 'CHI'),
      fin('DEN', 'BOS'), fin('DEN', 'NYK'), fin('MIA', 'DEN'),
      fin('HOU', 'LAL'), fin('HOU', 'ORL'), fin('MIA', 'HOU'),
      fin('LAL', 'SAC'), fin('LAL', 'GSW'),
    ]);
    const [den, hou, lal] = ['DEN', 'HOU', 'LAL'].map((x) => seedOf(s.West, x)) as SeededTeam[];
    expect([den!.seed, hou!.seed, lal!.seed]).toEqual([3, 4, 5]);
    expect([...den!.tie!.tiedWith].sort()).toEqual(['DEN', 'HOU', 'LAL']);
    expect(steps(den!)).toEqual(['division-winner']);
    expect(steps(hou!)).toEqual(['division-winner', 'h2h']);
    expect(hou!.tie!.steps[1]).toMatchObject({ among: ['HOU', 'LAL'], value: '1-0' });
  });
  it('3 teams: win % among them; no games among them ranks below a team that lost them', () => {
    // BOS, CLE, ATL 2-0 lead their divisions; CHI, NYK, MIA 1-1; CHI beat NYK, MIA hasn't met either
    const s = computeStandings([
      fin('BOS', 'LAL'), fin('BOS', 'SAC'), fin('CLE', 'GSW'), fin('CLE', 'PHX'), fin('ATL', 'UTA'), fin('ATL', 'POR'),
      fin('CHI', 'NYK'), fin('DEN', 'CHI'), fin('NYK', 'DAL'), fin('MIA', 'HOU'), fin('MEM', 'MIA'),
    ]);
    const [chi, nyk, mia] = ['CHI', 'NYK', 'MIA'].map((x) => seedOf(s.East, x)) as SeededTeam[];
    expect([chi!.seed, nyk!.seed, mia!.seed]).toEqual([4, 5, 6]);
    expect(steps(mia!)).toEqual(['h2h']);
    expect(mia!.tie!.steps[0]).toMatchObject({ criterion: 'h2h', value: '0-0' });
  });
  it('still level after everything: a drawing (shown A–Z, marked)', () => {
    const s = computeStandings([]);
    expect(s.West.every((t) => t.tie)).toBe(true);
    const drawn = s.West.filter((t) => t.tie!.drawing);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn.map((t) => t.tricode)).toEqual([...drawn.map((t) => t.tricode)].sort());
    expect(tieText(drawn[0]!)).toContain('drawing');
  });
});

describe('what counts, splits and schedule columns', () => {
  it('Cup group and knockout (002) games count; the Cup Championship (006) does not', () => {
    const s = computeStandings([fin('BOS', 'NYK', { subtype: 'in-season' }), fin('BOS', 'MIA', { subtype: 'in-season-knockout' }), fin('NYK', 'BOS', { prefix: '006', subtype: 'in-season-knockout' })]);
    expect(fmtRec(seedOf(s.East, 'BOS'))).toBe('2-0');
    expect(s.games).toBe(2);
  });
  it('close (≤ 5), OT, home / road / neutral, streak, last 10, per game', () => {
    const s = computeStandings([fin('BOS', 'NYK', { by: 5 }), fin('BOS', 'MIA', { by: 6, away: true }), fin('NYK', 'BOS', { by: 2, ot: true }), fin('BOS', 'LAL', { by: 12, neutral: true })]);
    const b = seedOf(s.East, 'BOS');
    expect({ close: fmtRec(b.close), ot: fmtRec(b.ot), home: fmtRec(b.home), road: fmtRec(b.road), neutral: fmtRec(b.neutral), streak: b.streak, l10: fmtRec(b.last10) }).toEqual({
      close: '1-1', ot: '0-1', home: '1-0', road: '1-1', neutral: '1-0', streak: 'W1', l10: '3-1',
    });
    expect(b.diffPg).toBeCloseTo((5 + 6 - 2 + 12) / 4);
  });
  it('games left (home / road), back-to-backs left, and the record on each night of a back-to-back', () => {
    const g = (date: string, home: string, away: string, final?: [number, number]) => game({ date, utc: `${date}T23:30:00Z`, home: ID[home], away: ID[away], final });
    const s = computeStandings([
      g('2026-11-01', 'BOS', 'NYK', [100, 110]), // W, night 1
      g('2026-11-02', 'MIA', 'BOS', [100, 120]), // L, night 2
      g('2026-11-05', 'BOS', 'LAL'), // to come
      g('2026-11-06', 'DEN', 'BOS'), // to come, night 2 of a back-to-back
      g('2026-11-09', 'BOS', 'MIA'),
    ]);
    const b = seedOf(s.East, 'BOS');
    expect(b.b2bFirst).toEqual({ w: 1, l: 0 });
    expect(b.b2bSecond).toEqual({ w: 0, l: 1 });
    expect(b.left).toEqual({ total: 3, home: 2, road: 1, neutral: 0, b2b: 1 });
  });
  it('the night after the Cup Championship is a 2nd night (the Championship itself counts nowhere)', () => {
    const g = (date: string, home: string, away: string, final: [number, number], prefix?: string) => game({ date, utc: `${date}T23:30:00Z`, home: ID[home], away: ID[away], final, prefix });
    const s = computeStandings([g('2026-12-15', 'BOS', 'LAL', [100, 110], '006'), g('2026-12-16', 'BOS', 'NYK', [100, 110])]);
    expect(seedOf(s.East, 'BOS').b2bSecond).toEqual({ w: 1, l: 0 });
    expect(seedOf(s.East, 'BOS').b2bFirst).toEqual({ w: 0, l: 0 });
    expect(fmtRec(seedOf(s.East, 'BOS'))).toBe('1-0');
  });
});

describe('clinch and elimination markers', () => {
  const blank = computeStandings([]);
  const row = (tricode: string, w: number, l: number): SeededTeam => ({ ...[...blank.East, ...blank.West].find((x) => x.tricode === tricode)!, w, l, clinch: undefined });
  it('none on 2026-11-05', () => {
    const s = computeStandings(buildCalendarData(parseSchedule(feed)).games);
    expect([...s.West, ...s.East].some((t) => t.clinch)).toBe(false);
  });
  it('conference, division, playoffs and eliminated, from 82-game maxima', () => {
    const recs: Record<string, [number, number]> = {
      BOS: [70, 5], NYK: [56, 20], PHI: [50, 25], CLE: [49, 26], DET: [48, 27], MIL: [47, 28], ATL: [46, 29], MIA: [45, 30],
      ORL: [44, 31], CHI: [43, 32], IND: [42, 33], TOR: [40, 35], CHA: [20, 55], WAS: [15, 60], BKN: [10, 65],
    };
    const conf = Object.entries(recs).map(([x, [w, l]]) => row(x, w, l));
    markClinches(conf);
    const c = Object.fromEntries(conf.map((t) => [t.tricode, t.clinch]));
    expect(c.BOS).toBe('e'); // nobody else can reach 70
    expect(c.NYK).toBe('x'); // only BOS, PHI (57) and CLE (56) can still reach 56
    expect(c.CHI).toBeUndefined();
    expect(c.WAS).toBe('o'); // 15 + 7 = 22: 10+ teams already have more wins
    expect(c.BKN).toBe('o');
    expect(c.TOR).toBeUndefined();
  });
  it('division title and play-in', () => {
    const recs: Record<string, [number, number]> = {
      // Atlantic: BOS 60-15 can't be caught by its division (NYK 50-25 → 57), but MIL 59-16 could still pass it
      BOS: [60, 15], NYK: [50, 25], PHI: [30, 45], TOR: [30, 45], BKN: [30, 45],
      MIL: [59, 16], CLE: [58, 17], DET: [57, 18], IND: [56, 19], CHI: [55, 20],
      ATL: [54, 21], MIA: [53, 22], ORL: [52, 23], CHA: [10, 65], WAS: [10, 65],
    };
    const conf = Object.entries(recs).map(([x, [w, l]]) => row(x, w, l));
    markClinches(conf);
    const c = Object.fromEntries(conf.map((t) => [t.tricode, t.clinch]));
    expect(c.BOS).toBe('a');
    // NYK 50-25: 9 others can still reach 50 (BOS, MIL … ORL): top 10 is sure, top 6 isn't
    expect(c.NYK).toBe('pi');
  });
});
