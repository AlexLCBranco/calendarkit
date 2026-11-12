// The Team Calendar's scale is sized on a probe cell (TeamMonthGrid probeCard). Its tricodes must be the widest (MEM),
// whichever game has the longest TV text: when a Christmas game listed five networks the probe took that game's
// narrower NYK / SAS and the scale grew until real cells (LAL vs GSW, Oct 21) clipped at 1920 px.

import { describe, expect, it } from 'vitest';
import { probeCard } from '../src/components/TeamMonthGrid';
import type { CalendarData } from '../src/data/model';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { data } from './feed';

const fiveNetworks = (g: ScheduleGame): ScheduleGame => {
  const b = g.broadcasters.nationalBroadcasters?.[0] ?? ({} as never);
  const natl = ['ABC', 'ESPN', 'ESPN2', 'Disney+', 'Disney Channel'].map((n) => ({ ...b, broadcasterDisplay: n }));
  return { ...g, broadcasters: { ...g.broadcasters, nationalBroadcasters: natl } };
};

describe('Team Calendar probe cell', () => {
  it('uses the widest tricode on both sides, not the teams of the game with the most networks', () => {
    const xmas = data.games.find((g) => g.dateEt === '2026-12-25' && g.homeTeam.teamTricode === 'NYK')!;
    expect(xmas.awayTeam.teamTricode).toBe('SAS');
    const games = data.games.map((g) => (g === xmas ? fiveNetworks(g) : g));
    const p = probeCard({ ...data, games } as CalendarData)!;
    expect([p.game.awayTeam.teamTricode, p.game.homeTeam.teamTricode]).toEqual(['MEM', 'MEM']);
    expect(p.teamId).toBe(p.game.homeTeam.teamId);
  });
});
