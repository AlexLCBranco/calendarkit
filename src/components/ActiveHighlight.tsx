// The lists' active-day highlight (round 4): a faint accent band with a thin accent bar on the left, over the active
// day's rows. Two overlay layers in the scroller crossfade (opacity only, 150 ms) when the day changes, so the fade runs
// on the compositor: fading the rows' own background and shadow repainted them every frame of the fade and cost the
// League List scroll ~30 % more main-thread time (PROJECT.md). Outside the rows, so never part of a copied row or day.

import { useRef } from 'react';

export interface ActiveBox {
  /** What is highlighted (a date): a new key crossfades, the same key just follows its box. */
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The two overlay layers (rendered inside the scroller, after the rows) and `show`, which moves the highlight. */
export function useActiveHighlight() {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const state = useRef<{ cur: 0 | 1; key: string; box: string }>({ cur: 0, key: '', box: '' });
  const place = (el: HTMLDivElement, box: ActiveBox) => {
    el.style.transform = `translate(${box.left}px, ${box.top}px)`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
  };
  /** Moves the highlight to `box` (or hides it); writes only when something changed. */
  const show = (box: ActiveBox | undefined) => {
    const s = state.current;
    const els = [a.current, b.current];
    if (!els[0] || !els[1]) return;
    const geo = box ? `${box.top}|${box.left}|${box.width}|${box.height}` : '';
    if ((box?.key ?? '') === s.key && geo === s.box) return;
    if (box && box.key === s.key) {
      place(els[s.cur]!, box); // same day, new geometry (re-measured): follow without a fade
    } else {
      // crossfade: the shown layer fades out where it is, the other one appears at the new day and fades in
      els[s.cur]!.classList.remove('ck-hl-on');
      if (box) {
        const next = (1 - s.cur) as 0 | 1;
        place(els[next]!, box);
        els[next]!.classList.add('ck-hl-on');
        s.cur = next;
      }
    }
    s.key = box?.key ?? '';
    s.box = geo;
  };
  const layers = (
    <>
      <div ref={a} className="ck-hl" aria-hidden="true" data-capture-exclude="true" />
      <div ref={b} className="ck-hl" aria-hidden="true" data-capture-exclude="true" />
    </>
  );
  return { layers, show };
}
