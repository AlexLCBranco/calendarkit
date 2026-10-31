// The game page link on each Slate card (the hoopsjunkie "↗" icon; round 10: moved here from config.ts, which
// re-exports it).

import type { ScheduleGame } from '../shared/nba-schedule/parse';

/** A game's page, or undefined for none: the card shows its "↗" icon only with a URL. */
export type GameLink = (game: ScheduleGame) => string | undefined;

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


/** The cards' link rule as calendarkit uses it: the hoopsjunkie page, or none while the base URL is unset. */
export const hoopsjunkieLink: GameLink | undefined = isGameLinkConfigured() ? (g) => gameLinkUrl(g) : undefined;
