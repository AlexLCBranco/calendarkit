// One game. Self-contained widget: inputs are the game, a few precomputed facts and a size; it never opens URLs.
// "Open" actions are raised through onOpenGame(gameId) and the host decides what that means.

import { Fragment } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, isOver, localDate, markers, nationalTv, overtime, perspective, teamLabel, tipoff, type B2BPair, type SeasonLine, type TeamRecord, type Tipoff } from '../data/model';
import { countdownLabel, todayAt, useClockValue } from './clock';
import { threeInFourLabel, threeInFourTip, type ThreeInFour } from '../data/scheduleTags';
import { teamLogo } from '../data/teams';
import { CopyButton } from './CopyButton';
import { FatigueMark } from './FatigueMark';
import type { TeamFatigue } from '../data/fatigue';
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
  /** League view: each team's schedule fatigue in this game (marks on its tricode + tooltip; leagueFatigue). */
  fatigue?: ReadonlyMap<number, TeamFatigue>;
  /** Team view: the selected team's back-to-back nights on this game ("1/2 · HA", "2/2 · HA"). */
  b2b?: B2BNight[];
  /** Team view: B2B labels without the home/away code ("1/2"), for cells too narrow for "1/2 · HA". */
  shortB2B?: boolean;
  /** Team view: tooltip when the opponent is on the 2nd night of a back-to-back (yellow dot on its tricode). */
  opponentB2B?: string;
  /** Team view: the selected team's 3-in-4 position and sets for this game ("3-in-4 · 2nd" chip). */
  tif?: ThreeInFour;
  /** Team view: the short chip "3in4·2nd" (calendar cells). */
  shortTif?: boolean;
  /** National TV as one "TV" pill with the network names in its tooltip (calendar cells), instead of the names. */
  tvPill?: boolean;
  /** Team view: the opponent's 3-in-4 over its own schedule (lighter chip; only shown with `fatigueColumns`). */
  opponentTif?: ThreeInFour;
  /**
   * Team list (desktop): schedule fatigue in two fixed-width columns — the team's B2B label + 3-in-4 chip between the
   * time and the team, the opponent's "2/2" + 3-in-4 chip right after the opponent — instead of among the tags.
   */
  fatigueColumns?: boolean;
  /** Team list: the nights whose left-edge bracket is drawn (default: every night in `b2b`); a selection image draws
   *  it only when both nights are in the image. */
  bracketNights?: (1 | 2)[];
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
  /** League List: each team's record going into the game, beside it on the outside ("3-1 [logo] BOS … DET [logo] 2-2"). */
  records?: ReadonlyMap<number, TeamRecord>;
  /** Team List: the row's date (data-row-date), which the week strip follows while scrolling. */
  rowDate?: string;
  /** A "↗" on hover that raises this with the game id (the host opens the game's page); never shown for undecided teams. */
  onOpenGameLink?: (gameId: string) => void;
}

/** The "↗" to a game's page (round 4): a hover button that only raises the event; never part of an image. The glyph is
 * CSS content, so it adds no text to rows and lines. */
export const GameLinkButton = ({ game, onOpen }: { game: ScheduleGame; onOpen: (gameId: string) => void }) =>
  game.awayTeam.teamId && game.homeTeam.teamId ? (
    <button
      type="button"
      className="ck-open-link"
      data-testid="open-link"
      data-capture-exclude="true"
      aria-label="Open the game page"
      title="Game page: injury report, win probability, box score"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(game.gameId);
      }}
    />
  ) : null;

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
 * Tip-off time, or on today's games (viewer's zone) before tip-off the countdown "in 2h 35m" in its place (round 4).
 * Reads the widget clock: a tick re-renders this text only. The plain time stays in the DOM, hidden, for images
 * (`.ck-capturing` shows it, copyAsImage) and the title.
 */
function TipTime({ start, tip, timeZone, now }: { start?: number; tip: Tipoff; timeZone?: string; now: number }) {
  const label = useClockValue((n) => (start !== undefined && todayAt(n, timeZone, localDate) === localDate(start, timeZone) ? countdownLabel(start, n) : undefined), now);
  return (
    <>
      {label && (
        <span className="ck-countdown" title={`Tip-off ${tip.label}`}>
          {label}
        </span>
      )}
      <span className={`ck-time-plain${label ? ' ck-time-hidden' : ''}`}>
        {tip.time}
        {tip.dayOffset !== 0 && <span className="ck-dayoff" title="Local calendar day after the NBA game date">{` (${tip.dayOffset > 0 ? '+' : ''}${tip.dayOffset})`}</span>}
      </span>
    </>
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

/**
 * "3-in-4 · 2nd" (purple; the 3rd game stronger); tooltip lists every set. `opp`: the opponent's, lighter. `short`:
 * "3in4·2nd" (calendar cells; the full text stays in the tooltip).
 */
export function TifChip({ tif, team, opp = false, short = false }: { tif: ThreeInFour; team?: string; opp?: boolean; short?: boolean }) {
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
      {threeInFourLabel(tif, short)}
    </span>
  );
}

/** Yellow dot over a tricode: that team is on the 2nd night of a back-to-back. */
export const B2BDot = ({ tip }: { tip: string }) => <span className="ck-b2b-mark" data-tip={tip} aria-label={tip} role="img" tabIndex={0} />;

export function GameCard({ game, teamId, teamFirst, fatigue, b2b = [], shortB2B, opponentB2B, tif, shortTif, tvPill = false, opponentTif, fatigueColumns = false, bracketNights, now, timeZone, size = 'regular', onOpenGame, logos, dateLabel, next, season, scores = !!season, copyable, records, rowDate, onOpenGameLink }: GameCardProps) {
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const side = teamId ? perspective(game, teamId) : undefined;
  const canOpen = !!onOpenGame && isOver(game, now);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  // final score from the shown side: the selected team (team views) or the away team (league views)
  const result = scores ? finalScore(game, teamId ?? game.awayTeam.teamId) : undefined;
  // Fixed slots (desktop/tablet League List, desktop Team List with its fatigue columns): every tricode, score and
  // "@"/"vs" in a fixed-width slot, the score slots empty on games without a score, so the tricodes, logos and "@" sit
  // at one x on every row. Elsewhere (phones, calendar cells) the parts take their natural width.
  const slots = size === 'regular' && !!logos && (side ? fatigueColumns : true);
  // the spaces keep textContent readable ("BOS 113 @ 121 DET"); inline-flex drops them
  const score = (n: number | undefined, win: boolean) =>
    n !== undefined ? (
      <span className={`ck-score${win ? ' ck-score-win' : ''}`}>{n}</span>
    ) : (
      slots && <span className="ck-score-slot" aria-hidden="true" />
    );
  const ot = result && overtime(game);
  const otMark = ot && (
    <>
      {' '}
      <span className="ck-ot" title="Overtime">{ot}</span>
    </>
  );
  const loss = (first: boolean) => (result && result.win !== first ? ' ck-loss' : '');

  // league records going in, on the outside of each logo (an empty slot when unknown)
  const recOf = (t: ScheduleGame['homeTeam']) => records?.get(t.teamId);
  const recText = (r?: TeamRecord) => (r ? `${r.wins}-${r.losses}` : '');
  const rec = (t: ScheduleGame['homeTeam']) =>
    records && (
      <span className="ck-rec" title={recOf(t) ? `${teamLabel(t)} record going in` : undefined}>
        {recText(recOf(t))}
      </span>
    );
  // "[logo] BOS 113 @ 121 DET [logo]": first team (away, or the selected team), its score, "@"/"vs", the other score,
  // the other team, logos on the outside. Each side wraps as one unit in narrow cells.
  const [first, second] = side ? [side.team, side.opponent] : [game.awayTeam, game.homeTeam];
  const matchup =
    side && !teamFirst ? (
      <span className="ck-matchup">
        <span className="ck-side">
          <span className="ck-vsat">{side.home ? 'vs' : '@'}</span> {logos && <TeamLogo team={side.opponent} />}
          <span className={`ck-team ck-opp${loss(false)}`}>
            {teamLabel(side.opponent)}
            {opponentB2B && <B2BDot tip={opponentB2B} />}
          </span>
          {result && ' '}
          {result && score(result.oppScore, !result.win)}
          {otMark}
        </span>
      </span>
    ) : (
      <span className={`ck-matchup ck-mirror${side ? '' : ' ck-league'}${slots ? ' ck-slots' : ''}`}>
        <span className="ck-side">
          {!side && rec(first)}
          {records && ' '}
          {logos && <TeamLogo team={first} />}
          <span className={`ck-team${side ? ' ck-self' : ''}${loss(true)}`}>{fatigue ? <FatigueMark f={fatigue.get(first.teamId)}>{teamLabel(first)}</FatigueMark> : teamLabel(first)}</span>
          {result && ' '}
          {score(result?.score, !!result?.win)}
        </span>{' '}
        <span className="ck-side">
          <span className="ck-vsat">{side ? (side.home ? 'vs' : '@') : '@'}</span>{' '}
          {score(result?.oppScore, !!result && !result.win)}
          {result && ' '}
          <span className={`ck-team${side ? ' ck-opp' : ''}${loss(false)}`}>
            {fatigue ? <FatigueMark f={fatigue.get(second.teamId)}>{teamLabel(second)}</FatigueMark> : teamLabel(second)}
            {side && opponentB2B && <B2BDot tip={opponentB2B} />}
          </span>{' '}
          {logos && <TeamLogo team={second} />}
          {records && ' '}
          {!side && rec(second)}
          {otMark}
        </span>
      </span>
    );

  const streak = season?.streak;
  const seasonText = season?.game
    ? `Game ${season.game}${season.record ? `, record ${season.record.wins}-${season.record.losses} going in` : ''}${streak ? `, on a ${streak.n}-game ${streak.kind === 'W' ? 'winning' : 'losing'} streak` : ''}`
    : '';
  const label = side
    ? `${teamFirst ? `${teamLabel(side.team)} ` : ''}${side.home ? 'vs' : 'at'} ${teamLabel(side.opponent)}, ${tip.label}${result ? `, ${result.win ? 'won' : 'lost'} ${result.score}–${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}${seasonText ? `, ${seasonText}` : ''}`
    : `${away} at ${home}, ${tip.label}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}${recOf(game.awayTeam) && recOf(game.homeTeam) ? `, records going in ${away} ${recText(recOf(game.awayTeam))}, ${home} ${recText(recOf(game.homeTeam))}` : ''}`;
  const nights = bracketNights ?? b2b.map((n) => n.night);
  const bracket = side && nights.length ? nights.join(' ') : undefined;
  const cols = fatigueColumns && !!side;
  const b2bLabels = side && b2b.map((n) => <B2BLabel key={n.night} night={n} short={shortB2B} />);
  const tifChip = side && tif && <TifChip tif={tif} short={shortTif} />;

  return (
    <article
      className={`ck-card ck-card-${size}${cols ? ' ck-card-cols' : ''}${logos ? ' ck-card-logos' : ''}${next ? ' ck-card-next' : ''}${result ? ' ck-card-final' : ''}`}
      data-game-id={game.gameId}
      data-row-date={rowDate}
      data-next={next || undefined}
      data-b2b={bracket}
      aria-label={dateLabel ? `${dateLabel}, ${label}` : label}
    >
      {/* first, so the season block stays the last part; positioned in the corner */}
      {copyable && <CopyButton hover label="Copy game as image" of=".ck-card" testId="copy-game" />}
      {onOpenGameLink && <GameLinkButton game={game} onOpen={onOpenGameLink} />}
      {dateLabel && <span className="ck-date">{dateLabel}</span>}
      <span className={`ck-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
        <TipTime start={game.startTimeUtc ? Date.parse(game.startTimeUtc) : undefined} tip={tip} timeZone={timeZone} now={now} />
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
        {tv.length > 0 && tvPill && (
          <span className="ck-tag ck-tv ck-tv-short" data-tip={tv.join(' · ')} aria-label={`US national TV: ${tv.join(', ')}`} role="img" tabIndex={0} data-testid="tv-badge">
            TV
          </span>
        )}
        {tv.length > 0 && !tvPill && (
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
