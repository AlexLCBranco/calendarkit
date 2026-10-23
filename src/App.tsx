// Standalone app shell: loads the schedule, sizes the widget to the window, keeps view state in the URL, and
// handles onOpenGame by opening rotationkit. Everything else lives in the self-contained components.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CalendarView, type CalendarState } from './components/CalendarView';
import { isRotationkitConfigured } from './config';
import { loadCalendarData } from './data/load';
import type { CalendarData } from './data/model';
import { TEAMS, TEAM_BY_ID } from './data/teams';
import { rotationkitUrl } from './rotationkit';

/** Shell's handling of GameCard's "open game" action: the rotationkit deep link in a new tab. */
export function openGameInRotationkit(gameId: string, open: (url: string) => void = (url) => window.open(url, '_blank', 'noopener')) {
  open(rotationkitUrl(gameId));
}

function readUrlState(): Partial<CalendarState> {
  const p = new URLSearchParams(window.location.search);
  const team = TEAMS.find((t) => t.tricode === p.get('team')?.toUpperCase());
  return {
    mode: p.get('view') === 'team' ? 'team' : p.get('view') === 'league' ? 'league' : undefined,
    teamId: team?.id,
    date: p.get('date') ?? undefined,
    tvOnly: p.get('tv') === '1' ? true : undefined,
  };
}

function writeUrlState(s: CalendarState) {
  const p = new URLSearchParams();
  p.set('view', s.mode);
  if (s.mode === 'team') p.set('team', TEAM_BY_ID.get(s.teamId)?.tricode ?? '');
  else {
    p.set('date', s.date);
    if (s.tvOnly) p.set('tv', '1');
  }
  window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
}

/** Page content width cap (app.css `.app` max-width minus its padding): ~40 px side margins at a 1920 px window. */
export const MAX_CONTENT_WIDTH = 1840;

/**
 * The widget's size = the app's real content box (not window.innerWidth, which includes the scrollbar), so the
 * month view's column maths matches the cells it renders. Measured before paint, then on every resize.
 */
function useContentSize(ref: RefObject<HTMLElement | null>) {
  const fallback = () => ({ width: Math.min(document.documentElement.clientWidth - 32, MAX_CONTENT_WIDTH), height: window.innerHeight });
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    const measure = () => {
      if (!el) return setSize(fallback());
      const cs = getComputedStyle(el);
      const width = Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      setSize((s) => (s.width === width && s.height === window.innerHeight ? s : { width, height: window.innerHeight }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !el) {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

export function App() {
  const [data, setData] = useState<CalendarData>();
  const [error, setError] = useState<string>();
  const appRef = useRef<HTMLDivElement>(null);
  const size = useContentSize(appRef);
  const [initial] = useState(readUrlState);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // No handler while rotationkit has no URL: GameCard only offers the action when onOpenGame is given.
  const onOpenGame = isRotationkitConfigured() ? (id: string) => openGameInRotationkit(id) : undefined;

  useEffect(() => {
    loadCalendarData().then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="app" ref={appRef}>
      <header className="app-header">
        <h1 className="app-title">NBA schedule {data && <span className="app-tz">{data.seasonYear}</span>}</h1>
        <span className="app-tz">Times in your time zone ({timeZone})</span>
      </header>
      {error && <p className="app-status" role="alert">Couldn’t load the schedule: {error}</p>}
      {!data && !error && <p className="app-status">Loading schedule…</p>}
      {data && <CalendarView data={data} size={size} initial={initial} onOpenGame={onOpenGame} onStateChange={writeUrlState} />}
    </div>
  );
}
