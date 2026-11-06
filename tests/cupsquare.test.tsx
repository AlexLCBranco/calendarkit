// @vitest-environment jsdom
// Round 21 (item 5): the one Cup group-game square (src/slate/CupSquare.tsx) — "vs" / "@" before the opponent in its own
// smaller element, W / L (and the margin where asked) for a played game, the opponent alone for one to come, tonight's
// marked, the final score as the tooltip, and the game page as a new-tab link (none: a plain square).
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CupSquare } from '../src/slate/CupSquare';

afterEach(cleanup);

const played = { gameId: '1', opponent: 'PHX', home: false, played: true, win: true, margin: 7, final: 'DEN 127 @ PHX 120 · Final' };
const next = { gameId: '2', opponent: 'HOU', home: true, played: false };
const sq = () => document.querySelector<HTMLElement>('.ck-cup-slot')!;

describe('CupSquare', () => {
  it('a played away game: "@" (its own small element) + PHX over W; the final score as tooltip; a new-tab link', () => {
    render(<CupSquare g={played} url="https://hoopsjunkie.io/games/x" />);
    expect(sq().tagName).toBe('A');
    expect([sq().getAttribute('target'), sq().getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
    expect(sq().querySelector('.ck-cup-slot-at')!.textContent).toBe('@');
    expect(sq().querySelector('.ck-cup-slot-opp')!.textContent).toBe('@PHX');
    expect(sq().querySelector('.ck-cup-slot-res')!.textContent).toBe('W');
    expect(sq().dataset.tip).toBe('DEN 127 @ PHX 120 · Final');
    expect(sq().classList).toContain('ck-cup-slot-w');
  });

  it('the margin where asked ("W +7", "L −12")', () => {
    render(<CupSquare g={played} margin />);
    expect(sq().querySelector('.ck-cup-slot-res')!.textContent).toBe('W +7');
    cleanup();
    render(<CupSquare g={{ ...played, win: false, margin: -12 }} margin />);
    expect(sq().querySelector('.ck-cup-slot-res')!.textContent).toBe('L −12');
    expect(sq().classList).toContain('ck-cup-slot-l');
  });

  it('a home game to come: "vs HOU" alone, muted; tonight outlined; no URL → not a link', () => {
    render(<CupSquare g={next} tonight />);
    expect(sq().tagName).toBe('SPAN');
    expect(sq().querySelector('.ck-cup-slot-opp')!.textContent).toBe('vsHOU');
    expect(sq().querySelector('.ck-cup-slot-res')).toBeNull();
    expect(sq().classList).toContain('ck-cup-slot-next');
    expect(sq().classList).toContain('ck-cup-slot-tonight');
    expect(sq().getAttribute('aria-label')).toBe('vs HOU, tonight');
  });
});
