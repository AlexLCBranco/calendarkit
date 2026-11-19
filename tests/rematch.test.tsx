// @vitest-environment jsdom
// Back-to-back meetings: a team's game is marked when its previous or next game is against the same opponent
// (consecutive in that team's own schedule, any days apart), per team; the series chip shows it by its look only.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { leagueRematches, leagueSeries } from '../src/data/series';
import { rematchLine, SeriesChip } from '../src/slate/series';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);
const { BOS, MIA, NYK, LAL } = TEAM;
const g = (date: string, home: number, away: number) => game({ date, utc: `${date}T23:00:00Z`, home, away });
const marked = (data: ReturnType<typeof dataOf>, id: string) => (leagueRematches(data).get(id) ?? []).map((r) => r.teamId).sort();

describe('the rule', () => {
  it('both teams consecutive: both games marked for both teams', () => {
    const a = g('2026-11-18', BOS, MIA);
    const b = g('2026-11-21', MIA, BOS);
    const data = dataOf([g('2026-11-10', BOS, NYK), g('2026-11-11', MIA, LAL), a, b, g('2026-11-25', BOS, LAL)]);
    expect(marked(data, a.gameId)).toEqual([BOS, MIA].sort());
    expect(marked(data, b.gameId)).toEqual([BOS, MIA].sort());
    const boS = leagueRematches(data).get(a.gameId)!.find((r) => r.teamId === BOS)!;
    expect(boS.next?.gameId).toBe(b.gameId);
    expect(boS.prev).toBeUndefined();
    expect(leagueRematches(data).get(b.gameId)!.find((r) => r.teamId === BOS)!.prev?.gameId).toBe(a.gameId);
  });

  it('only one team consecutive: only that team marked', () => {
    const a = g('2026-11-18', BOS, MIA);
    const between = g('2026-11-19', MIA, NYK); // MIA plays someone else in between, BOS doesn't
    const b = g('2026-11-21', MIA, BOS);
    const data = dataOf([a, between, b]);
    expect(marked(data, a.gameId)).toEqual([BOS]);
    expect(marked(data, b.gameId)).toEqual([BOS]);
    expect(marked(data, between.gameId)).toEqual([]);
  });

  it('both teams play someone else in between: no mark', () => {
    const data = dataOf([g('2026-11-18', BOS, MIA), g('2026-11-19', BOS, NYK), g('2026-11-20', MIA, LAL), g('2026-11-21', MIA, BOS)]);
    expect(leagueRematches(data).size).toBe(0);
  });

  it('the tooltip lines name the team and the other game', () => {
    const a = g('2026-11-18', BOS, MIA);
    const b = g('2026-11-21', MIA, BOS);
    const data = dataOf([a, b]);
    const lines = leagueRematches(data).get(a.gameId)!.map(rematchLine).sort();
    expect(lines).toEqual(['BOS: back-to-back meeting, plays again Sat, Nov 21', 'MIA: back-to-back meeting, plays again Sat, Nov 21']);
    expect(leagueRematches(data).get(b.gameId)!.map(rematchLine)).toContain('BOS: back-to-back meeting, also played Wed, Nov 18');
  });
});

describe('the chip', () => {
  const a = g('2026-11-18', BOS, MIA);
  const between = g('2026-11-19', MIA, NYK);
  const b = g('2026-11-21', MIA, BOS);
  const data = dataOf([a, between, b]);
  const chip = (focus?: number) => {
    cleanup();
    render(<SeriesChip s={leagueSeries(data).get(a.gameId)} gameId={a.gameId} rematch={leagueRematches(data).get(a.gameId)} focus={focus} />);
    return screen.getByTestId('series-chip');
  };
  it('marked when one team has it (league views)', () => {
    expect(chip().classList.contains('ck-series-rematch')).toBe(true);
    expect(chip().getAttribute('aria-label')).toContain('BOS: back-to-back meeting');
  });
  it('team views: marked in the marked team\'s view, not in the unmarked team\'s', () => {
    expect(chip(BOS).classList.contains('ck-series-rematch')).toBe(true);
    expect(chip(MIA).classList.contains('ck-series-rematch')).toBe(false);
  });
});
