// One game. Self-contained widget: inputs are the game, a few precomputed facts and a size; it never opens URLs.
// "Open" actions are raised through onOpenGame(gameId) and the host decides what that means.

import { Fragment, type ReactNode } from 'react';
import { SeriesChip } from '../slate/series';
import type { Rematch, SeriesGame } from '../data/series';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { ConfPosition } from '../data/standings';
import { finalScore, isOver, markers, nationalTv, overtime, perspective, teamLabel, tipoff, type B2BPair, type SeasonLine, type TeamRecord } from '../data/model';
import { mergedChip, mergedDays, mergedLabel, mergedTip, type ThreeInFour } from '../data/scheduleTags';
import type { OpponentSituation } from '../data/opponent';
import { GameLinkIcon, seasonTip, TeamLogo, TipTime } from '../slate/parts';
import { TeamLink, teamListTip } from '../slate/teamLink';
import { CupLabel } from '../slate/cupLink';
import { CopyButton } from './CopyButton';
import { FatigueMark } from './FatigueMark';
import { Fatigue } from './Fatigue';
import type { TeamFatigue } from '../data/fatigue';
import './calendar.css';
import { StreakChip } from '../slate/streakPopup';
import type { RunKind } from '../data/runs';
import { LiveLabel, liveFrom, useLive } from '../slate/live';

/** A road trip / homestand game's label ("Road trip · 3/5"); its tooltip names that game's place, the dates and the cities. */
export function RunLabel({ kind, text, tip, days, games }: { kind: RunKind; text: string; tip: string; days: string; /** the run's game ids (the strip's matchups) */ games?: string }) {
  return (
    <span className="ck-run-label" data-run={kind} data-tip={tip} data-tip-days={days} data-tip-games={games} data-testid="run-label" tabIndex={0} aria-label={tip.replace(/\n/g, ', ')}>
      {text}
    </span>
  );
}

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
  /**
   * Fixed slots: keep empty score slots on a game without a score, so its tricodes, "@" and records stand where a
   * played row's do (League List: on a day that has any final score).
   */
  scoreSlots?: boolean;
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
  /** Each team's current conference position (conferencePositions): beside its record (League List rows). Not in the Team List: its rows have no room (two TV pills or a Cup tag fill them). */
  positions?: ReadonlyMap<number, ConfPosition>;
  /**
   * Both teams' season lines for this game (leagueSeasonLines): their streaks. League rows: each team's streak outside
   * its record; team cells (no season block): the selected team's streak in the tags.
   */
  lines?: ReadonlyMap<number, SeasonLine>;
  /** Team List: the row's date (data-row-date), which the week strip follows while scrolling. */
  rowDate?: string;
  /** The game page URL, opened in a new tab: by the matchup (teams + scores), or the "↗" with `linkIcon`; no link when it returns undefined. */
  gameLink?: GameLink;
  /**
   * League List, Team List rows: the game page as the Slate's separate "↗" icon (first among the tags) instead
   * of the matchup; the teams are then team links only.
   */
  linkIcon?: boolean;
  /** Cup schedule: the Cup tag's text instead of "NBA Cup" ("West A", "Quarterfinal"). */
  cupTag?: string;
  /** The game's season series — the "G2/4" chip first among the tags (League List, Team List). */
  series?: SeriesGame;
  /** The game's back-to-back meetings (leagueRematches): they mark the series chip (in a team view, the open team's only). */
  rematch?: Rematch[];
  /** Views too tight for the chip (Team Calendar cells) — the series as the card's tooltip. */
  seriesTip?: string;
  /** Team List: the row's part of a road trip / homestand band (RunMark), with the game's label. */
  run?: RunMark;
  /**
   * Team Calendar cells: the opponent's own line under the team's labels — its tricode, record, streak, back-to-back
   * night, 3-in-4 stretch and days off (opponentSituation). `oppShort` (month cells): the record and the tired / rested
   * marks in their short forms, the rest in the tooltips.
   */
  opp?: OpponentSituation;
  oppShort?: boolean;
  /** List rows: the star of a holiday or a big NBA date (BigDayMark), last among the tags. */
  bigDay?: ReactNode;
}

/** A Team List row's place in a road trip or homestand: the band's stripe joins the rows; `label` on each game row. */
export interface RunMark {
  kind: RunKind;
  pos: 'first' | 'mid' | 'last' | 'only';
  label?: { text: string; tip: string; days: string; games?: string };
}

/** The host's game-page URL for a game (hoopsjunkie, config.ts gameLinkUrl), or undefined (no link: undecided teams). */
export type { GameLink } from '../slate/links';
import type { GameLink } from '../slate/links';

/**
 * The matchup as a real link to the game's page : an `<a>` in a new tab, so
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

// The logo, the tip-off time and the season tooltip live with the Slate's part (src/slate/parts.tsx)
export { seasonTip, TeamLogo, TipTime } from '../slate/parts';
import { ScoreLink } from '../slate/parts';

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
 * The merged 3-in-4 chip "4in6 · 2nd" (the same chip as the Fatigue component; was "3in4·2nd" with a line
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
      data-tip-games={m.ids.join(' ')}
      aria-label={tip}
      role="img"
      tabIndex={0}
    >
      {mergedChip(m)}
    </span>
  );
}

/** Yellow dot over a tricode: that team is on the 2nd night of a back-to-back. */
/**
 * Network names a list row's TV tag spells out; more → "+N", every name in its tooltip. Two names is the widest the rows
 * were laid out for ("Peacock · NBC Sports Network"); a Christmas game can list five, which wrapped its row.
 */
export const TV_NAMES_MAX = 2;

export const B2BDot =({ tip }: { tip: string }) => <span className="ck-b2b-mark" data-tip={tip} aria-label={tip} role="img" tabIndex={0} />;

/**
 * The opponent's line in a Team Calendar cell: "CHA 5-8 L2 [2/2 · HA] [4in6 · 2nd] [3d]". It starts with the opponent's
 * tricode on a tinted strip, so its labels can't be read as the calendar's team's (whose labels stay on the line above).
 */
export function OpponentLine({ o, gameId, final, short }: { o: OpponentSituation; gameId: string; final: boolean; short: boolean }) {
  const rec = o.record ? `${o.record.wins}-${o.record.losses}` : '';
  const when = o.now ? 'now' : final ? 'after the game' : 'going in';
  const said = [rec && `record ${rec} ${when}`, o.streak && `${o.streak.kind}${o.streak.n}`, o.b2b && `back-to-back night ${o.b2b.night} (${o.b2b.pair.code})`, o.tif && mergedChip(o.tif.merged), o.rest && `${o.rest.days} days off`].filter(Boolean).join(', ');
  return (
    <span className={`ck-oppline${short ? ' ck-oppline-short' : ''}`} data-testid="opp-line" data-team={o.tricode} data-tip={o.tip} aria-label={`Opponent ${o.tricode}${said ? `: ${said}` : ''}`}>
      <span className="ck-oppline-team">{o.tricode}</span>
      {rec && (
        <span className="ck-oppline-rec" data-testid="opp-rec" title={`${o.tricode} record ${when}`}>
          {rec}
        </span>
      )}
      {!short && o.streak && <StreakChip base="ck-streak ck-cstreak" teamId={o.teamId} gameId={gameId} streak={o.streak} testId="opp-streak" />}
      {/* the opponent's marks have their own classes and test ids: ".ck-b2b-label" and "tif" stay the calendar's team's */}
      {o.b2b && (
        <span className={`ck-opp-b2b${o.b2b.night === 2 ? ' ck-opp-b2b-n2' : ''}`} data-testid="opp-b2b" data-night={o.b2b.night} data-code={o.b2b.pair.code} data-tip={`${o.tricode}: ${o.b2b.pair.tip}`}>
          {o.b2b.night}/2{short ? '' : ` · ${o.b2b.pair.code}`}
          {o.b2b.pair.travels && <PlaneIcon />}
        </span>
      )}
      {o.tif && (
        <span className={`ck-opp-tif${o.tif.merged.position >= 3 ? ' ck-opp-tif-3' : ''}`} data-testid="opp-tif" data-tip={`${o.tricode}: ${mergedChip(o.tif.merged)}: ${mergedTip(o.tif.merged)}`} data-tip-days={mergedDays(o.tif.merged)} data-tip-games={o.tif.merged.ids.join(' ')}>
          {short ? mergedLabel(o.tif.merged) : mergedChip(o.tif.merged)}
        </span>
      )}
      {o.rest && (
        <span className={`ck-opp-rest${o.rest.tier === 'short' ? ' ck-opp-rest-short' : ''}`} data-testid="opp-rest" data-days={o.rest.days} data-tip={`${o.tricode}: ${o.rest.tip}`}>
          {o.rest.days}d
        </span>
      )}
    </span>
  );
}

export function GameCard({ game: snapshotGame, teamId, teamFirst, fatigue, fatigueSlots = false, scoreSlots = false, teamFatigue, b2b = [], shortB2B, opponentB2B, tif, tvPill = false, fatigueColumns = false, bracketNights, now, timeZone, size = 'regular', onOpenGame, logos, dateLabel, next, season, scores = !!season, copyable, records, positions, lines, rowDate, gameLink: gameLinkProp, linkIcon = false, cupTag, series, rematch, seriesTip, run, opp, oppShort = false, bigDay }: GameCardProps) {
  // live scores (CK-21): the game final once ESPN has it finished; `live` while it is being played
  const { game, live } = useLive(snapshotGame, now);
  const iconUrl = linkIcon ? gameLinkProp?.(game) : undefined;
  // the matchup is the game link only without the icon (calendar cells; week lines use MatchLink themselves)
  const gameLink = linkIcon ? undefined : gameLinkProp;
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const side = teamId ? perspective(game, teamId) : undefined;
  const canOpen = !!onOpenGame && isOver(game, now);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  // final score from the shown side: the selected team (team views) or the away team (league views)
  const result = scores ? finalScore(game, teamId ?? game.awayTeam.teamId) : undefined;
  // a game being played: its score so far in the final score's places (no winner yet)
  const liveScore = live && liveFrom(game, live, teamId ?? game.awayTeam.teamId);
  const shown = result ?? (scores ? liveScore : undefined);
  // Fixed slots (desktop/tablet League List, desktop Team List with its fatigue columns): every tricode, score and
  // "@"/"vs" in a fixed-width slot, so the tricodes, logos and "@" sit at one x on every row. A deliberate
  // trade-off: a row without a score has no score slots — "CHA @ WAS", the tricodes against the "@" — so on a day mixing
  // played and unplayed games the columns no longer line up between the two kinds (they still do within each).
  // Elsewhere (phones, calendar cells) the parts take their natural width.
  const slots = size === 'regular' && !!logos && (side ? fatigueColumns : true);
  // the spaces keep textContent readable ("BOS 113 @ 121 DET"); inline-flex drops them
  const score = (n: number | undefined, win: boolean) =>
    n !== undefined ? (
      <ScoreLink url={iconUrl} className={`ck-score${win ? ' ck-score-win' : ''}${result ? '' : ' ck-score-live'}`}>
        {n}
      </ScoreLink>
    ) : (
      slots && (!!shown || scoreSlots) && <span className="ck-score-slot" aria-hidden="true" />
    );
  const ot = result && overtime(game);
  const otMark = ot && (
    <>
      {' '}
      <span className="ck-ot" title="Overtime">{ot}</span>
    </>
  );
  const loss = (first: boolean) => (result && result.win !== first ? ' ck-loss' : '');

  // league records (after the game once final; else going in), on the outside of each logo (an empty slot when unknown)
  const recOf = (t: ScheduleGame['homeTeam']) => records?.get(t.teamId);
  const recText = (r?: TeamRecord) => (r ? `${r.wins}-${r.losses}` : '');
  const rec = (t: ScheduleGame['homeTeam'], home = false) =>
    records && (
      <TeamLink teamId={recOf(t) ? t.teamId : 0} view="list" className={`ck-rec${home ? ' ck-rec-home' : ''}`} title={recOf(t) ? `${teamListTip(teamLabel(t))} · record ${result ? 'after the game' : 'going in'}` : undefined} data-testid="row-rec">
        {recText(recOf(t))}
      </TeamLink>
    );
  // the current conference position, between the record and the streak (an empty slot when unknown, so rows line up)
  const pos = (teamId: number, home = false) => {
    const p = positions?.get(teamId);
    return (
      positions && (
        <span className={`ck-pos${home ? ' ck-pos-home' : ''}`} title={p?.tip} data-testid="row-pos" data-team-id={teamId}>
          {p?.text ?? ''}
        </span>
      )
    );
  };
  // "[logo] BOS 113 @ 121 DET [logo]": first team (away, or the selected team), its score, "@"/"vs", the other score,
  // the other team, logos on the outside. Each side wraps as one unit in narrow cells.
  const [first, second] = side ? [side.team, side.opponent] : [game.awayTeam, game.homeTeam];
  const fx = !side && fatigueSlots && !!fatigue;
  // No dot on the opponent's tricode where its Fatigue component is shown (desktop Team List columns), as
  // no yellow tricode boxes beside the component; elsewhere it is the only mark of the opponent's 2nd night
  const oppDot = !fatigueColumns && !opp && opponentB2B;
  const matchup =
    side && !teamFirst ? (
      <span className="ck-matchup">
        <MatchLink game={game} gameLink={gameLink} className="ck-side">
          <span className="ck-vsat">{side.home ? 'vs' : '@'}</span> {logos && <TeamLogo team={side.opponent} />}
          <TeamLink teamId={side.opponent.teamId} className={`ck-team ck-opp${loss(false)}`}>
            {teamLabel(side.opponent)}
            {oppDot && <B2BDot tip={oppDot} />}
          </TeamLink>
          {shown && ' '}
          {shown && score(shown.oppScore, !!result && !result.win)}
          {otMark}
        </MatchLink>
      </span>
    ) : (
      <span className={`ck-matchup ck-mirror${side ? '' : ' ck-league'}${slots ? ' ck-slots' : ''}${slots && !shown && !scoreSlots ? ' ck-noscore' : ''}${fx ? ' ck-fx-cols' : ''}`}>
        {/* League List with the Fatigue components: [tags] [record] matchup [record] [tags] — the tags in fixed-width
            columns on the outside, the records against the logos, so names, "@" and records line up down the list */}
        {fx && <Fatigue f={fatigue!.get(first.teamId)} team={teamLabel(first)} badge="right" />}
        {!side && lines && <StreakChip base="ck-streak ck-lstreak" teamId={first.teamId} gameId={game.gameId} streak={lines.get(first.teamId)?.streak} testId="row-streak" />}
        {!side && lines && ' '}
        {!side && positions && <>{pos(first.teamId)} </>}
        {!side && rec(first)}
        {(records || fx) && ' '}
        <MatchLink game={game} gameLink={gameLink} className="ck-teams">
          <span className="ck-side">
            {logos && <TeamLogo team={first} />}
            <TeamLink teamId={first.teamId} className={`ck-team${side ? ' ck-self' : ''}${loss(true)}`}>{fatigue ? <FatigueMark f={fatigue.get(first.teamId)} component={fx}>{teamLabel(first)}</FatigueMark> : teamLabel(first)}</TeamLink>
            {(shown || scoreSlots) && ' '}
            {score(shown?.score, !!result?.win)}
          </span>{' '}
          <span className="ck-side">
            <span className="ck-vsat">{side ? (side.home ? 'vs' : '@') : '@'}</span>{' '}
            {score(shown?.oppScore, !!result && !result.win)}
            {(shown || scoreSlots) && ' '}
            <TeamLink teamId={second.teamId} className={`ck-team${side ? ' ck-opp' : ''}${loss(false)}`}>
              {fatigue ? <FatigueMark f={fatigue.get(second.teamId)} component={fx}>{teamLabel(second)}</FatigueMark> : teamLabel(second)}
              {side && oppDot && <B2BDot tip={oppDot} />}
            </TeamLink>{' '}
            {logos && <TeamLogo team={second} />}
          </span>
        </MatchLink>
        {(records || fx) && ' '}
        {!side && rec(second, true)}
        {!side && positions && <> {pos(second.teamId, true)}</>}
        {!side && lines && ' '}
        {!side && lines && <StreakChip base="ck-streak ck-lstreak ck-lstreak-home" teamId={second.teamId} gameId={game.gameId} streak={lines.get(second.teamId)?.streak} testId="row-streak" />}
        {fx && <Fatigue f={fatigue!.get(second.teamId)} team={teamLabel(second)} />}
        {otMark}
      </span>
    );

  const streak = season?.streak;
  const seasonText = season ? seasonTip(season) : '';
  const liveText = liveScore ? `, live ${liveScore.score}–${liveScore.oppScore}` : '';
  const label = side
    ? `${teamFirst ? `${teamLabel(side.team)} ` : ''}${side.home ? 'vs' : 'at'} ${teamLabel(side.opponent)}, ${tip.label}${result ? `, ${result.win ? 'won' : 'lost'} ${result.score}–${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}${liveText}${seasonText ? `, ${seasonText}` : ''}`
    : `${away} at ${home}, ${tip.label}${liveText}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}${recOf(game.awayTeam) && recOf(game.homeTeam) ? `, records ${result ? 'after the game' : 'going in'} ${away} ${recText(recOf(game.awayTeam))}, ${home} ${recText(recOf(game.homeTeam))}` : ''}`;
  const nights = bracketNights ?? b2b.map((n) => n.night);
  const bracket = side && nights.length ? nights.join(' ') : undefined;
  const cols = fatigueColumns && !!side;
  const b2bLabels = side && b2b.map((n) => <B2BLabel key={n.night} night={n} short={shortB2B} />);
  const tifChip = side && tif && <TifChip tif={tif} />;

  return (
    <article
      className={`ck-card ck-card-${size}${cols ? ' ck-card-cols' : ''}${logos ? ' ck-card-logos' : ''}${next ? ' ck-card-next' : ''}${result ? ' ck-card-final' : ''}${live ? ' ck-card-live' : ''}`}
      data-game-id={game.gameId}
      data-row-date={rowDate}
      data-next={next || undefined}
      data-b2b={bracket}
      data-tip={seriesTip}
      data-run={run?.kind}
      data-run-pos={run?.pos}
      aria-label={dateLabel ? `${dateLabel}, ${label}` : label}
    >
      {/* first, so the season block stays the last part; positioned in the corner */}
      {copyable && <CopyButton hover label="Copy game as image" of=".ck-card" testId="copy-game" />}
      {run?.label && <RunLabel kind={run.kind} {...run.label} />}
      {dateLabel && <span className="ck-date">{dateLabel}</span>}
      {/* a game being played: the red LIVE label in the tip-off's place (the time no longer matters, the row keeps its columns) */}
      {live ? (
        <span className="ck-time ck-time-live" data-testid="tipoff">
          <LiveLabel live={live} detail={size !== 'compact' || !!logos} score={!scores && liveScore ? `${liveScore.score}–${liveScore.oppScore}` : undefined} />
        </span>
      ) : (
        <span className={`ck-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
          <TipTime tip={tip} />
        </span>
      )}
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
        {iconUrl && <GameLinkIcon url={iconUrl} />}
        {side && lines && !season && lines.get(side.team.teamId)?.streak && <StreakChip base="ck-streak ck-cstreak" teamId={side.team.teamId} gameId={game.gameId} streak={lines.get(side.team.teamId)?.streak} testId="cell-streak" />}
        <SeriesChip s={series} gameId={game.gameId} rematch={rematch} focus={side ? teamId : undefined} />
        {!cols && b2bLabels}
        {!cols && tifChip}
        {marks.map((m) =>
          m.kind === 'cup' || m.kind === 'cup-final' ? (
            <CupLabel key={m.kind + m.short} game={game} className={`ck-tag ck-${m.kind}`} long={m.long}>
              {size === 'compact' ? m.short : cupTag ?? m.long}
            </CupLabel>
          ) : (
            <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long}>
              {size === 'compact' ? m.short : m.long}
            </span>
          ),
        )}
        {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
        {tv.length > 0 && tvPill && (
          <span className="ck-tag ck-tv ck-tv-short" data-tip={tv.join(' · ')} aria-label={`US national TV: ${tv.join(', ')}`} role="img" tabIndex={0} data-testid="tv-badge">
            TV
          </span>
        )}
        {tv.length > 0 && !tvPill && (
          <span
            className="ck-tag ck-tv"
            title={tv.length > TV_NAMES_MAX ? undefined : 'US national TV'}
            data-tip={tv.length > TV_NAMES_MAX ? `US national TV: ${tv.join(' · ')}` : undefined}
            aria-label={tv.length > TV_NAMES_MAX ? `US national TV: ${tv.join(', ')}` : undefined}
            role={tv.length > TV_NAMES_MAX ? 'img' : undefined}
            tabIndex={tv.length > TV_NAMES_MAX ? 0 : undefined}
            data-testid="tv-badge"
          >
            {tv.slice(0, TV_NAMES_MAX).map((n, i) => (
              <Fragment key={n}>
                {i > 0 && <span className="ck-tv-sep"> · </span>}
                <span className="ck-tv-name">{n}</span>
              </Fragment>
            ))}
            {tv.length > TV_NAMES_MAX && <span className="ck-tv-more"> +{tv.length - TV_NAMES_MAX}</span>}
          </span>
        )}
        {bigDay}
      </span>
      {side && opp && <OpponentLine o={opp} gameId={game.gameId} final={!!result} short={oppShort} />}
      {season?.game && (
        <span className="ck-season" data-tip={seasonText} data-testid="season">
          <span className="ck-gnum">G{season.game}</span>
          <span className="ck-record">{season.record ? `${season.record.wins}-${season.record.losses}` : ''}</span>
          <StreakChip teamId={teamId ?? 0} gameId={game.gameId} streak={teamId ? streak : undefined} />
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
