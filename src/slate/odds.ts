// The Slate's moneyline odds — an optional input of the part, like the notes store. calendarkit passes
// `liveOddsStore()`; without a store (slate.html, the gauntlet until it opts in) the part makes no request and sets no
// timer for odds. The store fetches one ET date at a time from /calendar/api/odds (api/odds.ts → ESPN), only when a
// Slate showing that date asks for it (after the cards are on screen: an effect), keeps it in memory for the page, and
// refreshes it every ODDS_REFRESH_MS while shown unless every game of the day is over. A failed or missing answer means
// no odds: the cards keep their empty, reserved odds column. The same answer carries the live scores (CK-21): any view
// `watch`es its games, and the store asks every minute only while one of them is on (or about to be) and the tab is
// visible; a failure keeps what is on screen.

import { CALENDARKIT_BASE } from '../data/address';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { LIVE_LEAD_MS, type DayOdds, type GameFinal, type GameLive, type GameOdds } from '../data/odds';

export type { DayOdds, GameFinal, GameLive, GameOdds } from '../data/odds';
export const ODDS_URL = `${CALENDARKIT_BASE}api/odds`;
/** The CDN keeps a day's answer 10 minutes (oddsCacheSeconds); asking more often would only get the same answer. */
export const ODDS_REFRESH_MS = 10 * 60_000;
/** While a game on screen is being played or within LIVE_LEAD_MS of tip-off (CK-21), or a shown Slate's last answer
    said `live`: asked this often for the live scores (the CDN keeps such an answer 1 minute too). */
export const LIVE_REFRESH_MS = 60_000;
/** A game the scoreboard hasn't called live is asked for no longer than this after its tip-off (ESPN down, a delay):
    the polling always ends. */
export const LIVE_MAX_MS = 4 * 3_600_000;
/** After a failure, the next ask for that date waits this long. */
export const ODDS_RETRY_MS = 60_000;

export interface SlateOdds {
  /** The day's odds once loaded (the same object until it changes), else undefined. */
  get(date: string): DayOdds | undefined;
  subscribe(date: string, fn: () => void): () => void;
  /** A Slate shows `date`: load it (once, then refreshed while shown); returns the stop for the refresh. With the
      night's `games` it also watches them (live scores from 15 min before a tip-off, CK-21). */
  show(date: string, allOver: boolean, games?: readonly ScheduleGame[]): () => void;
  /**
   * Games on screen (CK-21): while one is being played or within LIVE_LEAD_MS of its tip-off, and the tab is visible,
   * its date is asked every LIVE_REFRESH_MS; otherwise nothing runs but one timer to the next such tip-off. Returns the
   * unwatch.
   */
  watch(games: readonly ScheduleGame[]): () => void;
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
/** The game's live score and clock (CK-21) while ESPN has it in play and no final is known; else undefined. */
export const gameLive = (g: ScheduleGame, day: DayOdds | undefined): GameLive | undefined =>
  g.status === 'final' || day?.finals?.[oddsKey(g)] ? undefined : day?.inPlay?.[oddsKey(g)];

/** withFinal for a night's games: the same array when no game changes. */
export function withFinals(games: ScheduleGame[], day: DayOdds | undefined): ScheduleGame[] {
  if (!day?.finals) return games;
  const out = games.map((g) => withFinal(g, day));
  return out.some((g, i) => g !== games[i]) ? out : games;
}
/** "1.65", "12.50": always two decimals. */
export const fmtOdds = (n: number) => n.toFixed(2);

/** A store over `fetchDay` (the network by default); exported for tests. */
export function createOddsStore(fetchDay: (date: string) => Promise<DayOdds> = fetchOdds, now: () => number = Date.now, doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined = typeof document === 'undefined' ? undefined : document): SlateOdds {
  const days = new Map<string, DayOdds>();
  const subs = new Map<string, Set<() => void>>();
  const inFlight = new Set<string>();
  const failedAt = new Map<string, number>();
  const shown = new Map<string, number>(); // date → how many Slates show it
  const timers = new Map<string, { id: ReturnType<typeof setInterval>; ms: number }>();
  const loadedAt = new Map<string, number>();
  const hidden = () => doc?.visibilityState === 'hidden';
  const every = (date: string) => (days.get(date)?.live ? LIVE_REFRESH_MS : ODDS_REFRESH_MS);
  // The refresh of a shown date, at its pace (faster while a game is on); `keep`: only if it is already running.
  const pace = (date: string, keep: boolean) => {
    const t = timers.get(date);
    if (keep && !t) return;
    const ms = every(date);
    if (t?.ms === ms) return;
    if (t) clearInterval(t.id);
    timers.set(date, { id: setInterval(() => hidden() || load(date), ms), ms }); // a hidden tab asks nothing
  };
  const load = (date: string) => {
    if (inFlight.has(date) || now() - (failedAt.get(date) ?? -Infinity) < ODDS_RETRY_MS) return;
    inFlight.add(date);
    fetchDay(date)
      .then((d) => {
        failedAt.delete(date);
        loadedAt.set(date, now());
        const old = days.get(date);
        const same = (a: DayOdds, b: DayOdds) => JSON.stringify([a.games, a.finals ?? {}, a.inPlay ?? {}, !!a.live]) === JSON.stringify([b.games, b.finals ?? {}, b.inPlay ?? {}, !!b.live]);
        if (old && same(old, d)) return;
        days.set(date, d);
        pace(date, true);
        subs.get(date)?.forEach((f) => f());
        plan();
      })
      .catch(() => failedAt.set(date, now()))
      .finally(() => inFlight.delete(date));
  };

  // The live scores' scheduler (CK-21) over the games on screen: one timer at a time.
  const watched = new Map<ScheduleGame, number>();
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
  let planned = false;
  const onVisible = () => plan();
  const plan = () => {
    if (planned) return;
    planned = true;
    queueMicrotask(() => {
      planned = false;
      run();
    });
  };
  const run = () => {
    clearTimeout(liveTimer);
    liveTimer = undefined;
    const t = now();
    const hot = new Set<string>();
    let next = Infinity;
    for (const g of watched.keys()) {
      if (g.status === 'final' || !g.startTimeUtc) continue;
      const day = days.get(g.dateEt);
      if (day?.finals?.[oddsKey(g)]) continue;
      const tip = Date.parse(g.startTimeUtc);
      if (day?.inPlay?.[oddsKey(g)] || (t >= tip - LIVE_LEAD_MS && t < tip + LIVE_MAX_MS)) hot.add(g.dateEt);
      else if (tip - LIVE_LEAD_MS > t) next = Math.min(next, tip - LIVE_LEAD_MS);
    }
    const want = watched.size > 0;
    if (want !== listening) {
      listening = want;
      if (want) doc?.addEventListener('visibilitychange', onVisible);
      else doc?.removeEventListener('visibilitychange', onVisible);
    }
    if (hot.size) {
      if (hidden()) return; // the tab coming back plans again
      // a Slate's own refresh may just have asked: no second request inside the minute
      for (const d of hot) if (t - (loadedAt.get(d) ?? -Infinity) >= LIVE_REFRESH_MS - 1000) load(d);
      liveTimer = setTimeout(run, LIVE_REFRESH_MS);
    } else if (next < Infinity) liveTimer = setTimeout(run, Math.min(next - t, 2 ** 31 - 1));
  };
  const watch = (games: readonly ScheduleGame[]) => {
    for (const g of games) watched.set(g, (watched.get(g) ?? 0) + 1);
    plan();
    return () => {
      for (const g of games) {
        const n = (watched.get(g) ?? 1) - 1;
        if (n <= 0) watched.delete(g);
        else watched.set(g, n);
      }
      plan();
    };
  };
  return {
    get: (date) => days.get(date),
    subscribe(date, fn) {
      const set = subs.get(date) ?? new Set();
      subs.set(date, set);
      set.add(fn);
      return () => set.delete(fn);
    },
    watch,
    show(date, allOver, games) {
      const unwatch = games && !allOver ? watch(games) : undefined;
      if (!days.has(date) || !allOver) load(date);
      shown.set(date, (shown.get(date) ?? 0) + 1);
      if (!allOver && !timers.has(date)) pace(date, false);
      return () => {
        unwatch?.();
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
