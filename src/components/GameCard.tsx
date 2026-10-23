// One game. Self-contained widget: inputs are the game, a few precomputed facts and a size; it never opens URLs.
// "Open" actions are raised through onOpenGame(gameId) and the host decides what that means.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { isOver, markers, nationalTv, perspective, teamLabel, tipoff } from '../data/model';
import './calendar.css';

export interface GameCardProps {
  game: ScheduleGame;
  /** Team view: show the game from this team's side ("vs BOS" / "@ BOS"). League view: omit. */
  teamId?: number;
  /** Teams in this game that also played the previous day (see isBackToBack). */
  backToBackTeamIds?: number[];
  /** Current time (ms). Decides whether the game is over (rotationkit action). */
  now: number;
  /** IANA zone for tip-off; default: the browser's local zone. */
  timeZone?: string;
  size?: 'compact' | 'regular';
  /** Raised when the user asks to open the game (only offered once the game is over). */
  onOpenGame?: (gameId: string) => void;
}

export function GameCard({ game, teamId, backToBackTeamIds = [], now, timeZone, size = 'regular', onOpenGame }: GameCardProps) {
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const side = teamId ? perspective(game, teamId) : undefined;
  const b2b = new Set(backToBackTeamIds);
  const canOpen = !!onOpenGame && isOver(game, now);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);

  const matchup = side ? (
    <span className="ck-matchup">
      <span className="ck-vsat">{side.home ? 'vs' : '@'}</span> <span className="ck-team">{teamLabel(side.opponent)}</span>
      {b2b.has(teamId!) && <span className="ck-tag ck-b2b" title="Back-to-back: also played the previous day">B2B</span>}
    </span>
  ) : (
    <span className="ck-matchup">
      <span className="ck-team">{away}</span>
      {b2b.has(game.awayTeam.teamId) && <span className="ck-tag ck-b2b" title={`${away} back-to-back`}>B2B</span>}
      <span className="ck-vsat"> @ </span>
      <span className="ck-team">{home}</span>
      {b2b.has(game.homeTeam.teamId) && <span className="ck-tag ck-b2b" title={`${home} back-to-back`}>B2B</span>}
    </span>
  );

  const label = side
    ? `${side.home ? 'vs' : 'at'} ${teamLabel(side.opponent)}, ${tip.label}`
    : `${away} at ${home}, ${tip.label}`;

  return (
    <article className={`ck-card ck-card-${size}`} data-game-id={game.gameId} aria-label={label}>
      <span className={`ck-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
        {tip.time}
        {tip.dayOffset !== 0 && <span className="ck-dayoff" title="Local calendar day after the NBA game date">{` (${tip.dayOffset > 0 ? '+' : ''}${tip.dayOffset})`}</span>}
      </span>
      {matchup}
      <span className="ck-tags">
        {marks.map((m) => (
          <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long}>
            {size === 'compact' ? m.short : m.long}
          </span>
        ))}
        {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
        {tv.length > 0 && (
          <span className="ck-tag ck-tv" title="US national TV" data-testid="tv-badge">
            {tv.join(' · ')}
          </span>
        )}
      </span>
      {canOpen && (
        <button type="button" className="ck-open" onClick={() => onOpenGame!(game.gameId)} data-testid="open-game" title="Open rotations in rotationkit">
          Rotations ↗
        </button>
      )}
    </article>
  );
}
