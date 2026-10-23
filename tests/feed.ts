// Saved real feed (2026-10-23) parsed once for tests.
import raw from './fixtures/feed-2026-10-23.json';
import { parseSchedule } from '../src/shared/nba-schedule/parse';
import { buildCalendarData } from '../src/data/model';

export const feed = parseSchedule(raw);
export const data = buildCalendarData(feed);
