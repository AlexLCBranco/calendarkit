// Round 21 (item 2): the real Cup's IN / OUT for a view, worked out after the view is on screen (an idle moment, at
// most a few hundred ms late in group play) and cached per data set: the first render never waits for it.
import { useEffect, useState } from 'react';
import { cupFatesNow, cupFatesOf, type Decided } from '../data/cupDecide';
import type { CalendarData } from '../data/model';
import { cupStakesNow, cupStakesOf, type StakeChip } from '../data/cupStakes';

export function useCupFates(data: CalendarData, enabled: boolean): Decided | undefined {
  const [fates, setFates] = useState(() => cupFatesNow(data));
  useEffect(() => {
    if (!enabled || cupFatesNow(data)) return setFates(cupFatesNow(data));
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => setFates(cupFatesOf(data));
    if (idle) {
      const id = idle(run, { timeout: 1000 });
      return () => (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 50);
    return () => clearTimeout(t);
  }, [data, enabled]);
  return enabled ? fates : undefined;
}

/** Round 21 (item 11): tonight's stakes chips for `date`, the same way (idle, cached). */
export function useCupStakes(data: CalendarData, date: string, enabled: boolean): Map<number, StakeChip[]> | undefined {
  const [chips, setChips] = useState(() => cupStakesNow(data, date));
  useEffect(() => {
    if (!enabled || cupStakesNow(data, date)) return setChips(cupStakesNow(data, date));
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => setChips(cupStakesOf(data, date));
    if (idle) {
      const id = idle(run, { timeout: 1000 });
      return () => (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 50);
    return () => clearTimeout(t);
  }, [data, date, enabled]);
  return enabled ? chips : undefined;
}
