// Loads the schedule snapshot once per page (in-memory cache) and parses it with the shared module.

import { SCHEDULE_DATA_URL } from './address';
import { parseSchedule } from '../shared/nba-schedule/parse';
import { buildCalendarData, type CalendarData } from './model';

let cached: Promise<CalendarData> | undefined;

export function loadCalendarData(url = SCHEDULE_DATA_URL, fetchImpl: typeof fetch = fetch): Promise<CalendarData> {
  cached ??= (async () => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`schedule: HTTP ${res.status}`);
    const raw = await res.json();
    const time = raw?.meta?.time;
    return { ...buildCalendarData(parseSchedule(raw)), updatedAt: typeof time === 'string' ? time : undefined };
  })();
  cached.catch(() => (cached = undefined)); // allow a retry after a failure
  return cached;
}
