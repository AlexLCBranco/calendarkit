// Parser tests on a trimmed copy of the real feed (fixture.json).

import { describe, expect, it } from 'vitest';
import fixture from './fixture.json';
import { finished, gameTypeOf, parseSchedule, regularSeason, ScheduleParseError } from './parse';

const s = parseSchedule(fixture);
const byId = (id: string) => s.games.find((g) => g.gameId === id)!;

describe('parseSchedule', () => {
  it('reads season, weeks and every game', () => {
    expect(s.seasonYear).toBe('2026-27');
    expect(s.leagueId).toBe('00');
    expect(s.weeks[0]).toMatchObject({ weekNumber: 1, weekName: 'Week 1' });
    expect(s.games).toHaveLength(9);
  });

  it('keeps every raw field untouched (scores, broadcasters, labels, arena, leaders)', () => {
    const dates = fixture.leagueSchedule.gameDates as unknown as { games: Record<string, unknown>[] }[];
    const raw = dates.flatMap((d) => d.games).find((g) => g.gameId === '0022600001')!;
    const g = byId('0022600001');
    for (const [k, v] of Object.entries(raw)) expect(g[k], k).toEqual(v);
    expect(g.homeTeam).toMatchObject({ teamTricode: 'DET', score: 121 });
    expect(g.awayTeam).toMatchObject({ teamTricode: 'BOS', score: 113 });
    expect(g.broadcasters.nationalBroadcasters!.length).toBeGreaterThan(0);
  });

  it('derives status, Eastern date and real UTC start', () => {
    const fin = byId('0022600001');
    expect(fin).toMatchObject({ status: 'final', statusText: 'Final', gameType: 'regular', dateEt: '2026-10-20', timeTbd: false });
    expect(fin.startTimeUtc).toBe(fin.gameDateTimeUTC);
    expect(byId('0012600038')).toMatchObject({ status: 'final', statusText: 'Final/OT', gameType: 'preseason' });
    // Live game: status text arrives padded with spaces.
    const live = byId('0022600006');
    expect(live.status).toBe('live');
    expect(live.statusText).toBe('3rd Qtr');
    expect(live.gameStatusText).toBe('3rd Qtr             ');
    expect(byId('0022600007')).toMatchObject({ status: 'scheduled', statusText: '9:30 pm ET', timeTbd: false });
  });

  it('NBA Cup: group game, TBD knockout, final (006, neutral site)', () => {
    expect(byId('0022600015')).toMatchObject({ isCupGroupGame: true, isCupKnockout: false, gameLabel: 'Emirates NBA Cup' });
    const qf = byId('0022601201');
    expect(qf).toMatchObject({ isCupKnockout: true, teamsTbd: true, timeTbd: true, startTimeUtc: null, gameSubLabel: 'Quarterfinal', gameType: 'regular' });
    expect(qf.homeTeam.teamId).toBe(0);
    const final = byId('0062600001');
    expect(final).toMatchObject({ gameType: 'cup-final', isCupKnockout: true, isNeutral: true, arenaCity: 'Indianapolis' });
  });

  it('neutral-site Global Games keep a designated home team', () => {
    const g = byId('0022600189');
    expect(g).toMatchObject({ gameSubtype: 'Global Games', isNeutral: true, arenaCity: 'Mexico City' });
    expect(g.homeTeam.teamTricode).not.toBe('');
  });

  it('helpers: regular season includes Cup group/knockout games but not the Cup final', () => {
    const reg = regularSeason(s).map((g) => g.gameId);
    expect(reg).toContain('0022601201');
    expect(reg).not.toContain('0062600001');
    expect(reg).not.toContain('0012600009');
    expect(finished(regularSeason(s)).map((g) => g.gameId)).toEqual(['0022600001']);
    expect(gameTypeOf('0042500101')).toBe('playoffs');
    expect(gameTypeOf('xyz')).toBe('unknown');
  });

  it('rejects malformed input with ScheduleParseError', () => {
    expect(() => parseSchedule(null)).toThrow(ScheduleParseError);
    expect(() => parseSchedule({ leagueSchedule: { seasonYear: '2026-27' } })).toThrow(/gameDates/);
    expect(() => parseSchedule({ leagueSchedule: { seasonYear: '2026-27', gameDates: [{ games: [{ foo: 1 }] }] } })).toThrow(/malformed game/);
  });
});
