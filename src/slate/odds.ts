// The Slate's moneyline odds — an optional input of the part, like the notes store. calendarkit passes
// `liveOddsStore()`; without a store (slate.html, the gauntlet until it opts in) the part makes no request and sets no
// timer for odds. The store fetches one ET date at a time from /calendar/api/odds (api/odds.ts → ESPN), only when a
// Slate showing that date asks for it (after the cards are on screen: an effect), keeps it in memory for the page, and
// refreshes it every ODDS_REFRESH_MS while shown unless every game of the day is over. A failed or missing answer means
// no odds: the cards keep their empty, reserved odds column.

import { CALENDARKIT_BASE } from '../data/address';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { DayOdds, GameFinal, GameOdds } from '../data/odds';

export type { DayOdds, GameFinal, GameOdds } from '../data/odds';
export const ODDS_URL = `${CALENDARKIT_BASE}api/odds`;
/** The CDN keeps a day's answer 10 minutes (oddsCacheSeconds); asking more often would only get the same answer. */
export const ODDS_REFRESH_MS = 10 * 60_000;
/** While a game of the day is being played (the last answer said `live`): asked this often, so a final score shows
    within minutes of the end (the CDN keeps such an answer 2 minutes too). */
export const LIVE_REFRESH_MS = 2 * 60_000;
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

/**
 * The game as the cards show it (gauntlet GT-5): final, with its score, once ESPN has it as finished, while the
 * snapshot (updated each morning) still has it scheduled or live. The same object when nothing changes.
 */
export function withFinal(g: ScheduleGame, day: DayOdds | undefined): ScheduleGame {
  const f: GameFinal | undefined = g.status === 'final' ? undefined : day?.finals?.[oddsKey(g)];
  if (!f) return g;
  return {
    ...g,
    status: 'final',
    statusText: f.statusText,
    gameStatus: 3,
    gameStatusText: f.statusText,
    awayTeam: { ...g.awayTeam, score: f.away },
    homeTeam: { ...g.homeTeam, score: f.home },
  };
}
/** withFinal for a night's games: the same array when no game changes. */
export function withFinals(games: ScheduleGame[], day: DayOdds | undefined): ScheduleGame[] {
  if (!day?.finals) return games;
  const out = games.map((g) => withFinal(g, day));
  return out.some((g, i) => g !== games[i]) ? out : games;
}
/** "1.65", "12.50": always two decimals. */
export const fmtOdds = (n: number) => n.toFixed(2);

/** A store over `fetchDay` (the network by default); exported for tests. */
export function createOddsStore(fetchDay: (date: string) => Promise<DayOdds> = fetchOdds, now: () => number = Date.now): SlateOdds {
  const days = new Map<string, DayOdds>();
  const subs = new Map<string, Set<() => void>>();
  const inFlight = new Set<string>();
  const failedAt = new Map<string, number>();
  const shown = new Map<string, number>(); // date → how many Slates show it
  const timers = new Map<string, { id: ReturnType<typeof setInterval>; ms: number }>();
  const every = (date: string) => (days.get(date)?.live ? LIVE_REFRESH_MS : ODDS_REFRESH_MS);
  // The refresh of a shown date, at its pace (faster while a game is on); `keep`: only if it is already running.
  const pace = (date: string, keep: boolean) => {
    const t = timers.get(date);
    if (keep && !t) return;
    const ms = every(date);
    if (t?.ms === ms) return;
    if (t) clearInterval(t.id);
    timers.set(date, { id: setInterval(() => load(date), ms), ms });
  };
  const load = (date: string) => {
    if (inFlight.has(date) || now() - (failedAt.get(date) ?? -Infinity) < ODDS_RETRY_MS) return;
    inFlight.add(date);
    fetchDay(date)
      .then((d) => {
        failedAt.delete(date);
        const old = days.get(date);
        const same = (a: DayOdds, b: DayOdds) => JSON.stringify([a.games, a.finals ?? {}, !!a.live]) === JSON.stringify([b.games, b.finals ?? {}, !!b.live]);
        if (old && same(old, d)) return;
        days.set(date, d);
        pace(date, true);
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
      if (!allOver && !timers.has(date)) pace(date, false);
      return () => {
        const n = (shown.get(date) ?? 1) - 1;
        shown.set(date, n);
        if (n <= 0) {
          clearInterval(timers.get(date)?.id);
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
