// @vitest-environment jsdom
// The standings popup's move / resize maths (floatBox.ts): kept inside the viewport, never under the minimum size,
// the side not dragged stays put; the saved box survives only when it is a real box.
import { afterEach, describe, expect, it } from 'vitest';
import { clampBox, loadBox, resizeBox } from '../src/components/floatBox';

const MIN = { w: 360, h: 200 };
const VW = 1600;
const VH = 1000;

afterEach(() => localStorage.clear());

describe('clampBox', () => {
  it('a box inside the viewport is unchanged', () => {
    expect(clampBox({ x: 100, y: 50, w: 800, h: 500 }, VW, VH, MIN)).toEqual({ x: 100, y: 50, w: 800, h: 500 });
  });
  it('dragged past an edge: stops at it (all four sides)', () => {
    expect(clampBox({ x: -40, y: -10, w: 800, h: 500 }, VW, VH, MIN)).toEqual({ x: 0, y: 0, w: 800, h: 500 });
    expect(clampBox({ x: 1000, y: 700, w: 800, h: 500 }, VW, VH, MIN)).toEqual({ x: 800, y: 500, w: 800, h: 500 });
  });
  it('a box saved in a larger window: shrinks to the viewport; never below the minimum', () => {
    expect(clampBox({ x: 0, y: 0, w: 2400, h: 1400 }, VW, VH, MIN)).toEqual({ x: 0, y: 0, w: 1600, h: 1000 });
    expect(clampBox({ x: 10, y: 10, w: 100, h: 50 }, VW, VH, MIN)).toEqual({ x: 10, y: 10, w: 360, h: 200 });
  });
});

describe('resizeBox', () => {
  const start = { x: 400, y: 100, w: 800, h: 500 };
  it('east / south grow and shrink the size; the top-left stays', () => {
    expect(resizeBox(start, 'se', 100, 50, VW, VH, MIN)).toEqual({ x: 400, y: 100, w: 900, h: 550 });
    expect(resizeBox(start, 'e', -200, 999, VW, VH, MIN)).toEqual({ x: 400, y: 100, w: 600, h: 500 });
  });
  it('west / north move that side; the opposite side stays put', () => {
    const b = resizeBox(start, 'nw', -100, -50, VW, VH, MIN);
    expect(b).toEqual({ x: 300, y: 50, w: 900, h: 550 });
    expect([b.x + b.w, b.y + b.h]).toEqual([start.x + start.w, start.y + start.h]);
  });
  it('stops at the minimum size and at the viewport edges', () => {
    expect(resizeBox(start, 'se', -2000, -2000, VW, VH, MIN)).toMatchObject({ w: 360, h: 200 });
    expect(resizeBox(start, 'nw', 2000, 2000, VW, VH, MIN)).toEqual({ x: 840, y: 400, w: 360, h: 200 });
    expect(resizeBox(start, 'se', 5000, 5000, VW, VH, MIN)).toEqual({ x: 400, y: 100, w: 1200, h: 900 });
    expect(resizeBox(start, 'nw', -5000, -5000, VW, VH, MIN)).toEqual({ x: 0, y: 0, w: 1200, h: 600 });
  });
});

describe('loadBox', () => {
  it('reads a saved box; anything else (missing, broken JSON, wrong shape) is no box', () => {
    expect(loadBox('k')).toBeUndefined();
    localStorage.setItem('k', JSON.stringify({ x: 1, y: 2, w: 400, h: 300 }));
    expect(loadBox('k')).toEqual({ x: 1, y: 2, w: 400, h: 300 });
    localStorage.setItem('k', '{oops');
    expect(loadBox('k')).toBeUndefined();
    localStorage.setItem('k', JSON.stringify({ x: 1, y: 2, w: 'wide' }));
    expect(loadBox('k')).toBeUndefined();
  });
});
