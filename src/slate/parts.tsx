// Small pieces of a game shared by the Slate cards and calendarkit's other views (round 10: moved here from
// GameCard.tsx, which re-exports them): the team logo, the tip-off time, the season line's tooltip text.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { SeasonLine, Tipoff } from '../data/model';
import { teamLogo } from '../data/teams';

/** The season line's tooltip: "Game 2, record 0-1 going in, on a 1-game losing streak" ('' without a game number). */
export const seasonTip = ({ game, record, streak }: SeasonLine) =>
  game ? `Game ${game}${record ? `, record ${record.wins}-${record.losses} going in` : ''}${streak ? `, on a ${streak.n}-game ${streak.kind === 'W' ? 'winning' : 'losing'} streak` : ''}` : '';

/** Team logo on its light disc; an undecided team gets an empty slot of the same size. */
export function TeamLogo({ team }: { team: ScheduleGame['homeTeam'] }) {
  const src = teamLogo(team.teamId);
  return src ? (
    <span className="ck-logo-backing">
      <img src={src} alt="" width={16} height={16} />
    </span>
  ) : (
    <span className="ck-logo-empty" aria-hidden="true" />
  );
}

/**
 * Tip-off time, the same on every day, today included (round 7, 2.3: round 4's countdown "in 2h 35m" on today's games
 * was dropped for now, on purpose — PROJECT.md).
 */
export function TipTime({ tip }: { tip: Tipoff }) {
  return (
    <>
      {tip.time}
      {tip.dayOffset !== 0 && <span className="ck-dayoff" title="Local calendar day after the NBA game date">{` (${tip.dayOffset > 0 ? '+' : ''}${tip.dayOffset})`}</span>}
    </>
  );
}
