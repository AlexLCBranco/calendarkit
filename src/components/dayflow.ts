// League calendar day cells: game-line geometry, time groups and the newspaper flow of a day's games into
// columns. Pure (no React, no DOM), so the layout maths can be checked and measured outside a browser.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { tipoff } from '../data/model';

/**
 * Game line geometry in px. Widths are fixed rather than measured at runtime: the text is the bundled Inter font,
 * so they are the same on every OS. `tri` fits the widest tricode (MEM, 26.95 px at 11 px semibold).
 * Line: logo · gap · AWAY · sep (the "@", `atFont` px: 8.69 px wide at 9 px) · logo · gap · HOME · pillGap · TV.
 * AWAY is right-aligned in its column, so every line reads "AWAY @ HOME" with the "@" in one column.
 * `labelGap`: below a time label; `dot`: B2B dot.
 */
export const MONTH_LINE = { logo: 16, gap: 1, tri: 28, sep: 12, atFont: 9, pillGap: 2, pill: 15, font: 11, labelFont: 10, rowGap: 3, groupGap: 7, labelGap: 2, dot: 5 } as const;
export type MonthLine = { [K in keyof typeof MONTH_LINE]: number };
export const lineWidth = (L: MonthLine) => 2 * (L.logo + L.gap + L.tri) + L.sep + L.pillGap + L.pill;
export const MONTH_LINE_WIDTH = lineWidth(MONTH_LINE);
/** MONTH_LINE with every length (fonts included) times `s`. */
export const scaleLine = (s: number): MonthLine => Object.fromEntries(Object.entries(MONTH_LINE).map(([k, v]) => [k, v * s])) as MonthLine;
/** Space between game columns inside a day cell (2 × 119 + 8 = 246 of the 249.42 px cell at 1920 px). */
export const MONTH_COL_GAP = 8;
/** Below this widget width the day grid uses 2 px gaps and cell padding (instead of 4 px). */
export const ROOMY_WIDTH = 1000;

/** Inner width of one day cell for a given widget width (matches the grid gap, cell padding and border in CSS). */
export function monthCellInner(width: number): number {
  const roomy = width >= ROOMY_WIDTH;
  const gridGap = roomy ? 4 : 2;
  const pad = roomy ? 4 : 2;
  return (width - 6 * gridGap) / 7 - 2 * pad - 2;
}

/** Game columns per day cell: as many full-size lines as fit, with MONTH_COL_GAP between them; at least 1. */
export function monthColumns(width: number): number {
  return Math.max(1, Math.floor((monthCellInner(width) + MONTH_COL_GAP) / (MONTH_LINE_WIDTH + MONTH_COL_GAP)));
}

/**
 * Smallest widget width where a full-size game line fits a 7-column day cell (monthCellInner ≥ 119 px). Below it,
 * League → Calendar shows the count grid. (width − 12) / 7 − 6 ≥ 119 → 887.
 */
export const WEEK_MIN_WIDTH = Math.ceil(7 * (MONTH_LINE_WIDTH + 2 * 2 + 2) + 6 * 2);

export type TimeGroup = { label: string; games: ScheduleGame[] };

/** A day's games grouped by local tip-off label ("20:00", "00:30 (+1)", "TBD"), keeping tip-off order. */
export function timeGroups(games: ScheduleGame[], timeZone?: string): TimeGroup[] {
  const out: TimeGroup[] = [];
  for (const g of games) {
    const label = tipoff(g, timeZone).label;
    const last = out.at(-1);
    if (last && last.label === label) last.games.push(g);
    else out.push({ label, games: [g] });
  }
  return out;
}

/** A column's piece of a time group; `repeat` when the group started in the previous column (label shown again). */
export interface ColumnGroup extends TimeGroup {
  repeat: boolean;
}

const ROW_H = MONTH_LINE.logo + MONTH_LINE.rowGap;

/** Estimated height (px) of one column of time groups at line geometry `L` (what the CSS lays out). */
export const columnHeight = (c: TimeGroup[], L: MonthLine = MONTH_LINE) =>
  c.reduce((h, grp, i) => h + (i ? L.groupGap : 0) + L.labelFont * 1.25 + L.labelGap + grp.games.length * (L.logo + L.rowGap) - L.rowGap, 0);

/**
 * Flows a day's time groups into `cols` columns in newspaper order (down column 1, then column 2, …), choosing the
 * break points that make the tallest column as short as possible. Each column starts at a game, so a label never
 * ends a column. Splitting a group (its label repeats atop the next column) costs one game row, so a group is only
 * split when that balances the columns by more than a row. Heights are estimated from MONTH_LINE, not measured.
 */
export function flowDay(groups: TimeGroup[], cols: number): ColumnGroup[][] {
  const flat = groups.flatMap((grp, gi) => grp.games.map((g, i) => ({ g, gi, first: i === 0 })));
  const n = flat.length;
  // Column = games [a, b), as group pieces.
  const column = (a: number, b: number) => {
    const out: ColumnGroup[] = [];
    for (let i = a; i < b; i++) {
      const { g, gi, first } = flat[i]!;
      if (out.at(-1)?.label === groups[gi]!.label) out.at(-1)!.games.push(g);
      else out.push({ label: groups[gi]!.label, games: [g], repeat: !first });
    }
    return out;
  };
  const parts = (cuts: number[]) => [...cuts, n].map((e, i, ends) => column(i ? ends[i - 1]! : 0, e));
  const k = Math.max(1, Math.min(cols, n));
  let best: { cost: number; splits: number; cuts: number[] } | undefined;
  // Try every set of up to k − 1 break points (n ≤ ~15 games, 2 columns at most sizes: a handful of cases).
  const walk = (cuts: number[], from: number) => {
    const p = parts(cuts);
    const splits = p.filter((c) => c[0]!.repeat).length;
    const cost = Math.max(...p.map((c) => columnHeight(c))) + splits * ROW_H;
    // on a tie: fewer split groups, then the later break (earlier columns the longer ones, as in a newspaper)
    if (!best || cost < best.cost - 0.01 || (cost <= best.cost + 0.01 && splits <= best.splits)) best = { cost, splits, cuts };
    if (cuts.length < k - 1) for (let c = from; c < n; c++) walk([...cuts, c], c + 1);
  };
  if (n) walk([], 1);
  const out: ColumnGroup[][] = best ? parts(best.cuts) : [];
  while (out.length < cols) out.push([]);
  return out;
}

/** Estimated height (px) of a day's flowed games: its tallest column. */
export const flowHeight = (flow: TimeGroup[][]) => Math.max(0, ...flow.map((c) => columnHeight(c)));

// ---------------------------------------------------------------- 1-week mode: larger lines

/** Largest game-line scale in 1-week mode (about 1.5×, see PROJECT.md). */
export const WEEK_SCALE_MAX = 1.5;
/** Share of a day cell's inner width, and of its height below the day header, that the scaled content may use. */
export const WEEK_SCALE_FILL = 0.8;
/** Day header (12 px text + padding) and the space above the games; not scaled (.ck-wday, .ck-month-day). */
export const WEEK_HEAD_H = 24;

/** The season's tallest day in one column at scale 1 (px): every game, grouped by tip-off time in `timeZone`. */
export function busiestDayHeight(byDate: Map<string, ScheduleGame[]>, timeZone?: string): number {
  let max = 0;
  for (const games of byDate.values()) max = Math.max(max, columnHeight(timeGroups(games, timeZone)));
  return max;
}

/**
 * 1-week game-line scale for a day cell's inner size (px, inside padding and border): as large as possible up to
 * WEEK_SCALE_MAX while one line uses at most WEEK_SCALE_FILL of the width and the season's busiest day at most
 * WEEK_SCALE_FILL of the height below the header. Never below 1 (the 2-week size); 0.05 steps.
 */
export function weekScale(innerWidth: number, innerHeight: number, busiest: number): number {
  const byWidth = (innerWidth * WEEK_SCALE_FILL) / MONTH_LINE_WIDTH;
  const byHeight = busiest > 0 ? ((innerHeight - WEEK_HEAD_H) * WEEK_SCALE_FILL) / busiest : Infinity;
  return Math.max(1, Math.min(WEEK_SCALE_MAX, Math.floor(Math.min(byWidth, byHeight) * 20 + 1e-9) / 20));
}
