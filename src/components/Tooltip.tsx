// One floating tooltip per widget for every [data-tip] element (hover + keyboard focus).

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { clampX } from './widget';

/**
 * One floating tooltip for every `[data-tip]` element in the widget, shown on hover and keyboard focus. Fixed
 * positioning, so cells with overflow: hidden don't clip it, and clamped into the viewport.
 */
export function useTooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: SyntheticEvent) => {
    const el = (e.target as Element).closest?.('[data-tip]');
    if (!el) return setTip(undefined);
    const r = el.getBoundingClientRect();
    const text = el.getAttribute('data-tip')!;
    setTip((t) => (t && t.text === text && t.x === r.left + r.width / 2 && t.top === r.top ? t : { text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
  };
  const hide = () => setTip(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    el.style.left = `${clampX(tip.x - el.offsetWidth / 2, el.offsetWidth)}px`;
    const above = tip.top - el.offsetHeight - 6;
    el.style.top = `${above >= 4 ? above : tip.bottom + 6}px`;
  });
  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);
  return {
    handlers: { onMouseOver: show, onFocus: show, onMouseLeave: hide, onBlur: hide },
    node: tip && (
      <div ref={ref} className="ck-tooltip" role="tooltip" data-testid="tooltip">
        {tip.text}
      </div>
    ),
  };
}
