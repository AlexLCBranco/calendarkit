// Small pieces of a game shared by the Slate cards and calendarkit's other views (round 10: moved here from
// GameCard.tsx, which re-exports them): the team logo, the tip-off time, the season line's tooltip text.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { SeasonLine, Tipoff } from '../data/model';
import { teamLogo } from '../data/teams';
import { TeamLink } from './teamLink';

/**
 * The season line's tooltip: "Game 2, record 0-1 going in, on a 1-game losing streak", or once the game is final
 * "Game 2, record 1-1 after it, on a 1-game winning streak" (round 22) ('' without a game number).
 */
export const seasonTip = ({ game, record, streak, after }: SeasonLine) =>
  game ? `Game ${game}${record ? `, record ${record.wins}-${record.losses} ${after ? 'after it' : 'going in'}` : ''}${streak ? `, on a ${streak.n}-game ${streak.kind === 'W' ? 'winning' : 'losing'} streak` : ''}` : '';

/** Team logo on its light disc (round 15: a team link); an undecided team gets an empty slot of the same size. */
export function TeamLogo({ team, link = true }: { team: ScheduleGame['homeTeam']; /** false: never a link (the team picker) */ link?: boolean }) {
  const src = teamLogo(team.teamId);
  return src ? (
    <TeamLink teamId={link ? team.teamId : 0} className="ck-logo-backing" aria-label={team.teamTricode || undefined}>
      <img src={src} alt="" width={16} height={16} />
    </TeamLink>
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

/**
 * The game page link as a small "↗" icon (round 9 on the Slate cards; round 16 also the League List / Team List rows):
 * a real `<a target="_blank">` with the tooltip "Open on hoopsjunkie"; a control, so never in a copy
 * (`data-capture-exclude`) and a marquee never starts on it. Hover styles: `.ck-slate-link` (styles/slate.css).
 */
export const GameLinkIcon = ({ url }: { url: string }) => (
  <a className="ck-slate-link" href={url} target="_blank" rel="noopener noreferrer" draggable={false} title="Open on hoopsjunkie" aria-label="Open on hoopsjunkie" data-testid="game-link" data-capture-exclude="true" onClick={(e) => e.stopPropagation()}>
    ↗
  </a>
);
