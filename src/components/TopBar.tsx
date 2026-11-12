// The shell's own parts of the one-row top bar: the page history's ← →, the ⓘ with the time zone and data stamp, the
// Quick standings icon, and the auto-hide behaviour. The destinations' controls are not here: each destination
// renders its own into the bar's slots (destination.tsx).

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { dateFormat } from '../data/model';
import { STALE_AFTER_MS, type PageHistory } from './calendarState';
import { CLOCK_TICK_EVENT, useClockValue } from './clock';
import { useValue } from './valueStore';

/** "Data updated Oct 23, 08:29" in the viewer's zone; orange with a tooltip once the data is older than 36 h. */
function DataStamp({ updatedAt, now, timeZone }: { updatedAt: string; now: number; timeZone?: string }) {
  const t = Date.parse(updatedAt);
  const valid = !Number.isNaN(t);
  // hooks before the early return (rules of hooks)
  const stale = useClockValue((n) => valid && n - t > STALE_AFTER_MS, now);
  // turns orange when it crosses 36 h: one timeout makes the clock read the time then (it has no minute tick)
  useEffect(() => {
    const left = t + STALE_AFTER_MS - Date.now();
    if (!valid || stale || left <= 0 || left > 2 ** 31 - 1) return;
    const id = setTimeout(() => window.dispatchEvent(new Event(CLOCK_TICK_EVENT)), left + 50);
    return () => clearTimeout(id);
  }, [t, valid, stale]);
  if (!valid) return null;
  const when = dateFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(t);
  const tip = stale ? 'Data is more than 36 hours old: the daily update may have failed.' : undefined;
  return (
    <span className={`ck-stamp${stale ? ' ck-stamp-stale' : ''}`} data-testid="data-updated" data-tip={tip} tabIndex={stale ? 0 : undefined}>
      Data updated {when}
    </span>
  );
}

/**
 * The page history's ← →, at the far left of the top bar — long arrows in one joined pill, unlike the
 * date block's round ‹ › (a day); greyed out when there is nothing there; the tooltip names the page.
 */
export function PageArrows({ h: { labels, onBack, onForward } }: { h: PageHistory }) {
  const h = { ...useValue(labels), onBack, onForward };
  return (
    <span className="ck-hist" role="group" aria-label="Page history" data-testid="page-history">
      <button type="button" className="ck-hist-btn" aria-label={h.back ? `Back to ${h.back}` : 'Back'} title={h.back ? `Back to ${h.back}` : 'Nothing to go back to'} disabled={!h.back} onClick={h.onBack} data-testid="page-back">
        ←
      </button>
      <button type="button" className="ck-hist-btn" aria-label={h.forward ? `Forward to ${h.forward}` : 'Forward'} title={h.forward ? `Forward to ${h.forward}` : 'Nothing to go forward to'} disabled={!h.forward} onClick={h.onForward} data-testid="page-forward">
        →
      </button>
    </span>
  );
}

/** Ⓘ — the time zone, the data stamp (orange once it is 36 h old) and, on the Cup, the stage, in its tooltip. */
export function BarInfo({ note, updatedAt, now, timeZone, extra }: { note: string; updatedAt?: string; now: number; timeZone?: string; extra?: string }) {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  const stale = useClockValue((n) => !Number.isNaN(t) && n - t > STALE_AFTER_MS, now);
  const when = Number.isNaN(t) ? undefined : dateFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(t);
  const tip = [note, when && `Data updated ${when}${stale ? ' — more than 36 hours old: the daily update may have failed' : ''}`, extra].filter(Boolean).join('\n');
  return (
    <span className={`ck-info${stale ? ' ck-info-stale' : ''}`} data-testid="bar-info" data-tip={tip} aria-label={tip} role="img" tabIndex={0}>
      i
      <span className="ck-sr">
        <span className="ck-note" data-testid="tz-note">
          {note}
        </span>
        {updatedAt && <DataStamp updatedAt={updatedAt} now={now} timeZone={timeZone} />}
      </span>
    </span>
  );
}

/** A small table: the Quick standings button's icon. */
export const StandingsIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M2 2.5h12v2H2zM2 6.5h12v1.6H2zM2 10h12v1.6H2zM2 13.4h12V15H2z" opacity=".95" />
    <path fill="currentColor" d="M5.2 6.5h1.2V15H5.2z" opacity=".55" />
  </svg>
);

/**
 * The top bar hides while a list (League / Team List, Slate) is scrolled down by the person (wheel or
 * keys — not a jump to a row, a restore or a script) and comes back on a scroll up, at the top, or with the pointer at
 * the top edge. No React render: a class on the root (`ck-bar-hidden`, the bar out of the layout); the scroller is moved
 * by the bar's height at the same time, so the rows on screen stay exactly where they were (no jump) and the list gains
 * the bar's height. Off in other views (nothing scrolls) and on phones.
 */
export function useAutoHideBar(root: RefObject<HTMLDivElement | null>, bar: RefObject<HTMLDivElement | null>, enabled: boolean, page: string) {
  const s = useRef({ input: -Infinity, last: new WeakMap<HTMLElement, number>(), run: 0, skip: null as HTMLElement | null, hidden: false, scroller: null as HTMLElement | null });
  const set = useCallback(
    (hide: boolean, el?: HTMLElement) => {
      const r = root.current;
      const b = bar.current;
      const st = s.current;
      if (!r || !b || st.hidden === hide) return;
      // the bar's height with its margin, measured while it is shown (before hiding it, after showing it)
      const height = () => b.getBoundingClientRect().height + parseFloat(getComputedStyle(b).marginBottom || '0');
      const sc = el ?? st.scroller;
      const was = hide ? height() : 0;
      st.hidden = hide;
      r.classList.toggle('ck-bar-hidden', hide);
      const h = hide ? was : height();
      // keep the rows in place: the scroller moved up (or down) by the bar's height
      if (sc && sc.isConnected) {
        const before = sc.scrollTop;
        sc.scrollTop = Math.max(0, before + (hide ? -h : h));
        st.skip = sc;
        st.last.set(sc, sc.scrollTop);
      }
      st.scroller = sc ?? null;
      st.run = 0;
    },
    [root, bar],
  );
  // a new page, or the view can't scroll: the bar is back
  useLayoutEffect(() => {
    if (s.current.hidden) set(false);
  }, [page, enabled, set]);
  // the pointer at the window's top edge (above the widget too) brings it back
  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      const r = root.current;
      if (s.current.hidden && r && e.clientY - Math.max(0, r.getBoundingClientRect().top) < 12) set(false);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [enabled, root, set]);
  return {
    onInput: (e: { type: string; key?: string }) => {
      if (e.type !== 'keydown' || /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key ?? '')) s.current.input = performance.now();
    },
    onScroll: (el: HTMLElement) => {
      const st = s.current;
      if (!enabled || !(el instanceof HTMLElement) || el.closest('.ck-popover, [role="dialog"], [role="listbox"], .ck-capture-stage')) return;
      const top = el.scrollTop;
      const prev = st.last.get(el) ?? 0; // a scroller not seen yet started at its top
      st.last.set(el, top);
      if (st.skip === el) return void (st.skip = null);
      if (top <= 2) return set(false, el);
      // only the person's own scrolling (a wheel or a key in the last 400 ms) hides or shows it
      if (performance.now() - st.input > 400) return;
      const d = top - prev;
      st.run = Math.sign(d) === Math.sign(st.run) ? st.run + d : d;
      // (not at the very end: no room left there to keep the rows in place)
      if (st.run > 24 && top > 60 && el.scrollHeight - el.clientHeight - top > 120) set(true, el);
      else if (st.run < -24) set(false, el);
    },
  };
}
