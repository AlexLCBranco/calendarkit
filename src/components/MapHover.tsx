// Round 8 (3.1, 3.4): the game hovered in the League List or on its map, shared by both: a value store ("list:<id>" /
// "map:<id>", "" for none). The list side reads it here without re-rendering the list: the hovered row gets a class
// (an outline — no layout shift), and when the hover comes from the map, the row is scrolled into view if it's off
// screen on a busy night. The map (src/map/LeagueMap.tsx) reads the same store.

import { useEffect, useLayoutEffect, type PointerEvent, type RefObject } from 'react';
import type { ValueStore } from './valueStore';

/** The hovered row's class; lifted in images (styles: `.ck-capturing .ck-map-hot`). */
export const MAP_HOT = 'ck-map-hot';

export type HoverSource = 'list' | 'map';
export const hoverKey = (from: HoverSource, id: string) => `${from}:${id}`;
export const parseHover = (v: string): { from: HoverSource; id: string } | undefined => {
  const i = v.indexOf(':');
  return i < 0 ? undefined : { from: v.slice(0, i) as HoverSource, id: v.slice(i + 1) };
};

/** Pointer handlers for the list + map area: a row or a dot under the pointer is the hovered game; elsewhere none. */
export function hoverHandlers(store: ValueStore<string>) {
  return {
    onPointerOver(e: PointerEvent) {
      const t = e.target as Element;
      const row = t.closest<HTMLElement>('[data-testid="league-list"] .ck-card[data-game-id]');
      const dot = row ? null : t.closest<HTMLElement>('[data-map-game]');
      store.set(row ? hoverKey('list', row.dataset.gameId!) : dot ? hoverKey('map', dot.dataset.mapGame!) : '');
    },
    onPointerLeave() {
      store.set('');
    },
  };
}

/** Puts MAP_HOT on the hovered game's row inside `root`, and scrolls it into view when the map asked. */
export function useHoverRow(store: ValueStore<string>, root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    let lit: HTMLElement | null = null;
    const apply = () => {
      const h = parseHover(store.get());
      const row = h ? root.current?.querySelector<HTMLElement>(`[data-testid="league-list"] .ck-card[data-game-id="${h.id}"]`) ?? null : null;
      if (lit !== row) {
        lit?.classList.remove(MAP_HOT);
        row?.classList.add(MAP_HOT);
        lit = row;
      }
      if (row && h!.from === 'map') {
        const list = row.closest<HTMLElement>('[data-testid="league-list"]')!;
        const r = row.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        if (r.top < l.top || r.bottom > l.bottom) row.scrollIntoView({ block: 'nearest' });
      }
    };
    apply();
    const off = store.subscribe(apply);
    return () => {
      off();
      lit?.classList.remove(MAP_HOT);
    };
  }, [store, root]);
}

/** A new day (or view): nothing hovered. */
export function useClearHover(store: ValueStore<string>, key: string) {
  useEffect(() => store.set(''), [store, key]);
}
