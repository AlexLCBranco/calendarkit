// @vitest-environment jsdom
// Prize money per player by season, each with a source; the bracket's lines under each round.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { CUP_PRIZES, prizeLines } from '../src/data/cupPrize';
import { data } from './feed';

afterEach(cleanup);

describe('Cup prize money', () => {
  it('2026: the amounts as reported (QF loss $60,499 … champion $604,985), every season with a source', () => {
    expect(CUP_PRIZES[2026]).toMatchObject({ qfLoss: 60_499, sfLoss: 120_997, runnerUp: 241_994, champion: 604_985 });
    for (const p of Object.values(CUP_PRIZES)) {
      expect(p.source).toMatch(/https:\/\//);
      expect(p.qfLoss < p.sfLoss && p.sfLoss < p.runnerUp && p.runnerUp < p.champion).toBe(true);
    }
    expect(prizeLines(2022)).toBeUndefined(); // no Cup, no line
  });
  it('the simulator\'s bracket: a line under the quarterfinals, the semifinals and the final', async () => {
    render(<CalendarView data={data} size={{ width: 1920, height: 1000 }} now={Date.parse('2026-11-06T15:00:00Z')} timeZone="UTC" initial={{ mode: 'cup', cup: { tab: 'simulator' } }} />);
    await screen.findByTestId('cup-sim');
    expect(screen.getAllByTestId('cup-prize').map((p) => p.textContent)).toEqual([
      'QF loss $60,499 / player', 'SF loss $120,997 / player', 'QF loss $60,499 / player', 'SF loss $120,997 / player', 'Runner-up $241,994 · Champion $604,985 / player',
    ]);
  });
});
