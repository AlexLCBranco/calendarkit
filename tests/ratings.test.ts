// CK-19: offensive / defensive / net rating — the possessions math, from fixtures.
import { describe, expect, it } from 'vitest';
import { parseRatingsStats, per100, teamRatings, type RatingsFile } from '../src/data/ratings';
import { countsInStandings, leagueStandings } from '../src/data/standings';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

/** The shape of ESPN's team statistics answer, trimmed (BOS, 2026-11-18). */
const ESPN_BOS = {
  splits: {
    categories: [
      { name: 'defensive', stats: [{ name: 'blocks', value: 70 }] },
      { name: 'general', stats: [{ name: 'gamesPlayed', value: 14 }] },
      { name: 'offensive', stats: [{ name: 'points', value: 1607 }, { name: 'possessions', value: 1387.92 }, { name: 'estimatedPossessions', value: 1375.2 }] },
    ],
  },
};

describe('ratings', () => {
  it('reads games played, possessions and points from ESPN’s answer; a missing number throws', () => {
    expect(parseRatingsStats(ESPN_BOS)).toEqual([14, 1387.9, 1607]);
    expect(() => parseRatingsStats({ splits: { categories: [] } })).toThrow(/gamesPlayed/);
  });

  it('per 100 possessions, to one decimal', () => {
    expect(per100(1607, 1387.9)).toBe(115.8);
    expect(per100(1500, 1500)).toBe(100);
  });

  const s = leagueStandings(data);
  const all = [...s.West, ...s.East];
  // 100 possessions a game: ORtg = points for per game, DRtg = points against per game
  const file: RatingsFile = { source: 'test', season: data.seasonYear, teams: Object.fromEntries(all.map((t) => [t.tricode, [t.w + t.l, 100 * (t.w + t.l), t.pf]])) };
  const played = all.filter((t) => t.w + t.l > 0);

  it('ORtg, DRtg and Net for every team that has played; DRtg from the points the schedule says it allowed', () => {
    const r = teamRatings(data.games, file);
    expect(r.size).toBe(played.length);
    for (const t of played) {
      const x = r.get(t.teamId)!;
      expect(x.ortg, t.tricode).toBeCloseTo(t.ppg, 1);
      expect(x.drtg, t.tricode).toBeCloseTo(t.oppg, 1);
      expect(x.net, t.tricode).toBeCloseTo(x.ortg - x.drtg, 1);
    }
  });

  it('ranks: 1 = highest ORtg, lowest DRtg, highest Net; ties share a rank', () => {
    const r = [...teamRatings(data.games, file).values()];
    const best = (k: 'ortg' | 'drtg' | 'net') => r.filter((x) => x[`${k}Rank`] === 1).map((x) => x[k]);
    expect(best('ortg')[0]).toBe(Math.max(...r.map((x) => x.ortg)));
    expect(best('drtg')[0]).toBe(Math.min(...r.map((x) => x.drtg)));
    expect(best('net')[0]).toBe(Math.max(...r.map((x) => x.net)));
    for (const x of r) expect(r.filter((y) => y.ortg > x.ortg).length + 1).toBe(x.ortgRank);
  });

  it('the schedule ahead of ESPN: only ESPN’s first games count; behind: the same share of the possessions', () => {
    const t = [...played].sort((a, b) => b.w + b.l - (a.w + a.l))[0]!;
    expect(t.w + t.l).toBeGreaterThanOrEqual(2);
    const mine = data.games.filter(countsInStandings).filter((g) => g.homeTeam.teamId === t.teamId || g.awayTeam.teamId === t.teamId).sort((a, b) => a.dateEt.localeCompare(b.dateEt));
    const allowed = (n: number) => mine.slice(0, n).reduce((sum, g) => sum + (g.homeTeam.teamId === t.teamId ? g.awayTeam.score : g.homeTeam.score), 0);
    const ahead = teamRatings(data.games, { ...file, teams: { [t.tricode]: [1, 100, 115] } }).get(t.teamId)!;
    expect(ahead.drtg).toBe(per100(allowed(1), 100));
    const gp = mine.length;
    const behind = teamRatings(data.games, { ...file, teams: { [t.tricode]: [gp + 2, 100 * (gp + 2), 0] } }).get(t.teamId)!;
    expect(behind.drtg).toBe(per100(allowed(gp), 100 * gp));
  });

  it('a team missing from the file, or with no games, has no rating', () => {
    const r = teamRatings(data.games, { ...file, teams: { BOS: [0, 0, 0] } });
    expect(r.size).toBe(0);
    expect(TEAMS).toHaveLength(30);
  });
});
