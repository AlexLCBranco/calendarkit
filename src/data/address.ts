// Where calendarkit is served (round 10): under the gauntlet's address, gauntlet-home.vercel.app/calendar/, so the
// gauntlet and calendarkit share one origin (one localStorage: the Slate notes). The build's base (vite.config.ts), the
// schedule snapshot and the team logos all use this path, so they resolve the same from a gauntlet page.

export const CALENDARKIT_BASE = '/';

/** Daily snapshot of the raw NBA schedule feed, written by .github/workflows/schedule-update.yml. */
export const SCHEDULE_DATA_URL = `${CALENDARKIT_BASE}data/schedule.json`;
