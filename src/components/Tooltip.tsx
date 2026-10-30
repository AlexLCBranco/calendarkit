// One floating tooltip per widget for every [data-tip] element (hover + keyboard focus).

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { clampX } from './widget';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND = { g: 'game', r: 'rest', t: 'tonight' } as const;

/**
 * Round 6: a day strip under the text, from `data-tip-days` ("YYYY-MM-DD:g|r|t" joined by spaces — a game, a rest day,
 * tonight; scheduleTags mergedDays): one cell per day, filled on game days, empty on rest days, tonight highlighted, the
 * day of the month under each cell and the month under the first cell and the 1st.
 */
function DayStrip({ days }: { days: string }) {
  const cells = days.split(' ').map((d) => ({ date: d.slice(0, 10), kind: KIND[d.slice(11) as keyof typeof KIND] ?? 'rest' }));
  return (
    <div className="ck-tip-days" data-testid="tip-days">
      {cells.map(({ date, kind }, i) => {
        const day = Number(date.slice(8, 10));
        return (
          <span key={date} className={`ck-tip-day ck-tip-${kind}`} data-date={date} data-kind={kind}>
            <i />
            <span className="ck-tip-num">{i === 0 || day === 1 ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${day}` : day}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * One floating tooltip for every `[data-tip]` element in the widget, shown on hover and keyboard focus. Fixed
 * positioning, so cells with overflow: hidden don't clip it, and clamped into the viewport.
 */
export function useTooltip() {
  const [tip, setTip] = useState<{ text: string; days?: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: SyntheticEvent) => {
    const el = (e.target as Element).closest?.('[data-tip]');
    if (!el) return setTip(undefined);
    const r = el.getBoundingClientRect();
    const text = el.getAttribute('data-tip')!;
    const days = el.getAttribute('data-tip-days') ?? undefined;
    setTip((t) => (t && t.text === text && t.days === days && t.x === r.left + r.width / 2 && t.top === r.top ? t : { text, days, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
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
        {tip.days && <DayStrip days={tip.days} />}
      </div>
    ),
  };
}
