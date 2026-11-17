// Loads the schedule snapshot once per page (in-memory cache) and parses it with the shared module.

import { SCHEDULE_DATA_URL } from './address';
import { parseSchedule } from '../shared/nba-schedule/parse';
import { buildCalendarData, type CalendarData } from './model';
import { storedRegulation } from './regulation';

let cached: Promise<CalendarData> | undefined;

export function loadCalendarData(url = SCHEDULE_DATA_URL, fetchImpl: typeof fetch = fetch): Promise<CalendarData> {
  cached ??= (async () => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`schedule: HTTP ${res.status}`);
    const raw = await res.json();
    const time = raw?.meta?.time;
    return { ...buildCalendarData(parseSchedule(raw)), updatedAt: typeof time === 'string' ? time : undefined, regulation: storedRegulation(raw) };
  })();
  cached.catch(() => (cached = undefined)); // allow a retry after a failure
  return cached;
}

/** How often a page that stays open (the gauntlet's Slate widget) looks for a new snapshot (gauntlet GT-5). The
    snapshot changes about once a day; the browser revalidates it (no-cache), so an unchanged one costs a 304. */
export const SCHEDULE_CHECK_MS = 5 * 60_000;

/**
 * Asks for the snapshot again (gauntlet GT-5: a whiteboard left open picks up the morning's scores, a moved game…).
 * Returns the new data when the snapshot is newer than `updatedAt` (its meta.time) — and keeps it as the page's data,
 * so a later loadCalendarData() gets it — else undefined (unchanged, or a failure: the page keeps what it has).
 */
export async function refreshCalendarData(updatedAt: string | undefined, url = SCHEDULE_DATA_URL, fetchImpl: typeof fetch = fetch): Promise<CalendarData | undefined> {
  try {
    const res = await fetchImpl(url, { cache: 'no-cache' });
    if (!res.ok) return undefined;
    const raw = await res.json();
    const time = raw?.meta?.time;
    if (typeof time !== 'string' || time === updatedAt) return undefined;
    const next: CalendarData = { ...buildCalendarData(parseSchedule(raw)), updatedAt: time, regulation: storedRegulation(raw) };
    cached = Promise.resolve(next);
    return next;
  } catch {
    return undefined;
  }
}
