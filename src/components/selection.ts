// Marquee selection of games, ported from Boardkit (src/features/board/useMarqueeSelection.ts): drag past a 4 px
// threshold to draw a box; every game it touches is selected live; Shift adds to the selection; a plain click clears
// it. The box is drawn by writing to its style (no React render per pointer move); only the set of selected game ids
// goes to a small store, and an unchanged set notifies nobody. Differences from Boardkit: rows here aren't
// draggable, so a drag may start on a game; mouse only (touch keeps scrolling); dragging near the top/bottom of a
// scrolling list scrolls it, and the box's start stays anchored to the content, so rows scrolled past stay selected
// (their last measured position is remembered — the League List unmounts days far off-screen).

import { useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** The selected game ids, outside React state so a change re-renders only its subscribers (highlight, bar). */
export interface SelectionStore {
  get(): ReadonlySet<string>;
  /** Replaces the selection; no-op (and no notification) when the set is unchanged. */
  set(ids: Iterable<string>): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export function createSelectionStore(): SelectionStore {
  let current = EMPTY;
  const listeners = new Set<() => void>();
  const store: SelectionStore = {
    get: () => current,
    set(ids) {
      const next = new Set(ids);
      if (next.size === current.size && [...next].every((id) => current.has(id))) return;
      current = next.size ? next : EMPTY;
      listeners.forEach((l) => l());
    },
    clear: () => store.set([]),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

export const useSelection = (store: SelectionStore) => useSyncExternalStore(store.subscribe, store.get, store.get);

/** Pointer travel (px) before a press becomes a marquee; less is a click (which clears the selection). */
export const MARQUEE_THRESHOLD = 4;
/** Auto-scroll: within this distance (px) of a scrolling list's top/bottom edge, up to MAX_SCROLL_STEP px per frame. */
export const SCROLL_EDGE = 48;
export const MAX_SCROLL_STEP = 28;

/** A press on any of these keeps doing its own job instead of starting a marquee. */
/** The matchup links (GameCard MatchLink): a press on one is a click or the start of a marquee. */
const GAME_LINK = '.ck-mlink';
const INTERACTIVE = 'button, a, input, label, select, textarea, [role="tab"], [role="option"], [role="listbox"], [data-capture-exclude="true"], .ck-toolbar';
/** Selectable items: games (list rows, week-view lines, the game in a team calendar cell). Never days or rest rows. */
export const ITEM = '[data-game-id]';
/** Scrolling containers: items are clipped to them; the one a drag starts in auto-scrolls. */
export const SCROLLER = '[data-select-scroller]';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const touches = (a: Box, b: Box) => a.left < a.right && a.top < a.bottom && a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/**
 * Ids of the games in `root` that the box (client px) touches, judged by what is visible: each game's rect is first
 * clipped to its scroller (or the viewport), so one scrolled out of view isn't selected. Games inside `anchor` (the
 * scroller the drag started in) are judged in that scroller's content coordinates instead, against `seen` (every
 * rect measured during this drag, kept for games that have since been unmounted), so rows scrolled past stay in.
 */
export function gamesTouching(root: ParentNode, box: Box, anchor?: HTMLElement, seen?: Map<string, Box>): string[] {
  const ids = new Set<string>();
  const clips = new Map<Element, DOMRect>();
  const view: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const a = anchor?.getBoundingClientRect();
  const s = anchor?.scrollTop ?? 0;
  for (const el of root.querySelectorAll<HTMLElement>(ITEM)) {
    if (el.closest('.ck-team-probe')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const scroller = el.closest(SCROLLER);
    if (anchor && a && seen && scroller === anchor) {
      seen.set(el.dataset.gameId!, { left: r.left, right: r.right, top: r.top - a.top + s, bottom: r.bottom - a.top + s });
      continue;
    }
    let clip: Box = view;
    if (scroller) {
      let c = clips.get(scroller);
      if (!c) clips.set(scroller, (c = scroller.getBoundingClientRect()));
      clip = { left: Math.max(c.left, view.left), top: Math.max(c.top, view.top), right: Math.min(c.right, view.right), bottom: Math.min(c.bottom, view.bottom) };
    }
    const visible = { left: Math.max(r.left, clip.left), top: Math.max(r.top, clip.top), right: Math.min(r.right, clip.right), bottom: Math.min(r.bottom, clip.bottom) };
    if (touches(visible, box)) ids.add(el.dataset.gameId!);
  }
  if (anchor && a && seen) {
    const inContent = { left: box.left, right: box.right, top: box.top - a.top + s, bottom: box.bottom - a.top + s };
    for (const [id, r] of seen) if (touches(r, inContent)) ids.add(id);
  }
  return [...ids];
}

/**
 * Returns the `onPointerDown` for the views' content area. `box` is the (fixed-position) marquee element.
 */
export function useMarqueeSelection(store: SelectionStore, box: RefObject<HTMLDivElement | null>) {
  return function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const area = event.currentTarget;
    const boxEl = box.current;
    const target = event.target;
    if (!boxEl || event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse') return;
    if (!(target instanceof Element) || !area.contains(target)) return;
    // a game link (the matchup, round 5) may start a marquee; other controls don't
    const control = target.closest(INTERACTIVE);
    if (control && !control.matches(GAME_LINK)) return;
    const scroller = target.closest<HTMLElement>(SCROLLER) ?? undefined;
    if (scroller) {
      // a press on the list's own scrollbar scrolls it
      const b = scroller.getBoundingClientRect();
      if (event.clientX - b.left >= scroller.clientWidth || event.clientY - b.top >= scroller.clientHeight) return;
    }
    const additive = event.shiftKey;
    const base = additive ? [...store.get()] : [];
    const start = { x: event.clientX, y: event.clientY };
    // The start point stays on the content it was pressed on: it follows the pressed element (the League List's
    // virtualizer changes scrollTop by itself to keep its top day in place, so scrollTop alone can't tell how far
    // the content moved), and the scroll offset only once that element is gone (unmounted far off-screen).
    const pressed = target;
    const anchor = { y: start.y, offset: start.y - pressed.getBoundingClientRect().top, scroll: scroller?.scrollTop ?? 0 };
    const startY = () => {
      if (pressed.isConnected) {
        anchor.y = pressed.getBoundingClientRect().top + anchor.offset;
        anchor.scroll = scroller?.scrollTop ?? 0;
        return anchor.y;
      }
      return anchor.y - ((scroller?.scrollTop ?? 0) - anchor.scroll);
    };
    const pointer = { x: start.x, y: start.y };
    const seen = new Map<string, Box>();
    const previousUserSelect = document.body.style.userSelect;
    let drawing = false;
    let frame = 0;

    // One update per frame: auto-scroll, hit-test (all reads), then draw the box (writes).
    function update() {
      frame = 0;
      let step = 0;
      if (scroller) {
        const b = scroller.getBoundingClientRect();
        if (pointer.y < b.top + SCROLL_EDGE) step = -Math.min(MAX_SCROLL_STEP, Math.ceil((b.top + SCROLL_EDGE - pointer.y) / 2));
        else if (pointer.y > b.bottom - SCROLL_EDGE) step = Math.min(MAX_SCROLL_STEP, Math.ceil((pointer.y - b.bottom + SCROLL_EDGE) / 2));
        const before = scroller.scrollTop;
        if (step) scroller.scrollTop = before + step;
        if (scroller.scrollTop === before) step = 0; // at the end: stop
      }
      const y0 = startY();
      const rect = { left: Math.min(start.x, pointer.x), right: Math.max(start.x, pointer.x), top: Math.min(y0, pointer.y), bottom: Math.max(y0, pointer.y) };
      const ids = gamesTouching(area, rect, scroller, seen);
      // drawn inside the list it started in (the part scrolled away isn't on screen)
      const clip = scroller?.getBoundingClientRect();
      const top = clip ? Math.max(rect.top, clip.top) : rect.top;
      const bottom = clip ? Math.min(rect.bottom, clip.bottom) : rect.bottom;
      boxEl!.style.transform = `translate(${rect.left}px, ${top}px)`;
      boxEl!.style.width = `${rect.right - rect.left}px`;
      boxEl!.style.height = `${Math.max(0, bottom - top)}px`;
      store.set(additive ? [...base, ...ids] : ids);
      if (step) schedule(); // keep scrolling while the pointer rests at the edge
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    function handlePointerMove(e: PointerEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!drawing) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < MARQUEE_THRESHOLD) return;
        drawing = true;
        // captured only once it is a drag: a plain click on a game link must reach the link
        area.setPointerCapture(event.pointerId);
        document.body.style.userSelect = 'none'; // no text highlight under the box
        window.getSelection()?.removeAllRanges();
        boxEl!.style.display = 'block';
      }
      schedule();
    }
    // a press on a logo would start the browser's own image drag (and cancel this one)
    const noNativeDrag = (e: DragEvent) => e.preventDefault();
    // wheel-scrolling mid-drag: the content moved under the box
    const handleScroll = () => drawing && schedule();

    function finish() {
      area.removeEventListener('pointermove', handlePointerMove);
      area.removeEventListener('pointerup', handlePointerUp);
      area.removeEventListener('pointercancel', finish);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('dragstart', noNativeDrag, true);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
      document.body.style.userSelect = previousUserSelect;
      boxEl!.style.display = 'none';
    }
    function handlePointerUp() {
      if (drawing && frame) {
        cancelAnimationFrame(frame);
        update(); // the last position counts
      }
      finish();
      if (drawing && pressed.closest(GAME_LINK)) {
        // the click that ends a drag started on a game link must not open it (only that click: the listener goes
        // after this task)
        const swallow = (e: MouseEvent) => {
          if (!(e.target instanceof Node) || !area.contains(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
      if (!drawing && !additive) store.clear();
    }

    area.addEventListener('pointermove', handlePointerMove);
    area.addEventListener('pointerup', handlePointerUp);
    area.addEventListener('pointercancel', finish);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('dragstart', noNativeDrag, true);
  };
}
