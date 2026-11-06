// Round 21 (item 13): rest and travel before a knockout game — days off since the previous game, the road team's trip
// from that game's arena (miles, time-zone change), the host none; a game without a date: "TBD".
import { describe, expect, it } from 'vitest';
import { prepFor } from '../src/data/knockout';
import { ARENAS } from '../src/data/arenas';
import { miles } from '../src/data/geo';
import { dataOf, game, TEAM } from './synthetic';

const at = (name: string, city: string) => ({ arenaName: name, arenaCity: city });
const G = [
  // BOS's home games (its home arena: TD Garden); DEN's last game before Dec 4: at New York (Madison Square Garden)
  game({ date: '2026-11-20', utc: '2026-11-21T00:00:00Z', home: TEAM.BOS, away: TEAM.MIA, final: [100, 110], raw: at('TD Garden', 'Boston') }),
  game({ date: '2026-12-01', utc: '2026-12-02T00:00:00Z', home: TEAM.BOS, away: TEAM.LAL, final: [100, 110], raw: at('TD Garden', 'Boston') }),
  game({ date: '2026-11-30', utc: '2026-12-01T00:00:00Z', home: TEAM.DEN, away: TEAM.MIA, final: [100, 110], raw: at('Ball Arena', 'Denver') }),
  game({ date: '2026-12-02', utc: '2026-12-03T00:00:00Z', home: TEAM.NYK, away: TEAM.DEN, final: [100, 110], raw: at('Madison Square Garden', 'New York') }),
];
const data = dataOf(G);
const garden = ARENAS.find((a) => a.arena === 'TD Garden')!;
const msg = ARENAS.find((a) => a.arena === 'Madison Square Garden')!;

describe('prepFor', () => {
  it('the host at home: its days off, no travel', () => {
    const p = prepFor(data, TEAM.BOS, '2026-12-04', garden);
    expect(p.rest).toBe(2); // Dec 1 → Dec 4: Dec 2 and 3 off
    expect(p.travel).toBeUndefined();
    expect(p.text).toBe('2d rest');
  });
  it('the road team: days off and the trip from its last game (miles; a time-zone change only when there is one)', () => {
    const p = prepFor(data, TEAM.DEN, '2026-12-04', garden);
    expect(p.rest).toBe(1);
    const mi = Math.round(miles(msg, garden));
    expect(p.text).toBe(`1d rest · ✈ ${mi.toLocaleString('en-US')} mi`); // New York → Boston: both ET
    expect(p.tip).toMatch(/^DEN: last played 2026-12-02 \(@ NYK, New York\) — 1 day off; \d+ miles to Boston/);
  });
  it('no date yet: TBD; the simulator before the night is set: the trip, "rest TBD"', () => {
    expect(prepFor(data, TEAM.DEN, undefined, garden).text).toBe('TBD');
    expect(prepFor(data, TEAM.DEN, '2026-12-04', garden, false).text).toMatch(/^rest TBD · ✈ \d+ mi$/);
  });
});
