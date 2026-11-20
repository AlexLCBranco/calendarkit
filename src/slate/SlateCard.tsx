// The Slate's cards (the self-contained part the gauntlet's Slate widget uses, moved here from
// SlateView.tsx). Inputs: the schedule data, a date, a time zone, a notes store — nothing from calendarkit's app shell,
// URL or page. Each card: both teams (logo, full name, record and streak going in, Fatigue component), "@" before the
// home team, the tip-off time or the final score (OT), the hoopsjunkie "↗" icon, the Cup / play-off labels and the
// national TV names; under the team rows, across the card, a note box per game (NoteBox: pregame / live / postgame; its
// space label and switch in the card's top-right corner), the grid filling the width it is given, two columns while the
// room right of the info keeps SLATE_NOTE_MIN. No timers, no requests: the
// data comes in (loadCalendarData fetches it once per page), only the logos are images.

import { memo, useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { dateFormat, finalScore, hasNationalTv, leagueSeasonLines, markers, nationalTv, overtime, teamLabel, tipoff, type CalendarData, type SeasonLine } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { Fatigue } from './Fatigue';
import { slateCardWidth, slateColumns, slateCopyZoom, slateImageSize, slateInfoColumns, slateInfoWidth, SLATE_CARD_PAD, SLATE_COPY_MARGIN, cupExtra, SLATE_CUP_TRACK, type CupTrackKind, SLATE_ROW_GAP, SLATE_ROW_TRACKS, SLATE_STRIP, SLATE_STRIP_GAP } from './layout';
import { cupStandingsOf } from '../data/cup';
import { useCupFates, useCupStakes } from './cupFates';
import { cupStakesNow, type StakeChip } from '../data/cupStakes';
import { cupFatesNow, type Decided } from '../data/cupDecide';
import { CupSquare, cupSquareNow } from './CupSquare';
import { HostTag, VenueBadge } from './VenueMarker';
import { knockoutVenue, prepFor, venueArena } from '../data/knockout';
import type { GameLink } from './links';
import { NoteBox, NoteCopy, NoteLive } from './NoteBox';
import type { SlateNotes } from './notes';
import { SeriesChip } from './series';
import { leagueRematches, leagueSeries } from '../data/series';
import { fmtOdds, gameLive, gameOdds, withFinals, type DayOdds, type GameLive, type GameOdds, type SlateOdds } from './odds';
import { LiveLabel } from './live';
import { GameLinkIcon, ScoreLink, seasonTip, TeamLogo, TipTime } from './parts';
import { TeamLink, teamListTip } from './teamLink';
import { CupLabel } from './cupLink';
import { BigDayLabel, BigDayMark } from './bigDay';
import { StreakChip } from './streakPopup';
import { slateHeaderLabel } from './header';
import { isCold } from '../data/cold';
import { ColdMark, GameMenuButton } from './gameLinks';
import type { NightCold, SlateCold } from './weather';

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
  /** The games' notes; none: info-only cards. */
  notes?: SlateNotes;
  /** The width the grid fills (CSS px): with notes, two columns while each note box keeps SLATE_NOTE_MIN, else one;
   *  without, as many tight info-only cards as fit. */
  width?: number;
  tvOnly?: boolean;
  /** Each card's "↗" link (e.g. hoopsjunkieLink); none: no icon. */
  gameLink?: GameLink;
  /** Moneyline odds (liveOddsStore()); none: no request, the odds column stays empty. */
  odds?: SlateOdds;
  /** Each card's game button (player props, injuries); the host renders useGameLinksPopup. None: no button. */
  gameMenu?: boolean;
  /** The cold-weather store (liveColdStore()); none: no request, no flags. */
  cold?: SlateCold;
}

/**
 * One day's cards: the grid (and "No games." on an empty day). It follows other tabs' notes for as long as it is shown
 * (`notes.listen`; the default store keeps one storage listener per page however many grids there are).
 */
const NO_SUB = () => () => {};
const NONE = () => undefined;
const NO_GAMES: ScheduleGame[] = [];

/** The day's odds from the store (undefined until they come, or without a store), and the night's games with the
    finals ESPN already has (gauntlet GT-5): a night is over once every game is final, either way. */
function useDayOdds(odds: SlateOdds | undefined, date: string, raw: ScheduleGame[]): { day: DayOdds | undefined; games: ScheduleGame[] } {
  const day = useSyncExternalStore(odds ? (fn) => odds.subscribe(date, fn) : NO_SUB, odds ? () => odds.get(date) : NONE);
  const games = useMemo(() => withFinals(raw, day), [raw, day]);
  const allOver = games.every((g) => g.status === 'final');
  // after the cards are on screen (an effect): load, and refresh while shown
  // live scores (CK-21): the night's games are watched, so the refresh goes every minute from 15 min before a tip-off
  useEffect(() => odds?.show(date, allOver, raw), [odds, date, allOver, raw]);
  return { day, games };
}

export function SlateDay({ data, date, timeZone, notes, width = 1840, tvOnly = false, gameLink, odds, gameMenu = false, cold }: SlateDayProps) {
  const nightCold = useNightCold(cold, date, data.byDate.get(date) ?? NO_GAMES);
  // The whole night decides when the refresh stops (tvOnly or not), as before; the cards are the games shown.
  const { day } = useDayOdds(odds, date, data.byDate.get(date) ?? NO_GAMES);
  const shown = useMemo(() => slateGames(data, date, tvOnly), [data, date, tvOnly]);
  const games = useMemo(() => withFinals(shown, day), [shown, day]);
  const night = isCupNight(games);
  const fates = useCupFates(data, night);
  const chips = useCupStakes(data, date, night);
  const cup = cupKind(games, fates, chips);
  const cols = notes ? slateColumns(width, cup) : slateInfoColumns(width, cup);
  useEffect(() => notes?.listen?.(), [notes]);
  return (
    <>
      {/* A game-less day of the season is reachable and says so */}
      {games.length === 0 && (
        <p className="ck-empty ck-no-games" data-testid="no-games" data-day={date}>
          {tvOnly ? 'No national TV games' : 'No games'} on {dateFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`))}
        </p>
      )}
      <div className={`ck-slate-grid${notes ? ' ck-slate-wide' : ''}`} data-cols={cols} data-cup={cup || undefined} style={slateVars(cols, cup)}>
        {games.length > 0 && <SlateHeader date={date} data={data} />}
        {games.map((g) => (
          <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} notes={notes} odds={gameOdds(day, g)} live={gameLive(g, day)} cupNight={cup} fates={fates} chips={chips} gameMenu={gameMenu} cold={nightCold?.get(g.gameId)} />
        ))}
      </div>
    </>
  );
}

/** A night with Cup group games — every card gets the Cup track (layout.ts SLATE_CUP_TRACK). */
export const isCupNight = (games: readonly ScheduleGame[]) => games.some((g) => g.isCupGroupGame || isKnockout(g));
/** A Cup knockout game (quarterfinal, semifinal, Championship). */
export const isKnockout = (g: ScheduleGame) => g.isCupKnockout || g.gameType === 'cup-final';
/** The night's feels-like temperatures from the store (undefined until they come, or without one); asks once shown. */
function useNightCold(cold: SlateCold | undefined, date: string, games: ScheduleGame[]): NightCold | undefined {
  const night = useSyncExternalStore(cold ? (fn) => cold.subscribe(date, fn) : NO_SUB, cold ? () => cold.get(date) : NONE);
  useEffect(() => cold?.show(date, games), [cold, date, games]);
  return night;
}

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
  '--ck-slate-tracks': `${T.at}px ${T.logo}px ${T.name}px ${T.rec}px ${T.streak}px ${cup ? `${SLATE_CUP_TRACK + cupExtra(cup)}px ` : ''}${T.fx}px ${T.odds}px`,
});
const VARS = [layoutVars(0), layoutVars(1), layoutVars(2), layoutVars(3)] as const;
const varsOf = (cup: CupTrackKind) => VARS[cup === true ? 1 : cup === false ? 0 : cup];
const slateVars = (cols: number, cup: CupTrackKind = false) => ({ ...varsOf(cup), '--ck-slate-cols': cols }) as CSSProperties;

/**
 * The copied image (and a selection's): the cards in `cols` columns, touching (one shared 1 px line between them, CK-7),
 * SLATE_COPY_MARGIN around them, on nothing — only the cards are opaque. `cardWidth`: the on-screen card width, so cards wrap their text as on screen.
 */
/** The Cup track kind of a copied night (as SlateCopy draws it). */
export const slateCopyCup = (data: CalendarData, games: readonly ScheduleGame[]) => cupKind(games, cupFatesNow(data), games[0] && cupStakesNow(data, games[0].dateEt));

export function SlateCopy({ data, games: raw, cols, cardWidth, timeZone, notes, odds, gameLink, editNotes = false, cold }: { /** feels-like °C per game (CK-16) */ cold?: NightCold; data: CalendarData; games: ScheduleGame[]; cols: number; cardWidth: number; timeZone?: string; notes?: SlateNotes; odds?: DayOdds; /** A host showing the copy layout live (the gauntlet's Slate widget): each card's "↗" and score links; none in images. */ gameLink?: GameLink; /** A host showing the copy layout live: a click on a note opens it for typing (NoteLive); never in images. */ editNotes?: boolean }) {
  // The finals ESPN already has (gauntlet GT-5): a game over tonight shows its score before the morning snapshot.
  const games = useMemo(() => withFinals(raw, odds), [raw, odds]);
  const cup = slateCopyCup(data, games);
  // The info drawn larger inside the card (its info column widened to match), the note box narrower
  const zoom = slateCopyZoom(cardWidth, cup, !!notes);
  return (
    <div className="ck-slate-copy" style={{ ...varsOf(cup), ...(zoom > 1 ? { '--ck-slate-info': `${slateInfoWidth(cup) * zoom}px`, '--ck-copy-zoom': zoom } : {}), width: slateImageSize(games.length, cols, { width: cardWidth, height: 0 }).width, '--ck-slate-cols': cols, '--ck-slate-card': `${cardWidth}px`, '--ck-slate-margin': `${SLATE_COPY_MARGIN}px` } as CSSProperties} data-zoom={zoom}>
      {games[0] && <SlateHeader date={games[0].dateEt} data={data} />}
      {games.map((g) => (
        <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} notes={notes} odds={gameOdds(odds, g)} live={gameLive(g, odds)} cupNight={cupKind(games, cupFatesNow(data), games[0] && cupStakesNow(data, games[0].dateEt))} fates={cupFatesNow(data)} chips={games[0] && cupStakesNow(data, games[0].dateEt)} copy editNotes={editNotes} cold={cold?.get(g.gameId)} />
      ))}
    </div>
  );
}

/** The header line across the top of the grid ("SLATE · 18-11 · NBA"), on screen, in copies and in host widgets. */
function SlateHeader({ date, data }: { date: string; data: CalendarData }) {
  return (
    <div className="ck-slate-header" data-testid="slate-header">
      {slateHeaderLabel(date)}
      <BigDayLabel data={data} date={date} className=" ck-bigday-slate" />
    </div>
  );
}

/** One game as a card. */
export const SlateCard = memo(function SlateCard({ data, game, timeZone, gameLink, notes, odds, live, copy = false, editNotes = false, cupNight = false, fates, chips, gameMenu = false, cold }: { /** Feels-like °C at tip-off (CK-16), when known */ cold?: number; data: CalendarData; game: ScheduleGame; timeZone?: string; gameLink?: GameLink; notes?: SlateNotes; odds?: GameOdds; /** The game being played (CK-21): score so far, period, clock */ live?: GameLive; copy?: boolean; /** The game button (SlateDayProps.gameMenu); never in a copy */ gameMenu?: boolean; /** In the copy layout, notes open for typing on a click (SlateCopy editNotes) */ editNotes?: boolean; /** The night's Cup track (cupKind; true = 1) */ cupNight?: CupTrackKind; /** IN / OUT */ fates?: Decided; /** Tonight's stakes chips */ chips?: Map<number, StakeChip[]> }) {
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
  const label = `${away} at ${home}, ${tip.label}${live ? `, live ${away} ${live.away}, ${home} ${live.home}` : ''}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}`;
  return (
    // A national TV game's card is outlined and tinted in the TV badge's green (nothing else uses it)
    <article className={`ck-slate-card${result ? ' ck-slate-final' : ''}${live ? ' ck-slate-live' : ''}${tv.length ? ' ck-slate-tv' : ''}${notes ? ' ck-with-note' : ''}`} data-game-id={game.gameId} aria-label={label}>
      <div className="ck-slate-info">
        {/* The strip — tip-off time (or "Final" + OT) on top, then the ↗ link, the TV pill and the
            Cup / play-off tags, wrapping inside the strip; beside the two team rows instead of a line of its own */}
        <div className="ck-slate-strip">
          {result ? (
            <span className="ck-slate-status" data-testid="slate-status">
              Final{ot && <span className="ck-ot"> {ot}</span>}
            </span>
          ) : live ? (
            <span className="ck-slate-status ck-slate-livestatus" data-testid="slate-status">
              {/* the strip has room for "Q3 4:12" after the tag; a longer clock shows the period (the full clock in the tooltip) */}
              <LiveLabel live={live} maxChars={7} />
            </span>
          ) : (
            <span className={`ck-slate-status ck-slate-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
              <TipTime tip={tip} />
            </span>
          )}
          <span className="ck-slate-chips">
            {/* The game page is this icon, not the team names; a control, so never in a copy */}
            {url && (
              <GameLinkIcon url={url} />
            )}
            <SeriesChip s={leagueSeries(data).get(game.gameId)} gameId={game.gameId} rematch={leagueRematches(data).get(game.gameId)} />
            {tv.length > 0 && (
              <span className="ck-slate-tv-pill" data-tip={tv.join(' · ')} aria-label={`National TV: ${tv.join(', ')}`} title={tv.join(' · ')} data-testid="tv-badge">
                TV
              </span>
            )}
            {marks.map((m) =>
              m.kind === 'cup' || m.kind === 'cup-final' ? (
                <CupLabel key={m.kind + m.short} game={game} className={`ck-tag ck-${m.kind}`} long={m.long}>
                  {m.short}
                </CupLabel>
              ) : (
                <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long} data-tip={m.long}>
                  {m.short}
                </span>
              ),
            )}
            {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
          </span>
          {/* a holiday or a big NBA date: a star in the strip's corner (it takes no room from the chips) */}
          <BigDayMark data={data} date={game.dateEt} />
        </div>
        <div className="ck-slate-teams">
          <TeamRow menu={gameMenu && !copy ? `${away} at ${home}` : undefined} cold={cold} cup={cupNight ? { data, game, live, gameLink, fates: cupNight === 2 || cupNight === 3 ? fates : undefined, chips: cupNight === 3 ? chips : undefined } : undefined} team={game.awayTeam} gameId={game.gameId} f={fx?.get(game.awayTeam.teamId)} line={lines?.get(game.awayTeam.teamId)} url={url} score={result ? { n: result.score, win: result.win } : live && { n: live.away, win: false, live: true }} odds={odds?.away} provider={odds?.provider} />
          <TeamRow cup={cupNight ? { data, game, live, gameLink, fates: cupNight === 2 || cupNight === 3 ? fates : undefined, chips: cupNight === 3 ? chips : undefined } : undefined} team={game.homeTeam} gameId={game.gameId} f={fx?.get(game.homeTeam.teamId)} line={lines?.get(game.homeTeam.teamId)} url={url} score={result ? { n: result.oppScore, win: !result.win } : live && { n: live.home, win: false, live: true }} odds={odds?.home} provider={odds?.provider} home />
        </div>
      </div>
      {notes && (copy ? editNotes ? <NoteLive store={notes} gameId={game.gameId} label={`${away} at ${home}`} /> : <NoteCopy note={notes.get(game.gameId)} /> : <NoteBox store={notes} gameId={game.gameId} label={`${away} at ${home}`} />)}
    </article>
  );
});

/**
 * "[@] [logo] Wizards 113 3-1 W2 [fatigue]": one team; the home team's row starts with the "@" (the away row keeps its
 * room). Record and streak going in: the Team List season line's rule, colours and tooltip.
 */
function TeamRow({ menu, cold, cup, team, gameId, f, line, score, url, odds, provider, home = false }: { /** The away row: the game button in its empty "@" cell (its label) */ menu?: string; /** feels-like °C at tip-off (the away row shows the mark) */ cold?: number; url?: string; cup?: { data: CalendarData; game: ScheduleGame; live?: GameLive; gameLink?: GameLink; fates?: Decided; chips?: Map<number, StakeChip[]> }; team: ScheduleGame['homeTeam']; gameId: string; f?: TeamFatigue; line?: SeasonLine; score?: { n: number; win: boolean; /** a score so far (CK-21): no winner, not dimmed */ live?: boolean }; odds?: number; provider?: string; home?: boolean }) {
  const t = TEAM_BY_ID.get(team.teamId);
  const rec = line?.record;
  const streak = line?.streak;
  const tip = line && seasonTip(line) ? `${teamLabel(team)}: ${seasonTip(line)}` : undefined;
  const loss = score && !score.win && !score.live ? ' ck-loss' : '';
  const out = cup?.game.isCupGroupGame && cup.fates?.fate.get(team.teamId) === 'out' ? ' ck-cup-out-row' : '';
  return (
    <span className={`ck-slate-row${loss}${out}`} data-side={home ? 'home' : 'away'}>
      <span className="ck-slate-at" aria-hidden={!home && !menu && !isCold(cold)}>
        {home ? '@' : menu ? <GameMenuButton gameId={gameId} label={menu} cold={cold} /> : <ColdMark cold={cold} />}
      </span>
      <TeamLogo team={team} />
      {/* The name and, right after it, the final score (the game's page) */}
      <span className="ck-slate-namecell">
        <TeamLink teamId={team.teamId} className="ck-slate-name" data-tricode={teamLabel(team)}>
          {t?.name ?? teamLabel(team)}
        </TeamLink>
        <ScoreLink url={score ? url : undefined} className={`ck-slate-score${score?.win ? ' ck-score-win' : ''}${score?.live ? ' ck-score-live' : ''}`}>
          {score?.n ?? ''}
        </ScoreLink>
      </span>
      {/* the record is the team's List (every game, the rest days); the name and logo stay its Calendar */}
      <TeamLink teamId={rec ? team.teamId : 0} view="list" className="ck-slate-rec" data-tip={rec ? `${teamListTip(teamLabel(team))}${tip ? `
${tip}` : ''}` : undefined} data-testid="slate-rec">
        {rec ? `${rec.wins}-${rec.losses}` : ''}
      </TeamLink>
      <StreakChip teamId={team.teamId} gameId={gameId} streak={streak} base="ck-slate-streak" testId="slate-streak" label={tip} />
      {cup && (isKnockout(cup.game) ? <KoTrack data={cup.data} game={cup.game} teamId={team.teamId} home={home} /> : <CupTrack {...cup} teamId={team.teamId} />)}
      <Fatigue f={f} team={teamLabel(team)} shortChip />
      {/* The moneyline, decimal; its column is reserved, empty until (unless) the odds come */}
      <span className="ck-slate-odds" data-testid="slate-odds" data-tip={odds ? `${teamLabel(team)} moneyline ${fmtOdds(odds)} (decimal${provider ? `, ${provider}` : ''}; the last line before tip-off once the game has started)` : undefined}>
        {odds ? fmtOdds(odds) : ''}
      </span>
    </span>
  );
}

/**
 * A Cup group game's team: its 4 group games as mini squares in order (played: W / L and the margin;
 * to come: the opponent; tonight's ringed), each its game page; then its group record over its differential. A card
 * that isn't a Cup game keeps the track empty (the night's cards stay one size).
 */
function CupTrack({ data, game, live, gameLink, teamId, fates, chips }: { data: CalendarData; game: ScheduleGame; /** tonight's game being played (CK-21) */ live?: GameLive; gameLink?: GameLink; teamId: number; fates?: Decided; chips?: Map<number, StakeChip[]> }) {
  const t = game.isCupGroupGame && teamId ? cupStandingsOf(data).byTeam.get(teamId) : undefined;
  if (!t) return <span className="ck-slate-cup" data-testid="slate-cup" />;
  const diff = t.diff > 0 ? `+${t.diff}` : t.diff < 0 ? `−${-t.diff}` : '0';
  return (
    <span className="ck-slate-cup" data-testid="slate-cup" data-team={t.tricode}>
      <span className="ck-slate-cup-squares">
        {t.slots.map((s) => (
          <CupSquare key={s.gameId} g={s.gameId === game.gameId ? cupSquareNow(s, game, live) : s} margin tonight={s.gameId === game.gameId} url={gameLink?.(s.game)} />
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

/** "IN" (clinched a knockout spot, green) or "OUT" (can't qualify any more, muted gray); nothing while alive. */
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
 * The team's stakes tonight, in the B2B / 3-in-4 chips' style, two at most (each one's tooltip has
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
 * A knockout card's track — the venue, from the feed (knockoutVenue): "HOST" on the host team's row;
 * the Championship's "Neutral · Hinkle Fieldhouse, Indianapolis" on the first row (neither team gets HOST); "venue TBD"
 * while the feed hasn't set it.
 */
function KoTrack({ data, game, teamId, home }: { data: CalendarData; game: ScheduleGame; teamId: number; home: boolean }) {
  const venue = knockoutVenue(game);
  // The team's rest and (for the road team) travel before the game
  const prep = teamId ? prepFor(data, teamId, game.dateEt, venueArena(game)) : undefined;
  return (
    <span className="ck-slate-cup ck-slate-ko" data-testid="slate-ko">
      {venue.kind === 'host' && venue.teamId === teamId && teamId !== 0 && <HostTag />}
      {!home && venue.kind !== 'host' && <VenueBadge venue={venue} />}
      {prep && (
        <span className="ck-ko-prep" data-testid="ko-prep" data-tip={prep.tip} title={prep.tip}>
          {prep.text}
        </span>
      )}
    </span>
  );
}
