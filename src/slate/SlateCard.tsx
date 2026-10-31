// The Slate's cards (round 7; round 10: the self-contained part the gauntlet's Slate widget uses, moved here from
// SlateView.tsx). Inputs: the schedule data, a date, a time zone, a notes store — nothing from calendarkit's app shell,
// URL or page. Each card: both teams (logo, full name, record and streak going in, Fatigue component), "@" before the
// home team, the tip-off time or the final score (OT), the hoopsjunkie "↗" icon, the Cup / play-off labels and the
// national TV names; round 9: beside the facts, a note box per game (NoteBox: pregame / live / postgame), the grid
// filling the width it is given, two columns while each note box keeps SLATE_NOTE_MIN. No timers, no requests: the
// data comes in (loadCalendarData fetches it once per page), only the logos are images.

import { memo, useEffect, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { finalScore, hasNationalTv, leagueSeasonLines, markers, nationalTv, overtime, teamLabel, tipoff, type CalendarData, type SeasonLine } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { Fatigue } from './Fatigue';
import { slateColumns, slateImageSize, SLATE_COPY_GAP, SLATE_GRID_GAP, SLATE_INFO_WIDTH, SLATE_NOTE_GAP } from './layout';
import type { GameLink } from './links';
import { NoteBox, NoteCopy } from './NoteBox';
import type { SlateNotes } from './notes';
import { seasonTip, TeamLogo, TipTime } from './parts';

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
  /** The width the grid fills (CSS px): two columns while each note box keeps SLATE_NOTE_MIN, else one. */
  width?: number;
  tvOnly?: boolean;
  /** Each card's "↗" link (e.g. hoopsjunkieLink); none: no icon. */
  gameLink?: GameLink;
}

/**
 * One day's cards: the grid (and "No games." on an empty day). It follows other tabs' notes for as long as it is shown
 * (`notes.listen`; the default store keeps one storage listener per page however many grids there are).
 */
export function SlateDay({ data, date, timeZone, notes, width = 1840, tvOnly = false, gameLink }: SlateDayProps) {
  const games = slateGames(data, date, tvOnly);
  const cols = notes ? slateColumns(width) : 2;
  useEffect(() => notes?.listen?.(), [notes]);
  return (
    <>
      {games.length === 0 && <p className="ck-empty">No games.</p>}
      <div className={`ck-slate-grid${notes ? ' ck-slate-wide' : ''}`} data-cols={cols} style={slateVars(cols)}>
        {games.map((g) => (
          <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} notes={notes} />
        ))}
      </div>
    </>
  );
}

const slateVars = (cols: number) => ({ '--ck-slate-cols': cols, '--ck-slate-info': `${SLATE_INFO_WIDTH}px`, '--ck-slate-note-gap': `${SLATE_NOTE_GAP}px`, '--ck-slate-grid-gap': `${SLATE_GRID_GAP}px` }) as CSSProperties;

/**
 * The copied image (and a selection's): the cards in `cols` columns, SLATE_COPY_GAP apart and half of it around them,
 * on nothing — only the cards are opaque. `cardWidth`: the on-screen card width, so cards wrap their text as on screen.
 */
export function SlateCopy({ data, games, cols, cardWidth, timeZone, notes }: { data: CalendarData; games: ScheduleGame[]; cols: number; cardWidth: number; timeZone?: string; notes?: SlateNotes }) {
  return (
    <div className="ck-slate-copy" style={{ width: slateImageSize(games.length, cols, { width: cardWidth, height: 0 }).width, '--ck-slate-cols': cols, '--ck-slate-card': `${cardWidth}px`, '--ck-slate-gap': `${SLATE_COPY_GAP}px`, '--ck-slate-info': `${SLATE_INFO_WIDTH}px` } as CSSProperties}>
      {games.map((g) => (
        <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} notes={notes} copy />
      ))}
    </div>
  );
}

/** One game as a card. */
export const SlateCard = memo(function SlateCard({ data, game, timeZone, gameLink, notes, copy = false }: { data: CalendarData; game: ScheduleGame; timeZone?: string; gameLink?: GameLink; notes?: SlateNotes; copy?: boolean }) {
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
      {/* the head: tip-off time (or "Final OT") and the hoopsjunkie icon on the left, the Cup / play-off labels and the
          TV names on the right */}
      <div className="ck-slate-head">
        <span className="ck-slate-when">
          {result ? (
            <span className="ck-slate-status" data-testid="slate-status">
              Final{ot && <span className="ck-ot"> {ot}</span>}
            </span>
          ) : (
            <span className={`ck-slate-status ck-slate-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
              <TipTime tip={tip} />
            </span>
          )}
          {/* round 9 (2.3): the game page is this icon, not the team names; a control, so never in a copy */}
          {url && (
            <a className="ck-slate-link" href={url} target="_blank" rel="noopener noreferrer" draggable={false} title="Open on hoopsjunkie" aria-label="Open on hoopsjunkie" data-testid="game-link" data-capture-exclude="true" onClick={(e) => e.stopPropagation()}>
              ↗
            </a>
          )}
        </span>
        <span className="ck-slate-tags">
          {marks.map((m) => (
            <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long}>
              {m.long}
            </span>
          ))}
          {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
          {tv.length > 0 && (
            <span className="ck-tag ck-tv" title="US national TV" data-testid="tv-badge">
              {tv.join(' · ')}
            </span>
          )}
        </span>
      </div>
      <div className="ck-slate-teams">
        <TeamRow team={game.awayTeam} f={fx?.get(game.awayTeam.teamId)} line={lines?.get(game.awayTeam.teamId)} score={result && { n: result.score, win: result.win }} />
        <TeamRow team={game.homeTeam} f={fx?.get(game.homeTeam.teamId)} line={lines?.get(game.homeTeam.teamId)} score={result && { n: result.oppScore, win: !result.win }} home />
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
function TeamRow({ team, f, line, score, home = false }: { team: ScheduleGame['homeTeam']; f?: TeamFatigue; line?: SeasonLine; score?: { n: number; win: boolean }; home?: boolean }) {
  const t = TEAM_BY_ID.get(team.teamId);
  const rec = line?.record;
  const streak = line?.streak;
  const tip = line && seasonTip(line) ? `${teamLabel(team)}: ${seasonTip(line)}` : undefined;
  const loss = score && !score.win ? ' ck-loss' : '';
  return (
    <span className={`ck-slate-row${loss}`} data-side={home ? 'home' : 'away'}>
      <span className="ck-slate-at" aria-hidden={!home}>
        {home ? '@' : ''}
      </span>
      <TeamLogo team={team} />
      <span className="ck-slate-name" data-tricode={teamLabel(team)}>
        {t?.name ?? teamLabel(team)}
      </span>
      <span className="ck-slate-rec" data-tip={rec ? tip : undefined}>
        {rec ? `${rec.wins}-${rec.losses}` : ''}
      </span>
      <span className={`ck-slate-streak${streak ? ` ck-streak-${streak.kind.toLowerCase()}` : ''}`} data-testid="slate-streak" data-tip={streak ? tip : undefined}>
        {streak ? `${streak.kind}${streak.n}` : ''}
      </span>
      <Fatigue f={f} team={teamLabel(team)} />
      <span className={`ck-slate-score${score?.win ? ' ck-score-win' : ''}`}>{score?.n ?? ''}</span>
    </span>
  );
}
