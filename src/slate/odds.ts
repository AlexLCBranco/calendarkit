// The Slate's moneyline odds — an optional input of the part, like the notes store. calendarkit passes
// `liveOddsStore()`; without a store (slate.html, the gauntlet until it opts in) the part makes no request and sets no
// timer for odds. The store fetches one ET date at a time from /calendar/api/odds (api/odds.ts → ESPN), only when a
// Slate showing that date asks for it (after the cards are on screen: an effect), keeps it in memory for the page, and
// refreshes it every ODDS_REFRESH_MS while shown unless every game of the day is over. A failed or missing answer means
// no odds: the cards keep their empty, reserved odds column.

import { CALENDARKIT_BASE } from '../data/address';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { DayOdds, GameOdds } from '../data/odds';

export type { DayOdds, GameOdds } from '../data/odds';
export const ODDS_URL = `${CALENDARKIT_BASE}api/odds`;
/** The CDN keeps a day's answer 10 minutes (oddsCacheSeconds); asking more often would only get the same answer. */
export const ODDS_REFRESH_MS = 10 * 60_000;
/** After a failure, the next ask for that date waits this long. */
export const ODDS_RETRY_MS = 60_000;

export interface SlateOdds {
  /** The day's odds once loaded (the same object until it changes), else undefined. */
  get(date: string): DayOdds | undefined;
  subscribe(date: string, fn: () => void): () => void;
  /** A Slate shows `date`: load it (once, then refreshed while shown); returns the stop for the refresh. */
  show(date: string, allOver: boolean): () => void;
}

/** "AWAY@HOME" (NBA tricodes) of a game, the odds' key. */
export const oddsKey = (g: ScheduleGame) => `${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode}`;
export const gameOdds = (day: DayOdds | undefined, g: ScheduleGame): GameOdds | undefined => day?.games[oddsKey(g)];
/** "1.65", "12.50": always two decimals. */
export const fmtOdds = (n: number) => n.toFixed(2);

/** A store over `fetchDay` (the network by default); exported for tests. */
export function createOddsStore(fetchDay: (date: string) => Promise<DayOdds> = fetchOdds, now: () => number = Date.now): SlateOdds {
  const days = new Map<string, DayOdds>();
  const subs = new Map<string, Set<() => void>>();
  const inFlight = new Set<string>();
  const failedAt = new Map<string, number>();
  const shown = new Map<string, number>(); // date → how many Slates show it
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const load = (date: string) => {
    if (inFlight.has(date) || now() - (failedAt.get(date) ?? -Infinity) < ODDS_RETRY_MS) return;
    inFlight.add(date);
    fetchDay(date)
      .then((d) => {
        failedAt.delete(date);
        const old = days.get(date);
        if (old && JSON.stringify(old.games) === JSON.stringify(d.games)) return;
        days.set(date, d);
        subs.get(date)?.forEach((f) => f());
      })
      .catch(() => failedAt.set(date, now()))
      .finally(() => inFlight.delete(date));
  };
  return {
    get: (date) => days.get(date),
    subscribe(date, fn) {
      const set = subs.get(date) ?? new Set();
      subs.set(date, set);
      set.add(fn);
      return () => set.delete(fn);
    },
    show(date, allOver) {
      if (!days.has(date) || !allOver) load(date);
      shown.set(date, (shown.get(date) ?? 0) + 1);
      if (!allOver && !timers.has(date)) timers.set(date, setInterval(() => load(date), ODDS_REFRESH_MS));
      return () => {
        const n = (shown.get(date) ?? 1) - 1;
        shown.set(date, n);
        if (n <= 0) {
          clearInterval(timers.get(date));
          timers.delete(date);
        }
      };
    },
  };
}

async function fetchOdds(date: string): Promise<DayOdds> {
  const r = await fetch(`${ODDS_URL}?date=${date}`);
  if (!r.ok) throw new Error(`odds ${r.status}`);
  const j = (await r.json()) as DayOdds;
  if (!j || typeof j.games !== 'object') throw new Error('odds: bad answer');
  return j;
}

let live: SlateOdds | undefined;
/** The page's one odds store (every Slate of the page shares it). */
export const liveOddsStore = () => (live ??= createOddsStore());
