// CK-18: the games behind each Standings cell match the cell's number, for every team.
import { describe, expect, it } from 'vitest';
import { cellGames, leagueStandings, LAST_RESULTS } from '../src/data/standings';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

describe('cellGames', () => {
  const s = leagueStandings(data);
  const all = [...s.West, ...s.East];
  it('every team: Left / Home / Road / B2B list as many games as the cell says; legs as many as the record', () => {
    for (const t of all) {
      const n = (k: Parameters<typeof cellGames>[2]) => cellGames(data.games, t.teamId, k).length;
      expect(n('left'), t.tricode).toBe(t.left.total);
      expect(n('leftHome'), t.tricode).toBe(t.left.home);
      expect(n('leftRoad'), t.tricode).toBe(t.left.road);
      expect(n('leftB2b'), t.tricode).toBe(t.left.b2b);
      expect(n('b2b1'), t.tricode).toBe(t.b2bFirst.w + t.b2bFirst.l);
      expect(n('b2b2'), t.tricode).toBe(t.b2bSecond.w + t.b2bSecond.l);
    }
  });
  it('W-L: the last 5 results, finals, the team in each, newest last', () => {
    for (const t of TEAMS) {
      const g = cellGames(data.games, t.id, 'wl');
      expect(g.length).toBeLessThanOrEqual(LAST_RESULTS);
      for (const x of g) expect(x.status).toBe('final');
      for (const x of g) expect([x.homeTeam.teamId, x.awayTeam.teamId]).toContain(t.id);
      expect(g.map((x) => x.dateEt)).toEqual([...g.map((x) => x.dateEt)].sort());
    }
  });
  it('Home and Road leave out neutral sites; the 2nd nights to come are all unplayed', () => {
    for (const t of TEAMS) {
      for (const g of cellGames(data.games, t.id, 'leftHome')) expect(g.homeTeam.teamId).toBe(t.id);
      for (const g of cellGames(data.games, t.id, 'leftRoad')) expect(g.awayTeam.teamId).toBe(t.id);
      for (const g of cellGames(data.games, t.id, 'leftB2b')) expect(g.status).not.toBe('final');
    }
  });
});
