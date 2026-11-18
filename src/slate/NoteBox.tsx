// Slate note box: the game's note under its team rows, the card's full width — a text field the person types in,
// three spaces (PRE / LIVE / POST) switched with [⇄], the space on show saved with the note. The label and the switch
// sit in the card's top-right corner (beside the odds), not in the box. It subscribes to its own game only
// (useSyncExternalStore on the notes store), so typing re-renders this box and nothing else. The box is always NOTE_LINES
// lines tall, empty or not (gauntlet GT-11: every card the same height); a longer note scrolls inside. While the field isn't focused
// the wheel scrolls the page, never the note (onWheel below); once clicked into, the note scrolls.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { nextSlot, SLOT_LABEL, type GameNote, type SlateNotes } from './notes';

const LABEL: Record<string, string> = { pre: 'pregame', live: 'live', post: 'postgame' };
/** The on-screen box's height in lines, and a live copy's (notes.css uses the same number). Copied pictures are never
    capped. */
export const NOTE_LINES = 3;

/** The nearest ancestor that scrolls vertically (the Slate's own scroller, or the page). */
function scroller(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** A wheel over an unfocused note scrolls what is behind it, as if the note weren't a scroll box. */
export function wheelPastNote(e: WheelEvent) {
  const t = e.currentTarget as HTMLTextAreaElement;
  if (document.activeElement === t || e.ctrlKey) return;
  e.preventDefault();
  const target = scroller(t);
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? target.clientHeight : 1;
  target.scrollBy({ left: e.deltaX * unit, top: e.deltaY * unit });
}

/** The space label and its switch — the card's top-right corner (`slot` only: the copy's label, no switch). */
function NoteHead({ slot, onSwitch, keepFocus = false }: { slot: GameNote['shown']; onSwitch?: () => void; /** A press on ⇄ leaves the focus in the note (NoteLive: it stays open) */ keepFocus?: boolean }) {
  const next = nextSlot(slot);
  return (
    <span className="ck-gnote-head" data-testid="note-head">
      <span className="ck-gnote-slot" data-testid="note-slot" data-slot={slot}>
        {SLOT_LABEL[slot]}
      </span>
      {onSwitch && (
        <button type="button" className="ck-gnote-switch" data-testid="note-switch" data-capture-exclude="true" title={`Show the ${LABEL[next]} note (${SLOT_LABEL[next]})`} aria-label={`Show the ${LABEL[next]} note`} onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined} onClick={onSwitch}>
          ⇄
        </button>
      )}
    </span>
  );
}

export function NoteBox({ store, gameId, label }: { store: SlateNotes; gameId: string; label: string }) {
  const note = useSyncExternalStore(
    useCallback((fn: () => void) => store.subscribe(gameId, fn), [store, gameId]),
    () => store.get(gameId),
  );
  const slot = note.shown;
  const field = useRef<HTMLTextAreaElement>(null);
  // non-passive (React's onWheel can't preventDefault)
  useEffect(() => {
    const t = field.current;
    t?.addEventListener('wheel', wheelPastNote, { passive: false });
    return () => t?.removeEventListener('wheel', wheelPastNote);
  }, []);
  return (
    <>
      <NoteHead slot={slot} onSwitch={() => store.set(gameId, { shown: nextSlot(slot) }, true)} />
      <div className="ck-gnote" data-testid="note" data-slot={slot}>
        <span className="ck-gnote-grow" data-text={`${note[slot]} `}>
          <textarea
            ref={field}
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
    </>
  );
}

/** The note box as it is copied: the shown space's label (no switch) and its whole text — never capped, no scrollbar.
    With `onEdit` (NoteLive, a host showing the copy live) the box is 3 lines, scrolling inside (GT-11), and a click on
    it opens it for typing. */
export function NoteCopy({ note, onEdit }: { note: GameNote; onEdit?: () => void }) {
  return (
    <>
      <NoteHead slot={note.shown} />
      <div className="ck-gnote ck-gnote-copy" data-testid="note" data-slot={note.shown} data-editable={onEdit ? 'true' : undefined} onClick={onEdit}>
        <span className="ck-gnote-grow">
          <span className="ck-gnote-text ck-gnote-static" data-testid="note-text">
            {note[note.shown]}
          </span>
        </span>
      </div>
    </>
  );
}

/**
 * A note in the copy layout shown live by a host (the gauntlet's Slate widget, `SlateCopy editNotes`): exactly the copy
 * (NoteCopy) until clicked; then calendarkit's field in the same box, the space label with its ⇄, the box 3 lines tall
 * like calendarkit's own (the field scrolls inside: gauntlet GT-11). Enter adds a line; the note is saved as typed (the store's delay); leaving
 * the field (a click elsewhere, Escape, Tab) saves it at once and shows the copy again. It follows its own game only, so
 * a note typed elsewhere (another tab) shows here as it is saved.
 */
export function NoteLive({ store, gameId, label }: { store: SlateNotes; gameId: string; label: string }) {
  const note = useSyncExternalStore(
    useCallback((fn: () => void) => store.subscribe(gameId, fn), [store, gameId]),
    () => store.get(gameId),
  );
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = field.current;
    if (!editing || !t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
  }, [editing]);
  if (!editing) return <NoteCopy note={note} onEdit={() => setEditing(true)} />;
  const slot = note.shown;
  return (
    <>
      <NoteHead slot={slot} onSwitch={() => store.set(gameId, { shown: nextSlot(slot) }, true)} keepFocus />
      <div className="ck-gnote ck-gnote-copy" data-testid="note" data-slot={slot} data-editable="true" data-editing="true">
        <span className="ck-gnote-grow ck-gnote-live" data-text={`${note[slot]} `}>
          <textarea
            ref={field}
            className="ck-gnote-text"
            data-testid="note-text"
            aria-label={`${SLOT_LABEL[slot]} note, ${label}`}
            spellCheck={false}
            value={note[slot]}
            onChange={(e) => store.set(gameId, { [slot]: e.target.value } as Partial<GameNote>)}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
            onBlur={() => {
              store.flush();
              setEditing(false);
            }}
          />
        </span>
      </div>
    </>
  );
}
