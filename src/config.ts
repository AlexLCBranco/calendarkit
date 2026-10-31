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

// round 10: the hoopsjunkie link rule lives with the Slate's part (src/slate/links.ts)
export { gameLinkUrl, HOOPSJUNKIE_BASE_URL, isGameLinkConfigured } from './slate/links';

export { SCHEDULE_DATA_URL } from './data/address';
