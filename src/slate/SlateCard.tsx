// The Slate's cards (round 7; round 10: the self-contained part the gauntlet's Slate widget uses, moved here from
// SlateView.tsx). Inputs: the schedule data, a date, a time zone, a notes store — nothing from calendarkit's app shell,
// URL or page. Each card: both teams (logo, full name, record and streak going in, Fatigue component), "@" before the
// home team, the tip-off time or the final score (OT), the hoopsjunkie "↗" icon, the Cup / play-off labels and the
// national TV names; round 9: beside the facts, a note box per game (NoteBox: pregame / live / postgame), the grid
// filling the width it is given, two columns while each note box keeps SLATE_NOTE_MIN. No timers, no requests: the
// data comes in (loadCalendarData fetches it once per page), only the logos are images.

import { memo, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { dateFormat, finalScore, hasNationalTv, leagueSeasonLines, markers, nationalTv, overtime, teamLabel, tipoff, type CalendarData, type SeasonLine } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { Fatigue } from './Fatigue';
import { slateCardWidth, slateColumns, slateImageSize, slateInfoColumns, slateInfoWidth, SLATE_CARD_PAD, SLATE_COPY_GAP, cupExtra, SLATE_CUP_TRACK, type CupTrackKind, SLATE_GRID_GAP, SLATE_NOTE_GAP, SLATE_ROW_GAP, SLATE_ROW_TRACKS, SLATE_STRIP, SLATE_STRIP_GAP } from './layout';
import { cupStandingsOf } from '../data/cup';
import { useCupFates, useCupStakes } from './cupFates';
import { cupStakesNow, type StakeChip } from '../data/cupStakes';
import { cupFatesNow, type Decided } from '../data/cupDecide';
import { CupSquare } from './CupSquare';
import { HostTag, VenueBadge } from './VenueMarker';
import { knockoutVenue } from '../data/knockout';
import type { GameLink } from './links';
import { NoteBox, NoteCopy } from './NoteBox';
import type { SlateNotes } from './notes';
import { SeriesChip } from './series';
import { leagueSeries } from '../data/series';
import { fmtOdds, gameOdds, type DayOdds, type GameOdds, type SlateOdds } from './odds';
import { GameLinkIcon, seasonTip, TeamLogo, TipTime } from './parts';
import { TeamLink } from './teamLink';
import { streakAttr } from './streakPopup';

/** The day's games (TV games only when filtered), in tip-off order; [] on a day without games. */
export const slateGames = (data: CalendarData, date: string, tvOnly = false) => {
  const all = data.byDate.get(date) ?? [];
  return tvOnly ? all.filter(hasNationalTv) : all;
};

export interface SlateDayProps {
  data: CalendarData;
  /** The day shown (NBA / ET game date, YYYY-MM-DD); a day without games shows "No games." */
  date: string;
  /** IANA zone for the tip-off times; default: the browser's. */
  timeZone?: string;
  /** The games' notes; none: info-only cards (round 7's). */
  notes?: SlateNotes;
  /** The width the grid fills (CSS px): with notes, two columns while each note box keeps SLATE_NOTE_MIN, else one;
   *  without (round 14), as many tight info-only cards as fit. */
  width?: number;
  tvOnly?: boolean;
  /** Each card's "↗" link (e.g. hoopsjunkieLink); none: no icon. */
  gameLink?: GameLink;
  /** Round 14: moneyline odds (liveOddsStore()); none: no request, the odds column stays empty. */
  odds?: SlateOdds;
}

/**
 * One day's cards: the grid (and "No games." on an empty day). It follows other tabs' notes for as long as it is shown
 * (`notes.listen`; the default store keeps one storage listener per page however many grids there are).
 */
const NO_SUB = () => () => {};
const NONE = () => undefined;

/** The day's odds from the store (undefined until they come, or without a store). */
function useDayOdds(odds: SlateOdds | undefined, date: string, allOver: boolean): DayOdds | undefined {
  const day = useSyncExternalStore(odds ? (fn) => odds.subscribe(date, fn) : NO_SUB, odds ? () => odds.get(date) : NONE);
  // after the cards are on screen (an effect): load, and refresh while shown
  useEffect(() => odds?.show(date, allOver), [odds, date, allOver]);
  return day;
}

export function SlateDay({ data, date, timeZone, notes, width = 1840, tvOnly = false, gameLink, odds }: SlateDayProps) {
  const games = slateGames(data, date, tvOnly);
  const day = useDayOdds(odds, date, (data.byDate.get(date) ?? []).every((g) => g.status === 'final'));
  const night = isCupNight(games);
  const fates = useCupFates(data, night);
  const chips = useCupStakes(data, date, night);
  const cup = cupKind(games, fates, chips);
  const cols = notes ? slateColumns(width, cup) : slateInfoColumns(width, cup);
  useEffect(() => notes?.listen?.(), [notes]);
  return (
    <>
      {/* round 14 (item 6): a game-less day of the season is reachable and says so */}
      {games.length === 0 && (
        <p className="ck-empty ck-no-games" data-testid="no-games" data-day={date}>
          {tvOnly ? 'No national TV games' : 'No games'} on {dateFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`))}
        </p>
      )}
      <div className={`ck-slate-grid${notes ? ' ck-slate-wide' : ''}`} data-cols={cols} data-cup={cup || undefined} style={slateVars(cols, cup)}>
        {games.map((g) => (
          <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} notes={notes} odds={gameOdds(day, g)} cupNight={cup} fates={fates} chips={chips} />
        ))}
      </div>
    </>
  );
}

/** Round 21 (item 1): a night with Cup group games — every card gets the Cup track (layout.ts SLATE_CUP_TRACK). */
export const isCupNight = (games: readonly ScheduleGame[]) => games.some((g) => g.isCupGroupGame || isKnockout(g));
/** Round 21 (item 10): a Cup knockout game (quarterfinal, semifinal, Championship). */
export const isKnockout = (g: ScheduleGame) => g.isCupKnockout || g.gameType === 'cup-final';
/** The night's Cup track: none, the squares, or the squares and the IN / OUT column (a Cup team on show is decided). */
export const cupKind = (games: readonly ScheduleGame[], fates?: Decided, chips?: Map<number, StakeChip[]>): 0 | 1 | 2 | 3 => {
  if (!isCupNight(games)) return 0;
  const cupTeams = games.filter((g) => g.isCupGroupGame).flatMap((g) => [g.homeTeam.teamId, g.awayTeam.teamId]);
  if (chips && cupTeams.some((id) => chips.has(id))) return 3;
  return fates && cupTeams.some((id) => fates.fate.has(id)) ? 2 : 1;
};

/** The layout constants as CSS variables (layout.ts is the one source of the sizes). */
const T = SLATE_ROW_TRACKS;
const layoutVars = (cup: CupTrackKind) => ({
  '--ck-slate-info': `${slateInfoWidth(cup)}px`,
  '--ck-slate-card-w': `${slateCardWidth(cup)}px`,
  '--ck-slate-pad': `${SLATE_CARD_PAD}px`,
  '--ck-slate-strip': `${SLATE_STRIP}px`,
  '--ck-slate-strip-gap': `${SLATE_STRIP_GAP}px`,
  '--ck-slate-row-gap': `${SLATE_ROW_GAP}px`,
  '--ck-slate-tracks': `${T.at}px ${T.logo}px ${T.name}px ${T.rec}px ${T.streak}px ${cup ? `${SLATE_CUP_TRACK + cupExtra(cup)}px ` : ''}${T.fx}px ${T.score}px ${T.odds}px`,
  '--ck-slate-note-gap': `${SLATE_NOTE_GAP}px`,
  '--ck-slate-grid-gap': `${SLATE_GRID_GAP}px`,
});
const VARS = [layoutVars(0), layoutVars(1), layoutVars(2), layoutVars(3)] as const;
const varsOf = (cup: CupTrackKind) => VARS[cup === true ? 1 : cup === false ? 0 : cup];
const slateVars = (cols: number, cup: CupTrackKind = false) => ({ ...varsOf(cup), '--ck-slate-cols': cols }) as CSSProperties;

/**
 * The copied image (and a selection's): the cards in `cols` columns, SLATE_COPY_GAP apart and half of it around them,
 * on nothing — only the cards are opaque. `cardWidth`: the on-screen card width, so cards wrap their text as on screen.
 */
export function SlateCopy({ data, games, cols, cardWidth, timeZone, notes, odds }: { data: CalendarData; games: ScheduleGame[]; cols: number; cardWidth: number; timeZone?: string; notes?: SlateNotes; odds?: DayOdds }) {
  return (
    <div className="ck-slate-copy" style={{ ...varsOf(cupKind(games, cupFatesNow(data), games[0] && cupStakesNow(data, games[0].dateEt))), width: slateImageSize(games.length, cols, { width: cardWidth, height: 0 }).width, '--ck-slate-cols': cols, '--ck-slate-card': `${cardWidth}px`, '--ck-slate-gap': `${SLATE_COPY_GAP}px` } as CSSProperties}>
      {games.map((g) => (
        <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} notes={notes} odds={gameOdds(odds, g)} cupNight={cupKind(games, cupFatesNow(data), games[0] && cupStakesNow(data, games[0].dateEt))} fates={cupFatesNow(data)} chips={games[0] && cupStakesNow(data, games[0].dateEt)} copy />
      ))}
    </div>
  );
}

/** One game as a card. */
export const SlateCard = memo(function SlateCard({ data, game, timeZone, gameLink, notes, odds, copy = false, cupNight = false, fates, chips }: { data: CalendarData; game: ScheduleGame; timeZone?: string; gameLink?: GameLink; notes?: SlateNotes; odds?: GameOdds; copy?: boolean; /** round 21: the night's Cup track (cupKind; true = 1) */ cupNight?: CupTrackKind; /** round 21 (item 2): IN / OUT */ fates?: Decided; /** round 21 (item 11): tonight's stakes chips */ chips?: Map<number, StakeChip[]> }) {
  const fx = leagueFatigue(data).get(game.gameId);
  const lines = leagueSeasonLines(data).get(game.gameId);
  const result = finalScore(game, game.awayTeam.teamId);
  const ot = result && overtime(game);
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  const url = gameLink?.(game);
  const label = `${away} at ${home}, ${tip.label}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}`;
  return (
    // round 9 (2.2): a national TV game's card is outlined and tinted in the TV badge's green (nothing else uses it)
    <article className={`ck-slate-card${result ? ' ck-slate-final' : ''}${tv.length ? ' ck-slate-tv' : ''}${notes ? ' ck-with-note' : ''}`} data-game-id={game.gameId} aria-label={label}>
      <div className="ck-slate-info">
        {/* round 14 (item 3): the strip — tip-off time (or "Final" + OT) on top, then the ↗ link, the TV pill and the
            Cup / play-off tags, wrapping inside the strip; beside the two team rows instead of a line of its own */}
        <div className="ck-slate-strip">
          {result ? (
            <span className="ck-slate-status" data-testid="slate-status">
              Final{ot && <span className="ck-ot"> {ot}</span>}
            </span>
          ) : (
            <span className={`ck-slate-status ck-slate-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
              <TipTime tip={tip} />
            </span>
          )}
          <span className="ck-slate-chips">
            {/* round 9 (2.3): the game page is this icon, not the team names; a control, so never in a copy */}
            {url && (
              <GameLinkIcon url={url} />
            )}
            <SeriesChip s={leagueSeries(data).get(game.gameId)} gameId={game.gameId} />
            {tv.length > 0 && (
              <span className="ck-slate-tv-pill" data-tip={tv.join(' · ')} aria-label={`National TV: ${tv.join(', ')}`} title={tv.join(' · ')} data-testid="tv-badge">
                TV
              </span>
            )}
            {marks.map((m) => (
              <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long} data-tip={m.long}>
                {m.short}
              </span>
            ))}
            {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
          </span>
        </div>
        <div className="ck-slate-teams">
          <TeamRow cup={cupNight ? { data, game, gameLink, fates: cupNight === 2 || cupNight === 3 ? fates : undefined, chips: cupNight === 3 ? chips : undefined } : undefined} team={game.awayTeam} gameId={game.gameId} f={fx?.get(game.awayTeam.teamId)} line={lines?.get(game.awayTeam.teamId)} score={result && { n: result.score, win: result.win }} odds={odds?.away} provider={odds?.provider} />
          <TeamRow cup={cupNight ? { data, game, gameLink, fates: cupNight === 2 || cupNight === 3 ? fates : undefined, chips: cupNight === 3 ? chips : undefined } : undefined} team={game.homeTeam} gameId={game.gameId} f={fx?.get(game.homeTeam.teamId)} line={lines?.get(game.homeTeam.teamId)} score={result && { n: result.oppScore, win: !result.win }} odds={odds?.home} provider={odds?.provider} home />
        </div>
      </div>
      {notes && (copy ? <NoteCopy note={notes.get(game.gameId)} /> : <NoteBox store={notes} gameId={game.gameId} label={`${away} at ${home}`} />)}
    </article>
  );
});

/**
 * "[@] [logo] Wizards 3-1 W2 [fatigue] 113": one team; the home team's row starts with the "@" (the away row keeps its
 * room). Record and streak going in (round 9, 2.1): the Team List season line's rule, colours and tooltip.
 */
function TeamRow({ cup, team, gameId, f, line, score, odds, provider, home = false }: { cup?: { data: CalendarData; game: ScheduleGame; gameLink?: GameLink; fates?: Decided; chips?: Map<number, StakeChip[]> }; team: ScheduleGame['homeTeam']; gameId: string; f?: TeamFatigue; line?: SeasonLine; score?: { n: number; win: boolean }; odds?: number; provider?: string; home?: boolean }) {
  const t = TEAM_BY_ID.get(team.teamId);
  const rec = line?.record;
  const streak = line?.streak;
  const tip = line && seasonTip(line) ? `${teamLabel(team)}: ${seasonTip(line)}` : undefined;
  const loss = score && !score.win ? ' ck-loss' : '';
  const out = cup?.game.isCupGroupGame && cup.fates?.fate.get(team.teamId) === 'out' ? ' ck-cup-out-row' : '';
  return (
    <span className={`ck-slate-row${loss}${out}`} data-side={home ? 'home' : 'away'}>
      <span className="ck-slate-at" aria-hidden={!home}>
        {home ? '@' : ''}
      </span>
      <TeamLogo team={team} />
      <TeamLink teamId={team.teamId} className="ck-slate-name" data-tricode={teamLabel(team)}>
        {t?.name ?? teamLabel(team)}
      </TeamLink>
      <span className="ck-slate-rec" data-tip={rec ? tip : undefined}>
        {rec ? `${rec.wins}-${rec.losses}` : ''}
      </span>
      <span className={`ck-slate-streak${streak ? ` ck-streak-${streak.kind.toLowerCase()}` : ''}`} data-testid="slate-streak" data-streak={streak ? streakAttr(team.teamId, gameId) : undefined} tabIndex={streak ? 0 : undefined} aria-label={streak ? tip : undefined}>
        {streak ? `${streak.kind}${streak.n}` : ''}
      </span>
      {cup && (isKnockout(cup.game) ? <KoTrack game={cup.game} teamId={team.teamId} home={home} /> : <CupTrack {...cup} teamId={team.teamId} />)}
      <Fatigue f={f} team={teamLabel(team)} shortChip />
      <span className={`ck-slate-score${score?.win ? ' ck-score-win' : ''}`}>{score?.n ?? ''}</span>
      {/* round 14 (item 4): the moneyline, decimal; its column is reserved, empty until (unless) the odds come */}
      <span className="ck-slate-odds" data-testid="slate-odds" data-tip={odds ? `${teamLabel(team)} moneyline ${fmtOdds(odds)} (decimal${provider ? `, ${provider}` : ''}; the last line before tip-off once the game has started)` : undefined}>
        {odds ? fmtOdds(odds) : ''}
      </span>
    </span>
  );
}

/**
 * Round 21 (item 1): a Cup group game's team: its 4 group games as mini squares in order (played: W / L and the margin;
 * to come: the opponent; tonight's ringed), each its game page; then its group record over its differential. A card
 * that isn't a Cup game keeps the track empty (the night's cards stay one size).
 */
function CupTrack({ data, game, gameLink, teamId, fates, chips }: { data: CalendarData; game: ScheduleGame; gameLink?: GameLink; teamId: number; fates?: Decided; chips?: Map<number, StakeChip[]> }) {
  const t = game.isCupGroupGame && teamId ? cupStandingsOf(data).byTeam.get(teamId) : undefined;
  if (!t) return <span className="ck-slate-cup" data-testid="slate-cup" />;
  const diff = t.diff > 0 ? `+${t.diff}` : t.diff < 0 ? `−${-t.diff}` : '0';
  return (
    <span className="ck-slate-cup" data-testid="slate-cup" data-team={t.tricode}>
      <span className="ck-slate-cup-squares">
        {t.slots.map((s) => (
          <CupSquare key={s.gameId} g={s} margin tonight={s.gameId === game.gameId} url={gameLink?.(s.game)} />
        ))}
      </span>
      {chips ? <StakeChips chips={game.isCupGroupGame ? chips.get(teamId) : undefined} fate={fates?.fate.get(teamId)} /> : fates && <CupFateTag fate={fates.fate.get(teamId)} />}
      <span className="ck-slate-cup-rec" data-tip={`${t.tricode} in the Cup: ${t.w}-${t.l} in group play, point differential ${diff}`} aria-label={`Cup group record ${t.w}-${t.l}, differential ${diff}`}>
        <span>{`${t.w}-${t.l}`}</span>
        <span className={t.diff > 0 ? 'ck-cup-pos-text' : t.diff < 0 ? 'ck-cup-neg-text' : ''}>{diff}</span>
      </span>
    </span>
  );
}

/** Round 21 (item 2): "IN" (clinched a knockout spot, green) or "OUT" (can't qualify any more, muted gray); nothing while alive. */
function CupFateTag({ fate }: { fate?: 'in' | 'out' }) {
  return (
    <span className="ck-slate-cup-fate" data-testid="cup-fate" data-fate={fate ?? ''}>
      {fate === 'in' && (
        <span className="ck-cup-fate-in" title="Clinched a knockout spot (mathematically certain)">
          IN
        </span>
      )}
      {fate === 'out' && (
        <span className="ck-cup-fate-out" title="Can no longer qualify for the knockout rounds (mathematically certain)">
          OUT
        </span>
      )}
    </span>
  );
}

/**
 * Round 21 (item 11): the team's stakes tonight, in the B2B / 3-in-4 chips' style, two at most (each one's tooltip has
 * the details: the result needed, or the differential math); a decided team keeps its IN / OUT tag here instead.
 */
export function StakeChips({ chips, fate }: { chips?: StakeChip[]; fate?: 'in' | 'out' }) {
  if (!chips?.length) return fate ? <CupFateTag fate={fate} /> : <span className="ck-slate-cup-chips" />;
  return (
    <span className="ck-slate-cup-chips" data-testid="stake-chips">
      {chips.slice(0, 2).map((c) => (
        <span key={c.kind} className={`ck-stake ck-stake-${c.kind}`} data-tip={c.tip} data-kind={c.kind} title={c.tip}>
          {c.text}
        </span>
      ))}
    </span>
  );
}

/**
 * Round 21 (item 10): a knockout card's track — the venue, from the feed (knockoutVenue): "HOST" on the host team's row;
 * the Championship's "Neutral · Hinkle Fieldhouse, Indianapolis" on the first row (neither team gets HOST); "venue TBD"
 * while the feed hasn't set it.
 */
function KoTrack({ game, teamId, home }: { game: ScheduleGame; teamId: number; home: boolean }) {
  const venue = knockoutVenue(game);
  return (
    <span className="ck-slate-cup ck-slate-ko" data-testid="slate-ko">
      {venue.kind === 'host' && venue.teamId === teamId && teamId !== 0 && <HostTag />}
      {!home && venue.kind !== 'host' && <VenueBadge venue={venue} />}
    </span>
  );
}
