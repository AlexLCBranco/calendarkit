// CK-29: the opponent's situation in a team's game (record, streak, back-to-back night, 3-in-4, days off), checked
// against the schedule itself — the opponent's own previous game date decides back-to-back and rest.
import { describe, expect, it } from 'vitest';
import { opponentSituation } from '../src/data/opponent';
import { daysBetween, leagueRecords, teamGames } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

const BOS = TEAMS.find((t) => t.tricode === 'BOS')!.id;

describe('opponentSituation', () => {
  const games = teamGames(data, BOS).filter((g) => g.gameType === 'regular');

  it('every BOS game: the opponent, its back-to-back night 2 and its days off follow from its previous game', () => {
    let b2b = 0;
    let rested = 0;
    for (const g of games) {
      const o = opponentSituation(data, g, BOS)!;
      const oppId = g.homeTeam.teamId === BOS ? g.awayTeam.teamId : g.homeTeam.teamId;
      expect(o.teamId).toBe(oppId);
      const theirs = teamGames(data, oppId);
      const prev = theirs[theirs.findIndex((x) => x.gameId === g.gameId) - 1];
      const gap = prev ? daysBetween(prev.dateEt, g.dateEt) : undefined;
      if (gap === 1) {
        // played yesterday: the 2nd night (or the middle of three days in a row), no rest mark
        expect(o.b2b, g.dateEt).toBeDefined();
        expect(o.rest, g.dateEt).toBeUndefined();
        expect(['HH', 'HA', 'AH', 'AA']).toContain(o.b2b!.pair.code);
        b2b++;
      } else if (gap !== undefined && gap >= 2) {
        expect(o.rest?.days, g.dateEt).toBe(gap);
        expect(o.rest!.tier).toBe(gap >= 3 ? 'long' : 'short');
        expect(o.b2b?.night === 2, g.dateEt).toBe(false);
        rested++;
      } else expect(o.rest, g.dateEt).toBeUndefined();
    }
    expect(b2b).toBeGreaterThan(3);
    expect(rested).toBeGreaterThan(30);
  });

  it('a known game: the record is the league record of that game (after it once final, going in before)', () => {
    const g = games.find((x) => leagueRecords(data).get(x.gameId)?.has(x.homeTeam.teamId === BOS ? x.awayTeam.teamId : x.homeTeam.teamId))!;
    const o = opponentSituation(data, g, BOS)!;
    expect(o.record).toEqual(leagueRecords(data).get(g.gameId)!.get(o.teamId));
    expect(o.now).toBe(false);
  });

  it('a game far ahead: the opponent\'s record as of now, flagged', () => {
    const g = games.at(-1)!;
    const o = opponentSituation(data, g, BOS)!;
    expect(leagueRecords(data).get(g.gameId)?.get(o.teamId)).toBeUndefined();
    expect(o.record).toBeDefined();
    expect(o.now).toBe(true);
  });

  it('a team that is not in the game: nothing', () => {
    const other = data.games.find((g) => g.homeTeam.teamId !== BOS && g.awayTeam.teamId !== BOS)!;
    expect(opponentSituation(data, other, BOS)).toBeUndefined();
  });
});
