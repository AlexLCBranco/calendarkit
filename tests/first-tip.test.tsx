// CK-14: the Slate page's countdown to the night's first tip-off.
import { describe, expect, it } from 'vitest';
import { firstTipText } from '../src/components/clock';
import { firstTip } from '../src/components/SlateView';
import { game } from './synthetic';

const T = Date.parse('2026-11-18T00:00:00Z');
const min = 60_000;

describe('firstTipText', () => {
  it('hours and minutes, minutes alone, days and hours', () => {
    expect(firstTipText(T, T - (2 * 60 + 14) * min)).toBe('First tip-off in 2h 14m');
    expect(firstTipText(T, T - 14 * min)).toBe('First tip-off in 14m');
    expect(firstTipText(T, T - 30_000)).toBe('First tip-off in 1m');
    expect(firstTipText(T, T - (27 * 60 + 5) * min)).toBe('First tip-off in 1d 3h');
    expect(firstTipText(T, T - 2 * 60 * min)).toBe('First tip-off in 2h 0m');
  });
  it('hidden once it has started, and without a time', () => {
    expect(firstTipText(T, T)).toBeUndefined();
    expect(firstTipText(T, T + min)).toBeUndefined();
    expect(firstTipText(undefined, T)).toBeUndefined();
  });
});

describe('firstTip', () => {
  it('the earliest set time of the night; TBD games left out', () => {
    const g = [game({ date: '2026-11-17', utc: '2026-11-18T01:30:00Z' }), game({ date: '2026-11-17', utc: '2026-11-18T00:00:00Z' }), game({ date: '2026-11-17', utc: null })];
    expect(firstTip(g)).toBe(T);
    expect(firstTip([game({ date: '2026-11-17', utc: null })])).toBeUndefined();
  });
});
