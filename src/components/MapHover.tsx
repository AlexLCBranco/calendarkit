// The game hovered or pinned in the League List / Team List or on its map, shared by both. Hover: a value store
// ("list:<id>" / "map:<id>", "" for none). The list side reads it here without re-rendering the list: the hovered row
// gets a class (an outline — no layout shift), and when the hover comes from the map, the row is scrolled into view if
// it's off screen on a busy night. Pin: a second store (the game id, "" for none) — a click on a row or a dot pins its
// game (the map keeps showing it while the pointer moves away); a click on it again, Esc, a click on the empty map or
// another day unpins. The pinned row is marked by a style rule (survives the League List's virtualizer remounting rows).
// The maps (src/map/LeagueMap.tsx, TeamMap.tsx) read the same stores.

import { useEffect, useLayoutEffect, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { ValueStore } from './valueStore';

/** The rows that link to a map: the League List's and the Team List's games. */
const ROWS = '[data-testid="league-list"] .ck-card[data-game-id], [data-testid="team-list"] .ck-card[data-game-id]';
/** Controls inside a row or the map that keep their own click (no pin). */
const OWN_CLICK = 'a, button, input, select, textarea, label, [role="button"]';

/** The hovered row's class; lifted in images (styles: `.ck-capturing .ck-map-hot`). */
export const MAP_HOT = 'ck-map-hot';

export type HoverSource = 'list' | 'map';
export const hoverKey = (from: HoverSource, id: string) => `${from}:${id}`;
export const parseHover = (v: string): { from: HoverSource; id: string } | undefined => {
  const i = v.indexOf(':');
  return i < 0 ? undefined : { from: v.slice(0, i) as HoverSource, id: v.slice(i + 1) };
};

/** Where the last press started: a click after a marquee drag (≥ 4 px) pins nothing. */
let down: { x: number; y: number } | undefined;

/**
 * Pointer handlers for the list + map area: a row or a dot under the pointer is the hovered game; elsewhere none —
 * except on the map itself after a dot: the view zooms and the dot moves away from the pointer, so the map keeps that
 * game until the pointer leaves the map or finds another game. Clicks pin / unpin (`pin`).
 */
export function hoverHandlers(store: ValueStore<string>, pin?: ValueStore<string>) {
  return {
    onPointerOver(e: PointerEvent) {
      const t = e.target as Element;
      const row = t.closest<HTMLElement>(ROWS);
      const dot = row ? null : t.closest<HTMLElement>('[data-map-game]');
      if (!row && !dot && t.closest('.ck-map-box') && parseHover(store.get())?.from === 'map') return;
      store.set(row ? hoverKey('list', row.dataset.gameId!) : dot ? hoverKey('map', dot.dataset.mapGame!) : '');
    },
    onPointerLeave() {
      store.set('');
    },
    onPointerDown(e: PointerEvent) {
      down = { x: e.clientX, y: e.clientY };
    },
    onClick(e: MouseEvent) {
      if (!pin || e.button !== 0) return;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 4) return;
      const t = e.target as Element;
      if (t.closest(OWN_CLICK)) return;
      const row = t.closest<HTMLElement>(ROWS);
      const dot = row ? null : t.closest<HTMLElement>('[data-map-game]');
      const id = row?.dataset.gameId ?? dot?.dataset.mapGame;
      if (id) pin.set(pin.get() === id ? '' : id);
      else if (t.closest('.ck-map-box')) pin.set('');
    },
  };
}

/** Puts MAP_HOT on the hovered game's row inside `root`, and scrolls it into view when the map asked. */
export function useHoverRow(store: ValueStore<string>, root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    let lit: HTMLElement | null = null;
    const apply = () => {
      const h = parseHover(store.get());
      const row = h ? root.current?.querySelector<HTMLElement>(ROWS.split(', ').map((s) => s.replace('[data-game-id]', `[data-game-id="${h.id}"]`)).join(', ')) ?? null : null;
      if (lit !== row) {
        lit?.classList.remove(MAP_HOT);
        row?.classList.add(MAP_HOT);
        lit = row;
      }
      if (row && h!.from === 'map') {
        const list = row.closest<HTMLElement>('[data-testid="league-list"], [data-testid="team-list"]')!;
        const r = row.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        if (r.top < l.top || r.bottom > l.bottom) row.scrollIntoView({ block: 'nearest' });
      }
    };
    apply();
    const off = store.subscribe(apply);
    // a marquee drag holds the pointer (on the views' content area): after it, Chrome sends the list + map area no
    // leave event, the hover stuck on a row. Any pointerover outside that area clears it (fires on element changes only)
    const outside = (e: Event) => {
      if (store.get() && !(e.target as Element).closest?.('.ck-league-split')) store.set('');
    };
    document.addEventListener('pointerover', outside, true);
    return () => {
      off();
      document.removeEventListener('pointerover', outside, true);
      lit?.classList.remove(MAP_HOT);
    };
  }, [store, root]);
}

/** The pinned row's look (layout.css `.ck-map-pinned` as a rule on its id), and Esc to unpin. */
export function usePinRow(pin: ValueStore<string>) {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.mapPin = '';
    document.head.appendChild(style);
    const apply = () => {
      const id = pin.get().replace(/[^\w-]/g, '');
      style.textContent = id ? `.ck-league-split .ck-card[data-game-id="${id}"]:not(.ck-capturing) { box-shadow: inset 4px 0 0 #5ec8ff, inset 0 0 0 2px #5ec8ff; background-image: linear-gradient(rgba(94, 200, 255, 0.1), rgba(94, 200, 255, 0.1)); } .ck-league-split .ck-capturing .ck-card[data-game-id="${id}"] { box-shadow: none; background-image: none; }` : '';
      document.documentElement.toggleAttribute('data-map-pinned', !!id);
    };
    apply();
    const off = pin.subscribe(apply);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pin.get()) pin.set('');
    };
    addEventListener('keydown', onKey);
    return () => {
      off();
      removeEventListener('keydown', onKey);
      style.remove();
      document.documentElement.removeAttribute('data-map-pinned');
    };
  }, [pin]);
}

/** A new day (or view): nothing hovered, nothing pinned. */
export function useClearHover(store: ValueStore<string>, key: string, pin?: ValueStore<string>) {
  useEffect(() => {
    store.set('');
    pin?.set('');
  }, [store, key, pin]);
}
