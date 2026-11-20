// "Go anywhere"'s matching (src/components/nav.ts): every word must match, in any order, accents and case ignored;
// an exact or starting label comes first. And the Cup History's seasons written out for the shell equal the data's.
import { describe, expect, it } from 'vitest';
import history from '../src/data/cupHistory.json';
import { CUP_SEASONS } from '../src/components/CupDestination';
import { entry, fold, searchFind } from '../src/components/nav';

const noop = () => {};
const E = [entry('Schedule', 'Place', '', noop, 0), entry('Boston Celtics', 'Team', 'BOS East Atlantic', noop, 1), entry('Boston Celtics · List', 'Team', 'BOS', noop, 2), entry('Montréal', 'Team', '', noop, 1), entry('NBA Cup 2024', 'Cup history', '', noop, 2)];
const find = (q: string) => searchFind(E, q).map((e) => e.label);

describe('searchFind', () => {
  it('nothing typed: the rank-0 entries', () => expect(find('  ')).toEqual(['Schedule']));
  it('every word, any order, the shorter label first', () => {
    expect(find('celtics boston')).toEqual(['Boston Celtics', 'Boston Celtics · List']);
    expect(find('list bos')).toEqual(['Boston Celtics · List']);
    expect(find('atlantic')).toEqual(['Boston Celtics']);
  });
  it('accents and case ignored', () => {
    expect(fold('Montréal')).toBe('montreal');
    expect(find('MONTREAL')).toEqual(['Montréal']);
  });
  it('a label starting with the query beats one only containing it', () => expect(find('2024')).toEqual(['NBA Cup 2024']));
});

it('CUP_SEASONS (newest first) are the History data\'s seasons', () => {
  expect(CUP_SEASONS).toEqual(history.seasons.map((s) => s.year).sort((a, b) => b - a));
});
