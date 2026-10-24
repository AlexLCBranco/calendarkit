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

/**
 * URL: ?view=league|team&layout=list|calendar&team=&date=&weeks=2&tv=1 (weeks: League → Calendar rows). Links from before the List | Calendar switch have
 * no layout: ?view=team opened the team month grid (→ Calendar), ?view=league the day list (→ List).
 */
export function readUrlState(search = window.location.search): Partial<CalendarState> {
  const p = new URLSearchParams(search);
  const team = TEAMS.find((t) => t.tricode === p.get('team')?.toUpperCase());
  const view = p.get('view');
  const layout = p.get('layout');
  return {
    mode: view === 'team' ? 'team' : view === 'league' ? 'league' : undefined,
    layout: layout === 'list' || layout === 'calendar' ? layout : view === 'team' ? 'calendar' : undefined,
    teamId: team?.id,
    date: p.get('date') ?? undefined,
    tvOnly: p.get('tv') === '1' ? true : undefined,
    weeks: p.get('weeks') === '2' ? 2 : p.get('weeks') === '1' ? 1 : undefined,
  };
}

function writeUrlState(s: CalendarState) {
  const p = new URLSearchParams();
  p.set('view', s.mode);
  p.set('layout', s.layout);
  if (s.mode === 'team') p.set('team', TEAM_BY_ID.get(s.teamId)?.tricode ?? '');
  else p.set('date', s.date);
  if (s.weeks === 2) p.set('weeks', '2');
  if (s.tvOnly) p.set('tv', '1');
  window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
}

/** Page content width cap (app.css `.app` max-width minus its padding): ~40 px side margins at a 1920 px window. */
export const MAX_CONTENT_WIDTH = 1840;

/** Smallest widget height the shell passes (list layouts scroll inside it). */
const MIN_WIDGET_HEIGHT = 360;

/**
 * The widget's size = the app's real content box (not window.innerWidth, which includes the scrollbar), so the
 * month view's column maths matches the cells it renders; height = the window below the widget's top, so the list
 * layouts fill the screen and scroll inside. Measured before paint, then on every resize.
 */
function useContentSize(ref: RefObject<HTMLElement | null>, widgetRef: RefObject<HTMLElement | null>) {
  const fallback = () => ({ width: Math.min(document.documentElement.clientWidth - 32, MAX_CONTENT_WIDTH), height: window.innerHeight });
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    const measure = () => {
      if (!el) return setSize(fallback());
      const cs = getComputedStyle(el);
      const width = Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      const top = (widgetRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
      const height = Math.max(MIN_WIDGET_HEIGHT, Math.floor(window.innerHeight - top - parseFloat(cs.paddingBottom)));
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' || !el ? undefined : new ResizeObserver(measure);
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);
  return size;
}

export function App() {
  const [data, setData] = useState<CalendarData>();
  const [error, setError] = useState<string>();
  const appRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const size = useContentSize(appRef, widgetRef);
  const [initial] = useState(readUrlState);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // No handler while rotationkit has no URL: GameCard only offers the action when onOpenGame is given.
  const onOpenGame = isRotationkitConfigured() ? (id: string) => openGameInRotationkit(id) : undefined;

  const load = () => {
    setError(undefined);
    loadCalendarData().then(setData, (e: Error) => setError(e.message));
  };
  useEffect(load, []);

  return (
    <div className="app" ref={appRef}>
      {error && (
        <div className="app-status">
          <p role="alert">Couldn’t load the schedule: {error}</p>
          <button type="button" className="app-retry" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <p className="app-status">Loading schedule…</p>}
      <div ref={widgetRef}>
        {data && (
          <CalendarView
            data={data}
            size={size}
            initial={initial}
            onOpenGame={onOpenGame}
            onStateChange={writeUrlState}
            title={`NBA schedule ${data.seasonYear}`}
            note={`Times in your time zone (${timeZone})`}
            updatedAt={data.updatedAt}
          />
        )}
      </div>
    </div>
  );
}
