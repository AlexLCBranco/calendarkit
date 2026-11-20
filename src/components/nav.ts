// The shared layout's navigation (backlogkit's NAV_PATTERN.md), as plain data: the three Where places, a breadcrumb
// part with its siblings, and the "Go anywhere" search (entries and matching). The header and the page rows only draw
// what these describe; the destinations fill in their own parts.

import type { Destination } from './calendarState';

export const WHERE: [Destination, string, string][] = [
  ['schedule', 'Schedule', 'Every game: the whole league or one team, as a list, a calendar or the Slate'],
  ['cup', 'Cup', 'The NBA Cup: groups, schedule, simulator and past Cups'],
  ['standings', 'Standings', 'Both conferences side by side'],
];

/** One breadcrumb part: its text and the places beside it (a click jumps there). No items: plain text. */
export interface CrumbItem {
  label: string;
  on: boolean;
  go: () => void;
}
export interface Crumb {
  label: string;
  items: CrumbItem[];
  /** For tests and the click audit. */
  id: string;
}

/** Lower case, accents dropped ("Montréal" finds "montreal"). */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A "Go anywhere" entry: what it says, what kind of place it is, extra words it is found by, and where it goes.
 * Rank 0 entries are the ones listed before anything is typed. */
export interface SearchEntry {
  label: string;
  kind: string;
  keys: string;
  go: () => void;
  rank: number;
}

export const entry = (label: string, kind: string, extra: string, go: () => void, rank: number): SearchEntry => ({ label, kind, keys: fold(`${label} ${kind} ${extra}`), go, rank });

/** The entries matching every word of `query` (any order, case and accents ignored), best first. */
export function searchFind(entries: SearchEntry[], query: string, limit = 12): SearchEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries.filter((e) => e.rank === 0);
  const q = fold(query).trim();
  return entries
    .filter((e) => words.every((w) => e.keys.includes(w)))
    .map((e) => {
      const l = fold(e.label);
      return { e, s: (l === q ? 0 : l.startsWith(q) ? 1 : words.every((w) => l.includes(w)) ? 2 : 3) * 10 + e.rank };
    })
    .sort((a, b) => a.s - b.s || a.e.label.length - b.e.label.length)
    .slice(0, limit)
    .map((x) => x.e);
}
