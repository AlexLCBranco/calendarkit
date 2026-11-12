// The shell's own parts of the top bar: the page history's ← →, the ⓘ with the time zone and data stamp, the Quick
// standings icon. The destinations' controls are not here: each destination renders its own into the bar's slots
// (destination.tsx); the menu's two variants are in Menu.tsx.

import { useEffect, type ReactNode } from 'react';
import { dateFormat } from '../data/model';
import { STALE_AFTER_MS, type PageHistory } from './calendarState';
import { CLOCK_TICK_EVENT, useClockValue } from './clock';
import { PopoverButton } from './Popover';
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

/**
 * ⓘ — a button with a popover: the time zone, the data stamp (orange once it is 36 h old), then what the destination
 * adds (the Cup's stage, the League List's legend) and the temporary menu switch. Its plain title has the first two.
 */
export function BarInfo({ note, updatedAt, now, timeZone, children }: { note: string; updatedAt?: string; now: number; timeZone?: string; children?: ReactNode }) {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  const stale = useClockValue((n) => !Number.isNaN(t) && n - t > STALE_AFTER_MS, now);
  const when = Number.isNaN(t) ? undefined : dateFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(t);
  const staleText = ' — more than 36 hours old: the daily update may have failed';
  const tip = [note, when && `Data updated ${when}${stale ? staleText : ''}`].filter(Boolean).join('\n');
  return (
    <PopoverButton
      label="About this page"
      testId="bar-info"
      buttonClass={` ck-info-button${stale ? ' ck-info-stale' : ''}`}
      title={tip}
      className=" ck-info-wrap"
      popClass=" ck-info-pop"
      icon={
        <>
          <span className="ck-info" aria-hidden="true">
            i
          </span>
          <span className="ck-sr">
            <span className="ck-note" data-testid="tz-note">
              {note}
            </span>
            {updatedAt && <DataStamp updatedAt={updatedAt} now={now} timeZone={timeZone} />}
          </span>
        </>
      }
    >
      <div className="ck-info-lines">
        <span>{note}</span>
        {when && <span className={stale ? 'ck-info-stale-line' : undefined}>Data updated {when}{stale ? staleText : ''}</span>}
      </div>
      {children}
    </PopoverButton>
  );
}

/** A small table: the Quick standings button's icon. */
export const StandingsIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M2 2.5h12v2H2zM2 6.5h12v1.6H2zM2 10h12v1.6H2zM2 13.4h12V15H2z" opacity=".95" />
    <path fill="currentColor" d="M5.2 6.5h1.2V15H5.2z" opacity=".55" />
  </svg>
);
