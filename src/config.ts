// App configuration. One place for values that differ per deployment.

/**
 * Base URL of rotationkit (NBA rotation viewer). Deep link: `${ROTATIONKIT_BASE_URL}/?game=<gameId>`.
 * PLACEHOLDER: rotationkit has no production URL yet (not merged to main). See PROJECT.md "Open questions".
 */
export const ROTATIONKIT_BASE_URL = 'https://ROTATIONKIT-PLACEHOLDER.invalid';

/** Daily snapshot of the raw NBA schedule feed, written by .github/workflows/schedule-update.yml. */
export const SCHEDULE_DATA_URL = '/data/schedule.json';
