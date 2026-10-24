// 3-in-4 sets: rotationkit's cases (tests/scheduleTags.test.ts at 5a531d5, ported to calendarkit's games), then the
// real feed for all 30 teams against positions worked out here independently (plain date arithmetic on the feed).

import { describe, expect, it } from 'vitest';
import { teamB2BPairs, teamGames } from '../src/data/model';
import { teamThreeInFour, threeInFour, threeInFourLabel, threeInFourTip } from '../src/data/scheduleTags';
import { TEAMS } from '../src/data/teams';
import { data, feed } from './feed';
import { dataOf, game, TEAM } from './synthetic';

/** Team BOS's games on these ET dates (alternating home/away). */
const sched = (dates: string[]) => dates.map((date, i) => game({ date, utc: `${date}T23:00:00Z`, home: i % 2 ? TEAM.BOS : TEAM.NYK, away: i % 2 ? TEAM.NYK : TEAM.BOS }));
const positions = (dates: string[]) => {
  const g = sched(dates);
  const t = threeInFour(g);
  return g.map((x) => t.get(x.gameId)?.position ?? null);
};

describe('threeInFour (rotationkit cases)', () => {
  it('3 games in 4 days with the gap in the middle: 1st, 2nd, 3rd', () => {
    expect(positions(['2025-11-01', '2025-11-03', '2025-11-04', '2025-11-08'])).toEqual([1, 2, 3, null]);
  });
  it('3 games in 4 days with the gap at the end; one set', () => {
    const g = sched(['2025-11-01', '2025-11-02', '2025-11-04']);
    const t = threeInFour(g);
    expect(g.map((x) => t.get(x.gameId)?.position)).toEqual([1, 2, 3]);
    expect(t.get(g[2]!.gameId)!.sets).toHaveLength(1);
  });
  it('3 games in 5 days is not a 3-in-4', () => {
    expect(positions(['2025-11-01', '2025-11-03', '2025-11-05'])).toEqual([null, null, null]);
  });
  it('4 games in 5 days: overlapping sets → highest position, all sets listed', () => {
    const g = sched(['2025-11-01', '2025-11-02', '2025-11-04', '2025-11-05']);
    const t = threeInFour(g);
    expect(g.map((x) => t.get(x.gameId)!.position)).toEqual([1, 2, 3, 3]);
    expect(t.get(g[1]!.gameId)!.sets.map((s) => s.position)).toEqual([2, 1]);
    expect(t.get(g[2]!.gameId)!.sets.map((s) => s.position)).toEqual([3, 2]);
    expect(t.get(g[2]!.gameId)!.sets.map((s) => s.dates)).toEqual([
      ['2025-11-01', '2025-11-02', '2025-11-04'],
      ['2025-11-02', '2025-11-04', '2025-11-05'],
    ]);
    expect(t.get(g[2]!.gameId)!.sets[1]!.ids).toEqual([g[1]!.gameId, g[2]!.gameId, g[3]!.gameId]);
    // tooltip lists every set and this game's place in it
    expect(threeInFourTip(t.get(g[2]!.gameId)!)).toBe('3 games in 4 days — 2 sets:\nNov 1, Nov 2, Nov 4 (3rd game)\nNov 2, Nov 4, Nov 5 (2nd game)');
    expect(threeInFourTip(t.get(g[0]!.gameId)!, 'NYK')).toBe('NYK: 3 games in 4 days — set:\nNov 1, Nov 2, Nov 4 (1st game)');
    expect(threeInFourLabel(t.get(g[3]!.gameId)!)).toBe('3-in-4 · 3rd');
  });
  it('B2B and 3-in-4 together: the 2nd night of a back-to-back can be a 3rd game', () => {
    const g = sched(['2025-11-01', '2025-11-03', '2025-11-04']);
    expect(threeInFour(g).get(g[2]!.gameId)!.position).toBe(3);
    expect(teamB2BPairs(dataOf(g), TEAM.BOS).map((p) => [p.first.gameId, p.second.gameId])).toEqual([[g[1]!.gameId, g[2]!.gameId]]);
  });
  it('season opener: the first games can be 1st and 2nd (no game before them)', () => {
    expect(positions(['2025-10-21', '2025-10-22', '2025-10-24', '2025-10-30'])).toEqual([1, 2, 3, null]);
  });
  it('All-Star break: a long gap breaks every set', () => {
    expect(positions(['2026-02-11', '2026-02-12', '2026-02-19', '2026-02-20'])).toEqual([null, null, null, null]);
  });
  it('month and year boundaries; leap day', () => {
    expect(positions(['2025-12-31', '2026-01-01', '2026-01-03'])).toEqual([1, 2, 3]);
    expect(positions(['2028-02-28', '2028-02-29', '2028-03-02'])).toEqual([1, 2, 3]);
    expect(positions(['2027-02-27', '2027-02-28', '2027-03-03'])).toEqual([null, null, null]); // 4 days apart
  });
  it('the calendarkit game whitelist = rotationkit\'s "all but preseason (001) and All-Star (003)"', () => {
    const prefixes = new Set(data.games.map((g) => g.gameId.slice(0, 3)));
    for (const p of prefixes) expect(['002', '004', '005', '006']).toContain(p);
    // the feed's preseason games are left out
    expect(feed.games.some((g) => g.gameId.startsWith('001'))).toBe(true);
    expect(data.games.some((g) => g.gameId.startsWith('001') || g.gameId.startsWith('003'))).toBe(false);
  });
});

describe('teamThreeInFour on the real feed, all 30 teams', () => {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  it('every position equals one worked out independently from the feed', () => {
    let sets = 0;
    let thirds = 0;
    for (const team of TEAMS) {
      // independent: the team's shown games straight from the parsed feed, sorted by ET date
      const games = feed.games
        .filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamId === team.id || g.awayTeam.teamId === team.id))
        .sort((a, b) => a.dateEt.localeCompare(b.dateEt));
      const want = new Map<string, { pos: number; n: number }>();
      for (let i = 0; i + 2 < games.length; i++) {
        if (day(games[i + 2]!.dateEt) - day(games[i]!.dateEt) > 3) continue;
        sets++;
        for (let k = 0; k < 3; k++) {
          const id = games[i + k]!.gameId;
          const w = want.get(id) ?? { pos: 0, n: 0 };
          want.set(id, { pos: Math.max(w.pos, k + 1), n: w.n + 1 });
        }
      }
      const got = teamThreeInFour(data, team.id);
      expect(teamGames(data, team.id).map((g) => g.gameId)).toEqual(games.map((g) => g.gameId));
      for (const g of games) {
        const t = got.get(g.gameId);
        expect(t?.position ?? 0, `${team.tricode} ${g.dateEt}`).toBe(want.get(g.gameId)?.pos ?? 0);
        expect(t?.sets.length ?? 0, `${team.tricode} ${g.dateEt} sets`).toBe(want.get(g.gameId)?.n ?? 0);
        if (t?.position === 3) thirds++;
        // the tooltip lists every set
        if (t) expect(threeInFourTip(t).split('\n')).toHaveLength(1 + t.sets.length);
      }
    }
    expect(sets).toBeGreaterThan(200);
    expect(thirds).toBeGreaterThan(200);
  });
});
