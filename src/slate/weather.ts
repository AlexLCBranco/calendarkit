// The Slate's cold-weather input (CK-16) — optional, like the odds store. calendarkit passes `liveColdStore()`;
// without a store (slate.html, the gauntlet until it opts in) the part makes no request. One Open-Meteo request per
// night shown (all its arenas at once), only for nights Open-Meteo forecasts (from 2 days back to 14 ahead), kept in
// memory for the page; no refresh, no timer. A failed answer means no flags.

import { coldOf, coldRequest } from '../data/cold';
import { addDays } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';

/** gameId → feels-like °C at tip-off. */
export type NightCold = Map<string, number>;

export interface SlateCold {
  get(date: string): NightCold | undefined;
  subscribe(date: string, fn: () => void): () => void;
  /** A Slate shows `date` with `games`: load it once. */
  show(date: string, games: readonly ScheduleGame[]): void;
}

const etToday = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms);
/** Nights Open-Meteo's forecast covers (a little of the past too). */
export const coldInRange = (date: string, now: number) => date >= addDays(etToday(now), -2) && date <= addDays(etToday(now), 14);

export function createColdStore(get: (url: string) => Promise<unknown> = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`weather ${r.status}`)))), now: () => number = Date.now): SlateCold {
  const nights = new Map<string, NightCold>();
  const asked = new Set<string>();
  const subs = new Map<string, Set<() => void>>();
  return {
    get: (date) => nights.get(date),
    subscribe(date, fn) {
      const set = subs.get(date) ?? new Set();
      subs.set(date, set);
      set.add(fn);
      return () => set.delete(fn);
    },
    show(date, games) {
      if (asked.has(date) || !coldInRange(date, now())) return;
      const url = coldRequest(date, games);
      if (!url) return;
      asked.add(date);
      get(url)
        .then((a) => {
          nights.set(date, coldOf(games, a as Parameters<typeof coldOf>[1]));
          subs.get(date)?.forEach((f) => f());
        })
        .catch(() => asked.delete(date));
    },
  };
}

let live: SlateCold | undefined;
/** The page's one cold-weather store. */
export const liveColdStore = () => (live ??= createColdStore());
