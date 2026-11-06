// @vitest-environment jsdom
// Round 22 (item 15): abnormal rest. Rest = the difference of two game dates (ET game dates; tip-off times don't count):
// B2B = 1, one empty day = 2, two empty days = 3. Gaps of 3+ flag BOTH games (before / after the break). Shown as a teal
// "4d" badge in the Fatigue component (no width of its own: in a free track) (filled: off the break; outlined: the break follows), its tooltip the exact count.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Fatigue } from '../src/components/Fatigue';
import { hasFatigue, leagueFatigue } from '../src/data/fatigue';
import { daysBetween, teamGames } from '../src/data/model';
import { REST_FLAG_DAYS, restDays, restLines, teamRestFlags } from '../src/data/rest';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';
import { dataOf, game } from './synthetic';

afterEach(cleanup);

const id = (t: string) => TEAMS.find((x) => x.tricode === t)!.id;
const DET = id('DET');
const PHI = id('PHI');
const LAL = id('LAL');
const NYK = id('NYK');
const MIA = id('MIA');
const DEN = id('DEN');

const g = (date: string, home: number, away: number, utc = `${date}T23:00:00Z`) => game({ date, utc, home, away });

describe('rest counting (game dates)', () => {
  it('back-to-back = 1, one empty day = 2, two empty days = 3', () => {
    const a = g('2026-11-01', DET, PHI);
    expect(restDays(a, g('2026-11-02', DET, LAL))).toBe(1);
    expect(restDays(a, g('2026-11-03', DET, LAL))).toBe(2);
    expect(restDays(a, g('2026-11-04', DET, LAL))).toBe(3);
  });

  it('the DET example: PHI on Nov 4, next LAL on Nov 8 = 4 days → both games flagged, with the other game', () => {
    const phi = g('2026-11-04', PHI, DET);
    const lal = g('2026-11-08', DET, LAL);
    const flags = teamRestFlags(dataOf([g('2026-11-03', DET, NYK), phi, lal, g('2026-11-09', MIA, DET)]), DET);
    expect(flags.get(phi.gameId)).toEqual({ teamId: DET, before: { days: 4, other: lal } });
    expect(flags.get(lal.gameId)).toEqual({ teamId: DET, after: { days: 4, other: phi } });
    expect(flags.size).toBe(2); // Nov 3 → 4 and Nov 8 → 9 are back-to-backs
    expect(restLines(flags.get(lal.gameId)!)).toEqual(['4 days off, last played Wed, Nov 4 @ PHI']);
    expect(restLines(flags.get(phi.gameId)!)).toEqual(['4 days off next, plays again Sun, Nov 8 vs LAL']);
  });

  it('2 days is not flagged, 3 is (the threshold); a game between two breaks has both sides', () => {
    expect(REST_FLAG_DAYS).toBe(3);
    const a = g('2026-11-01', DET, PHI);
    const b = g('2026-11-03', DET, LAL); // 2 days: no flag
    const c = g('2026-11-06', DET, NYK); // 3 days: flagged
    const d = g('2026-11-10', DET, MIA); // 4 days: flagged
    const flags = teamRestFlags(dataOf([a, b, c, d]), DET);
    expect(flags.has(a.gameId)).toBe(false);
    expect(flags.get(b.gameId)).toEqual({ teamId: DET, before: { days: 3, other: c } });
    expect(flags.get(c.gameId)).toEqual({ teamId: DET, after: { days: 3, other: b }, before: { days: 4, other: d } });
    expect(flags.get(d.gameId)).toEqual({ teamId: DET, after: { days: 4, other: c } });
  });

  it('games around midnight count by game date, not tip-off: a 10:30 pm ET tip (03:30 UTC next day) and a 1 pm tip', () => {
    // Nov 4 game tipping 22:30 ET = Nov 5 03:30 UTC; next game Nov 7 at 1 pm ET (18:00 UTC): 3 days by game date
    const late = g('2026-11-04', DEN, DET, '2026-11-05T03:30:00Z');
    const early = g('2026-11-07', DET, PHI, '2026-11-07T18:00:00Z');
    expect(restDays(late, early)).toBe(3);
    const flags = teamRestFlags(dataOf([late, early]), DET);
    expect(flags.get(late.gameId)?.before?.days).toBe(3);
    expect(flags.get(early.gameId)?.after?.days).toBe(3);
    // and a late game the night before an early one is still a back-to-back (1), never 0 or 2
    expect(restDays(late, g('2026-11-05', DET, LAL, '2026-11-05T18:00:00Z'))).toBe(1);
  });

  it('real feed, every team: each flag = an independent count of the dates; both games of every 3+ gap flagged', () => {
    let n = 0;
    for (const t of TEAMS) {
      const games = teamGames(data, t.id);
      const flags = teamRestFlags(data, t.id);
      for (let i = 0; i < games.length; i++) {
        const prev = games[i - 1];
        const next = games[i + 1];
        const gapIn = prev ? daysBetween(prev.dateEt, games[i]!.dateEt) : 0;
        const gapOut = next ? daysBetween(games[i]!.dateEt, next.dateEt) : 0;
        const f = flags.get(games[i]!.gameId);
        expect(f?.after?.days, `${t.tricode} ${games[i]!.dateEt} in`).toBe(gapIn >= 3 ? gapIn : undefined);
        expect(f?.before?.days, `${t.tricode} ${games[i]!.dateEt} out`).toBe(gapOut >= 3 ? gapOut : undefined);
        if (f) n++;
      }
    }
    expect(n).toBeGreaterThan(300);
  });
});

describe('the break chip', () => {
  it('leagueFatigue carries the flag; the tooltip has the line; a game with only a break is not empty', () => {
    const phi = g('2026-11-04', PHI, DET);
    const lal = g('2026-11-08', DET, LAL);
    const d = dataOf([phi, lal]);
    const f = leagueFatigue(d).get(lal.gameId)!.get(DET)!;
    expect(f.rest?.after?.days).toBe(4);
    expect(hasFatigue(f)).toBe(true);
    expect(f.tip.split('\n')[0]).toBe('DET — 4 days off, last played Wed, Nov 4 @ PHI');
  });

  it('filled "4d" off the break, outlined before it; its own tooltip; the 5th track; nothing without a break', () => {
    const phi = g('2026-11-04', PHI, DET);
    const lal = g('2026-11-08', DET, LAL);
    const d = dataOf([g('2026-11-03', DET, NYK), phi, lal]);
    const fat = leagueFatigue(d);
    const { container: after } = render(<Fatigue f={fat.get(lal.gameId)!.get(DET)} team="DET" />);
    const chip = after.querySelector<HTMLElement>('.ck-fx-rest')!;
    expect([chip.textContent, chip.dataset.break, chip.dataset.tip]).toEqual(['4d', 'after', '4 days off, last played Wed, Nov 4 @ PHI']);
    expect(chip.classList).toContain('ck-fx-rest-after');
    // no back-to-back tonight: the badge takes the B2B badge's track
    expect(chip.classList).toContain('ck-fx-rest-b');
    cleanup();
    const { container: before } = render(<Fatigue f={fat.get(phi.gameId)!.get(DET)} team="DET" />);
    const b = before.querySelector<HTMLElement>('.ck-fx-rest')!;
    expect([b.textContent, b.dataset.break]).toEqual(['4d', 'before']);
    expect(b.classList).toContain('ck-fx-rest-before');
    // the same component also shows the back-to-back (Nov 3 → 4) beside it
    expect(before.querySelector('.ck-fx-b2b')).not.toBeNull();
    // the B2B badge has its track: the break badge takes the 3-in-4 chip's (free here)
    expect(b.classList).toContain('ck-fx-rest-c');
    expect(before.querySelector('[data-testid="fatigue"]')!.getAttribute('aria-label')).toContain('4 days until the next game');
    cleanup();
    const { container: none } = render(<Fatigue f={fat.get([...fat.keys()][0]!)!.get(NYK)} team="NYK" />);
    expect(none.querySelector('.ck-fx-rest')).toBeNull();
  });

  it('B2B night and 3-in-4 both shown: the break is a corner tick (count in its tooltip); the component keeps its width', () => {
    // DET: Nov 1, Nov 3, Nov 4 (a 3-in-4 and Nov 3 → 4 a back-to-back), then Nov 8: Nov 4 has all three
    const last = g('2026-11-04', DET, LAL);
    const d = dataOf([g('2026-11-01', DET, PHI), g('2026-11-03', NYK, DET), last, g('2026-11-08', MIA, DET)]);
    const f = leagueFatigue(d).get(last.gameId)!.get(DET)!;
    expect([f.nights.length > 0, !!f.tif, f.rest?.before?.days]).toEqual([true, true, 4]);
    const { container } = render(<Fatigue f={f} team="DET" />);
    const t = container.querySelector<HTMLElement>('.ck-fx-rest')!;
    expect(t.classList).toContain('ck-fx-rest-tick');
    expect(t.dataset.tip).toBe('4 days off next, plays again Sun, Nov 8 @ MIA');
    expect(container.querySelector('.ck-fx-b2b')).not.toBeNull();
    expect(container.querySelector('.ck-fx-chip')).not.toBeNull();
  });
});
