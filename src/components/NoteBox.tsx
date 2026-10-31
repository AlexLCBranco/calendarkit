// Slate note box (round 9, Part 3): the game's note beside its card — a text field the person types in, three slots
// (PRE / LIVE / POST) switched with [⇄], the slot on show saved with the note. It subscribes to its own game only
// (useSyncExternalStore on the notes store), so typing re-renders this box and nothing else. The box grows with its text
// (a hidden copy of the text sizes the grid cell the textarea fills: no inner scrollbar, the font never shrinks).

import { useCallback, useSyncExternalStore } from 'react';
import { nextSlot, SLOT_LABEL, type GameNote, type NotesStore } from './notes';

const LABEL: Record<string, string> = { pre: 'pregame', live: 'live', post: 'postgame' };

export function NoteBox({ store, gameId, label }: { store: NotesStore; gameId: string; label: string }) {
  const note = useSyncExternalStore(
    useCallback((fn: () => void) => store.subscribe(gameId, fn), [store, gameId]),
    () => store.get(gameId),
  );
  const slot = note.shown;
  const next = nextSlot(slot);
  return (
    <div className="ck-gnote" data-testid="note" data-slot={slot}>
      <span className="ck-gnote-head">
        <span className="ck-gnote-slot" data-testid="note-slot">
          {SLOT_LABEL[slot]}
        </span>
        <button type="button" className="ck-gnote-switch" data-testid="note-switch" data-capture-exclude="true" title={`Show the ${LABEL[next]} note (${SLOT_LABEL[next]})`} aria-label={`Show the ${LABEL[next]} note`} onClick={() => store.set(gameId, { shown: next }, true)}>
          ⇄
        </button>
      </span>
      <span className="ck-gnote-grow" data-text={`${note[slot]} `}>
        <textarea
          className="ck-gnote-text"
          data-testid="note-text"
          aria-label={`${SLOT_LABEL[slot]} note, ${label}`}
          spellCheck={false}
          value={note[slot]}
          onChange={(e) => store.set(gameId, { [slot]: e.target.value } as Partial<GameNote>)}
          onBlur={() => store.flush()}
        />
      </span>
    </div>
  );
}

/** The note box as it is copied: the shown slot's label and text, no switch, no field (an empty box stays a dark box). */
export function NoteCopy({ note }: { note: GameNote }) {
  return (
    <div className="ck-gnote" data-testid="note" data-slot={note.shown}>
      <span className="ck-gnote-head">
        <span className="ck-gnote-slot" data-testid="note-slot">
          {SLOT_LABEL[note.shown]}
        </span>
      </span>
      <span className="ck-gnote-grow">
        <span className="ck-gnote-text ck-gnote-static" data-testid="note-text">
          {note[note.shown]}
        </span>
      </span>
    </div>
  );
}
