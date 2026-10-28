// Model rules on synthetic cases: game-type filtering, back-to-backs, national TV and the TV-only counts.

import { describe, expect, it } from 'vitest';
import { countsByDate, hasNationalTv, isBackToBack, markers, nationalTv, teamGames } from '../src/data/model';
import { dataOf, game, TEAM } from './synthetic';
import { data as realData } from './feed';

describe('game-type filtering', () => {
  const g = {
    preseason: game({ id: '0012600001', date: '2026-10-05', utc: '2026-10-05T23:00:00Z' }),
    allStar: game({ id: '0032600001', date: '2027-02-14', utc: '2027-02-15T01:00:00Z' }),
    unknown: game({ id: '0092600001', date: '2027-02-13', utc: '2027-02-14T01:00:00Z' }),
    regular: game({ id: '0022600001', date: '2026-10-20', utc: '2026-10-20T23:00:00Z' }),
    cupGroup: game({ id: '0022600015', date: '2026-11-13', utc: '2026-11-14T00:00:00Z', subtype: 'in-season', subLabel: 'East Group A' }),
    cupQf: game({ id: '0022601201', date: '2026-12-04', utc: null, home: 0, away: 0, subtype: 'in-season-knockout', subLabel: 'Quarterfinal' }),
    cupFinal: game({ id: '0062600001', date: '2026-12-11', utc: '2026-12-12T01:00:00Z', subtype: 'in-season-knockout', subLabel: 'Championship' }),
    playIn: game({ id: '0052600101', date: '2027-04-14', utc: '2027-04-14T23:30:00Z' }),
    playoffs: game({ id: '0042600401', date: '2027-06-03', utc: '2027-06-04T00:30:00Z' }),
  };
  const d = dataOf(Object.values(g));
  const shown = new Set(d.games.map((x) => x.gameId));

  it('drops preseason, All-Star (all 003 events) and unknown types', () => {
    for (const x of [g.preseason, g.allStar, g.unknown]) expect(shown.has(x.gameId), x.gameId).toBe(false);
    expect(d.dates).not.toContain('2027-02-14');
  });

  it('keeps regular season, Cup (group, knockout, final), play-in and playoffs with the right markers', () => {
    for (const x of [g.regular, g.cupGroup, g.cupQf, g.cupFinal, g.playIn, g.playoffs]) expect(shown.has(x.gameId), x.gameId).toBe(true);
    expect(markers(g.regular)).toEqual([]);
    expect(markers(g.cupGroup).map((m) => m.kind)).toEqual(['cup']);
    expect(markers(g.cupQf)[0]).toMatchObject({ kind: 'cup', short: 'Cup QF' });
    expect(markers(g.cupFinal)).toEqual([{ kind: 'cup-final', short: 'Cup Final', long: 'NBA Cup Final' }]);
    expect(markers(g.playIn)[0]).toMatchObject({ kind: 'play-in', short: 'Play-In' });
    expect(markers(g.playoffs)[0]).toMatchObject({ kind: 'playoffs', short: 'Finals', long: 'Playoffs · NBA Finals' });
  });

  it('real feed: the Cup final (006) is labeled as the final; QF/SF as knockout rounds', () => {
    const final = realData.games.find((x) => x.gameType === 'cup-final')!;
    expect(markers(final)[0]!.long).toBe('NBA Cup Final');
    const ko = realData.games.filter((x) => x.isCupKnockout && x.gameType === 'regular').map((x) => markers(x)[0]!.short);
    expect(ko.sort()).toEqual(['Cup QF', 'Cup QF', 'Cup QF', 'Cup QF', 'Cup SF', 'Cup SF']);
    expect(realData.games.filter((x) => x.isCupGroupGame)).toHaveLength(60);
  });
});

describe('back-to-back', () => {
  const d = dataOf([
    game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
    game({ date: '2026-11-02', utc: '2026-11-03T00:00:00Z', home: TEAM.MIA, away: TEAM.BOS }),
    game({ date: '2026-11-04', utc: '2026-11-05T00:00:00Z', home: TEAM.BOS, away: TEAM.LAL }),
    // NYK: Nov 1 then Nov 3 (a day off between: not a back-to-back)
    game({ date: '2026-11-03', utc: '2026-11-04T00:00:00Z', home: TEAM.NYK, away: TEAM.DEN }),
    // Late tip on Nov 4 (after midnight in some zones) and a Nov 5 game: still a back-to-back by game date.
    game({ date: '2026-11-04', utc: '2026-11-05T03:30:00Z', home: TEAM.DEN, away: TEAM.MIA }),
    game({ date: '2026-11-05', utc: '2026-11-05T23:00:00Z', home: TEAM.DEN, away: TEAM.NYK }),
  ]);

  it('flags a team that also played the previous calendar (game) date', () => {
    expect(isBackToBack(d, TEAM.BOS, '2026-11-02')).toBe(true);
    expect(isBackToBack(d, TEAM.MIA, '2026-11-02')).toBe(false);
    expect(isBackToBack(d, TEAM.BOS, '2026-11-04')).toBe(false);
    expect(isBackToBack(d, TEAM.NYK, '2026-11-03')).toBe(false);
    expect(isBackToBack(d, TEAM.DEN, '2026-11-04')).toBe(true);
    expect(isBackToBack(d, TEAM.DEN, '2026-11-05')).toBe(true);
    expect(isBackToBack(d, TEAM.NYK, '2026-11-05')).toBe(false);
  });

  it('never flags an undecided (teamId 0) team', () => {
    const tbd = dataOf([game({ date: '2026-12-04', utc: null, home: 0, away: 0 }), game({ date: '2026-12-05', utc: null, home: 0, away: 0 })]);
    expect(isBackToBack(tbd, 0, '2026-12-05')).toBe(false);
  });

  it('real feed: LAL at LAC on Oct 28 after POR on Oct 27', () => {
    expect(isBackToBack(realData, TEAM.LAL, '2026-10-28')).toBe(true);
    expect(isBackToBack(realData, TEAM.LAL, '2026-10-27')).toBe(false);
    const n = teamGames(realData, TEAM.LAL).filter((x) => isBackToBack(realData, TEAM.LAL, x.dateEt)).length;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(25);
  });
});

describe('national TV', () => {
  it('names come from nationalBroadcasters only, de-duplicated', () => {
    const g = game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', natl: ['ABC', 'ESPN', 'ABC'] });
    g.broadcasters.homeTvBroadcasters = [{ ...g.broadcasters.nationalBroadcasters![0]!, broadcasterDisplay: 'NBC Sports Boston' }];
    expect(nationalTv(g)).toEqual(['ABC', 'ESPN']);
    expect(hasNationalTv(game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z' }))).toBe(false);
  });

  it('NBA TV is not national TV (NBA.com\'s national filter leaves those games out)', () => {
    const g = game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', natl: ['NBA TV'] });
    expect(nationalTv(g)).toEqual([]);
    expect(hasNationalTv(g)).toBe(false);
    expect(nationalTv(game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', natl: ['ESPN', 'NBA TV'] }))).toEqual(['ESPN']);
  });

  it('TV-only counts per date', () => {
    const d = dataOf([
      game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', natl: ['ESPN'] }),
      game({ date: '2026-11-01', utc: '2026-11-01T23:30:00Z', natl: ['NBA TV'] }),
      game({ date: '2026-11-01', utc: '2026-11-02T00:00:00Z' }),
      game({ date: '2026-11-02', utc: '2026-11-03T00:00:00Z' }),
    ]);
    expect([...countsByDate(d)]).toEqual([['2026-11-01', 3], ['2026-11-02', 1]]);
    expect([...countsByDate(d, true)]).toEqual([['2026-11-01', 1]]);
  });

  it('real feed: names seen on shown games are the US national networks (ESPN2 only had preseason games; no NBA TV)', () => {
    const names = new Set(realData.games.flatMap(nationalTv));
    expect([...names].sort()).toEqual(['ABC', 'ESPN', 'NBC', 'NBC Sports Network', 'Peacock', 'Prime Video', 'Telemundo']);
  });
});
