// Time conversion and day grouping in the runtime's local zone. Runs once per zone in vite.config.ts
// (America/New_York and America/Sao_Paulo), set through process.env.TZ there, so no shell prefix is needed.
// No timeZone argument is passed: this is the path the browser uses.

import { describe, expect, it } from 'vitest';
import { defaultDay, tipoff } from '../src/data/model';
import { dataOf, game } from './synthetic';
import { data as realData } from './feed';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
type Zone = 'America/New_York' | 'America/Sao_Paulo';
const pick = <T>(v: Record<Zone, T>): T => v[zone as Zone];

it('runs in one of the configured zones', () => {
  expect(['America/New_York', 'America/Sao_Paulo']).toContain(zone);
});

// US DST ends Sun Nov 1, 2026 at 2 am (EDT −4 → EST −5). São Paulo has no DST (−3 all year).
describe('tip-off across the Nov 1, 2026 DST change', () => {
  const cases: { what: string; date: string; utc: string; want: Record<Zone, string> }[] = [
    { what: 'Sat Oct 31, 7:30 pm EDT', date: '2026-10-31', utc: '2026-10-31T23:30:00Z', want: { 'America/New_York': '19:30', 'America/Sao_Paulo': '20:30' } },
    { what: 'Sat Oct 31, 10:30 pm EDT', date: '2026-10-31', utc: '2026-11-01T02:30:00Z', want: { 'America/New_York': '22:30', 'America/Sao_Paulo': '23:30' } },
    { what: 'Sun Nov 1, 6 pm EST (first evening after the change)', date: '2026-11-01', utc: '2026-11-01T23:00:00Z', want: { 'America/New_York': '18:00', 'America/Sao_Paulo': '20:00' } },
    { what: 'Mon Nov 2, 7:30 pm EST', date: '2026-11-02', utc: '2026-11-03T00:30:00Z', want: { 'America/New_York': '19:30', 'America/Sao_Paulo': '21:30' } },
    { what: 'Mon Nov 2, 10:30 pm EST', date: '2026-11-02', utc: '2026-11-03T03:30:00Z', want: { 'America/New_York': '22:30', 'America/Sao_Paulo': '00:30 (+1)' } },
    { what: 'Mar 14, 2027 (DST starts), 7:30 pm EDT', date: '2027-03-14', utc: '2027-03-14T23:30:00Z', want: { 'America/New_York': '19:30', 'America/Sao_Paulo': '20:30' } },
  ];
  for (const c of cases) {
    it(c.what, () => expect(tipoff(game({ date: c.date, utc: c.utc })).label).toBe(pick(c.want)));
  }
});

describe('day grouping by NBA game date', () => {
  it('a game tipping after local midnight stays on its NBA date and gets the +1 marker', () => {
    const late = game({ date: '2026-11-02', utc: '2026-11-03T03:30:00Z' });
    const next = game({ date: '2026-11-03', utc: '2026-11-04T00:00:00Z' });
    const d = dataOf([late, next]);
    expect(d.byDate.get('2026-11-02')!.map((g) => g.gameId)).toEqual([late.gameId]);
    expect(d.byDate.get('2026-11-03')!.map((g) => g.gameId)).toEqual([next.gameId]);
    expect(tipoff(late).dayOffset).toBe(pick({ 'America/New_York': 0, 'America/Sao_Paulo': 1 }));
  });

  it('real feed: every late game stays on its ET date; +1 only where the local day differs', () => {
    let plusOne = 0;
    for (const g of realData.games) {
      if (!g.startTimeUtc) continue;
      expect(realData.byDate.get(g.dateEt)).toContain(g);
      const t = tipoff(g);
      if (zone === 'America/New_York') expect(t.dayOffset, g.gameId).toBe(0);
      if (t.dayOffset) {
        plusOne++;
        expect(t.label).toMatch(/^\d\d:\d\d \(\+1\)$/);
      }
    }
    if (zone === 'America/Sao_Paulo') expect(plusOne).toBeGreaterThan(10);
  });
});

describe('default league day (now mocked)', () => {
  // Night A (Nov 2): 7 pm and 10:30 pm EST games. Night B (Nov 3): one game. 1 am local is computed per zone.
  const early = game({ date: '2026-11-02', utc: '2026-11-03T00:00:00Z' });
  const late = game({ date: '2026-11-02', utc: '2026-11-03T03:30:00Z' });
  const nextNight = game({ date: '2026-11-03', utc: '2026-11-04T00:00:00Z' });
  const d = dataOf([early, late, nextNight]);
  const at = (iso: string) => Date.parse(iso);

  it('during a game night → that night', () => expect(defaultDay(d, at('2026-11-03T02:00:00Z'))).toBe('2026-11-02'));
  it('at 1 am local, while the late game is still on → still last night', () => {
    const oneAm = pick({ 'America/New_York': '2026-11-03T06:00:00Z', 'America/Sao_Paulo': '2026-11-03T04:00:00Z' });
    expect(defaultDay(d, at(oneAm))).toBe('2026-11-02');
  });
  it('the next morning → the next game date', () => expect(defaultDay(d, at('2026-11-03T13:00:00Z'))).toBe('2026-11-03'));
  it('before the season → first game date', () => expect(defaultDay(d, at('2026-10-01T00:00:00Z'))).toBe('2026-11-02'));
  it("after the season's last game → the last game date", () => expect(defaultDay(d, at('2026-12-01T00:00:00Z'))).toBe('2026-11-03'));
  it('tip-off + 3 h boundary', () => {
    const lateEnd = Date.parse(late.startTimeUtc!) + 3 * 3600_000;
    expect(defaultDay(d, lateEnd - 1)).toBe('2026-11-02');
    expect(defaultDay(d, lateEnd + 1)).toBe('2026-11-03');
  });
  it('skips empty days (All-Star break style gap)', () => {
    const after = game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z' });
    expect(defaultDay(dataOf([early, after]), at('2026-11-05T12:00:00Z'))).toBe('2026-11-10');
  });
  it('real feed: Oct 22 (last tip DEN @ OKC 01:30Z) stays the default until 04:30Z, then Oct 23', () => {
    expect(defaultDay(realData, at('2026-10-23T04:00:00Z'))).toBe('2026-10-22'); // 1 am São Paulo
    expect(defaultDay(realData, at('2026-10-23T04:31:00Z'))).toBe('2026-10-23');
  });
});
