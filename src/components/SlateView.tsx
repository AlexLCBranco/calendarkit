// League → Slate (round 7): one day of games as cards, like a search engine's "today" grid — built to be copied as an
// image and pasted onto the gauntlet whiteboard. The day changes only with ← / → (top bar or keyboard, CalendarView); the
// cards scroll inside the view when they don't fit. Round 10: the cards, their note boxes and the grid are the Slate's
// self-contained part (src/slate/, also used by the gauntlet's Slate widget); this file adds calendarkit's own frame —
// the scroller and the notes toolbar (Switch all, Hide all notes, Export / Import).

import { useRef, useState } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { CalendarData } from '../data/model';
import type { GameLink } from '../slate/links';
import { exportFile, parseExport, SLOT_LABEL, SLOTS, type NotesStore, type Slot } from '../slate/notes';
import { SlateDay, slateGames } from '../slate/SlateCard';
import { LIST_MAX_WIDTH } from './widget';

export { SlateCard, SlateCopy, slateGames } from '../slate/SlateCard';

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

/** Slate on desktop only: from the lists' column width (960 px; the grid is that wide), so not on tablets or phones. */
export const SLATE_MIN_WIDTH = LIST_MAX_WIDTH;

export function SlateView({ data, date, tvOnly, timeZone, gameLink, width = 1840, notes, hideNotes = false, onHideNotes }: SlateViewProps) {
  const games = slateGames(data, date, tvOnly);
  return (
    <section className="ck-slate" aria-label="Games of the day" data-day={date}>
      {notes && <NotesTools notes={notes} games={games} hideNotes={hideNotes} onHideNotes={onHideNotes} />}
      <div className="ck-slate-scroll" data-testid="slate" data-select-scroller>
        <SlateDay data={data} date={date} tvOnly={tvOnly} timeZone={timeZone} gameLink={gameLink} width={width} notes={hideNotes ? undefined : notes} />
      </div>
    </section>
  );
}

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
