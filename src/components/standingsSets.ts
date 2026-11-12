// Standings column sets: West and East are side by side, so both tables show one set of columns at a time,
// switched together. Every set shows seed and team first. Kept out of the Standings chunk: the top bar's toggle needs
// the labels before that chunk loads.

export type StandingsSet = 'main' | 'splits' | 'form' | 'schedule';

/** Label and column keys (`Standings.tsx`'s columns), left to right, in toggle order. */
export const COLUMN_SETS: Record<StandingsSet, { label: string; keys: string[] }> = {
  main: { label: 'Main', keys: ['w', 'l', 'pct', 'gb', 'conf', 'home', 'road', 'l10', 'streak', 'diff'] },
  splits: { label: 'Splits', keys: ['wl', 'home', 'road', 'conf', 'div', 'over500', 'close', 'ot'] },
  form: { label: 'Form & scoring', keys: ['wl', 'l10', 'streak', 'ppg', 'oppg', 'diff'] },
  schedule: { label: 'Schedule & B2B', keys: ['wl', 'left', 'leftHome', 'leftRoad', 'leftB2b', 'b2b1', 'b2b2'] },
};

export const SET_OPTIONS = Object.entries(COLUMN_SETS).map(([k, v]) => [k, v.label]) as [StandingsSet, string][];
