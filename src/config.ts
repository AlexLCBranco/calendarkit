// App configuration. One place for values that differ per deployment.

/** Value of ROTATIONKIT_BASE_URL until rotationkit has a production URL. */
export const ROTATIONKIT_PLACEHOLDER = 'https://ROTATIONKIT-PLACEHOLDER.invalid';

/**
 * Base URL of rotationkit (NBA rotation viewer). Deep link: `${ROTATIONKIT_BASE_URL}/?game=<gameId>`.
 * PLACEHOLDER: rotationkit has no production URL yet (not merged to main). See PROJECT.md "Open questions".
 * While it is the placeholder, the app hides the "Rotations ↗" action; setting a real URL here turns it on.
 */
export const ROTATIONKIT_BASE_URL: string = ROTATIONKIT_PLACEHOLDER;

/** True once ROTATIONKIT_BASE_URL is a real http(s) URL rather than the placeholder. */
export const isRotationkitConfigured = (base: string = ROTATIONKIT_BASE_URL) => base !== ROTATIONKIT_PLACEHOLDER && /^https?:\/\/\S+$/.test(base);

/**
 * Base URL of hoopsjunkie.io game pages (injury report, win probability, box score). Same hidden-until-configured
 * pattern as rotationkit: an empty value hides the "↗" on every game. The URL rule was verified on the live site on
 * 2026-10-29 (see gameLinkUrl).
 */
export const HOOPSJUNKIE_BASE_URL: string = 'https://hoopsjunkie.io';

export const isGameLinkConfigured = (base: string = HOOPSJUNKIE_BASE_URL) => /^https?:\/\/\S+$/.test(base);

/**
 * The game's hoopsjunkie page: /games/<NBA (ET) game date>/<away>-vs-<home>, lowercase tricodes. Verified 2026-10-29
 * on 10 games: the ET date also for games after midnight UTC or local (POR @ LAL, ET Oct 27, 03:00 UTC Oct 28:
 * 2026-10-27/por-vs-lal loads, 2026-10-28/por-vs-lal redirects to that day's scores); a future game's page loads too.
 * Undefined while a team is undecided.
 */
export function gameLinkUrl(g: { dateEt: string; awayTeam: { teamId: number; teamTricode: string }; homeTeam: { teamId: number; teamTricode: string } }, base: string = HOOPSJUNKIE_BASE_URL): string | undefined {
  if (!g.awayTeam.teamId || !g.homeTeam.teamId || !g.awayTeam.teamTricode || !g.homeTeam.teamTricode) return undefined;
  return `${base.replace(/\/+$/, '')}/games/${g.dateEt}/${g.awayTeam.teamTricode.toLowerCase()}-vs-${g.homeTeam.teamTricode.toLowerCase()}`;
}

/** Daily snapshot of the raw NBA schedule feed, written by .github/workflows/schedule-update.yml. */
export const SCHEDULE_DATA_URL = '/data/schedule.json';
