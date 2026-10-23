// @vitest-environment jsdom
// Back-to-back plane by metro area: the feed's arena cities name the suburb or borough for some arenas (Clippers
// in Inglewood, Nets in Brooklyn), so a crosstown back-to-back is not travel. Metros come from a fixed table.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TeamListView } from '../src/components/CalendarView';
import { ARENA_METRO, metroOf } from '../src/data/metro';
import { teamB2BPairs } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const LAC = 1610612746;
const BKN = 1610612751;
const at = (date: string, home: number, away: number, city: string) => game({ date, utc: `${date}T23:30:00Z`, home, away, raw: { arenaCity: city } });
const labels = (d: ReturnType<typeof dataOf>, teamId: number) => {
  const el = render(<TeamListView data={d} teamId={teamId} tvOnly={false} size={{ width: 1000, height: 800 }} now={NOW} timeZone="UTC" />);
  return [...el.container.querySelectorAll('.ck-b2b-label')].map((l) => ({ text: l.textContent, plane: !!l.querySelector('[data-testid="plane"]'), tip: l.getAttribute('data-tip') }));
};

describe('arena city → metro', () => {
  it('table: Inglewood → Los Angeles, Brooklyn → New York; any other city is its own metro', () => {
    expect(metroOf('Inglewood')).toBe('Los Angeles');
    expect(metroOf('Brooklyn')).toBe('New York');
    expect(metroOf('Los Angeles')).toBe('Los Angeles');
    expect(metroOf('New York')).toBe('New York');
    expect(metroOf('Mexico City')).toBe('Mexico City');
    expect(metroOf('Paris')).toBe('Paris');
    expect(metroOf('')).toBe('');
  });

  it('real feed: the 30 teams\' usual home cities map to 28 metros — only LA (LAL, LAC) and New York (NYK, BKN) are shared', () => {
    // usual home city = the city of most of a team's home games (neutral sites are a few games at most)
    const home = new Map<string, Map<string, number>>();
    for (const g of data.games) {
      const t = g.homeTeam.teamTricode;
      if (!g.homeTeam.teamId || !g.arenaCity) continue;
      const m = home.get(t) ?? new Map<string, number>();
      m.set(g.arenaCity, (m.get(g.arenaCity) ?? 0) + 1);
      home.set(t, m);
    }
    const city = new Map([...home].map(([t, m]) => [t, [...m].sort((a, b) => b[1] - a[1])[0]![0]]));
    expect(city.size).toBe(30);
    const byMetro = new Map<string, string[]>();
    for (const [t, c] of city) byMetro.set(metroOf(c), [...(byMetro.get(metroOf(c)) ?? []), t].sort());
    expect(byMetro.size).toBe(28);
    expect([...byMetro.values()].filter((ts) => ts.length > 1).sort()).toEqual([['BKN', 'NYK'], ['LAC', 'LAL']]);
    // every table entry is a real arena city in the feed
    for (const c of Object.keys(ARENA_METRO)) expect([...city.values()]).toContain(c);
  });

  it('Lakers–Clippers and Knicks–Nets back-to-backs show no plane and no travel in the tooltip', () => {
    const d = dataOf([
      at('2026-11-02', TEAM.LAL, TEAM.BOS, 'Los Angeles'), at('2026-11-03', LAC, TEAM.LAL, 'Inglewood'), // LAL: LA → Inglewood
      at('2026-11-09', TEAM.NYK, TEAM.MIA, 'New York'), at('2026-11-10', BKN, TEAM.NYK, 'Brooklyn'), // NYK: NY → Brooklyn
    ]);
    expect(labels(d, TEAM.LAL)).toEqual([
      { text: '1/2 · HA', plane: false, tip: 'Back-to-back: vs BOS (home) → @ LAC (away)' },
      { text: '2/2 · HA', plane: false, tip: 'Back-to-back: vs BOS (home) → @ LAC (away)' },
    ]);
    cleanup();
    expect(labels(d, TEAM.NYK).map((l) => l.plane)).toEqual([false, false]);
    expect(labels(d, TEAM.NYK)[0]!.tip).not.toMatch(/travels/);
  });

  it('a real cross-metro back-to-back still shows the plane, with the real cities in the tooltip', () => {
    const d = dataOf([at('2026-11-02', BKN, TEAM.BOS, 'Brooklyn'), at('2026-11-03', LAC, BKN, 'Inglewood')]);
    expect(labels(d, BKN).map((l) => [l.plane, l.tip])).toEqual([
      [true, 'Back-to-back: vs BOS (home) → @ LAC (away) · travels Brooklyn → Inglewood'],
      [true, 'Back-to-back: vs BOS (home) → @ LAC (away) · travels Brooklyn → Inglewood'],
    ]);
  });

  it('a neutral-site city keeps its own metro (Los Angeles → Mexico City is travel)', () => {
    const d = dataOf([at('2026-11-02', TEAM.LAL, TEAM.BOS, 'Los Angeles'), at('2026-11-03', TEAM.MIA, TEAM.LAL, 'Mexico City')]);
    expect(labels(d, TEAM.LAL).map((l) => l.plane)).toEqual([true, true]);
  });

  it('real schedule: no LAL/LAC or NYK/BKN pair between the two arenas of one metro travels', () => {
    let crosstown = 0;
    for (const t of TEAMS) {
      for (const p of teamB2BPairs(data, t.id)) {
        const pair = [p.fromCity, p.toCity].sort().join('/');
        if (pair === 'Inglewood/Los Angeles' || pair === 'Brooklyn/New York') {
          crosstown++;
          expect(p.travels, `${t.tricode} ${p.first.dateEt}`).toBe(false);
          expect(p.tip).not.toMatch(/travels/);
        }
      }
    }
    expect(crosstown).toBeGreaterThan(0);
  });
});
