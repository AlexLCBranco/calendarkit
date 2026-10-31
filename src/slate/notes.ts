// Slate notes (round 9, Part 3): a note per game with three slots — pregame, live, postgame — and the slot on show.
// The note belongs to the GAME (its NBA gameId), not to a card or a view. Kept in localStorage under one key,
// NOTES_KEY, as { [gameId]: { pre, live, post, shown } } — the gauntlet Slate widget will read the same key (PROJECT.md).
// Notes are the person's content, not a default, so they are stored (the "no persistence before a settings page" rule
// is about defaults). Saved as typed (debounced) and on every slot switch; other open tabs follow through the `storage`
// event (last edit wins); a card subscribes to its own game only, so typing re-renders that card alone.

export const NOTES_KEY = 'ck:notes:v1';
export const SLOTS = ['pre', 'live', 'post'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { pre: 'PRE', live: 'LIVE', post: 'POST' };
export const nextSlot = (s: Slot): Slot => SLOTS[(SLOTS.indexOf(s) + 1) % SLOTS.length]!;

export interface GameNote {
  pre: string;
  live: string;
  post: string;
  /** The slot on show; nothing switches it but the person (never the clock or the game's state). */
  shown: Slot;
}
export type NotesMap = Record<string, GameNote>;

export const EMPTY_NOTE: GameNote = Object.freeze({ pre: '', live: '', post: '', shown: 'pre' }) as GameNote;
const isEmpty = (n: GameNote) => !n.pre && !n.live && !n.post && n.shown === 'pre';

/** Typing is saved this long after the last keystroke (and at once on a switch, a blur or leaving the page). */
export const SAVE_DELAY_MS = 400;

/** One note, checked: three strings and a known slot; anything else → undefined. */
function readNote(v: unknown): GameNote | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (!SLOTS.every((s) => o[s] === undefined || typeof o[s] === 'string')) return undefined;
  const shown = o.shown === undefined ? 'pre' : o.shown;
  if (!SLOTS.includes(shown as Slot)) return undefined;
  return { pre: (o.pre as string) ?? '', live: (o.live as string) ?? '', post: (o.post as string) ?? '', shown: shown as Slot };
}

/** A notes map, checked (game ids: digits); throws with a reason when it isn't one. */
export function parseNotes(v: unknown): NotesMap {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not a notes object');
  const out: NotesMap = {};
  for (const [id, n] of Object.entries(v)) {
    if (!/^\d{10}$/.test(id)) throw new Error(`"${id}" is not an NBA game id`);
    const note = readNote(n);
    if (!note) throw new Error(`the note of game ${id} is not { pre, live, post, shown }`);
    out[id] = note;
  }
  return out;
}

/** The export file: { format, exported, notes }. */
export const EXPORT_FORMAT = NOTES_KEY;
export const exportFile = (notes: NotesMap, now = new Date()) => JSON.stringify({ format: EXPORT_FORMAT, exported: now.toISOString(), notes }, null, 2);

/** An export file's notes (or a bare notes map); throws with a reason for anything else. */
export function parseExport(text: string): NotesMap {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('the file is not JSON');
  }
  if (v && typeof v === 'object' && 'notes' in v) {
    const f = v as { format?: unknown; notes: unknown };
    if (f.format !== undefined && f.format !== EXPORT_FORMAT) throw new Error(`unknown format "${String(f.format)}"`);
    return parseNotes(f.notes);
  }
  return parseNotes(v);
}

/** Import: for a game in both, each slot the file has text for wins (an empty slot in the file keeps ours); the file's shown slot wins. */
export function mergeNotes(ours: NotesMap, theirs: NotesMap): NotesMap {
  const out = { ...ours };
  for (const [id, t] of Object.entries(theirs)) {
    const o = ours[id] ?? EMPTY_NOTE;
    out[id] = { pre: t.pre || o.pre, live: t.live || o.live, post: t.post || o.post, shown: t.shown };
  }
  return out;
}

/**
 * Round 10: what a Slate card's note box needs from a notes store — the input the Slate's part takes. calendarkit and the
 * gauntlet pass the default, localNotesStore() (localStorage NOTES_KEY, live between tabs); a host may pass its own.
 */
export interface SlateNotes {
  /** The game's note (EMPTY_NOTE when it has none). Must return the same object until that game's note changes. */
  get(id: string): GameNote;
  /** Changes one game's note (text of a slot, the slot on show); saved after SAVE_DELAY_MS, or at once with `now`. */
  set(id: string, patch: Partial<GameNote>, now?: boolean): void;
  /** Writes pending changes now (a box calls it on blur). */
  flush(): void;
  /** Listens to one game's note (a card) — or every change with `*`; returns the undo. */
  subscribe(id: string, fn: () => void): () => void;
  /** Optional: start following other tabs while a grid is shown; returns the undo. */
  listen?(): () => void;
}

/** The default store: SlateNotes plus calendarkit's notes toolbar (Switch all, Export, Import). */
export interface NotesStore extends SlateNotes {
  /** Every listed game on one slot (the toolbar's "Switch all"), saved at once. */
  showAll(ids: readonly string[], slot: Slot): void;
  all(): NotesMap;
  /** Merges an imported map (mergeNotes), saved at once; returns how many games it held. */
  importNotes(theirs: NotesMap): number;
  /** Follows other tabs (`storage` events) and saves when the page is hidden or left; returns the undo (which saves too). */
  listen(): () => void;
}

/** Storage that may be missing or throw (private mode, blocked site data): the notes then live for the page only. */
function safeStorage(s: Storage | undefined) {
  return {
    read(): NotesMap {
      try {
        const raw = s?.getItem(NOTES_KEY);
        return raw ? parseNotes(JSON.parse(raw)) : {};
      } catch {
        return {};
      }
    },
    write(m: NotesMap) {
      try {
        if (Object.keys(m).length) s?.setItem(NOTES_KEY, JSON.stringify(m));
        else s?.removeItem(NOTES_KEY);
      } catch {
        /* full or blocked: kept in memory */
      }
    },
  };
}

export function createNotesStore(storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, win: Window | undefined = typeof window === 'undefined' ? undefined : window): NotesStore {
  const disk = safeStorage(storage);
  let notes: NotesMap = disk.read();
  // what changed here since the last save, per game (slot texts, the shown slot)
  const pending = new Map<string, Partial<GameNote>>();
  const listeners = new Map<string, Set<() => void>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = (id: string) => {
    listeners.get(id)?.forEach((f) => f());
    listeners.get('*')?.forEach((f) => f());
  };
  const change = (id: string, patch: Partial<GameNote>) => {
    notes = { ...notes, [id]: { ...(notes[id] ?? EMPTY_NOTE), ...patch } };
    pending.set(id, { ...pending.get(id), ...patch });
    notify(id);
  };
  // writes only the games changed here, onto what is stored now: another tab's notes on other games survive
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending.size) return;
    const stored = disk.read();
    for (const [id, patch] of pending) {
      const n = { ...(stored[id] ?? EMPTY_NOTE), ...patch };
      if (isEmpty(n)) delete stored[id];
      else stored[id] = n;
    }
    pending.clear();
    disk.write(stored);
  };
  // another tab saved: take its notes — except what was changed here and not saved yet (kept, so the text being typed
  // and its caret stay; saving it then makes it the last edit)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== NOTES_KEY && e.key !== null) return;
    let theirs: NotesMap;
    try {
      theirs = e.newValue ? parseNotes(JSON.parse(e.newValue)) : {};
    } catch {
      return;
    }
    const before = notes;
    const next: NotesMap = {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(theirs)])) {
      const n = { ...(theirs[id] ?? EMPTY_NOTE), ...pending.get(id) };
      if (!isEmpty(n)) next[id] = n;
    }
    notes = next;
    for (const id of new Set([...Object.keys(before), ...Object.keys(next)])) {
      const [x, y] = [before[id] ?? EMPTY_NOTE, next[id] ?? EMPTY_NOTE];
      if (x.pre !== y.pre || x.live !== y.live || x.post !== y.post || x.shown !== y.shown) notify(id);
    }
  };
  const onHide = () => flush();
  let users = 0;
  const onVisibility = () => document.visibilityState === 'hidden' && flush();
  return {
    get: (id) => notes[id] ?? EMPTY_NOTE,
    set(id, patch, now = false) {
      change(id, patch);
      if (now) flush();
      else {
        clearTimeout(timer);
        timer = setTimeout(flush, SAVE_DELAY_MS);
      }
    },
    showAll(ids, slot) {
      for (const id of ids) change(id, { shown: slot });
      flush();
    },
    all: () => notes,
    importNotes(theirs) {
      const merged = mergeNotes(notes, theirs);
      for (const id of Object.keys(theirs)) change(id, merged[id]!);
      flush();
      return Object.keys(theirs).length;
    },
    flush,
    subscribe(id, fn) {
      let s = listeners.get(id);
      if (!s) listeners.set(id, (s = new Set()));
      s.add(fn);
      return () => s!.delete(fn);
    },
    // one set of listeners however many grids listen (round 10: every card / widget of a page shares one store);
    // each undo saves, the last one also stops listening
    listen() {
      if (users++ === 0) {
        win?.addEventListener('storage', onStorage);
        win?.addEventListener('pagehide', onHide);
        win?.document?.addEventListener('visibilitychange', onVisibility);
      }
      let undone = false;
      return () => {
        flush();
        if (undone) return;
        undone = true;
        if (--users > 0) return;
        win?.removeEventListener('storage', onStorage);
        win?.removeEventListener('pagehide', onHide);
        win?.document?.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

let pageStore: NotesStore | undefined;
let pageUndo: (() => void) | undefined;

/**
 * Round 10: the default notes store — one per page, shared by every card and widget on it (calendarkit's Slate, each
 * gauntlet Slate widget): localStorage NOTES_KEY, live between tabs. It follows other tabs for the page's life (one
 * `storage` listener, attached on first use), so a widget added later never starts from stale notes.
 */
export function localNotesStore(): NotesStore {
  if (!pageStore) {
    pageStore = createNotesStore();
    pageUndo = pageStore.listen();
  }
  return pageStore;
}

/** Tests only: forget the page's store (each test starts as a fresh page). */
export function resetLocalNotesStore() {
  pageUndo?.();
  pageStore = pageUndo = undefined;
}
