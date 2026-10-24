// One game. Self-contained widget: inputs are the game, a few precomputed facts and a size; it never opens URLs.
// "Open" actions are raised through onOpenGame(gameId) and the host decides what that means.

import { Fragment } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, isOver, markers, nationalTv, perspective, teamLabel, tipoff, type B2BPair, type SeasonLine } from '../data/model';
import { threeInFourLabel, threeInFourTip, type ThreeInFour } from '../data/scheduleTags';
import { teamLogo } from '../data/teams';
import { CopyButton } from './CopyButton';
import './calendar.css';

/** The selected team's side of a back-to-back, as shown on one of its two nights. */
export interface B2BNight {
  pair: B2BPair;
  night: 1 | 2;
}

export interface GameCardProps {
  game: ScheduleGame;
  /** Team view: show the game from this team's side ("BOS vs CHI" / "BOS @ DET"). League view: omit. */
  teamId?: number;
  /** Team view: show the selected team first (with its logo) before vs/@; otherwise only "vs CHI". */
  teamFirst?: boolean;
  /** League view: teams in this game that also played the previous day (see isBackToBack). */
  backToBackTeamIds?: number[];
  /** Team view: the selected team's back-to-back nights on this game ("1/2 · HA", "2/2 · HA"). */
  b2b?: B2BNight[];
  /** Team view: B2B labels without the home/away code ("1/2"), for cells too narrow for "1/2 · HA". */
  shortB2B?: boolean;
  /** Team view: tooltip when the opponent is on the 2nd night of a back-to-back (orange dot on its tricode). */
  opponentB2B?: string;
  /** Team view: the selected team's 3-in-4 position and sets for this game ("3-in-4 · 2nd" chip). */
  tif?: ThreeInFour;
  /** Team view: the opponent's 3-in-4 over its own schedule (lighter chip; only shown with `fatigueColumns`). */
  opponentTif?: ThreeInFour;
  /**
   * Team list (desktop): schedule fatigue in two fixed-width columns — the team's B2B label + 3-in-4 chip between the
   * time and the team, the opponent's "2/2" + 3-in-4 chip right after the opponent — instead of among the tags.
   */
  fatigueColumns?: boolean;
  /** Current time (ms). Decides whether the game is over (rotationkit action). */
  now: number;
  /** IANA zone for tip-off; default: the browser's local zone. */
  timeZone?: string;
  size?: 'compact' | 'regular';
  /** Raised when the user asks to open the game (only offered once the game is over). */
  onOpenGame?: (gameId: string) => void;
  /** Team logos (local files, on the light backing) before the tricodes. */
  logos?: boolean;
  /** Date shown first on the row (team list), e.g. "Sun 15/11". */
  dateLabel?: string;
  /** Marks the row the list opened at (team list: next game not over). */
  next?: boolean;
  /** Team list: regular-season game number and record going in (right side), and the final score by the names. */
  season?: SeasonLine;
  /** Final score beside each tricode once the game is final (always on with `season`). */
  scores?: boolean;
  /** Copy-as-image button on hover (lists, phone detail card). */
  copyable?: boolean;
}

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

/** Small plane: the team changes city between the two nights of a back-to-back. */
export const PlaneIcon = () => (
  <svg className="ck-plane" data-testid="plane" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path fill="currentColor" transform="rotate(45 8 8)" d="M8 0c.6 0 1 .5 1 1.2v4.3l6 3.5v1.5L9 8.7v3.6l1.8 1.3V15L8 14.2 5.2 15v-1.4L7 12.3V8.7L1 10.5V9l6-3.5V1.2C7 .5 7.4 0 8 0Z" />
  </svg>
);

/**
 * "1/2 · HA" (outlined on night 1, solid on night 2), with the plane on a city change; tooltip with both games.
 * `short`: "1/2" only (phone calendar cells, where the full label doesn't fit; the tooltip and detail card have it).
 */
export function B2BLabel({ night, short = false }: { night: B2BNight; short?: boolean }) {
  const { pair } = night;
  return (
    <span
      className={`ck-b2b-label ck-b2b-n${night.night}`}
      data-b2b-night={night.night}
      data-tip={pair.tip}
      aria-label={pair.tip}
      role="img"
      tabIndex={0}
    >
      {night.night}/2{short ? '' : ` · ${pair.code}`}
      {pair.travels && <PlaneIcon />}
    </span>
  );
}

/** "3-in-4 · 2nd" (purple; the 3rd game stronger); tooltip lists every set. `opp`: the opponent's, lighter. */
export function TifChip({ tif, team, opp = false }: { tif: ThreeInFour; team?: string; opp?: boolean }) {
  const tip = threeInFourTip(tif, opp ? team : undefined);
  return (
    <span
      className={`ck-tif ck-tif-pos-${tif.position}${opp ? ' ck-tif-opp' : ''}`}
      data-testid={opp ? 'tif-opp' : 'tif'}
      data-position={tif.position}
      data-sets={tif.sets.length}
      data-tip={tip}
      aria-label={tip}
      role="img"
      tabIndex={0}
    >
      {threeInFourLabel(tif)}
    </span>
  );
}

/** Orange dot over a tricode: that team is on the 2nd night of a back-to-back. */
export const B2BDot = ({ tip }: { tip: string }) => <span className="ck-b2b-mark" data-tip={tip} aria-label={tip} role="img" tabIndex={0} />;

export function GameCard({ game, teamId, teamFirst, backToBackTeamIds = [], b2b = [], shortB2B, opponentB2B, tif, opponentTif, fatigueColumns = false, now, timeZone, size = 'regular', onOpenGame, logos, dateLabel, next, season, scores = !!season, copyable }: GameCardProps) {
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const side = teamId ? perspective(game, teamId) : undefined;
  const b2bIds = new Set(backToBackTeamIds);
  const canOpen = !!onOpenGame && isOver(game, now);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  // final score from the shown side: the selected team (team views) or the away team (league views)
  const result = scores ? finalScore(game, teamId ?? game.awayTeam.teamId) : undefined;
  const loss = (first: boolean) => (result && result.win !== first ? ' ck-loss' : '');
  // the space keeps textContent readable ("BOS 113"); inline-flex drops it, the margin spaces the score
  const score = (n: number, win: boolean) => (
    <>
      {' '}
      <span className={`ck-score${win ? ' ck-score-win' : ''}`}>{n}</span>
    </>
  );

  const matchup = side ? (
    <span className="ck-matchup">
      {teamFirst && (
        <>
          <span className="ck-side">
            {logos && <TeamLogo team={side.team} />}
            <span className={`ck-team ck-self${loss(true)}`}>{teamLabel(side.team)}</span>
            {result && score(result.score, result.win)}
          </span>{' '}
        </>
      )}
      <span className="ck-side">
        <span className="ck-vsat">{side.home ? 'vs' : '@'}</span> {logos && <TeamLogo team={side.opponent} />}
        <span className={`ck-team ck-opp${loss(false)}`}>
          {teamLabel(side.opponent)}
          {opponentB2B && <B2BDot tip={opponentB2B} />}
        </span>
        {result && score(result.oppScore, !result.win)}
      </span>
    </span>
  ) : (
    <span className="ck-matchup">
      {logos && <TeamLogo team={game.awayTeam} />}
      <span className={`ck-team${loss(true)}`}>{away}</span>
      {result && score(result.score, result.win)}
      {b2bIds.has(game.awayTeam.teamId) && <span className="ck-tag ck-b2b" title={`${away} back-to-back`}>B2B</span>}
      <span className="ck-vsat"> @ </span>
      {logos && <TeamLogo team={game.homeTeam} />}
      <span className={`ck-team${loss(false)}`}>{home}</span>
      {result && score(result.oppScore, !result.win)}
      {b2bIds.has(game.homeTeam.teamId) && <span className="ck-tag ck-b2b" title={`${home} back-to-back`}>B2B</span>}
    </span>
  );

  const streak = season?.streak;
  const seasonText = season?.game
    ? `Game ${season.game}${season.record ? `, record ${season.record.wins}-${season.record.losses} going in` : ''}${streak ? `, on a ${streak.n}-game ${streak.kind === 'W' ? 'winning' : 'losing'} streak` : ''}`
    : '';
  const label = side
    ? `${teamFirst ? `${teamLabel(side.team)} ` : ''}${side.home ? 'vs' : 'at'} ${teamLabel(side.opponent)}, ${tip.label}${result ? `, ${result.win ? 'won' : 'lost'} ${result.score}–${result.oppScore}` : ''}${seasonText ? `, ${seasonText}` : ''}`
    : `${away} at ${home}, ${tip.label}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}` : ''}`;
  const bracket = side && b2b.length ? b2b.map((n) => n.night).join(' ') : undefined;
  const cols = fatigueColumns && !!side;
  const b2bLabels = side && b2b.map((n) => <B2BLabel key={n.night} night={n} short={shortB2B} />);
  const tifChip = side && tif && <TifChip tif={tif} />;

  return (
    <article
      className={`ck-card ck-card-${size}${cols ? ' ck-card-cols' : ''}${logos ? ' ck-card-logos' : ''}${next ? ' ck-card-next' : ''}${result ? ' ck-card-final' : ''}`}
      data-game-id={game.gameId}
      data-next={next || undefined}
      data-b2b={bracket}
      aria-label={dateLabel ? `${dateLabel}, ${label}` : label}
    >
      {/* first, so the season block stays the last part; positioned in the corner */}
      {copyable && <CopyButton hover label="Copy game as image" of=".ck-card" testId="copy-game" />}
      {dateLabel && <span className="ck-date">{dateLabel}</span>}
      <span className={`ck-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
        {tip.time}
        {tip.dayOffset !== 0 && <span className="ck-dayoff" title="Local calendar day after the NBA game date">{` (${tip.dayOffset > 0 ? '+' : ''}${tip.dayOffset})`}</span>}
      </span>
      {cols && (
        <span className="ck-fat ck-fat-team" data-testid="fatigue-team">
          {b2bLabels}
          {tifChip}
        </span>
      )}
      {matchup}
      {cols && (
        <span className="ck-fat ck-fat-opp" data-testid="fatigue-opp">
          {opponentB2B && (
            <span className="ck-b2b-opp" data-tip={opponentB2B} aria-label={opponentB2B} role="img" tabIndex={0}>
              2/2
            </span>
          )}
          {opponentTif && <TifChip tif={opponentTif} team={teamLabel(side.opponent)} opp />}
        </span>
      )}
      <span className="ck-tags">
        {!cols && b2bLabels}
        {!cols && tifChip}
        {marks.map((m) => (
          <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long}>
            {size === 'compact' ? m.short : m.long}
          </span>
        ))}
        {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
        {tv.length > 0 && (
          <span className="ck-tag ck-tv" title="US national TV" data-testid="tv-badge">
            {tv.map((n, i) => (
              <Fragment key={n}>
                {i > 0 && <span className="ck-tv-sep"> · </span>}
                <span className="ck-tv-name">{n}</span>
              </Fragment>
            ))}
          </span>
        )}
      </span>
      {season?.game && (
        <span className="ck-season" data-tip={seasonText} data-testid="season">
          <span className="ck-gnum">G{season.game}</span>
          <span className="ck-record">{season.record ? `${season.record.wins}-${season.record.losses}` : ''}</span>
          <span className={`ck-streak${streak ? ` ck-streak-${streak.kind.toLowerCase()}` : ''}`}>{streak ? `${streak.kind}${streak.n}` : ''}</span>
        </span>
      )}
      {canOpen && (
        <button type="button" className="ck-open" onClick={() => onOpenGame!(game.gameId)} data-testid="open-game" title="Open rotations in rotationkit">
          Rotations ↗
        </button>
      )}
    </article>
  );
}
