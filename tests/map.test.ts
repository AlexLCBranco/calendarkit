// Round 8 (Part 2): the League map's data — arena table, locations from the feed's own fields, projection, time zones.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoAlbers, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection } from 'geojson';
import { leagueFatigue } from '../src/data/fatigue';
import { TEAMS } from '../src/data/teams';
import { ARENAS } from '../src/map/arenas';
import { MAP_H, MAP_W, PROJECTION, STATES } from '../src/map/basemap';
import { mapGames } from '../src/map/LeagueMap';
import { arenaOf, gameLocation } from '../src/map/location';
import { project } from '../src/map/project';
import { SPLIT_STATES, STATE_ZONE } from '../src/map/zones';
import { data } from './feed';

const home = (teamId: number) => data.games.filter((g) => g.homeTeam.teamId === teamId);

describe('arena table', () => {
  it('every team\'s home arena has an entry (the arena of most of its home games in the feed)', () => {
    for (const t of TEAMS) {
      const counts = new Map<string, number>();
      for (const g of home(t.id)) counts.set(`${g.arenaName}|${g.arenaCity}`, (counts.get(`${g.arenaName}|${g.arenaCity}`) ?? 0) + 1);
      const [main] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
      const [name, city] = main.split('|');
      expect(arenaOf({ arenaName: name!, arenaCity: city! }), `${t.tricode}: ${main}`).toBeDefined();
    }
  });

  it('every entry has a source and coordinates in a sane range; no duplicates', () => {
    for (const a of ARENAS) {
      expect(a.source, a.arena).toMatch(/^wikidata:Q\d+@\d+$/);
      expect(Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180, a.arena).toBe(true);
    }
    expect(new Set(ARENAS.map((a) => `${a.arena}|${a.city}`)).size).toBe(ARENAS.length);
  });

  it('each arena lies inside its own state (US, Census outlines) or country (Natural Earth): an independent check of the coordinates', () => {
    const req = createRequire(import.meta.url);
    const topo = (f: string) => JSON.parse(readFileSync(req.resolve(f), 'utf8'));
    const us = topo('us-atlas/states-10m.json');
    const states = (feature(us, us.objects.states) as unknown as FeatureCollection).features;
    const world = topo('world-atlas/countries-50m.json');
    const countries = (feature(world, world.objects.countries) as unknown as FeatureCollection).features;
    // postal code → state name (us-atlas names its features), countries by ISO numeric id
    const NAMES: Record<string, string> = { TX: 'Texas', CO: 'Colorado', NY: 'New York', DC: 'District of Columbia', CA: 'California', UT: 'Utah', TN: 'Tennessee', WI: 'Wisconsin', IN: 'Indiana', FL: 'Florida', MI: 'Michigan', OR: 'Oregon', AZ: 'Arizona', OK: 'Oklahoma', OH: 'Ohio', LA: 'Louisiana', NC: 'North Carolina', GA: 'Georgia', MN: 'Minnesota', MA: 'Massachusetts', IL: 'Illinois', PA: 'Pennsylvania', NV: 'Nevada' };
    const COUNTRY: Record<string, string> = { ON: '124', MX: '484', FR: '250', '': '826' }; // Toronto, Mexico City, Paris, Manchester
    for (const a of ARENAS) {
      const f = NAMES[a.state] ? states.find((x) => (x.properties as { name: string }).name === NAMES[a.state]) : countries.find((x) => String(x.id) === COUNTRY[a.state]);
      expect(f, `${a.arena}: no outline for "${a.state}"`).toBeDefined();
      expect(geoContains(f as Feature, [a.lon, a.lat]), `${a.arena} (${a.lat}, ${a.lon}) inside ${a.state || 'GB'}`).toBe(true);
    }
  });

  it('every game of the season resolves: on the map, on its edge (known place outside), or "unknown" only without an arena', () => {
    const kinds = { map: 0, edge: 0, unknown: 0 };
    const edge: string[] = [];
    for (const g of data.games) {
      const loc = gameLocation(g);
      kinds[loc.kind]++;
      if (loc.kind === 'unknown') expect(g.arenaName, g.gameId).toBe(''); // never an arena missing from the table
      if (loc.kind === 'edge') edge.push(`${g.dateEt} ${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode} ${loc.label} ${loc.arrow}`);
    }
    // the feed of 2026-10-23: 3 international games, 6 Cup knockout games with no arena yet
    expect(edge.sort()).toEqual(['2026-11-07 DEN@IND Mexico City, Mexico ↓', '2027-01-14 NOP@SAS Paris, France →', '2027-01-17 SAS@NOP Manchester, England →']);
    expect(kinds.unknown).toBe(6);
    expect(kinds.map).toBe(data.games.length - 9);
  });

  it('the feed\'s location, not the home team\'s usual arena: SAS in Austin, the Cup final in Indianapolis (Hinkle)', () => {
    const austin = data.games.filter((g) => g.arenaCity === 'Austin');
    expect(austin.length).toBeGreaterThan(0);
    for (const g of austin) expect(gameLocation(g).kind === 'map' && (gameLocation(g) as { arena: { arena: string } }).arena.arena).toBe('Moody Center');
    const final = data.games.find((g) => g.gameId.startsWith('006'))!;
    const loc = gameLocation(final);
    expect(loc.kind === 'map' && loc.arena.arena).toBe('Hinkle Fieldhouse');
  });
});

describe('projection', () => {
  it('= d3-geo geoAlbers as fitted by scripts/make-basemap.ts, for every arena (to 0.01 unit)', () => {
    const d3 = geoAlbers().scale(PROJECTION.k).translate([PROJECTION.tx, PROJECTION.ty]);
    for (const a of ARENAS) {
      const [x, y] = project(a.lon, a.lat);
      const [ex, ey] = d3([a.lon, a.lat])!;
      expect(Math.abs(x - ex) + Math.abs(y - ey), a.arena).toBeLessThan(0.01);
    }
  });

  it('the map is the lower 48 with Toronto inside; west is left, north is up', () => {
    expect(MAP_W).toBe(1000);
    expect(MAP_H).toBeGreaterThan(550);
    const p = (n: string) => project(ARENAS.find((a) => a.arena === n)!.lon, ARENAS.find((a) => a.arena === n)!.lat);
    const [tor, mia, por, bos] = ['Scotiabank Arena', 'Kaseya Center', 'Moda Center', 'TD Garden'].map(p);
    for (const q of [tor, mia, por, bos]) expect(q![0] > 0 && q![0] < MAP_W && q![1] > 0 && q![1] < MAP_H).toBe(true);
    expect(por![0]).toBeLessThan(bos![0]);
    expect(tor![1]).toBeLessThan(mia![1]);
  });
});

describe('time zones', () => {
  it('every drawn state (48 + DC) has one zone; the split states are listed with their reason', () => {
    expect(STATES.map(([s]) => s).sort()).toEqual(Object.keys(STATE_ZONE).sort());
    expect(STATES).toHaveLength(49);
    for (const [st, why] of Object.entries(SPLIT_STATES)) expect(why.startsWith(STATE_ZONE[st]!), st).toBe(true);
  });

  it('every NBA arena state is in its arena city\'s zone', () => {
    // arena city → zone, written out by hand
    const cities: Record<string, string> = { Boston: 'ET', Brooklyn: 'ET', 'New York': 'ET', Philadelphia: 'ET', Washington: 'ET', Charlotte: 'ET', Atlanta: 'ET', Miami: 'ET', Orlando: 'ET', Cleveland: 'ET', Detroit: 'ET', Indianapolis: 'ET', Chicago: 'CT', Milwaukee: 'CT', Minneapolis: 'CT', Memphis: 'CT', 'New Orleans': 'CT', Dallas: 'CT', Houston: 'CT', 'San Antonio': 'CT', Austin: 'CT', 'Oklahoma City': 'CT', Denver: 'MT', 'Salt Lake City': 'MT', Phoenix: 'MT', 'Los Angeles': 'PT', Inglewood: 'PT', 'San Francisco': 'PT', Sacramento: 'PT', Portland: 'PT', 'Las Vegas': 'PT' };
    for (const a of ARENAS) if (STATE_ZONE[a.state]) expect(STATE_ZONE[a.state], a.city).toBe(cities[a.city]);
  });
});

describe('dots', () => {
  it('yellow (b2b) exactly when either team plays a back-to-back night, every game of the season', () => {
    const f = leagueFatigue(data);
    for (const m of mapGames(data, data.games)) {
      const nights = [m.game.awayTeam.teamId, m.game.homeTeam.teamId].map((t) => f.get(m.game.gameId)?.get(t)?.nights.length ?? 0);
      expect(m.b2b, m.game.gameId).toBe(nights.some((n) => n > 0));
    }
  });

  it('two games at nearby arenas the same night (LAL + LAC at home) are spread apart, labels outward', () => {
    const day = data.dates.find((d) => {
      const ids = data.byDate.get(d)!.map((g) => g.homeTeam.teamTricode);
      return ids.includes('LAL') && ids.includes('LAC');
    })!;
    expect(day).toBeDefined();
    const la = mapGames(data, data.byDate.get(day)!).filter((m) => ['LAL', 'LAC'].includes(m.game.homeTeam.teamTricode));
    expect(la).toHaveLength(2);
    expect(Math.hypot(la[0]!.dx - la[1]!.dx, la[0]!.dy - la[1]!.dy)).toBeGreaterThanOrEqual(12);
    expect(la.map((m) => m.labelLeft).sort()).toEqual([false, true]);
  });
});
