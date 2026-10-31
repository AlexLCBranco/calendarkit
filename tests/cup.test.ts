// NBA Cup standings (src/data/cup.ts): records, tiebreakers, wild cards, what counts — on synthetic games, then on the
// real feed's Cup games saved 2026-10-31 (tests/fixtures/cup-2026-10-31.json).

import { describe, expect, it } from 'vitest';
import cupFeed from './fixtures/cup-2026-10-31.json';
import { CUP_GROUP_TEAMS, CUP_GROUPS, cupGroupsOf, cupStandings, LAST_SEASON_WINS, rank, type CupStandings } from '../src/data/cup';
import { parseSchedule, type ScheduleGame } from '../src/shared/nba-schedule/parse';
import { TEAMS } from '../src/data/teams';
import { game } from './synthetic';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUP_OF = Object.fromEntries(Object.entries(CUP_GROUP_TEAMS).flatMap(([g, ts]) => ts.map((t) => [t, g])));

/** A finished Cup group game: `winner` beat `loser` winnerScore–loserScore (winner at home unless `away`). */
function cup(winner: string, loser: string, ws: number, ls: number, opts: { date?: string; ot?: boolean; away?: boolean; subtype?: string; final?: boolean } = {}): ScheduleGame {
  const [home, away, hs, as] = opts.away ? [loser, winner, ls, ws] : [winner, loser, ws, ls];
  return game({
    date: opts.date ?? '2026-11-07',
    utc: `${opts.date ?? '2026-11-07'}T23:00:00Z`,
    home: ID[home],
    away: ID[away],
    subtype: opts.subtype ?? 'in-season',
    subLabel: opts.subtype === 'in-season-knockout' ? 'Quarterfinal' : GROUP_OF[winner],
    final: opts.final === false ? undefined : [as, hs],
    raw: opts.ot ? { gameStatusText: 'Final/OT' } : {},
  });
}

const group = (s: CupStandings, g: string) => s.groups.find((x) => x.group === g)!;
const order = (s: CupStandings, g: string) => group(s, g).teams.map((t) => t.tricode);
/** The group order of just these teams (a 0-0 team is level with a 1-1 team, so bystanders can join a tie). */
const among = (s: CupStandings, g: string, tris: string[]) => order(s, g).filter((t) => tris.includes(t));
const team = (s: CupStandings, tri: string) => s.groups.flatMap((g) => g.teams).find((t) => t.tricode === tri)!;
const leaders = (s: CupStandings) => s.groups.map((g) => g.teams[0]!.tricode);
const wildCard = (s: CupStandings, c: 'West' | 'East') => s.wildCards.find((w) => w.conference === c)!.teams[0]!.tricode;

describe('cupStandings: records', () => {
  it('counts W, L, point differential and points scored per team', () => {
    const s = cupStandings([cup('DEN', 'PHX', 127, 120, { away: true }), cup('DEN', 'UTA', 110, 100)]);
    expect(team(s, 'DEN')).toMatchObject({ w: 2, l: 0, diff: 17, points: 237 });
    expect(team(s, 'PHX')).toMatchObject({ w: 0, l: 1, diff: -7, points: 120 });
    expect(team(s, 'HOU')).toMatchObject({ w: 0, l: 0, diff: 0, points: 0 });
    expect(s.games).toBe(2);
  });

  it('counts only finished group games inside Oct 30 – Nov 27: no knockout, unfinished or out-of-window games', () => {
    const s = cupStandings([
      cup('DEN', 'PHX', 100, 90),
      cup('DEN', 'DAL', 100, 90, { subtype: 'in-season-knockout', date: '2026-12-05' }),
      cup('DEN', 'UTA', 100, 90, { final: false }),
      cup('DEN', 'HOU', 100, 90, { date: '2026-11-28' }),
      cup('DEN', 'HOU', 100, 90, { date: '2026-10-29' }),
      game({ date: '2026-11-07', utc: '2026-11-07T23:00:00Z', home: ID.DEN, away: ID.DAL, final: [80, 120] }), // a regular game
    ]);
    expect(team(s, 'DEN')).toMatchObject({ w: 1, l: 0, diff: 10 });
    expect(s.games).toBe(1);
    expect(s.through).toBe('2026-11-07');
  });

  it('record order: games over .500 first, then win % (1-0 above 2-1, 0-0 level with 1-1)', () => {
    // DEN 1-0 above DAL 2-1 (both +1), then UTA 0-0 above HOU 1-2 and PHX 1-2
    const s = cupStandings([cup('DEN', 'HOU', 101, 100), cup('DAL', 'PHX', 101, 100), cup('DAL', 'HOU', 101, 100), cup('PHX', 'DAL', 101, 100), cup('HOU', 'PHX', 101, 100)]);
    expect(order(s, 'West Group A').slice(0, 3)).toEqual(['DEN', 'DAL', 'UTA']);
    // 0-0 is level with 1-1: the tiebreakers decide (here UTA 0-0 and DAL 1-1 with DAL +9 → DAL)
    const t = cupStandings([cup('DAL', 'PHX', 110, 100), cup('DEN', 'DAL', 101, 100), cup('DEN', 'HOU', 110, 100)]);
    expect(among(t, 'West Group A', ['DAL', 'UTA'])).toEqual(['DAL', 'UTA']);
    expect(team(t, 'DAL').tiebreak).toBe('diff');
  });

  it('lists every team, 5 per group, 0-0 before a group has played', () => {
    const s = cupStandings([]);
    expect(s.groups.map((g) => g.group)).toEqual([...CUP_GROUPS]);
    for (const g of s.groups) expect(g.teams.map((t) => t.tricode).sort()).toEqual([...CUP_GROUP_TEAMS[g.group]].sort());
    expect(s.through).toBeUndefined();
  });

  it('an OT game counts with its final score (the feed has no period scores) and is flagged', () => {
    const s = cupStandings([cup('DEN', 'PHX', 130, 125, { ot: true })]);
    expect(team(s, 'DEN')).toMatchObject({ diff: 5, points: 130, otGames: 1 });
    expect(s.hasOt).toBe(true);
    expect(cupStandings([cup('DEN', 'PHX', 130, 125)]).hasOt).toBe(false);
  });
});

describe('cupStandings: tiebreakers inside a group', () => {
  it('2-team tie broken by head-to-head, over a better point differential', () => {
    // DEN 1-1 (−1), DAL 1-1 (+29), but DEN beat DAL
    const s = cupStandings([cup('DEN', 'DAL', 100, 99), cup('DAL', 'UTA', 130, 100), cup('HOU', 'DEN', 102, 100)]);
    expect(order(s, 'West Group A')[0]).toBe('HOU');
    expect(among(s, 'West Group A', ['DEN', 'DAL'])).toEqual(['DEN', 'DAL']);
    expect(team(s, 'DEN')).toMatchObject({ rank: 2, tiebreak: 'h2h', tied: false });
  });

  it('3-team tie: head-to-head level (a circle), broken by point differential', () => {
    // DEN > DAL by 10, DAL > UTA by 3, UTA > DEN by 5 → DEN +5, UTA +2, DAL −7
    const s = cupStandings([cup('DEN', 'DAL', 110, 100), cup('DAL', 'UTA', 103, 100), cup('UTA', 'DEN', 105, 100)]);
    expect(among(s, 'West Group A', ['DEN', 'UTA', 'DAL'])).toEqual(['DEN', 'UTA', 'DAL']);
    expect(['DEN', 'UTA', 'DAL'].map((t) => team(s, t).tiebreak)).toEqual(['diff', 'diff', 'diff']);
  });

  it('3-team tie split in part: the two still level start again from head-to-head', () => {
    // DEN > DAL by 2, DAL > UTA by 6, UTA > DEN by 10 → DEN −8, DAL +4, UTA +4; DAL beat UTA
    const s = cupStandings([cup('DEN', 'DAL', 102, 100), cup('DAL', 'UTA', 106, 100), cup('UTA', 'DEN', 110, 100)]);
    expect(among(s, 'West Group A', ['DAL', 'UTA', 'DEN'])).toEqual(['DAL', 'UTA', 'DEN']);
    expect(team(s, 'DAL').tiebreak).toBe('h2h');
    expect(team(s, 'DEN').tiebreak).toBe('diff');
  });

  it('3-team tie broken by head-to-head when one team beat both others', () => {
    // all 2-2: DEN beat DAL and UTA, DAL beat UTA; outside games even it out
    const s = cupStandings([
      cup('DEN', 'DAL', 100, 99), cup('DEN', 'UTA', 100, 99), cup('DAL', 'UTA', 100, 99),
      cup('HOU', 'DEN', 140, 100), cup('PHX', 'DEN', 140, 100),
      cup('DAL', 'HOU', 100, 99), cup('PHX', 'DAL', 140, 100),
      cup('UTA', 'HOU', 100, 99), cup('UTA', 'PHX', 100, 99),
    ]);
    const tied = order(s, 'West Group A').filter((t) => ['DEN', 'DAL', 'UTA'].includes(t));
    expect(tied).toEqual(['DEN', 'DAL', 'UTA']);
    for (const t of tied) expect(team(s, t)).toMatchObject({ w: 2, l: 2, tiebreak: 'h2h' });
  });

  it('tie broken by point differential (no head-to-head game)', () => {
    const s = cupStandings([cup('DEN', 'PHX', 110, 100), cup('DAL', 'HOU', 120, 100)]);
    expect(order(s, 'West Group A').slice(0, 2)).toEqual(['DAL', 'DEN']);
    expect(team(s, 'DAL').tiebreak).toBe('diff');
  });

  it('tie reaching points scored: same record and differential', () => {
    const s = cupStandings([cup('DAL', 'PHX', 100, 90), cup('DEN', 'HOU', 120, 110)]);
    expect(order(s, 'West Group A').slice(0, 2)).toEqual(['DEN', 'DAL']);
    expect(team(s, 'DEN').tiebreak).toBe('points');
  });

  it('tie reaching last season: same record, differential and points', () => {
    const s = cupStandings([cup('DAL', 'PHX', 100, 90), cup('DEN', 'HOU', 100, 90)]);
    expect(LAST_SEASON_WINS.DEN).toBeGreaterThan(LAST_SEASON_WINS.DAL!);
    expect(order(s, 'West Group A').slice(0, 2)).toEqual(['DEN', 'DAL']);
    expect(team(s, 'DEN').tiebreak).toBe('last-season');
  });

  it('a tie no rule breaks keeps a stable (tricode) order and is marked tied', () => {
    const t = (tricode: string) => ({ teamId: tricode.length, tricode, w: 1, l: 0, diff: 5, points: 100 });
    const r = rank([t('ZZZ'), t('AAA')], [{ name: 'diff', value: (x) => x.diff }]);
    expect(r.map((x) => [x.team.tricode, x.tied])).toEqual([['AAA', true], ['ZZZ', true]]);
  });

  it('last season has a number for all 30 teams, adding up to 1230 wins', () => {
    expect(Object.keys(LAST_SEASON_WINS).sort()).toEqual(TEAMS.map((t) => t.tricode).sort());
    expect(Object.values(LAST_SEASON_WINS).reduce((a, b) => a + b, 0)).toBe(1230);
  });
});

describe('cupStandings: wild card', () => {
  it('the best 2nd-place record in each conference; ties without head-to-head, by differential', () => {
    const s = cupStandings([
      // West A: DEN 2-0, DAL 1-1 (+1); West B: MIN 2-0, OKC 1-1 (+12); West C: GSW 2-0, SAS 1-1 (+3)
      cup('DEN', 'DAL', 110, 100), cup('DEN', 'UTA', 110, 100), cup('DAL', 'HOU', 111, 100),
      cup('MIN', 'OKC', 110, 100), cup('MIN', 'NOP', 110, 100), cup('OKC', 'MEM', 122, 100),
      cup('GSW', 'SAS', 110, 100), cup('GSW', 'POR', 110, 100), cup('SAS', 'SAC', 113, 100),
    ]);
    expect(leaders(s).slice(0, 3)).toEqual(['DEN', 'MIN', 'GSW']);
    const race = s.wildCards.find((w) => w.conference === 'West')!;
    expect(race.teams.map((t) => [t.tricode, t.group])).toEqual([['OKC', 'West Group B'], ['SAS', 'West Group C'], ['DAL', 'West Group A']]);
    expect(race.teams[0]).toMatchObject({ wcTiebreak: 'diff', wcTied: false, status: 'wild-card' });
    expect(team(s, 'OKC').status).toBe('wild-card');
    expect(team(s, 'DAL').status).toBeUndefined();
  });

  it('a better 2nd-place record wins it over a better differential', () => {
    // West A: DEN 3-0, DAL 2-1 (−8); West B: MIN 1-0, OKC 1-1 (+49)
    const s = cupStandings([
      cup('DEN', 'DAL', 110, 100), cup('DEN', 'UTA', 110, 100), cup('DEN', 'HOU', 110, 100), cup('DAL', 'HOU', 101, 100), cup('DAL', 'PHX', 101, 100),
      cup('MIN', 'OKC', 101, 100), cup('OKC', 'MEM', 150, 100),
    ]);
    expect(wildCard(s, 'West')).toBe('DAL');
  });

  it('group ties are resolved first: the wild card comes from the team ranked 2nd after its group tiebreakers', () => {
    // West A: HOU 1-0, DEN and DAL 1-1 with DEN ahead on head-to-head although DAL's differential is far better
    const s = cupStandings([cup('DEN', 'DAL', 100, 99), cup('DAL', 'UTA', 130, 100), cup('HOU', 'DEN', 102, 100), cup('MIN', 'LAC', 101, 100)]);
    const west = s.wildCards.find((w) => w.conference === 'West')!.teams.map((t) => t.tricode);
    expect(west).toContain('DEN');
    expect(west).not.toContain('DAL');
  });

  it('wild-card ties skip head-to-head (2nd-place teams from different groups) and fall to last season', () => {
    // East: two 1-0 teams per group, all +10 with 110 points, so last season orders each group and the race:
    // A DET 60 > ORL 45, B PHI 45 > MIA 43, C BOS 56 > WAS 17 → 2nd: ORL 45, MIA 43, WAS 17 → ORL
    const s = cupStandings([
      cup('DET', 'TOR', 110, 100), cup('ORL', 'MIL', 110, 100), cup('MIA', 'NYK', 110, 100),
      cup('PHI', 'CLE', 110, 100), cup('WAS', 'CHI', 110, 100), cup('BOS', 'ATL', 110, 100),
    ]);
    expect(leaders(s).slice(3)).toEqual(['DET', 'PHI', 'BOS']);
    const race = s.wildCards.find((w) => w.conference === 'East')!;
    expect(race.teams.map((t) => t.tricode)).toEqual(['ORL', 'MIA', 'WAS']);
    expect(race.teams[0]).toMatchObject({ wcTiebreak: 'last-season', status: 'wild-card' });
  });
});

describe('cupStandings: Oct 30, 2026 (the first night of group play)', () => {
  const expected = { leaders: ['DEN', 'MIN', 'GSW', 'DET', 'MIA', 'WAS'], west: 'DAL', east: 'BOS' };

  it('from the results as listed: DEN, MIN, GSW, DET, MIA, WAS lead; DAL and BOS hold the wild cards', () => {
    const results: [string, string, number][] = [
      ['DEN', 'PHX', 7], ['DAL', 'HOU', 5], ['MIN', 'LAC', 26], ['GSW', 'LAL', 17], ['DET', 'BKN', 16],
      ['ORL', 'TOR', 7], ['MIA', 'IND', 20], ['PHI', 'NYK', 5], ['WAS', 'CHA', 16], ['BOS', 'CHI', 14],
    ];
    const s = cupStandings(results.map(([w, l, m]) => cup(w, l, 110 + m, 110, { date: '2026-10-30' })));
    expect(leaders(s)).toEqual(expected.leaders);
    expect([wildCard(s, 'West'), wildCard(s, 'East')]).toEqual([expected.west, expected.east]);
    expect(s.groups.flatMap((g) => g.teams.filter((t) => t.status === 'leader').map((t) => t.tricode))).toEqual(expected.leaders);
    expect(s.groups.flatMap((g) => g.teams.filter((t) => t.status === 'wild-card').map((t) => t.tricode))).toEqual([expected.west, expected.east]);
    expect(s.through).toBe('2026-10-30');
  });

  it('from the real feed: the same, with the feed’s scores', () => {
    const games = parseSchedule(cupFeed).games;
    const s = cupStandings(games.filter((g) => g.dateEt <= '2026-10-30'));
    expect(s.games).toBe(10);
    expect(leaders(s)).toEqual(expected.leaders);
    expect([wildCard(s, 'West'), wildCard(s, 'East')]).toEqual([expected.west, expected.east]);
    expect(team(s, 'MIN')).toMatchObject({ w: 1, l: 0, diff: 26, points: 127 });
    expect(team(s, 'PHX')).toMatchObject({ w: 0, l: 1, diff: -7 });
  });

  it('the feed’s groups are the 2026-27 groups (gameSubLabel on every group game; knockout games separate)', () => {
    const games = parseSchedule(cupFeed).games;
    const byId = new Map(TEAMS.map((t) => [t.id, t.tricode]));
    const groups = cupGroupsOf(games.filter((g) => g.gameSubLabel));
    for (const g of CUP_GROUPS) expect(groups.get(g)!.map((id) => byId.get(id)).sort()).toEqual([...CUP_GROUP_TEAMS[g]].sort());
    expect(games.filter((g) => g.isCupGroupGame)).toHaveLength(60);
    expect(games.filter((g) => g.isCupGroupGame).every((g) => (CUP_GROUPS as readonly string[]).includes(g.gameSubLabel))).toBe(true);
    expect(games.filter((g) => g.isCupKnockout).length).toBeGreaterThan(0);
  });
});
