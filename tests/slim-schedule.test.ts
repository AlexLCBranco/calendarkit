// The slim snapshot (scripts/slim-schedule.ts) loads into the same CalendarData as the raw feed: the same games in the
// same order with the same values and derived fields, dates, maps, data stamp and regulation totals — only the feed
// fields no code reads are gone. And no code in src/ or api/ reads a field the slimmer drops.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CalendarData } from '../src/data/model';
import { BROADCASTER_FIELDS, BROADCASTER_LISTS, GAME_FIELDS, TEAM_FIELDS, slimSchedule } from '../scripts/slim-schedule';

type Obj = Record<string, unknown>;
const fixture = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8')) as Obj;

/** What the app's loader makes of a snapshot (a fresh module each time: the loader caches its first result). */
async function load(json: Obj): Promise<CalendarData> {
  vi.resetModules();
  const { loadCalendarData } = await import('../src/data/load');
  const body = JSON.stringify(json);
  return loadCalendarData('x', (async () => new Response(body)) as unknown as typeof fetch);
}

/** Fields parse.ts adds to every game. */
const DERIVED = ['seasonYear', 'gameType', 'status', 'statusText', 'dateEt', 'startTimeUtc', 'timeTbd', 'teamsTbd', 'isCupGroupGame', 'isCupKnockout'];
const pick = (o: Obj, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
/** A game with only the kept and derived fields. */
function keptGame(g: Obj): Obj {
  const out = pick(g, [...GAME_FIELDS, ...DERIVED]);
  for (const side of ['homeTeam', 'awayTeam']) out[side] = pick(g[side] as Obj, TEAM_FIELDS);
  const b = g.broadcasters as Record<string, Obj[]> | undefined;
  if (b) out.broadcasters = Object.fromEntries(BROADCASTER_LISTS.filter((k) => k in b).map((k) => [k, b[k]!.map((x) => pick(x, BROADCASTER_FIELDS))]));
  return out;
}
const keptData = (d: CalendarData) => {
  const g = (x: unknown) => keptGame(x as Obj);
  return { ...d, games: d.games.map(g), byDate: new Map([...d.byDate].map(([k, v]) => [k, v.map(g)])) };
};

describe('slim schedule snapshot', () => {
  const cases: [string, Obj][] = [
    // the raw feed of 2026-10-23 plus our own regulation totals, as the daily job writes them
    ['feed-2026-10-23 (raw)', { ...fixture('feed-2026-10-23.json'), calendarkit: { regulation: { '0022600110': [99, 101] } } }],
    // finished and overtime NBA Cup knockout games, in the feed's format
    ['cup-knockout-2025', fixture('cup-knockout-2025.json')],
  ];

  it.each(cases)('%s: the slim file loads into identical CalendarData', async (_name, raw) => {
    const full = await load(raw);
    const slim = await load(slimSchedule(raw));
    expect(slim.games.length).toBeGreaterThan(0);
    expect(slim).toEqual(keptData(slim)); // the slim data holds nothing but kept and derived fields …
    expect(slim).toEqual(keptData(full)); // … and is the raw data's, value for value, in the same order
    expect(slim.games.map((g) => g.gameId)).toEqual(full.games.map((g) => g.gameId));
    expect(slim.updatedAt).toBe(full.updatedAt);
    expect(slim.regulation).toEqual(full.regulation);
  });

  it('is much smaller than the raw feed', () => {
    const raw = fixture('feed-2026-10-23.json');
    const ratio = JSON.stringify(slimSchedule(raw)).length / JSON.stringify(raw).length;
    expect(ratio).toBeLessThan(0.4);
  });

  it('no code reads a feed field the slimmer drops', () => {
    // every field name the raw feed has on a game, a team side or a broadcaster
    const raw = fixture('feed-2026-10-23.json') as { leagueSchedule: { gameDates: { games: Obj[] }[] } };
    const names = new Set<string>();
    for (const d of raw.leagueSchedule.gameDates)
      for (const g of d.games) {
        Object.keys(g).forEach((k) => names.add(k));
        for (const side of ['homeTeam', 'awayTeam']) Object.keys(g[side] as Obj).forEach((k) => names.add(k));
        for (const [list, arr] of Object.entries(g.broadcasters as Record<string, Obj[]>)) {
          names.add(list);
          for (const b of arr) Object.keys(b).forEach((k) => names.add(k));
        }
      }
    const kept = new Set<string>([...GAME_FIELDS, ...TEAM_FIELDS, ...BROADCASTER_LISTS, ...BROADCASTER_FIELDS]);
    const dropped = [...names].filter((n) => !kept.has(n));
    expect(dropped).toContain('pointsLeaders');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) {
          if (f !== 'shared') walk(p); // the parser (shared with rotationkit) reads only kept fields: checked by the loads above
        } else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    const root = join(import.meta.dirname, '..');
    walk(join(root, 'src'));
    walk(join(root, 'api'));
    // Plain words that the app uses for its own objects (records, standings rows, dates): only a read off a feed game
    // or team counts there.
    const common: Record<string, RegExp> = {
      day: /\b(?:g|game|x)\??\.day\b/,
      wins: /(?:homeTeam|awayTeam|Team)\??\.wins\b/,
      losses: /(?:homeTeam|awayTeam|Team)\??\.losses\b/,
      seed: /(?:homeTeam|awayTeam|Team)\??\.seed\b/,
    };
    const hits: string[] = [];
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const n of dropped) if ((common[n] ?? new RegExp(`\\b${n}\\b`)).test(code)) hits.push(`${f.slice(root.length + 1)} reads ${n}`);
    }
    expect(hits, 'keep these fields in scripts/slim-schedule.ts').toEqual([]);
  });
});
