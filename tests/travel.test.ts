// The maps' travel view (src/map/travel.ts), checked against every game of the real season worked out here
// independently: each team's previous and next game, miles between the feed's arenas, same arena = 0 mi, the season
// opener / last game, rest = the lists' rest chips (and B2B badges), time-zone changes, places off the map.
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/data/arenas';
import { leagueFatigue } from '../src/data/fatigue';
import { teamB2BPairs } from '../src/data/model';
import { teamRestFlags } from '../src/data/rest';
import { TEAMS } from '../src/data/teams';
import { homeArena, miles } from '../src/data/geo';
import { gameTravel, tzChange, tzLabel, utcOffset } from '../src/map/travel';
import { data } from './feed';

const arenaOf = (g: { arenaName: string; arenaCity: string }) => ARENAS.find((a) => a.arena.toLowerCase() === g.arenaName.toLowerCase() && a.city.toLowerCase() === g.arenaCity.toLowerCase());
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
const tri = (t: string) => TEAMS.find((x) => x.tricode === t)!.id;

describe('gameTravel', () => {
  it('every game, both teams: previous / next game, miles, same arena = 0 mi and "stays", opener and last game', () => {
    let openers = 0;
    let lasts = 0;
    let stays = 0;
    for (const t of TEAMS) {
      const games = data.games.filter((g) => g.homeTeam.teamId === t.id || g.awayTeam.teamId === t.id).sort((a, b) => (a.startTimeUtc ?? a.dateEt).localeCompare(b.startTimeUtc ?? b.dateEt) || a.dateEt.localeCompare(b.dateEt));
      games.forEach((g, i) => {
        const tt = gameTravel(data, g).teams.find((x) => x.teamId === t.id)!;
        expect(tt.side).toBe(g.awayTeam.teamId === t.id ? 'away' : 'home');
        const [p, n] = [games[i - 1], games[i + 1]];
        expect(tt.prev?.game.gameId, `${t.tricode} ${g.gameId} prev`).toBe(p?.gameId);
        expect(tt.next?.game.gameId, `${t.tricode} ${g.gameId} next`).toBe(n?.gameId);
        if (!p) openers++;
        if (!n) lasts++;
        for (const [leg, other] of [[tt.prev, p], [tt.next, n]] as const) {
          if (!leg || !other) continue;
          const [a, b] = [arenaOf(other), arenaOf(g)];
          if (!a || !b) {
            expect(leg.miles).toBeUndefined();
            continue;
          }
          expect(leg.miles, `${t.tricode} ${g.gameId}`).toBe(Math.round(miles(a, b)));
          expect(leg.stays).toBe(a === b);
          if (a === b) {
            stays++;
            expect(leg.miles).toBe(0);
          } else expect(leg.miles).toBeGreaterThan(0);
        }
      });
    }
    expect(openers).toBe(30);
    expect(lasts).toBe(30);
    expect(stays).toBeGreaterThan(100); // home stands
  });

  it('rest = days between game dates, exactly the lists\' rest chips (2+ days) and B2B badges (1 day), for every game', () => {
    let checked = 0;
    for (const t of TEAMS) {
      const flags = teamRestFlags(data, t.id);
      const b2bSecond = new Set(teamB2BPairs(data, t.id).map((p) => p.second.gameId));
      const b2bFirst = new Set(teamB2BPairs(data, t.id).map((p) => p.first.gameId));
      for (const g of data.games) {
        if (g.homeTeam.teamId !== t.id && g.awayTeam.teamId !== t.id) continue;
        const tt = gameTravel(data, g).teams.find((x) => x.teamId === t.id)!;
        const f = flags.get(g.gameId);
        if (tt.prev) {
          expect(tt.prev.rest).toBe(day(g.dateEt) - day(tt.prev.game.dateEt));
          if (tt.prev.rest >= 2) expect(f?.after?.days, `${t.tricode} ${g.gameId}`).toBe(tt.prev.rest);
          else expect(f?.after).toBeUndefined();
          expect(tt.prev.rest === 1, `${t.tricode} ${g.gameId} B2B 2nd night`).toBe(b2bSecond.has(g.gameId));
          checked++;
        }
        if (tt.next) {
          if (tt.next.rest >= 2) expect(f?.before?.days, `${t.tricode} ${g.gameId}`).toBe(tt.next.rest);
          else expect(f?.before).toBeUndefined();
          expect(tt.next.rest === 1).toBe(b2bFirst.has(g.gameId));
        }
        // the 3-in-4 chip: the same stretch the lists show
        const m = leagueFatigue(data).get(g.gameId)?.get(t.id)?.tif?.merged;
        expect(!!tt.tif).toBe(!!m);
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('BOS @ HOU, Nov 2, 2026: BOS came from @ ORL the night before — Orlando → Houston, a B2B, clock −1h', () => {
    const g = data.byDate.get('2026-11-02')!.find((x) => x.awayTeam.teamTricode === 'BOS')!;
    const bos = gameTravel(data, g).teams[0]!;
    expect([bos.team, bos.side]).toEqual(['BOS', 'away']);
    expect(bos.prev!.game.homeTeam.teamTricode).toBe('ORL');
    expect(bos.prev!.loc.kind === 'map' && bos.prev!.loc.arena.arena).toBe('Kia Center');
    expect(bos.prev!.rest).toBe(1);
    expect(bos.prev!.tz).toBe(-1);
    expect(bos.prev!.miles).toBeGreaterThan(800);
    expect(bos.prev!.miles).toBeLessThan(900);
  });

  it('time-zone change: the UTC offset at each tip-off, by the arena\'s zone (Arizona keeps standard time)', () => {
    expect(utcOffset('America/New_York', Date.parse('2026-12-01T00:00:00Z'))).toBe(-5);
    expect(utcOffset('America/Phoenix', Date.parse('2026-07-01T00:00:00Z'))).toBe(-7);
    expect(utcOffset('Europe/Paris', Date.parse('2027-01-15T00:00:00Z'))).toBe(1);
    // every pair of consecutive games of a team: the difference of the two places' zones, known everywhere in the feed
    const zoneH: Record<string, number> = { ET: -5, CT: -6, MT: -7, PT: -8 };
    for (const t of TEAMS) {
      const games = data.games.filter((g) => g.homeTeam.teamId === t.id || g.awayTeam.teamId === t.id);
      for (let i = 1; i < games.length; i++) {
        const [a, b] = [arenaOf(games[i - 1]!), arenaOf(games[i]!)];
        if (!a || !b) continue;
        const tz = tzChange(games[i - 1]!, games[i]!);
        expect(tz, `${a.city} → ${b.city}`).toBeDefined();
        const z = (x: typeof a) => (x.city === 'Phoenix' ? undefined : ({ GA: 'ET', MA: 'ET', NY: 'ET', NC: 'ET', IL: 'CT', OH: 'ET', TX: 'CT', CO: 'MT', MI: 'ET', IN: 'ET', CA: 'PT', TN: 'CT', FL: 'ET', WI: 'CT', MN: 'CT', LA: 'CT', OK: 'CT', PA: 'ET', OR: 'PT', UT: 'MT', ON: 'ET', DC: 'ET', NV: 'PT' } as Record<string, string>)[x.state]);
        const [za, zb] = [z(a), z(b)];
        // a DST switch between the two games is no change (Boston → New York stays 'none'); Phoenix and abroad: above
        if (za && zb) expect(tz, `${a.city} → ${b.city}`).toBe(zoneH[zb]! - zoneH[za]!);
      }
    }
    expect([tzLabel(3), tzLabel(-2), tzLabel(0), tzLabel(undefined)]).toEqual(['+3h', '−2h', 'none', '?']);
  });

  it('places off the map (Mexico City, Paris): an edge point, real miles and clock change', () => {
    const mx = data.games.find((g) => g.arenaCity === 'Mexico City')!;
    const paris = data.games.find((g) => g.arenaCity === 'Paris')!;
    for (const g of [mx, paris]) {
      const tv = gameTravel(data, g);
      expect(tv.loc.kind, g.arenaCity).toBe('edge');
      for (const t of tv.teams) {
        expect(t.prev!.miles, `${t.team} to ${g.arenaCity}`).toBeGreaterThan(g === paris ? 3000 : 400);
        expect(t.prev!.tz).toBeDefined();
      }
    }
    const p = gameTravel(data, paris).teams[0]!;
    expect(p.prev!.tz).toBeGreaterThanOrEqual(5); // from US Eastern time or further west to Paris
  });

  it('cached per game: the same object on every hover', () => {
    const g = data.games[100]!;
    expect(gameTravel(data, g)).toBe(gameTravel(data, g));
  });

  it('home arena / great-circle miles (was tests/trips.test.ts)', () => {
    expect(homeArena(data, tri('BOS'))!.arena).toBe('TD Garden');
    expect(homeArena(data, tri('LAC'))!.arena).toBe('Intuit Dome');
    const d = miles(ARENAS.find((a) => a.arena === 'TD Garden')!, ARENAS.find((a) => a.arena === 'Crypto.com Arena')!);
    expect(d).toBeGreaterThan(2570);
    expect(d).toBeLessThan(2630);
  });
});
