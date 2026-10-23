// Data layer on the saved real feed: which games are shown, the team table, day grouping.

import { describe, expect, it } from 'vitest';
import { data, feed } from './feed';
import { TEAMS, TEAM_BY_ID } from '../src/data/teams';
import { teamGames } from '../src/data/model';

describe('calendar data from the real feed', () => {
  it('drops preseason (and anything that is not regular/cup-final/play-in/playoffs)', () => {
    expect(feed.games.some((g) => g.gameType === 'preseason')).toBe(true);
    expect(data.games.some((g) => g.gameType === 'preseason')).toBe(false);
    expect(new Set(data.games.map((g) => g.gameType))).toEqual(new Set(['regular', 'cup-final']));
    expect(data.games).toHaveLength(1207);
  });

  it('keeps full game objects (scores, broadcasters, arena) untouched', () => {
    const g = data.games.find((x) => x.gameId === '0022600001')!;
    expect(g).toBe(feed.games.find((x) => x.gameId === '0022600001'));
    expect(g.homeTeam.score).toBeGreaterThan(0);
    expect(g.arenaName).toBe('Little Caesars Arena');
  });

  it('groups by the NBA (ET) game date and sorts by tip-off', () => {
    for (const [date, games] of data.byDate) {
      expect(games.every((g) => g.dateEt === date)).toBe(true);
      const tips = games.filter((g) => g.startTimeUtc).map((g) => g.startTimeUtc!);
      expect(tips).toEqual([...tips].sort());
    }
    expect(data.dates).toEqual([...data.dates].sort());
    expect(data.dates[0]).toBe('2026-10-20');
    expect(data.dates.at(-1)).toBe('2027-04-11');
  });

  it('team table matches the feed (30 teams, ids and tricodes)', () => {
    expect(TEAMS).toHaveLength(30);
    const feedTeams = new Map<number, string>();
    for (const g of data.games) for (const t of [g.homeTeam, g.awayTeam]) if (t.teamId) feedTeams.set(t.teamId, t.teamTricode);
    expect(feedTeams.size).toBe(30);
    for (const [id, tri] of feedTeams) expect(TEAM_BY_ID.get(id)?.tricode, String(id)).toBe(tri);
    for (const c of ['East', 'West']) expect(TEAMS.filter((t) => t.conference === c)).toHaveLength(15);
  });

  it('every team has its known games (80 or 81 + Cup knockout placeholders still TBD)', () => {
    for (const t of TEAMS) {
      const n = teamGames(data, t.id).length;
      expect(n, t.tricode).toBeGreaterThanOrEqual(80);
      expect(n, t.tricode).toBeLessThanOrEqual(82);
    }
  });
});
