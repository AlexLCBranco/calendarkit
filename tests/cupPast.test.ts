// CK-43: a past Cup's details for the history pages — records going in and rest/travel come from the stored schedule
// (never today's rules), arenas under an earlier name still resolve, and the wild-card race is the NBA's order.
import { describe, expect, it } from 'vitest';
import { pastArena, pastPrep, pastRaces, SEASONS } from '../src/data/cupPast';
import { data } from './feed';

describe('stored knockout details', () => {
  it('every knockout team has its record going in and its previous game; the records step up by the Cup wins', () => {
    for (const s of SEASONS)
      for (const k of s.knockout)
        for (const t of [k.home, k.away]) {
          expect(t.prev, `${s.year} ${k.round} ${t.tricode}`).toBeDefined();
          expect(t.prev!.date < k.date).toBe(true);
          expect(t.record.w + t.record.l).toBeGreaterThan(15);
        }
    // 2023 IND: 10-8 before its QF win, 11-8 before the SF, 12-8 before the Final (the Championship doesn't count)
    const s = SEASONS.find((x) => x.year === 2023)!;
    const ind = (round: string) => s.knockout.filter((k) => k.round === round).flatMap((k) => [k.home, k.away]).find((t) => t.tricode === 'IND')!.record;
    expect([ind('qf'), ind('sf'), ind('final')]).toEqual([{ w: 10, l: 8 }, { w: 11, l: 8 }, { w: 12, l: 8 }]);
  });
  it("every arena of a knockout game and of the game before it is on the map (Footprint Center = Phoenix's arena)", () => {
    expect(pastArena('Footprint Center', 'Phoenix')?.arena).toBe('Mortgage Matchup Center');
    for (const s of SEASONS)
      for (const k of s.knockout) {
        expect(pastArena(k.arena, k.city), k.arena).toBeDefined();
        for (const t of [k.home, k.away]) expect(pastArena(t.prev!.arena, t.prev!.city), t.prev!.arena).toBeDefined();
      }
  });
  it('rest and travel: the host has none to travel; a team coming off a game in the same arena travels 0', () => {
    for (const s of SEASONS)
      for (const k of s.knockout) {
        for (const t of [k.home, k.away]) expect(pastPrep(data, k, t)!.text).toMatch(/^\d+d rest( · ✈ [\d,]+ mi(, [A-Z]+→[A-Z]+)?)?$/);
        if (k.round === 'qf') expect(pastPrep(data, k, k.home)!.travel).toBeUndefined();
        if (k.round === 'final') for (const t of [k.home, k.away]) expect(pastPrep(data, k, t)!.text).not.toMatch(/✈/);
      }
  });
  it("the wild-card race: three 2nd-place teams per conference, the NBA's wild card first, then two of the rest", () => {
    for (const s of SEASONS)
      for (const r of pastRaces(s)) {
        expect(r.teams.map((t) => t.rank)).toEqual([2, 2, 2]);
        expect(s.teams.find((t) => t.teamId === r.teams[0]!.teamId)!.wildCard).toBe(true);
        expect(r.chasing).toHaveLength(2);
      }
  });
});
