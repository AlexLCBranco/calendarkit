// A floating panel the person can move (drag its handle) and resize (drag an edge or a corner), kept inside the
// viewport, its place and size remembered in localStorage. While a gesture runs, only the panel's inline style is
// written (no React render per pointer move); the box is committed and saved once, on release.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a resize grabs: n / s / e / w and the four corners. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** The box moved / resized to fit the viewport: never smaller than `min` (unless the viewport is), never outside it. */
export function clampBox(b: Box, vw: number, vh: number, min: { w: number; h: number }): Box {
  const w = Math.min(Math.max(b.w, min.w), vw);
  const h = Math.min(Math.max(b.h, min.h), vh);
  return { w, h, x: Math.min(Math.max(b.x, 0), vw - w), y: Math.min(Math.max(b.y, 0), vh - h) };
}

/**
 * The box after dragging `edge` by (dx, dy) from `start`: the dragged sides move, the opposite ones stay put; a side
 * stops at the minimum size and at the viewport's edge.
 */
export function resizeBox(start: Box, edge: Edge, dx: number, dy: number, vw: number, vh: number, min: { w: number; h: number }): Box {
  let { x, y, w, h } = start;
  const right = x + w;
  const bottom = y + h;
  if (edge.includes('e')) w = Math.min(Math.max(start.w + dx, min.w), vw - x);
  if (edge.includes('s')) h = Math.min(Math.max(start.h + dy, min.h), vh - y);
  if (edge.includes('w')) {
    x = Math.min(Math.max(start.x + dx, 0), right - min.w);
    w = right - x;
  }
  if (edge.includes('n')) {
    y = Math.min(Math.max(start.y + dy, 0), bottom - min.h);
    h = bottom - y;
  }
  return { x, y, w, h };
}

const isBox = (v: unknown): v is Box => !!v && typeof v === 'object' && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((v as Record<string, unknown>)[k]));

export function loadBox(key: string): Box | undefined {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isBox(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function saveBox(key: string, box: Box | undefined) {
  try {
    if (box) localStorage.setItem(key, JSON.stringify(box));
    else localStorage.removeItem(key);
  } catch {
    // storage blocked (private mode, quota): the box just isn't remembered
  }
}

const apply = (el: HTMLElement, b: Box) => Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });

/**
 * `box`: undefined = the default place and size (the CSS's). `dragProps` go on the handle, `edgeProps(edge)` on each
 * resize grip, `reset` puts the default back (and forgets the saved box).
 */
export function useFloatBox(key: string, min: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | undefined>(() => loadBox(key));
  const shown = (): Box => {
    const r = ref.current!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const commit = useCallback(
    (b: Box | undefined) => {
      setBox(b);
      saveBox(key, b);
    },
    [key],
  );

  // a saved box from a larger window, or the window shrinking: back inside
  useEffect(() => {
    if (!box) return;
    const fit = () => {
      const c = clampBox(box, innerWidth, innerHeight, min);
      if (c.x !== box.x || c.y !== box.y || c.w !== box.w || c.h !== box.h) commit(c);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [box, min, commit]);

  const gesture = (e: ReactPointerEvent, next: (start: Box, dx: number, dy: number) => Box) => {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    const el = ref.current;
    const start = box ?? shown();
    const sx = e.clientX;
    const sy = e.clientY;
    let cur = start;
    // a click (no real move) changes nothing: the gesture starts past a few px
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const move = (m: PointerEvent) => {
      const dx = m.clientX - sx;
      const dy = m.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        el.classList.add('ck-float-moving');
        // from the default place: pin the shown box first (the CSS centers it with a transform)
        apply(el, start);
        el.style.transform = 'none';
      }
      cur = next(start, dx, dy);
      apply(el, cur);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (!moved) return;
      el.classList.remove('ck-float-moving');
      commit(cur);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const dragProps = {
    onPointerDown: (e: ReactPointerEvent) => {
      // the handle's own buttons stay buttons
      if ((e.target as Element).closest('button, a, input')) return;
      gesture(e, (s, dx, dy) => clampBox({ ...s, x: s.x + dx, y: s.y + dy }, innerWidth, innerHeight, min));
    },
  };
  const edgeProps = (edge: Edge) => ({
    onPointerDown: (e: ReactPointerEvent) => gesture(e, (s, dx, dy) => resizeBox(s, edge, dx, dy, innerWidth, innerHeight, min)),
  });
  const style = box ? { left: box.x, top: box.y, width: box.w, height: box.h, transform: 'none', maxHeight: 'none' } : undefined;
  const reset = () => {
    const el = ref.current;
    if (el) el.removeAttribute('style');
    commit(undefined);
  };
  return { ref, box, style, dragProps, edgeProps, reset };
}
