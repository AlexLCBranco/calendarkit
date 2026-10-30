// One game. Self-contained widget: inputs are the game, a few precomputed facts and a size; it never opens URLs.
// "Open" actions are raised through onOpenGame(gameId) and the host decides what that means.

import { Fragment, type ReactNode } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, isOver, markers, nationalTv, overtime, perspective, teamLabel, tipoff, type B2BPair, type SeasonLine, type TeamRecord, type Tipoff } from '../data/model';
import { mergedChip, mergedDays, mergedTip, type ThreeInFour } from '../data/scheduleTags';
import { teamLogo } from '../data/teams';
import { CopyButton } from './CopyButton';
import { FatigueMark } from './FatigueMark';
import { Fatigue } from './Fatigue';
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
  /**
   * League List (desktop): each team's Fatigue component beside its logo, mirrored around the matchup
   * ("[away fatigue] [logo] AWAY … HOME [logo] [home fatigue]"); the tricode marks then drop their plane (the
   * component's plane means "away").
   */
  fatigueSlots?: boolean;
  /** Team List with `fatigueColumns`: both teams' fatigue (leagueFatigue) for the two Fatigue columns. */
  teamFatigue?: ReadonlyMap<number, TeamFatigue>;
  /** Team view: the selected team's back-to-back nights on this game ("1/2 · HA", "2/2 · HA"). */
  b2b?: B2BNight[];
  /** Team view: B2B labels without the home/away code ("1/2"), for cells too narrow for "1/2 · HA". */
  shortB2B?: boolean;
  /** Team view: tooltip when the opponent is on the 2nd night of a back-to-back (yellow dot on its tricode). */
  opponentB2B?: string;
  /** Team view (calendar cells): the selected team's 3-in-4 stretch for this game, as the merged chip "4in6 · 2nd". */
  tif?: ThreeInFour;
  /** National TV as one "TV" pill with the network names in its tooltip (calendar cells), instead of the names. */
  tvPill?: boolean;
  /**
   * Team list (desktop): schedule fatigue in two fixed-width columns — the team's Fatigue component between the time
   * and the team, the opponent's right after the opponent (from `teamFatigue`) — instead of the B2B labels among the tags.
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
  /** The game page URL: the matchup (teams + scores) links to it in a new tab; no link when it returns undefined. */
  gameLink?: GameLink;
}

/** The host's game-page URL for a game (hoopsjunkie, config.ts gameLinkUrl), or undefined (no link: undecided teams). */
export type GameLink = (game: ScheduleGame) => string | undefined;

/**
 * The matchup as a real link to the game's page (round 5, replaces round 4's hover "↗"): an `<a>` in a new tab, so
 * middle- and ctrl-click work and it adds no hover-only element. Looks like text until hovered (pointer, underline);
 * never link-styled in images (`.ck-capturing`). Not draggable, so a press on it can start a marquee selection
 * (selection.ts swallows the click that ends a drag). Without a URL it is a plain `<span>` with the same class.
 */
export function MatchLink({ game, gameLink, className, children }: { game: ScheduleGame; gameLink?: GameLink; className: string; children: ReactNode }) {
  const url = gameLink?.(game);
  return url ? (
    <a className={`${className} ck-mlink`} href={url} target="_blank" rel="noopener noreferrer" draggable={false} title="Game page: injury report, win probability, box score" data-testid="game-link" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
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
 * The merged 3-in-4 chip "4in6 · 2nd" (round 7, 1.3: the same chip as the Fatigue component; was "3in4·2nd" with a line
 * per set): purple, the 3rd game on stronger. Tooltip: the stretch in words and its day strip.
 */
export function TifChip({ tif }: { tif: ThreeInFour }) {
  const m = tif.merged;
  const tip = `${mergedChip(m)}: ${mergedTip(m)}`;
  return (
    <span
      className={`ck-tif ck-tif-pos-${Math.min(3, m.position)}`}
      data-testid="tif"
      data-position={m.position}
      data-sets={tif.sets.length}
      data-tip={tip}
      data-tip-days={mergedDays(m)}
      aria-label={tip}
      role="img"
      tabIndex={0}
    >
      {mergedChip(m)}
    </span>
  );
}

/** Yellow dot over a tricode: that team is on the 2nd night of a back-to-back. */
export const B2BDot = ({ tip }: { tip: string }) => <span className="ck-b2b-mark" data-tip={tip} aria-label={tip} role="img" tabIndex={0} />;

export function GameCard({ game, teamId, teamFirst, fatigue, fatigueSlots = false, teamFatigue, b2b = [], shortB2B, opponentB2B, tif, tvPill = false, fatigueColumns = false, bracketNights, now, timeZone, size = 'regular', onOpenGame, logos, dateLabel, next, season, scores = !!season, copyable, records, rowDate, gameLink }: GameCardProps) {
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
  // "@"/"vs" in a fixed-width slot, so the tricodes, logos and "@" sit at one x on every row. Round 7 (2.4, Alex's
  // trade-off): a row without a score has no score slots — "CHA @ WAS", the tricodes against the "@" — so on a day mixing
  // played and unplayed games the columns no longer line up between the two kinds (they still do within each).
  // Elsewhere (phones, calendar cells) the parts take their natural width.
  const slots = size === 'regular' && !!logos && (side ? fatigueColumns : true);
  // the spaces keep textContent readable ("BOS 113 @ 121 DET"); inline-flex drops them
  const score = (n: number | undefined, win: boolean) =>
    n !== undefined ? (
      <span className={`ck-score${win ? ' ck-score-win' : ''}`}>{n}</span>
    ) : (
      slots && !!result && <span className="ck-score-slot" aria-hidden="true" />
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
  const rec = (t: ScheduleGame['homeTeam'], home = false) =>
    records && (
      <span className={`ck-rec${home ? ' ck-rec-home' : ''}`} title={recOf(t) ? `${teamLabel(t)} record going in` : undefined}>
        {recText(recOf(t))}
      </span>
    );
  // "[logo] BOS 113 @ 121 DET [logo]": first team (away, or the selected team), its score, "@"/"vs", the other score,
  // the other team, logos on the outside. Each side wraps as one unit in narrow cells.
  const [first, second] = side ? [side.team, side.opponent] : [game.awayTeam, game.homeTeam];
  const fx = !side && fatigueSlots && !!fatigue;
  // round 7 (1.4): no dot on the opponent's tricode where its Fatigue component is shown (desktop Team List columns), as
  // round 6 dropped the yellow tricode boxes beside the component; elsewhere it is the only mark of the opponent's 2nd night
  const oppDot = !fatigueColumns && opponentB2B;
  const matchup =
    side && !teamFirst ? (
      <span className="ck-matchup">
        <MatchLink game={game} gameLink={gameLink} className="ck-side">
          <span className="ck-vsat">{side.home ? 'vs' : '@'}</span> {logos && <TeamLogo team={side.opponent} />}
          <span className={`ck-team ck-opp${loss(false)}`}>
            {teamLabel(side.opponent)}
            {oppDot && <B2BDot tip={oppDot} />}
          </span>
          {result && ' '}
          {result && score(result.oppScore, !result.win)}
          {otMark}
        </MatchLink>
      </span>
    ) : (
      <span className={`ck-matchup ck-mirror${side ? '' : ' ck-league'}${slots ? ' ck-slots' : ''}${slots && !result ? ' ck-noscore' : ''}`}>
        {!side && rec(first)}
        {fx && <Fatigue f={fatigue!.get(first.teamId)} team={teamLabel(first)} badge="right" />}
        {(records || fx) && ' '}
        <MatchLink game={game} gameLink={gameLink} className="ck-teams">
          <span className="ck-side">
            {logos && <TeamLogo team={first} />}
            <span className={`ck-team${side ? ' ck-self' : ''}${loss(true)}`}>{fatigue ? <FatigueMark f={fatigue.get(first.teamId)} component={fx}>{teamLabel(first)}</FatigueMark> : teamLabel(first)}</span>
            {result && ' '}
            {score(result?.score, !!result?.win)}
          </span>{' '}
          <span className="ck-side">
            <span className="ck-vsat">{side ? (side.home ? 'vs' : '@') : '@'}</span>{' '}
            {score(result?.oppScore, !!result && !result.win)}
            {result && ' '}
            <span className={`ck-team${side ? ' ck-opp' : ''}${loss(false)}`}>
              {fatigue ? <FatigueMark f={fatigue.get(second.teamId)} component={fx}>{teamLabel(second)}</FatigueMark> : teamLabel(second)}
              {side && oppDot && <B2BDot tip={oppDot} />}
            </span>{' '}
            {logos && <TeamLogo team={second} />}
          </span>
        </MatchLink>
        {(records || fx) && ' '}
        {fx && <Fatigue f={fatigue!.get(second.teamId)} team={teamLabel(second)} />}
        {!side && rec(second, true)}
        {otMark}
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
  const tifChip = side && tif && <TifChip tif={tif} />;

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
      {dateLabel && <span className="ck-date">{dateLabel}</span>}
      <span className={`ck-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
        <TipTime tip={tip} />
      </span>
      {cols && (
        <span className="ck-fat ck-fat-team" data-testid="fatigue-team">
          <Fatigue f={teamFatigue?.get(side.team.teamId)} team={teamLabel(side.team)} badge="right" focusable />
        </span>
      )}
      {matchup}
      {cols && (
        <span className="ck-fat ck-fat-opp" data-testid="fatigue-opp">
          <Fatigue f={teamFatigue?.get(side.opponent.teamId)} team={teamLabel(side.opponent)} focusable />
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
