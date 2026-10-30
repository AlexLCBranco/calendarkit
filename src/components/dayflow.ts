// League calendar day cells: game-line geometry, time groups and the newspaper flow of a day's games into
// columns. Pure (no React, no DOM), so the layout maths can be checked and measured outside a browser.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { tipoff } from '../data/model';

/**
 * Game line geometry in px. Widths are fixed rather than measured at runtime: the text is the bundled Inter font,
 * so they are the same on every OS. `tri` fits the widest tricode (MEM, 26.95 px at 11 px semibold).
 * Line (round 4, "option B": aligned columns, logos always): logo · gap · AWAY · sgap · score · sep (the "@",
 * `atFont` px: 8.69 px wide at 9 px) · score · sgap · HOME · gap · logo · pillGap · TV. Logos on the outside, each
 * tricode against its logo, each score in its own slot against the "@" (empty before the game), so every column — logos,
 * tricodes, scores, "@" — is at one x down a day. `labelGap`: below a time label; `dot`: the old B2B dot (unused
 * here since the fatigue marks). `scoreFont`: the score in its `score` slot (largest 0.1 px step where 3 tabular
 * digits, SCORE3_EM wide, fit: 8.2 px → 15.91 px of 16). `fxRow` / `fxGap` / `fxFont`: 1-week mode's second row under a game
 * whose teams have fatigue (round 5: the compact Fatigue component under each team; its font ≈ 0.72 × `font`).
 */
export const MONTH_LINE = { logo: 16, gap: 1, tri: 28, sgap: 2, score: 16, sep: 12, atFont: 9, pillGap: 2, pill: 15, font: 11, labelFont: 10, rowGap: 3, groupGap: 7, labelGap: 2, dot: 5, scoreFont: 8.2, fxRow: 11, fxGap: 1, fxFont: 7.9 } as const;
/** Width of the widest 3-digit score in em: tabular digits, bundled Inter, weight 500–700 (measured: 15.52 px at 8 px). */
export const SCORE3_EM = 1.94;

/**
 * Largest score font (0.1 px steps) whose 3 digits fit a logo slot of `slot` px both as measured (fractional widths:
 * Windows, Mac) and with each digit's width rounded to whole pixels (Linux Chromium: 8.2 px → 15 px, 8.61 px → 18 px,
 * 12.3 px → 24 px), with 0.1 px of margin before a digit rounds up. 16 px → 8.2, 16.8 px (1-week scale 1.05) → 8.3,
 * 24 px (scale 1.5) → 12.3. Not simply scoreFont × scale: 8.61 px overflowed the 16.8 px slot by 1.2 px on Linux.
 */
export function scoreFontFor(slot: number): number {
  const digit = SCORE3_EM / 3;
  let f = Math.floor((slot / SCORE3_EM) * 10 + 1e-9) / 10;
  while (f > 1 && 3 * Math.round(digit * f + 0.1) > slot + 1e-9) f = Math.round((f - 0.1) * 10) / 10;
  return f;
}
export type MonthLine = { [K in keyof typeof MONTH_LINE]: number };
export const lineWidth = (L: MonthLine) => 2 * (L.logo + L.gap + L.tri + L.sgap + L.score) + L.sep + L.pillGap + L.pill;
export const MONTH_LINE_WIDTH = lineWidth(MONTH_LINE);
/** MONTH_LINE with every length (fonts included) times `s`. */
export const scaleLine = (s: number): MonthLine => Object.fromEntries(Object.entries(MONTH_LINE).map(([k, v]) => [k, v * s])) as MonthLine;
/** Space between game columns inside a day cell (the 155 px line: 1 column at every width up to ~2600 px). */
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
 * Smallest widget width where a full-size game line fits a 7-column day cell (monthCellInner ≥ the line). Below it,
 * League → Calendar shows the count grid. 155 px line (round 4): (width − 24) / 7 − 10 ≥ 155 → 1179 (887 with the 119 px
 * line); a 1280 px window (1248 px content, cell 164.9 px) still shows the week view.
 */
export const WEEK_MIN_WIDTH = (() => {
  // monthCellInner drops at ROOMY_WIDTH (wider gaps), so search rather than invert the formula
  let w = 1;
  while (monthCellInner(w) < MONTH_LINE_WIDTH) w++;
  return w;
})();

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

/** Games that get 1-week mode's fatigue row (MONTH_LINE.fxRow); none in 2-week mode. */
export type FxRows = (g: ScheduleGame) => boolean;

/** Estimated height (px) of one column of time groups at line geometry `L` (what the CSS lays out). */
export const columnHeight = (c: TimeGroup[], L: MonthLine = MONTH_LINE, fx?: FxRows) =>
  c.reduce((h, grp, i) => h + (i ? L.groupGap : 0) + L.labelFont * 1.25 + L.labelGap + grp.games.reduce((s, g) => s + L.logo + L.rowGap + (fx?.(g) ? L.fxRow + L.fxGap : 0), 0) - L.rowGap, 0);

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

/**
 * Line width (scale 1) if a final game kept both logos and added each score after its tricode at the tricode's size
 * (11 px): the option checked for 1-week mode. It only allows 1.2 at 1920 × 1080 (< 1.3), so 1-week mode puts the
 * score in the logo slot like 2-week mode instead (PROJECT.md "Scores in the week view").
 */
export const LINE_WITH_SCORES = MONTH_LINE_WIDTH + 2 * (MONTH_LINE.gap + SCORE3_EM * MONTH_LINE.font);

/** Largest game-line scale in 1-week mode (about 1.5×, see PROJECT.md). */
export const WEEK_SCALE_MAX = 1.5;
/** Share of a day cell's inner width, and of its height below the day header, that the scaled content may use. */
export const WEEK_SCALE_FILL = 0.8;
/** Day header (12 px text + padding) and the space above the games; not scaled (.ck-wday, .ck-month-day). */
export const WEEK_HEAD_H = 24;

/** The season's tallest day in one column at scale 1 (px): every game, grouped by tip-off time in `timeZone`; `fx`: the
 * games with a fatigue row (1-week mode). */
export function busiestDayHeight(byDate: Map<string, ScheduleGame[]>, timeZone?: string, fx?: FxRows): number {
  let max = 0;
  for (const games of byDate.values()) max = Math.max(max, columnHeight(timeGroups(games, timeZone), MONTH_LINE, fx));
  return max;
}

/**
 * 1-week game-line scale for a day cell's inner size (px, inside padding and border): as large as possible up to
 * WEEK_SCALE_MAX while one line uses at most WEEK_SCALE_FILL of the width and the season's busiest day at most
 * WEEK_SCALE_FILL of the height below the header. Never below 1 (the 2-week size); 0.05 steps.
 */
export function weekScale(innerWidth: number, innerHeight: number, busiest: number, lineW = MONTH_LINE_WIDTH): number {
  const byWidth = (innerWidth * WEEK_SCALE_FILL) / lineW;
  const byHeight = busiest > 0 ? ((innerHeight - WEEK_HEAD_H) * WEEK_SCALE_FILL) / busiest : Infinity;
  return Math.max(1, Math.min(WEEK_SCALE_MAX, Math.floor(Math.min(byWidth, byHeight) * 20 + 1e-9) / 20));
}
