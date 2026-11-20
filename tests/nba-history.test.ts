// CK-24: the past seasons' data (public/data/history/, built from ESPN by scripts/make-nba-history.ts) against a second
// source: final records, Finals and conference finals results and play-in seeds as Basketball-Reference has them.
// And the bracket's order, the season list written out for the strip, every season's own checks.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bracketOf, HISTORY_YEARS, playInLabel, seasonLabel, type HistIndexRow, type HistSeason, type HistSeries } from '../src/data/nbaHistory';

const season = (y: number) => JSON.parse(readFileSync(`public/data/history/${y}.json`, 'utf8')) as HistSeason;
const index = (JSON.parse(readFileSync('public/data/history/index.json', 'utf8')) as { seasons: HistIndexRow[] }).seasons;
const rec = (s: HistSeason, t: string) => {
  const r = [...s.standings.East, ...s.standings.West].find((x) => x.t === t)!;
  return `${r.w}-${r.l}`;
};
const result = (x: HistSeries) => `${x.winner} ${Math.max(...x.wins)}-${Math.min(...x.wins)} ${x.winner === x.a ? x.b : x.a}`;
const round = (s: HistSeason, r: number, conf?: string) => s.series.filter((x) => x.round === r && (conf === undefined || x.conf === conf)).map(result).sort();

// Basketball-Reference (basketball-reference.com/leagues/NBA_<year>.html and NBA_<year>_playoffs.html)
describe('equal to Basketball-Reference', () => {
  it('2015-16: Warriors 73-9, Spurs 67-15, Cavaliers 57-25; CLE beat GSW 4-3, GSW beat OKC 4-3, CLE beat TOR 4-2', () => {
    const s = season(2016);
    expect([rec(s, 'GSW'), rec(s, 'SAS'), rec(s, 'CLE'), rec(s, 'TOR')]).toEqual(['73-9', '67-15', '57-25', '56-26']);
    expect(round(s, 4)).toEqual(['CLE 4-3 GSW']);
    expect(round(s, 3)).toEqual(['CLE 4-2 TOR', 'GSW 4-3 OKC']);
    expect(round(s, 1, 'East')).toEqual(['ATL 4-2 BOS', 'CLE 4-0 DET', 'MIA 4-3 CHA', 'TOR 4-3 IND']);
  });
  it('2007-08: Celtics 66-16; BOS beat LAL 4-2', () => {
    const s = season(2008);
    expect(rec(s, 'BOS')).toBe('66-16');
    expect(round(s, 4)).toEqual(['BOS 4-2 LAL']);
  });
  it('2010-11: DAL beat MIA 4-2; 2001-02: LAL swept NJ 4-0 (first round best of five: NJ beat IND 3-2)', () => {
    expect(round(season(2011), 4)).toEqual(['DAL 4-2 MIA']);
    const s = season(2002);
    expect(round(s, 4)).toEqual(['LAL 4-0 NJ']);
    expect(s.series.find((x) => x.round === 1 && [x.a, x.b].includes('NJ'))!.wins).toEqual([3, 2]);
  });
  it('2022-23: play-in — ATL beat MIA (7v8), MIA beat CHI for the 8th seed; DEN beat MIA 4-1, MIA (8) beat MIL (1) 4-1', () => {
    const s = season(2023);
    const east = s.playIn.filter((g) => s.standings.East.some((r) => r.t === g.away));
    expect(east.map((g) => `${g.away} ${g.as} @ ${g.hs} ${g.home}`)).toEqual(['ATL 116 @ 105 MIA', 'CHI 109 @ 105 TOR', 'CHI 91 @ 102 MIA']);
    expect(east.map((g) => playInLabel(s.playIn, g))).toEqual(['7th v 8th', '9th v 10th', 'For the 8th seed']);
    expect(round(s, 4)).toEqual(['DEN 4-1 MIA']);
    const mil = s.series.find((x) => x.round === 1 && x.a === 'MIL')!;
    expect([mil.aSeed, mil.b, mil.bSeed, result(mil)]).toEqual([1, 'MIA', 8, 'MIA 4-1 MIL']);
  });
});

describe('every season', () => {
  it('the strip\'s seasons are index.json\'s, newest first: 2025-26 back to 2001-02', () => {
    expect(index.map((r) => r.year)).toEqual(HISTORY_YEARS);
    expect([seasonLabel(HISTORY_YEARS[0]!), seasonLabel(HISTORY_YEARS.at(-1)!)]).toEqual(['2025-26', '2001-02']);
  });
  it('30 teams (29 before 2004-05), 15 series 8-4-2-1, seeds adding up to 9, the champion as index.json says', () => {
    for (const y of HISTORY_YEARS) {
      const s = season(y);
      expect(s.standings.East.length + s.standings.West.length, s.label).toBe(y < 2005 ? 29 : 30);
      expect([1, 2, 3, 4].map((r) => s.series.filter((x) => x.round === r).length), s.label).toEqual([8, 4, 2, 1]);
      for (const x of s.series.filter((q) => q.round === 1)) expect(x.aSeed + x.bSeed, `${s.label} ${x.a}-${x.b}`).toBe(9);
      expect(s.series.find((x) => x.round === 4)!.winner, s.label).toBe(index.find((r) => r.year === y)!.champion);
      expect(s.playIn.length, s.label).toBe(y >= 2021 ? 6 : 0);
    }
  });
  it('the bracket: first round 1v8, 4v5, 3v6, 2v7; the semifinals from those pairs', () => {
    const [r1, r2, r3] = bracketOf(season(2016).series, 'West');
    expect(r1!.map((x) => [x.aSeed, x.bSeed])).toEqual([[1, 8], [4, 5], [3, 6], [2, 7]]);
    expect(r2!.map((x) => `${x.a}-${x.b}`)).toEqual(['GSW-POR', 'SAS-OKC']);
    expect(r3!.map(result)).toEqual(['GSW 4-3 OKC']);
  });
});
