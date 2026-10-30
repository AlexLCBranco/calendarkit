// The widget's clock: a ValueStore with the time, read by what depends on today's date (the day strip's today, the
// Today buttons, the views that follow midnight) and the stale-data stamp, so a change re-renders those only.
// Round 7 (2.3): no minute tick any more — the countdowns it fed are gone. It moves at the next local midnight (one
// timeout, worked out in the widget's zone, so DST days are right), when the page comes back from sleep, a background
// tab or the back/forward cache, and when a test asks (CLOCK_TICK_EVENT). Nothing runs between those moments.

import { createContext, createElement, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createValueStore, type ValueStore } from './valueStore';

/** A test can make the clock read the time now: `window.dispatchEvent(new Event(CLOCK_TICK_EVENT))`. */
export const CLOCK_TICK_EVENT = 'ck-clock-tick';

/**
 * The first moment after `now` whose local date (`localDate`, in `timeZone`) differs from now's: the next midnight,
 * found by bisection (to the millisecond) so it is right on 23- and 25-hour days.
 */
export function nextMidnight(now: number, timeZone: string | undefined, localDate: (ms: number, tz?: string) => string): number {
  const today = localDate(now, timeZone);
  let lo = now;
  let hi = now + 26 * 3_600_000; // past any next midnight
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (localDate(mid, timeZone) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The clock: `fixed` (tests, replays) never moves; otherwise Date.now() at load, at each local midnight and on waking. */
export function useClock(fixed: number | undefined, timeZone: string | undefined, localDate: (ms: number, tz?: string) => string): ValueStore<number> {
  const [store] = useState(() => createValueStore(fixed ?? Date.now()));
  useEffect(() => {
    if (fixed !== undefined) {
      store.set(fixed);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      const now = Date.now();
      store.set(now);
      clearTimeout(timer);
      // one timeout to the next midnight (+50 ms, so the date has changed when it fires)
      timer = setTimeout(read, nextMidnight(now, timeZone, localDate) - now + 50);
    };
    // back from sleep, a background tab or the back/forward cache: timers may have been held back
    const wake = () => document.visibilityState === 'visible' && read();
    read();
    window.addEventListener(CLOCK_TICK_EVENT, read);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CLOCK_TICK_EVENT, read);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [fixed, store, timeZone]);
  return store;
}

const ClockContext = createContext<ValueStore<number> | undefined>(undefined);
export const ClockProvider = ({ clock, children }: { clock: ValueStore<number>; children: ReactNode }) => createElement(ClockContext.Provider, { value: clock }, children);
export const useClockStore = () => useContext(ClockContext);

/** A value derived from the clock: the component re-renders only when it changes (e.g. today's date). */
export function useClockValue<T>(derive: (now: number) => T, fallback: number): T {
  const clock = useClockStore();
  return useSyncExternalStore(clock?.subscribe ?? noSubscribe, () => derive(clock?.get() ?? fallback));
}
const noSubscribe = () => () => {};
