// Standalone app shell: loads the schedule, sizes the widget to the window, keeps view state in the URL, and
// handles onOpenGame by opening rotationkit and gives the widgets the game-page URL rule (gameLink: hoopsjunkie). Everything else lives in the self-contained components.

import { liveOddsStore } from './slate/odds';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CalendarView, type CalendarHandle, type CalendarState, type CupState, type PageHistory, type PageHistoryLabels, type TeamTarget, type ViewSnapshot } from './components/CalendarView';
import { createValueStore } from './components/valueStore';
import { gameLinkUrl, isGameLinkConfigured, isRotationkitConfigured } from './config';
import { BUILD_INFO } from './build-info';
import { SiteVersion } from './SiteVersion';
import { loadCalendarData } from './data/load';
import type { CalendarData } from './data/model';
import { TEAMS, TEAM_BY_ID } from './data/teams';
import { rotationkitUrl } from './rotationkit';

/** Shell's handling of GameCard's "open game" action: the rotationkit deep link in a new tab. */
export function openGameInRotationkit(gameId: string, open: (url: string) => void = (url) => window.open(url, '_blank', 'noopener')) {
  open(rotationkitUrl(gameId));
}

/** The widgets' game links (the matchup is an <a>): the hoopsjunkie URL rule, or none when not configured. */
export const appGameLink = isGameLinkConfigured() ? (g: Parameters<typeof gameLinkUrl>[0]) => gameLinkUrl(g) : undefined;

/**
 * URL: ?view=league|team|cup|standings&layout=list|calendar|slate&team=&weeks=2&span=1w|2w&tv=1 (no date; weeks: League → Calendar rows; span:
 * Team → Calendar weeks, none = month). Links from before the List | Calendar switch have no layout: ?view=team opened the
 * team month grid (→ Calendar), ?view=league the day list (→ List). "Show rest days" is not in it (on at
 * every load, unchecking lasts until a reload; an old link's `rest=` is ignored).
 */
export function readUrlState(search = window.location.search): Partial<CalendarState> & { teamDate?: string; cup?: Partial<CupState> } {
  const p = new URLSearchParams(search);
  const cupTeam = TEAMS.find((t) => t.tricode === p.get('ct')?.toUpperCase());
  const team = TEAMS.find((t) => t.tricode === p.get('team')?.toUpperCase());
  const view = p.get('view');
  const layout = p.get('layout');
  return {
    mode: view === 'team' ? 'team' : view === 'league' ? 'league' : view === 'cup' ? 'cup' : view === 'standings' ? 'standings' : undefined,
    layout: layout === 'list' || layout === 'calendar' || layout === 'slate' ? layout : view === 'team' ? 'calendar' : undefined,
    teamId: team?.id,
    date: p.get('date') ?? undefined,
    tvOnly: p.get('tv') === '1' ? true : undefined,
    teamSpan: p.get('span') === '1w' ? 1 : p.get('span') === '2w' ? 2 : undefined,
    weeks: p.get('weeks') === '2' ? 2 : p.get('weeks') === '1' ? 1 : undefined,
    teamDate: /^\d{4}-\d{2}-\d{2}$/.test(p.get('on') ?? '') ? p.get('on')! : undefined,
    // The Cup's sub-view
    cup: view === 'cup' ? { tab: p.get('cup') === 'schedule' ? 'schedule' : p.get('cup') === 'simulator' ? 'simulator' : p.get('cup') === 'history' ? 'history' : 'standings', hs: /^\d{4}$/.test(p.get('hs') ?? '') ? Number(p.get('hs')) : undefined, list: p.get('cl') === 'team' ? 'team' : 'league', by: p.get('by') === 'date' ? 'date' : 'group', teamId: cupTeam?.id } : undefined,
  };
}

/**
 * A team link's URL — that team's Team view in the last-used Team mode, the other toggles as now, and
 * `on=` the date being looked at. `on` is read once at load (the Team view opens there) and dropped from the address
 * then, so a reload opens on today as always.
 */
export function teamLinkUrl({ teamId, layout, date, state }: TeamTarget, pathname = window.location.pathname): string {
  const p = new URLSearchParams();
  p.set('view', 'team');
  p.set('layout', layout);
  p.set('team', TEAM_BY_ID.get(teamId)?.tricode ?? '');
  if (state.weeks === 2) p.set('weeks', '2');
  if (state.tvOnly) p.set('tv', '1');
  if (state.teamSpan !== 'month') p.set('span', `${state.teamSpan}w`);
  p.set('on', date);
  return `${pathname}?${p}`;
}

/**
 * End-to-end tests only: the day to open on, set by e2e/fixtures.ts before the page loads (`window.__ckOpenDate`), so a
 * test can start on a given day although the URL's date is ignored. Nothing in the app sets it.
 */
const e2eOpenDate = () => (window as { __ckOpenDate?: unknown }).__ckOpenDate as string | undefined;

/**
 * A page's address — the view, the team, the date looked at (`date=`: written for the record, but a
 * load still opens on today), the options, and the Cup's sub-view (`cup=`, `cl=`, `by=`, `ct=`).
 */
export function urlOf(snap: ViewSnapshot, pathname = window.location.pathname): string {
  const s = snap.state;
  const p = new URLSearchParams();
  const schedule = s.mode !== 'cup' && s.mode !== 'standings';
  p.set('view', s.mode);
  if (schedule) p.set('layout', s.layout);
  if (s.mode === 'team') p.set('team', TEAM_BY_ID.get(s.teamId)?.tricode ?? '');
  if (schedule) p.set('date', snap.at);
  if (s.weeks === 2) p.set('weeks', '2');
  if (s.tvOnly) p.set('tv', '1');
  if (s.teamSpan !== 'month') p.set('span', `${s.teamSpan}w`);
  if (s.mode === 'cup') {
    p.set('cup', snap.cup.tab);
    if (snap.cup.tab === 'history' && snap.cup.hs) p.set('hs', String(snap.cup.hs));
    if (snap.cup.tab === 'schedule') {
      p.set('cl', snap.cup.list);
      if (snap.cup.list === 'league') p.set('by', snap.cup.by);
      else if (snap.cup.teamId !== undefined) p.set('ct', TEAM_BY_ID.get(snap.cup.teamId)?.tricode ?? '');
    }
  }
  return `${pathname}?${p}`;
}

/** One history entry of ours: its place in this tab's pages, the furthest page known, every page's label, the page. */
export interface HistEntry {
  ck: 1;
  i: number;
  max: number;
  trail: string[];
  snap: ViewSnapshot;
}
const isEntry = (x: unknown): x is HistEntry => !!x && (x as HistEntry).ck === 1 && typeof (x as HistEntry).i === 'number';

/**
 * The widget's pages as real history entries, so the browser's back / forward (buttons, Alt+← →, the
 * mouse's side buttons) and the in-app ← → walk them; back / forward puts the whole page back (handle.restore).
 */
export function usePageHistory(handle: RefObject<CalendarHandle | null>) {
  // the position lives outside React state: only the ← → buttons read it (a state here re-rendered the whole widget
  // after its first render, on the load path)
  const [arrows] = useState(() => createValueStore<PageHistoryLabels>({}));
  const posRef = useRef<{ i: number; max: number; trail: string[] }>(undefined!);
  if (!posRef.current) {
    const e: unknown = window.history.state;
    posRef.current = isEntry(e) ? { i: e.i, max: e.max, trail: e.trail } : { i: 0, max: 0, trail: [] };
  }
  const setPos = useCallback((p: { i: number; max: number; trail: string[] }) => {
    const back = p.i > 0 ? p.trail[p.i - 1] ?? 'the previous page' : undefined;
    const forward = p.i < p.max ? p.trail[p.i + 1] ?? 'the next page' : undefined;
    const was = arrows.get();
    if (was.back !== back || was.forward !== forward) arrows.set({ back, forward });
  }, [arrows]);
  const onNavigate = useCallback((snap: ViewSnapshot, how: 'push' | 'replace', prev?: ViewSnapshot) => {
    const cur = posRef.current;
    let next: typeof cur;
    if (how === 'push') {
      // the page being left keeps its scroll position and top row
      const was: unknown = window.history.state;
      if (isEntry(was) && prev) window.history.replaceState({ ...was, snap: prev }, '');
      const i = cur.i + 1;
      next = { i, max: i, trail: [...cur.trail.slice(0, i), snap.label] };
      window.history.pushState({ ck: 1, ...next, snap } satisfies HistEntry, '', urlOf(snap));
    } else {
      const trail = [...cur.trail];
      trail[cur.i] = snap.label;
      next = { ...cur, trail };
      window.history.replaceState({ ck: 1, ...next, snap } satisfies HistEntry, '', urlOf(snap));
    }
    posRef.current = next;
    setPos(next);
  }, [setPos]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st: unknown = e.state;
      if (!isEntry(st)) return;
      const cur = posRef.current;
      const max = Math.max(cur.max, st.max);
      const trail = cur.trail.length > st.trail.length ? cur.trail : st.trail;
      const next = { i: st.i, max, trail };
      // this entry remembers how far the pages go (after a reload of it, forward still knows)
      window.history.replaceState({ ...st, max, trail }, '');
      posRef.current = next;
      setPos(next);
      handle.current?.restore(st.snap);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [handle, setPos]);
  const [pageHistory] = useState<PageHistory>(() => ({ labels: arrows, onBack: () => window.history.back(), onForward: () => window.history.forward() }));
  return { onNavigate, pageHistory };
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
    // once: the refs are stable; fallback only reads the window
  }, [ref, widgetRef]);
  return size;
}

export function App() {
  const [data, setData] = useState<CalendarData>();
  const [error, setError] = useState<string>();
  const appRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const size = useContentSize(appRef, widgetRef);
  // The page always opens on today. An old link's `date=` is never read back (and never
  // written), so a bookmark or a reloaded tab doesn't pin an old day; view, layout, team, weeks and the toggles still come from it.
  const [initial] = useState(() => ({ ...readUrlState(), date: e2eOpenDate() }));
  // A team link's `on=` is for this load only — the widget's first page replaces the address (its
  // own URL, without `on=`) as it renders
  const view = useRef<CalendarHandle>(null);
  const { onNavigate, pageHistory } = usePageHistory(view);
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
            odds={liveOddsStore()}
            data={data}
            size={size}
            initial={initial}
            onOpenGame={onOpenGame}
            gameLink={appGameLink}
            teamHref={teamLinkUrl}
            onNavigate={onNavigate}
            handle={view}
            pageHistory={pageHistory}
            title={`NBA schedule ${data.seasonYear}`}
            note={`Times in your time zone (${timeZone})`}
            updatedAt={data.updatedAt}
          />
        )}
      </div>
      <SiteVersion {...BUILD_INFO} />
    </div>
  );
}
