// @vitest-environment jsdom
// Marquee selection: the store (an unchanged set notifies nobody), hit-testing (box vs rects, clipping to a scroller,
// rows remembered while auto-scrolling, rest rows never), and the gesture (threshold, Shift adds, click clears,
// Escape clears, a view change clears). jsdom has no layout, so rects are stubbed per element.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { CalendarView } from '../src/components/CalendarView';
import { createSelectionStore, gamesTouching, useMarqueeSelection, useSelection, type SelectionStore } from '../src/components/selection';
import { data } from './feed';
import { TEAM } from './synthetic';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rect = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
/** Stubs each element's rect from its data-r="left,top,w,h". */
function stubRects(root: ParentNode) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = (this as HTMLElement).dataset?.r?.split(',').map(Number);
    return r ? rect(r[0]!, r[1]!, r[2]!, r[3]!) : rect(0, 0, 0, 0);
  });
  return root;
}

describe('selection store', () => {
  it('notifies only when the set changes; clear empties it', () => {
    const s = createSelectionStore();
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(['a', 'b']);
    s.set(['b', 'a']); // same set
    s.set(new Set(['a', 'b']));
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(['a']);
    expect(fn).toHaveBeenCalledTimes(2);
    s.clear();
    s.clear();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(s.get().size).toBe(0);
  });

  it('a subscriber re-renders only on a real change', () => {
    const s = createSelectionStore();
    let renders = 0;
    function Count() {
      renders++;
      return <span>{useSelection(s).size}</span>;
    }
    render(<Count />);
    act(() => s.set(['x']));
    act(() => s.set(['x']));
    act(() => s.set(['x']));
    expect(renders).toBe(2);
  });
});

describe('gamesTouching', () => {
  it('box vs game rects; days and rest rows are never items; clipped to the scroller', () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-select-scroller data-r="0,100,500,200">
          <article data-game-id="g1" data-r="10,110,400,30"></article>
          <div data-rest="2026-11-02" data-r="10,145,400,15"></div>
          <article data-game-id="g2" data-r="10,165,400,30"></article>
          <article data-game-id="hidden" data-r="10,320,400,30"></article>
        </div>
        <div data-day="2026-11-03" data-r="600,100,200,200"><li data-game-id="g3" data-r="610,120,150,20"></li></div>
        <div class="ck-team-probe"><article data-game-id="ck-probe" data-r="10,110,400,30"></article></div>
      </div>`;
    const root = stubRects(document.getElementById('root')!);
    expect(gamesTouching(root, { left: 50, top: 120, right: 60, bottom: 170 })).toEqual(['g1', 'g2']);
    // "hidden" is below the scroller's bottom (300): scrolled out of view, not selected
    expect(gamesTouching(root, { left: 50, top: 120, right: 60, bottom: 400 })).toEqual(['g1', 'g2']);
    expect(gamesTouching(root, { left: 0, top: 0, right: 900, bottom: 900 })).toEqual(['g1', 'g2', 'g3']);
    expect(gamesTouching(root, { left: 0, top: 146, right: 900, bottom: 158 })).toEqual([]); // only the rest row
  });

  it('in the scroller the drag started in: content coordinates, rows scrolled past (even unmounted) stay', () => {
    document.body.innerHTML = `<div id="root"><div id="sc" data-select-scroller data-r="0,100,500,200"><article data-game-id="g1" data-r="10,110,400,30"></article><article data-game-id="g2" data-r="10,150,400,30"></article></div></div>`;
    const root = stubRects(document.getElementById('root')!);
    const sc = document.getElementById('sc')!;
    const seen = new Map();
    expect(gamesTouching(root, { left: 50, top: 115, right: 60, bottom: 160 }, sc, seen).sort()).toEqual(['g1', 'g2']);
    // the list scrolled 100 px and g1 was unmounted: the box (start anchored to content) still covers it
    sc.scrollTop = 100;
    root.querySelector('[data-game-id="g1"]')!.remove();
    (root.querySelector('[data-game-id="g2"]') as HTMLElement).dataset.r = '10,50,400,30';
    expect(gamesTouching(root, { left: 50, top: 15, right: 60, bottom: 60 }, sc, seen).sort()).toEqual(['g1', 'g2']);
  });
});

/** Minimal host for the hook: an area with games and the box. */
function Host({ store }: { store: SelectionStore }) {
  const box = useRef<HTMLDivElement>(null);
  const down = useMarqueeSelection(store, box);
  return (
    <div data-testid="area" data-r="0,0,1000,1000" onPointerDown={down}>
      <article data-game-id="a" data-r="10,10,300,30">
        <span data-testid="in-a" data-r="20,15,50,20">BOS</span>
      </article>
      <article data-game-id="b" data-r="10,50,300,30" />
      <article data-game-id="c" data-r="10,90,300,30" />
      <div data-rest="x" data-r="10,125,300,15" />
      <button type="button" data-testid="btn" data-r="400,10,40,20" />
      <div ref={box} data-testid="box" style={{ display: 'none' }} />
    </div>
  );
}

function pointer(type: string, el: Element, x: number, y: number, extra: Record<string, unknown> = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', isPrimary: true });
  el.dispatchEvent(e);
}
async function drag(area: Element, from: Element, a: [number, number], b: [number, number], shift = false) {
  pointer('pointerdown', from, a[0], a[1], { shiftKey: shift });
  pointer('pointermove', area, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  pointer('pointermove', area, b[0], b[1]);
  await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
  pointer('pointerup', area, b[0], b[1]);
}

describe('the gesture', () => {
  const setup = () => {
    Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true });
    const store = createSelectionStore();
    render(<Host store={store} />);
    stubRects(document.body);
    return { store, area: screen.getByTestId('area') };
  };

  it('a drag (even starting on a game) selects what the box touches; rest rows never; the box hides after', async () => {
    const { store, area } = setup();
    await drag(area, screen.getByTestId('in-a'), [30, 20], [60, 140]);
    expect([...store.get()]).toEqual(['a', 'b', 'c']);
    expect(screen.getByTestId('box').style.display).toBe('none');
  });

  it('Shift adds; a new drag replaces; a plain click (under 4 px) clears; Shift-click keeps', async () => {
    const { store, area } = setup();
    await drag(area, area, [500, 15], [20, 20]);
    expect([...store.get()]).toEqual(['a']);
    await drag(area, area, [500, 95], [20, 100], true);
    expect([...store.get()].sort()).toEqual(['a', 'c']);
    await drag(area, area, [500, 55], [20, 60]);
    expect([...store.get()]).toEqual(['b']);
    pointer('pointerdown', area, 500, 500, { shiftKey: true });
    pointer('pointermove', area, 502, 501);
    pointer('pointerup', area, 502, 501);
    expect([...store.get()]).toEqual(['b']);
    pointer('pointerdown', area, 500, 500);
    pointer('pointermove', area, 502, 501);
    pointer('pointerup', area, 502, 501);
    expect(store.get().size).toBe(0);
  });

  it('a press on a control never starts a box; touch doesn\'t either (it scrolls)', async () => {
    const { store, area } = setup();
    await drag(area, screen.getByTestId('btn'), [410, 15], [20, 140]);
    expect(store.get().size).toBe(0);
    const e = new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 15, button: 0 });
    Object.assign(e, { pointerId: 2, pointerType: 'touch', isPrimary: true });
    area.dispatchEvent(e);
    pointer('pointermove', area, 20, 140);
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    pointer('pointerup', area, 20, 140);
    expect(store.get().size).toBe(0);
  });
});

describe('in CalendarView', () => {
  it('bar: count, Escape clears, ✕ clears; view, team, period, span and toggle changes clear', async () => {
    Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true });
    render(<CalendarView data={data} size={{ width: 1200, height: 900 }} now={Date.parse('2026-11-15T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS }} />);
    // every game gets a rect in a column, so a box from top to bottom touches them all
    let i = 0;
    for (const g of document.querySelectorAll<HTMLElement>('.ck-team-grid [data-game-id]')) g.dataset.r = `100,${100 + 40 * i++},200,30`;
    stubRects(document.body);
    const root = document.querySelector('.ck-select-area')!;
    const select = async () => {
      const first = document.querySelector('.ck-team-grid [data-game-id]')!;
      await drag(root, first, [150, 105], [160, 100 + 40 * i]);
    };
    await select();
    expect(screen.getByTestId('selection-count').textContent).toBe(`${i} games selected`);
    expect(screen.getByTestId('selection-style').textContent).toContain('outline');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('selection-bar')).toBeNull();
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByTestId('selection-bar')).toBeNull();
    for (const change of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Next month' })),
      () => fireEvent.click(screen.getByRole('tab', { name: '1 week' })),
      () => fireEvent.click(screen.getByLabelText('TV games only')),
      () => {
        fireEvent.click(screen.getByTestId('team-picker'));
        fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
      },
      () => fireEvent.click(screen.getByRole('tab', { name: 'List' })),
    ]) {
      i = 0;
      for (const g of document.querySelectorAll<HTMLElement>('.ck-select-area [data-game-id]')) g.dataset.r = `100,${100 + 40 * i++},200,30`;
      const first = document.querySelector('.ck-select-area [data-game-id]')!;
      await drag(root, first, [150, 105], [160, 100 + 40 * Math.min(i, 3)]);
      expect(screen.getByTestId('selection-bar')).toBeTruthy();
      change();
      expect(screen.queryByTestId('selection-bar')).toBeNull();
    }
  });
});
