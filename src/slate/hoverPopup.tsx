// The widget's hover popup, from the season-series popup: opens over an element carrying
// `attr`, below it (above when there is no room), stays open while the pointer is on the element or on the popup — so
// its rows can be clicked —, closes POPUP_GRACE_MS after the pointer leaves (the trip into the popup), and on Escape;
// never in a copied image (data-capture-exclude). It starts no timer at rest. The series popup and the streak popup
// both use it. Whether it is open is kept in a ref as well as in state: a fast sweep fires the next mouseover before
// React re-renders, and a handler reading only the state saw "closed" and never scheduled the close (a stuck popup).
// One popup at a time across every hook (popupGate).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { claimPopup, POPUP_GRACE_MS, releasePopup } from './popupGate';
import { clampX } from './tooltip';

export const POPUP_CLOSE_MS = POPUP_GRACE_MS;

export function useHoverPopup(attr: string, render: (value: string, close: () => void) => ReactNode, box: { className: string; label: string; testId: string }) {
  const [open, setOpen] = useState<{ value: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isOpen = useRef(false);
  const [close] = useState(() => {
    const c = () => {
      clearTimeout(closer.current);
      if (!isOpen.current) return;
      isOpen.current = false;
      releasePopup(c);
      setOpen(undefined);
    };
    return c;
  });
  const keep = () => clearTimeout(closer.current);
  const later = () => {
    keep();
    if (isOpen.current) closer.current = setTimeout(close, POPUP_GRACE_MS);
  };
  const over = (e: SyntheticEvent) => {
    const t = e.target as Element;
    if (ref.current?.contains(t)) return keep();
    const el = t.closest?.(`[${attr}]`);
    if (!el) return later();
    keep();
    claimPopup(close);
    isOpen.current = true;
    const r = el.getBoundingClientRect();
    const value = el.getAttribute(attr)!;
    setOpen((o) => (o && o.value === value && o.top === r.top && o.x === r.left + r.width / 2 ? o : { value, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    el.style.left = `${clampX(open.x - el.offsetWidth / 2, el.offsetWidth)}px`;
    const below = open.bottom + 6;
    el.style.top = `${below + el.offsetHeight <= window.innerHeight - 4 ? below : Math.max(4, open.top - el.offsetHeight - 6)}px`;
  });
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, close]);
  useEffect(() => close, [close]);
  const content = open ? render(open.value, close) : null;
  return {
    handlers: {
      onMouseOver: over,
      onFocus: (e: SyntheticEvent) => ((e.target as Element).closest?.(`[${attr}]`) || ref.current?.contains(e.target as Node) ? over(e) : undefined),
      onMouseLeave: later,
    },
    node: content && (
      <div ref={ref} className={box.className} role="dialog" aria-label={box.label} data-testid={box.testId} data-capture-exclude="true" onMouseEnter={keep} onMouseLeave={later}>
        {content}
      </div>
    ),
  };
}
