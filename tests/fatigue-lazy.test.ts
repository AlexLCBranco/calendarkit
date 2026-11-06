// v1.40.1: the lazy leagueFatigue gives exactly what the eager v1.40.0 one did (tests/fatigue-eager.ts, frozen copy) —
// every game, both teams, every field incl. tooltip text and day strip — whether games are read one by one (the views)
// or the map is iterated; and a single read works out only that game's two teams.

import { describe, expect, it } from 'vitest';
import { leagueFatigue, type TeamFatigue } from '../src/data/fatigue';
import { leagueFatigue as eager } from './fatigue-eager';
import { buildCalendarData } from '../src/data/model';
import { parseSchedule } from '../src/shared/nba-schedule/parse';
import feed from './fixtures/feed-2026-10-23.json';
import { data } from './feed';

const plain = (f: TeamFatigue | undefined) => f && { nights: f.nights, pairs: f.pairs.map((p) => [p.first.gameId, p.second.gameId, p.code, p.travels]), travels: f.travels, tif: f.tif, tip: f.tip.replace('Record after the game:', 'Record going in:'), days: f.days }; // round 22 renamed the line on final games; the frozen copy has the old label
const fresh = () => buildCalendarData(parseSchedule(feed)); // a new data set = a new cache entry

describe('lazy leagueFatigue', () => {
  const want = eager(data);

  it('get(gameId), game by game: same teams in the same order and the same values as v1.40.0', () => {
    const d = fresh();
    const ref = eager(d);
    const lazy = leagueFatigue(d);
    let n = 0;
    for (const [gameId, teams] of ref) {
      const got = lazy.get(gameId)!;
      expect([...got.keys()], gameId).toEqual([...teams.keys()]);
      for (const [teamId, f] of teams) expect(plain(got.get(teamId)), `${gameId} ${teamId}`).toEqual(plain(f));
      n++;
    }
    expect(n).toBe(1200); // every shown game in the 2026-10-23 feed
    expect(lazy.get('nope')).toBeUndefined();
    expect(lazy.has('nope')).toBe(false);
  });

  it('iterating or size: the whole map, in the same order as v1.40.0', () => {
    const lazy = leagueFatigue(fresh());
    lazy.get([...want.keys()][500]!); // a read first, then iteration
    expect(lazy.size).toBe(want.size);
    expect([...lazy.keys()]).toEqual([...want.keys()]);
    for (const [gameId, teams] of lazy) for (const [teamId, f] of teams) expect(plain(f)).toEqual(plain(want.get(gameId)!.get(teamId)));
  });

  it('builds no tooltip text until one is read', () => {
    const lazy = leagueFatigue(fresh());
    const id = [...want.keys()][10]!;
    const f = [...lazy.get(id)!.values()][0]!;
    const desc = Object.getOwnPropertyDescriptor(f, 'tip')!;
    expect(typeof desc.get).toBe('function');
    expect(f.tip).toBe(f.tip); // cached after the first read
  });
});
