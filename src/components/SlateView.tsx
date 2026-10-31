// League → Slate (round 7): one day of games as cards, two columns, like a search engine's "today" grid — built to be
// copied as an image and pasted onto the gauntlet whiteboard. The day changes only with ← / → (top bar or keyboard,
// CalendarView); the cards scroll inside the view when they don't fit. Each card: both teams (logo, full name, record
// going in, Fatigue component), "@" before the home team, the tip-off time or the final score (OT), the Cup / play-off
// labels and the national TV names — the League List row's facts, laid out as a card. Round 9 (Part 3): beside the
// facts, a note box per game (NoteBox: pregame / live / postgame, kept in localStorage), the grid from the page's left
// edge across the widget, two columns while each note box keeps SLATE_NOTE_MIN.

import { memo, useRef, useState, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { finalScore, leagueSeasonLines, markers, nationalTv, overtime, teamLabel, tipoff, type CalendarData, type SeasonLine } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { Fatigue } from './Fatigue';
import { seasonTip, TeamLogo, TipTime, type GameLink } from './GameCard';
import { listDays } from './LeagueListView';
import { NoteBox, NoteCopy } from './NoteBox';
import { exportFile, parseExport, SLOT_LABEL, SLOTS, type NotesStore, type Slot } from './notes';
import { slateColumns, slateImageSize, SLATE_COPY_GAP, SLATE_GRID_GAP, SLATE_INFO_WIDTH, SLATE_NOTE_GAP } from './slate';
import { LIST_MAX_WIDTH } from './widget';

export interface SlateViewProps {
  data: CalendarData;
  /** The day shown (ET game date); a day without games shows "No games". */
  date: string;
  tvOnly: boolean;
  timeZone?: string;
  gameLink?: GameLink;
  /** The widget's width: one or two columns (slateColumns). */
  width?: number;
  /** The games' notes (round 9); none: info-only cards, no notes toolbar. */
  notes?: NotesStore;
  /** "Hide all notes": info-only cards (a view toggle, never stored). */
  hideNotes?: boolean;
  onHideNotes?: (hide: boolean) => void;
}

/** The day's games (TV games only when filtered), in tip-off order. */
export const slateGames = (data: CalendarData, date: string, tvOnly: boolean) => listDays(data, tvOnly).find((d) => d.date === date)?.games ?? [];

/** Slate on desktop only: from the lists' column width (960 px; the grid is that wide), so not on tablets or phones. */
export const SLATE_MIN_WIDTH = LIST_MAX_WIDTH;

export function SlateView({ data, date, tvOnly, timeZone, gameLink, width = 1840, notes, hideNotes = false, onHideNotes }: SlateViewProps) {
  const games = slateGames(data, date, tvOnly);
  const withNotes = !!notes && !hideNotes;
  const cols = withNotes ? slateColumns(width) : 2;
  return (
    <section className="ck-slate" aria-label="Games of the day" data-day={date}>
      {notes && <NotesTools notes={notes} games={games} hideNotes={hideNotes} onHideNotes={onHideNotes} />}
      <div className="ck-slate-scroll" data-testid="slate" data-select-scroller>
        {games.length === 0 && <p className="ck-empty">No games.</p>}
        <div className={`ck-slate-grid${withNotes ? ' ck-slate-wide' : ''}`} data-cols={cols} style={slateVars(cols)}>
          {games.map((g) => (
            <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} notes={withNotes ? notes : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}

const slateVars = (cols: number) => ({ '--ck-slate-cols': cols, '--ck-slate-info': `${SLATE_INFO_WIDTH}px`, '--ck-slate-note-gap': `${SLATE_NOTE_GAP}px`, '--ck-slate-grid-gap': `${SLATE_GRID_GAP}px` }) as CSSProperties;

/**
 * The Slate's notes toolbar (above the cards, never copied): every card of the day onto one slot ("Switch all", saved like
 * a card's own switch), "Hide all notes" (a view toggle, not remembered), Export (a JSON file of every note) and Import
 * (merges such a file: per slot the file's text wins; tells how many games came in, or why nothing changed).
 */
function NotesTools({ notes, games, hideNotes, onHideNotes }: { notes: NotesStore; games: ScheduleGame[]; hideNotes: boolean; onHideNotes?: (hide: boolean) => void }) {
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const file = useRef<HTMLInputElement>(null);
  const exportNotes = () => {
    notes.flush();
    const blob = new Blob([exportFile(notes.all())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calendarkit-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMessage({ text: `Exported notes for ${Object.keys(notes.all()).length} games.` });
  };
  const importNotes = async (f: File) => {
    try {
      const n = notes.importNotes(parseExport(await f.text()));
      setMessage({ text: `Imported notes for ${n} game${n === 1 ? '' : 's'}.` });
    } catch (e) {
      setMessage({ text: `Not imported: ${(e as Error).message}. Nothing was changed.`, error: true });
    }
  };
  return (
    <div className="ck-slate-tools" data-testid="notes-tools" data-capture-exclude="true">
      <span className="ck-slate-tools-label">Notes</span>
      <span className="ck-slate-switch-all" role="group" aria-label="Switch all notes to">
        <span className="ck-slate-tools-hint">Switch all:</span>
        {SLOTS.map((slot: Slot) => (
          <button key={slot} type="button" className="ck-tool" disabled={hideNotes || !games.length} onClick={() => notes.showAll(games.map((g) => g.gameId), slot)} data-testid={`notes-all-${slot}`}>
            {SLOT_LABEL[slot]}
          </button>
        ))}
      </span>
      <button type="button" className="ck-tool" aria-pressed={hideNotes} onClick={() => onHideNotes?.(!hideNotes)} data-testid="notes-hide">
        {hideNotes ? 'Show notes' : 'Hide all notes'}
      </button>
      <span className="ck-slate-tools-end">
        <button type="button" className="ck-tool" onClick={exportNotes} data-testid="notes-export">
          Export notes
        </button>
        <button type="button" className="ck-tool" onClick={() => file.current?.click()} data-testid="notes-import">
          Import notes
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="notes-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importNotes(f);
          }}
        />
        <span className={`ck-slate-tools-msg${message?.error ? ' ck-error' : ''}`} role="status" data-testid="notes-message">
          {message?.text ?? ''}
        </span>
      </span>
    </div>
  );
}

/**
 * The copied image (and a selection's): the cards in `cols` columns, SLATE_COPY_GAP apart and half of it around them,
 * on nothing — only the cards are opaque. `cardWidth`: the on-screen card width, so cards wrap their text as on screen.
 */
export function SlateCopy({ data, games, cols, cardWidth, timeZone, notes }: { data: CalendarData; games: ScheduleGame[]; cols: number; cardWidth: number; timeZone?: string; notes?: NotesStore }) {
  return (
    <div className="ck-slate-copy" style={{ width: slateImageSize(games.length, cols, { width: cardWidth, height: 0 }).width, '--ck-slate-cols': cols, '--ck-slate-card': `${cardWidth}px`, '--ck-slate-gap': `${SLATE_COPY_GAP}px`, '--ck-slate-info': `${SLATE_INFO_WIDTH}px` } as CSSProperties}>
      {games.map((g) => (
        <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} notes={notes} copy />
      ))}
    </div>
  );
}

/** One game as a card. */
export const SlateCard = memo(function SlateCard({ data, game, timeZone, gameLink, notes, copy = false }: { data: CalendarData; game: ScheduleGame; timeZone?: string; gameLink?: GameLink; notes?: NotesStore; copy?: boolean }) {
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
