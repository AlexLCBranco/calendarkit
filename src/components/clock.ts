// The widget's clock (round 4): one timer per widget, ticking on the minute, into a ValueStore. What shows the time of
// day reads it — the countdowns on today's games, the stale-data stamp, today's date — so a tick updates those texts
// only, never a list or a row (Rule #1). Before round 4, a minute tick re-rendered the whole view (useNow).

import { createContext, createElement, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createValueStore, type ValueStore } from './valueStore';

/** A test can make the clock read the time now (e.g. mid-gesture): `window.dispatchEvent(new Event(CLOCK_TICK_EVENT))`. */
export const CLOCK_TICK_EVENT = 'ck-clock-tick';

/**
 * The clock: `fixed` (tests, replays) never moves; otherwise Date.now() at load and at every minute boundary after it
 * (re-armed each minute from the time itself, so it doesn't drift).
 */
export function useClock(fixed?: number): ValueStore<number> {
  const [store] = useState(() => createValueStore(fixed ?? Date.now()));
  useEffect(() => {
    if (fixed !== undefined) {
      store.set(fixed);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      store.set(Date.now());
      arm();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    const now = () => store.set(Date.now());
    // back from sleep, a background tab or the back/forward cache: read the time at once (timers may have been held
    // back), so today's date — and with it the day on show (CalendarView, round 6) — is right before the next minute
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      store.set(Date.now());
      arm();
    };
    arm();
    window.addEventListener(CLOCK_TICK_EVENT, now);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CLOCK_TICK_EVENT, now);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [fixed, store]);
  return store;
}

const ClockContext = createContext<ValueStore<number> | undefined>(undefined);
export const ClockProvider = ({ clock, children }: { clock: ValueStore<number>; children: ReactNode }) => createElement(ClockContext.Provider, { value: clock }, children);
export const useClockStore = () => useContext(ClockContext);

/** A value derived from the clock: the component re-renders only when it changes (e.g. a label, today's date). */
export function useClockValue<T>(derive: (now: number) => T, fallback: number): T {
  const clock = useClockStore();
  return useSyncExternalStore(clock?.subscribe ?? noSubscribe, () => derive(clock?.get() ?? fallback));
}
const noSubscribe = () => () => {};

const todays = new Map<string, { now: number; date: string }>();
/** localDate(now, timeZone), remembered per zone for the current minute (every countdown asks on every tick). */
export function todayAt(now: number, timeZone: string | undefined, localDate: (ms: number, tz?: string) => string): string {
  const k = timeZone ?? '';
  const hit = todays.get(k);
  if (hit && hit.now === now) return hit.date;
  const date = localDate(now, timeZone);
  todays.set(k, { now, date });
  return date;
}

/** "in 2h 35m", "in 2h", "in 35m" (minutes rounded up); undefined once the game has started. */
export function countdownLabel(tipoff: number, now: number): string | undefined {
  if (tipoff <= now) return undefined;
  const minutes = Math.ceil((tipoff - now) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `in ${h}h${m ? ` ${m}m` : ''}` : `in ${m}m`;
}
