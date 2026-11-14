// The maps' view and label geometry, pure: zoom-to-fit (the part of the map shown: centre + zoom), map units ↔
// pixels in the box, text widths, and a greedy label placer that never lets two labels (or a label and a dot) overlap.

import { MAP_H, MAP_W } from './basemap';

export interface View {
  /** Centre of the shown part, map units. */
  cx: number;
  cy: number;
  /** Zoom: 1 = the whole map fills the box. */
  k: number;
}

export const WHOLE: View = { cx: MAP_W / 2, cy: MAP_H / 2, k: 1 };
/** The most a view zooms in. */
export const MAX_ZOOM = 4;
/** The smallest stretch of map (units, ≈ 2.8 mi each) a view shows: a 0-mile game doesn't zoom into one city. */
export const MIN_SPAN = 170;

/** Zoom to fit `pts` (map units) in a box `w` px wide, with `pad` px left free around them (labels). */
export function fitView(pts: readonly { x: number; y: number }[], w: number, pad = { x: Math.min(110, w * 0.15), y: Math.min(46, w * 0.07) }): View {
  if (!pts.length || w <= 0) return WHOLE;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, MIN_SPAN);
  const spanY = Math.max(y1 - y0, (MIN_SPAN * MAP_H) / MAP_W);
  const s = w / MAP_W; // px per unit at k = 1
  const h = MAP_H * s;
  const k = Math.max(1, Math.min(MAX_ZOOM, (w - 2 * pad.x) / (span * s), (h - 2 * pad.y) / (spanY * s)));
  // not zoomed: the whole map. Zoomed: centred on the places, even if a little sea or Canada shows (clamping to the map
  // would push a West Coast place against the box's edge, where its label has no room)
  if (k <= 1.001) return WHOLE;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.round(k * 1000) / 1000 };
}

/** The stage's CSS transform for a view (origin top left; % of the box, so it holds at any width). */
export const stageTransform = (v: View) => `translate(${(50 - (v.k * v.cx * 100) / MAP_W).toFixed(3)}%, ${(50 - (v.k * v.cy * 100) / MAP_H).toFixed(3)}%) scale(${v.k})`;

/** Map units → px in a box `w` px wide, under view `v`. */
export function toPx(v: View, w: number, p: { x: number; y: number }): { x: number; y: number } {
  const s = (w / MAP_W) * v.k;
  return { x: (p.x - v.cx) * s + w / 2, y: (p.y - v.cy) * s + (MAP_H * w) / MAP_W / 2 };
}

// ---------------------------------------------------------------- text widths

let ctx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** Width (px) of `text` in `font` (a CSS font shorthand): measured once on a canvas; estimated where there's none (tests). */
export function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) ctx = typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent) && typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  let w: number;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText(text).width;
  } else w = text.length * (parseFloat(/(\d+(\.\d+)?)px/.exec(font)?.[1] ?? '12') * 0.62);
  widths.set(key, w);
  return w;
}

// ---------------------------------------------------------------- label placement

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export interface LabelAsk {
  key: string;
  /** Candidate boxes (px in the box), best first; one per variant and position. `variant` tells which text it is. */
  options: (Rect & { variant: number })[];
  /** Must be shown even when every option overlaps (the least overlapping one is taken). */
  force?: boolean;
}

/**
 * Greedy: each ask in order takes its first option that overlaps nothing placed (labels, `blocked` boxes such as dots)
 * and stays inside `bounds` (with a 2 px gap kept between labels). An ask with no free option is left out — or, `force`,
 * takes the least overlapping one.
 */
export function placeLabels(asks: readonly LabelAsk[], blocked: readonly Rect[], bounds: Rect, gap = 2): Map<string, Rect & { variant: number }> {
  const taken: Rect[] = [...blocked];
  const out = new Map<string, Rect & { variant: number }>();
  const inside = (r: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
  const grown = (r: Rect): Rect => ({ x: r.x - gap, y: r.y - gap, w: r.w + 2 * gap, h: r.h + 2 * gap });
  for (const a of asks) {
    let best: (Rect & { variant: number }) | undefined;
    let bestCost = Infinity;
    for (const o of a.options) {
      const cost = taken.reduce((s, t) => s + overlap(grown(o), t), 0) + (inside(o) ? 0 : 1e6);
      if (cost === 0) {
        best = o;
        bestCost = 0;
        break;
      }
      if (cost < bestCost) [best, bestCost] = [o, cost];
    }
    if (!best || (bestCost > 0 && !a.force)) continue;
    out.set(a.key, best);
    taken.push(best);
  }
  return out;
}

/** Boxes of a w × h label around a point (px), nearest first: right, left, above, below, then the four corners. */
export function around(p: { x: number; y: number }, w: number, h: number, r = 9): Rect[] {
  return [
    { x: p.x + r, y: p.y - h / 2, w, h },
    { x: p.x - r - w, y: p.y - h / 2, w, h },
    { x: p.x - w / 2, y: p.y - r - h, w, h },
    { x: p.x - w / 2, y: p.y + r, w, h },
    { x: p.x + r * 0.7, y: p.y - r * 0.7 - h, w, h },
    { x: p.x + r * 0.7, y: p.y + r * 0.7, w, h },
    { x: p.x - r * 0.7 - w, y: p.y - r * 0.7 - h, w, h },
    { x: p.x - r * 0.7 - w, y: p.y + r * 0.7, w, h },
  ];
}
