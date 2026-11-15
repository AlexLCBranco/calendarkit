// The feed writes multiple overtimes two ways: "Final/2OT" and, since 2026-11-12, "Final/OT2". Every reader of the
// status text (the OT marker, the Cup's OT rule, the standings' OT column) must take both.
// Fixtures: tests/fixtures/game-0022600228-final-ot2.json = DET 144 @ WAS 140 (Nov 12) as the schedule feed wrote it
// on 2026-11-15 (slimmed like the snapshot); tests/fixtures/boxscore-0022600228-2ot.json = its boxscore the same day,
// trimmed to the fields used (121-121 after four periods, two overtimes).

import { describe, expect, it } from 'vitest';
import raw from './fixtures/game-0022600228-final-ot2.json';
import box from './fixtures/boxscore-0022600228-2ot.json';
import { deriveGame, type RawScheduleGame } from '../src/shared/nba-schedule/parse';
import { finalStatusText, overtime, overtimeOf } from '../src/data/model';
import { cupSlots, cupStandings } from '../src/data/cup';
import { collectRegulation, regulationFromBoxscore } from '../src/data/regulation';
import { computeStandings, fmtRec } from '../src/data/standings';
import { TEAMS } from '../src/data/teams';
import { game } from './synthetic';

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;

describe('overtimeOf: both ways of writing overtime', () => {
  it.each([
    ['Final', undefined],
    ['Final/OT', 'OT'],
    ['Final/2OT', '2OT'],
    ['Final/OT2', '2OT'],
    ['Final/3OT', '3OT'],
    ['Final/OT3', '3OT'],
    ['Final/OT1', 'OT'],
    ['Final/OT2  ', '2OT'],
    ['OT 2:31', undefined],
    ['7:30 pm ET', undefined],
  ])('%s → %s', (text, ot) => {
    expect(overtimeOf(text)).toBe(ot);
  });
  it('writes the status the same way everywhere ("Final/2OT")', () => {
    expect(finalStatusText('Final/OT2')).toBe('Final/2OT');
    expect(finalStatusText('Final/OT')).toBe('Final/OT');
    expect(finalStatusText('Final')).toBe('Final');
    expect(finalStatusText('')).toBe('Final');
  });
});

describe('the real "Final/OT2" game (DET @ WAS, Nov 12)', () => {
  const g = deriveGame(raw as unknown as RawScheduleGame, '2026-27');
  it('is a final 2OT game', () => {
    expect(raw.gameStatusText).toBe('Final/OT2');
    expect(overtime(g)).toBe('2OT');
  });
  it('counts in the standings OT column', () => {
    const s = computeStandings([g]);
    expect(fmtRec(s.East.find((t) => t.tricode === 'DET')!.ot)).toBe('1-0');
    expect(fmtRec(s.East.find((t) => t.tricode === 'WAS')!.ot)).toBe('0-1');
  });
  it('its boxscore gives the regulation totals (two overtime periods left out)', () => {
    expect(regulationFromBoxscore(box)).toEqual({ gameId: '0022600228', away: 121, home: 121 });
  });
});

describe('a Cup group game written "Final/OT2"', () => {
  // the same game as a West Group A Cup game between DEN (home) and HOU
  const cup = game({ id: '0022600228', date: '2026-11-13', utc: '2026-11-14T00:00:00Z', home: ID.DEN, away: ID.HOU, subtype: 'in-season', subLabel: 'West Group A', final: [144, 140], raw: { gameStatusText: 'Final/OT2' } });
  it('the snapshot job fetches and stores its regulation totals', async () => {
    const { regulation, fetched } = await collectRegulation([cup], {}, async () => box, () => {});
    expect(fetched).toEqual(['0022600228']);
    expect(regulation).toEqual({ '0022600228': [121, 121] });
  });
  it('counts 0 in the differential and its regulation points', () => {
    const s = cupStandings([cup], { '0022600228': [121, 121] });
    const line = (tri: string) => s.groups.flatMap((x) => x.teams).find((t) => t.tricode === tri)!;
    expect(line('HOU')).toMatchObject({ w: 1, diff: 0, points: 121, otGames: 1 });
    expect(line('DEN')).toMatchObject({ l: 1, diff: 0, points: 121, otGames: 1 });
    expect(s.hasOt).toBe(true);
    expect(s.otWithoutRegulation).toBe(0);
    const slot = cupSlots([cup]).get(ID.HOU!)![0]!;
    expect(slot).toMatchObject({ diff: 0, margin: 4, final: 'HOU 144 @ DEN 140 · Final/2OT' });
  });
});
