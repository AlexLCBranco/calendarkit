// A night's games as a list a host can mix with another sport's (the gauntlet's combined Slate): each with an id and
// its start as an exact instant, in start order.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { hasNationalTv, type CalendarData } from '../data/model';

export interface SlateNightGame {
  /** The NBA game id (also the card's `data-game-id` and the notes' key). */
  id: string;
  /** Tip-off as an instant: ms since the epoch (UTC); undefined while the time is still to be decided. */
  start: number | undefined;
  /** The same instant as ISO 8601 UTC ("2026-11-20T00:00:00.000Z"); undefined with `start`. */
  startIso: string | undefined;
  /** The game, as `SlateGame` takes it. */
  game: ScheduleGame;
}

/**
 * The games of the night `date` (NBA / ET game date; TV games only when filtered) in start-time order — games at the
 * same instant keep the Slate's order, games without a set time come last. [] on a day without games.
 */
export function slateNight(data: CalendarData, date: string, tvOnly = false): SlateNightGame[] {
  const all = data.byDate.get(date) ?? [];
  return (tvOnly ? all.filter(hasNationalTv) : all)
    .map((game) => {
      const start = game.startTimeUtc ? Date.parse(game.startTimeUtc) : undefined;
      return { id: game.gameId, start, startIso: start === undefined ? undefined : new Date(start).toISOString(), game };
    })
    .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
}
