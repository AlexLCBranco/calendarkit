// Round 8 (3.2): a hovered game's back-to-back travel lines, checked against every game of the season worked out here
// independently: a team on the 2nd night (it also played the calendar day before) gets a line from that game's arena to
// tonight's; on the 1st night (it plays again the next day), from tonight's to that game's. Both ends: the feed's arena.
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/data/model';
import { travelLines } from '../src/map/travel';
import { data } from './feed';

/** The team's game on `date`, straight from the day's games. */
const gameOn = (teamId: number, date: string) => (data.byDate.get(date) ?? []).find((g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId);

describe('travelLines', () => {
  it('every game of the season: exactly the teams on a back-to-back night, with the right ends', () => {
    let n2 = 0;
    let n1 = 0;

    for (const g of data.games) {
      const want: string[] = [];
      for (const t of [g.awayTeam, g.homeTeam]) {
        if (!t.teamId) continue;
        const y = gameOn(t.teamId, addDays(g.dateEt, -1));
        const m = gameOn(t.teamId, addDays(g.dateEt, 1));
        if (y) want.push(`${t.teamTricode}:2 ${y.arenaName}|${y.arenaCity} -> ${g.arenaName}|${g.arenaCity}`);
        if (m) want.push(`${t.teamTricode}:1 ${g.arenaName}|${g.arenaCity} -> ${m.arenaName}|${m.arenaCity}`);

      }
      const got = travelLines(data, g).map((l) => {
        const other = l.other;
        const [from, to] = l.night === 2 ? [other, g] : [g, other];
        return `${l.team}:${l.night} ${from.arenaName}|${from.arenaCity} -> ${to.arenaName}|${to.arenaCity}`;
      });
      expect(got.sort(), `${g.gameId} ${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode} ${g.dateEt}`).toEqual(want.sort());
      for (const l of travelLines(data, g)) l.night === 2 ? n2++ : n1++;
    }
    expect(n2).toBe(n1); // every pair has two ends
    expect(n2).toBeGreaterThan(400);
  });

  it('BOS @ HOU, Nov 2, 2026 (real): BOS played @ ORL the night before — a road game — so its line runs Orlando → Houston', () => {
    const g = data.byDate.get('2026-11-02')!.find((x) => x.awayTeam.teamTricode === 'BOS')!;
    expect(g.homeTeam.teamTricode).toBe('HOU');
    const y = gameOn(g.awayTeam.teamId, '2026-11-01')!;
    expect([y.awayTeam.teamTricode, y.homeTeam.teamTricode, y.arenaCity]).toEqual(['BOS', 'ORL', 'Orlando']);
    const lines = travelLines(data, g);
    expect(lines).toHaveLength(1);
    const [l] = lines;
    expect([l!.team, l!.side, l!.night, l!.stays]).toEqual(['BOS', 'away', 2, false]);
    expect([l!.from.kind === 'map' && l!.from.arena.arena, l!.to.kind === 'map' && l!.to.arena.arena]).toEqual(['Kia Center', 'Toyota Center']);
  });

  it('a home stand on consecutive nights is "stays" (one arena: nothing to draw)', () => {
    const stay = data.games.flatMap((g) => travelLines(data, g)).find((l) => l.stays)!;
    expect(stay).toBeDefined();
    expect(stay.from.kind !== 'unknown' && stay.to.kind !== 'unknown' && stay.from.arena === stay.to.arena).toBe(true);
  });
});
