// Team map: road trips and their numbers, against the season worked out here independently.
import { describe, expect, it } from 'vitest';
import { TEAMS } from '../src/data/teams';
import { ARENAS } from '../src/map/arenas';
import { currentTrip, homeArena, miles, teamTrips, tripOf, tripStats, tripStops } from '../src/map/trips';
import { data } from './feed';

const arena = (name: string) => ARENAS.find((a) => a.arena === name)!;
/** Metro of a feed city, written out here: the two suburb/borough arenas belong to LA and New York. */
const metro = (city: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' })[city] ?? city;

describe('teamTrips', () => {
  it('every team: trips = maximal runs of games outside the home metro (home = the city of most of its home games)', () => {
    for (const t of TEAMS) {
      const games = data.games.filter((g) => g.homeTeam.teamId === t.id || g.awayTeam.teamId === t.id);
      const cities = new Map<string, number>();
      for (const g of games) if (g.homeTeam.teamId === t.id) cities.set(g.arenaCity, (cities.get(g.arenaCity) ?? 0) + 1);
      const homeCity = [...cities].sort((a, b) => b[1] - a[1])[0]![0];
      const want: string[][] = [];
      let run: string[] = [];
      for (const g of games) {
        if (g.arenaName && metro(g.arenaCity) === metro(homeCity)) {
          if (run.length) want.push(run);
          run = [];
        } else run.push(g.gameId);
      }
      if (run.length) want.push(run);
      expect(teamTrips(data, t.id).map((x) => x.games.map((g) => g.gameId)), t.tricode).toEqual(want);
      expect(want.length, t.tricode).toBeGreaterThan(8);
    }
  });

  it('LAL @ LAC is a home game for both (one metro); SAS in Austin and IND in Mexico City are travel', () => {
    const lal = TEAMS.find((t) => t.tricode === 'LAL')!.id;
    const atLac = data.games.find((g) => g.awayTeam.teamTricode === 'LAL' && g.homeTeam.teamTricode === 'LAC')!;
    expect(tripOf(teamTrips(data, lal), atLac.gameId)).toBeUndefined();
    const sas = TEAMS.find((t) => t.tricode === 'SAS')!.id;
    const austin = data.games.find((g) => g.arenaCity === 'Austin')!;
    expect(tripOf(teamTrips(data, sas), austin.gameId)).toBeDefined();
    const ind = TEAMS.find((t) => t.tricode === 'IND')!.id;
    const mx = data.games.find((g) => g.arenaCity === 'Mexico City')!;
    expect(tripOf(teamTrips(data, ind), mx.gameId)).toBeDefined();
  });

  it('home arena: every team\'s own building', () => {
    expect(homeArena(data, TEAMS.find((t) => t.tricode === 'BOS')!.id)!.arena).toBe('TD Garden');
    expect(homeArena(data, TEAMS.find((t) => t.tricode === 'SAS')!.id)!.arena).toBe('Frost Bank Center');
    expect(homeArena(data, TEAMS.find((t) => t.tricode === 'LAC')!.id)!.arena).toBe('Intuit Dome');
  });

  it('current trip: the one under way or next at a moment; the last after the season', () => {
    const bos = TEAMS.find((t) => t.tricode === 'BOS')!.id;
    const trips = teamTrips(data, bos);
    const t = currentTrip(trips, Date.parse('2026-11-01T12:00:00Z'))!;
    expect(t.games.some((g) => g.dateEt >= '2026-11-01')).toBe(true);
    if (t.index > 0) expect(trips[t.index - 1]!.games.at(-1)!.dateEt < '2026-11-01').toBe(true);
    expect(currentTrip(trips, Date.parse('2027-12-01T00:00:00Z'))).toBe(trips.at(-1));
  });
});

describe('trip numbers', () => {
  it('miles: great-circle, e.g. Boston (TD Garden) → Los Angeles (Crypto.com Arena) ≈ 2 600 mi', () => {
    const d = miles(arena('TD Garden'), arena('Crypto.com Arena'));
    expect(d).toBeGreaterThan(2570);
    expect(d).toBeLessThan(2630);
    expect(miles(arena('TD Garden'), arena('TD Garden'))).toBe(0);
  });

  it('every trip of every team: games, days, miles = home → stops → home, zone changes, back-to-backs inside it', () => {
    for (const t of TEAMS) {
      const home = homeArena(data, t.id)!;
      for (const trip of teamTrips(data, t.id)) {
        const s = tripStats(data, t.id, trip);
        expect(s.games).toBe(trip.games.length);
        expect(s.days).toBeGreaterThanOrEqual(s.games);
        if (s.miles === undefined) {
          expect(trip.games.some((g) => !g.arenaName), `${t.tricode} trip ${trip.index}`).toBe(true);
          continue;
        }
        const pts = [home, ...trip.games.map((g) => ARENAS.find((a) => a.arena === g.arenaName && a.city === g.arenaCity)!), home];
        let m = 0;
        for (let i = 1; i < pts.length; i++) m += miles(pts[i - 1]!, pts[i]!);
        expect(s.miles, `${t.tricode} trip ${trip.index}`).toBe(Math.round(m));
        expect(s.miles).toBeGreaterThan(0);
        // consecutive-day pairs inside the trip, counted here from the dates
        let b2b = 0;
        for (let i = 1; i < trip.games.length; i++) if ((Date.parse(trip.games[i]!.dateEt) - Date.parse(trip.games[i - 1]!.dateEt)) / 864e5 === 1) b2b++;
        expect(s.b2b, `${t.tricode} trip ${trip.index}`).toBe(b2b);
        expect(s.zones[0]).toBe(s.zones.at(-1));
      }
    }
  });

  it('stops: games at one arena share a stop, numbered in trip order', () => {
    for (const t of TEAMS)
      for (const trip of teamTrips(data, t.id)) {
        const stops = tripStops(trip);
        expect(stops.flatMap((s) => s.games.map((x) => x.n)).sort((a, b) => a - b)).toEqual(trip.games.map((_, i) => i + 1));
      }
  });
});
