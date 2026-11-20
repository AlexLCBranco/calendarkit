// CalendarView: the widget's shell. It holds the state every destination shares (CalendarState: what the host stores
// in the URL), the pinned header (page history ← →, the breadcrumb, "Go anywhere", the Options / ⓘ / Quick standings /
// Copy buttons, the Where tabs) and the page rows' frame (What, How, dates), page history, team links, sizing and the
// overlays; Schedule, Cup and Standings each own their own state and fill the slots with their own parts
// (ScheduleDestination, CupDestination, StandingsDestination). The layout is backlogkit's NAV_PATTERN.md.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange, onNavigate).

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { localDate, type CalendarData } from '../data/model';
import { TEAMS, TEAM_BY_ID } from '../data/teams';
import type { SlateOdds } from '../slate/odds';
import { LiveScores } from '../slate/live';
import { LivePopoutHost } from './LivePopout';
import type { SlateCold } from '../slate/weather';
import { useSeriesPopup } from '../slate/series';
import { useGameLinksPopup } from '../slate/gameLinks';
import { useStreakPopup } from '../slate/streakPopup';
import { stripGamesOf } from '../slate/stripGames';
import { TeamLinkContext, teamLinkTarget, type TeamLinks } from '../slate/teamLink';
import { CupLinkContext, cupLinkTarget, useCupPopup, type CupLinks } from '../slate/cupLink';
import { cupFocusOf, cupFocusParam, type CupFocus } from '../data/cupPopup';
import { useTooltip } from '../slate/tooltip';
import { BAR_SHORT_BELOW, seasonDay, type CalendarHandle, type CalendarState, type CupState, type Destination, type PageHistory, type TeamLayout, type TeamTarget, type ViewSnapshot } from './calendarState';
import { ClockProvider, useClock } from './clock';
import { CopyButton } from './CopyButton';
import { CupDestination, type CupApi } from './CupDestination';
import type { BarSlots, DestinationApi, DestinationProps } from './destination';
import type { GameLink } from './GameCard';
import { ScheduleDestination, scheduleShape, type ScheduleApi } from './ScheduleDestination';
import { createSelectionStore, useMarqueeSelection } from './selection';
import { SelectionStyle } from './SelectionBar';
import { SLATE_MIN_WIDTH } from './SlateView';
import { StandingsDestination, type StandingsApi } from './StandingsDestination';
import { CrumbPart, GoAnywhere, StandingsIcon, WhereTabs } from './Header';
import { entry, WHERE, type SearchEntry } from './nav';
import { cupTabs, CUP_SEASONS } from './CupDestination';
import { SET_OPTIONS, type StandingsSet } from './standingsSets';
import { HISTORY_YEARS, seasonLabel } from '../data/nbaHistory';
import { BarInfo, PageArrows, StaleBanner } from './TopBar';
import { fullName, isCompact, type WidgetSize } from './widget';
import './calendar.css';

// The widgets live in their own files; re-exported here so hosts and tests keep one entry point.
export { flowDay, monthCellInner, monthColumns, MONTH_COL_GAP, MONTH_LINE, MONTH_LINE_WIDTH, WEEK_MIN_WIDTH, WEEK_SCALE_MAX, weekScale, type ColumnGroup } from './dayflow';
export { LeagueListView, type LeagueListViewProps } from './LeagueListView';
export { LeagueWeekView, type LeagueWeekViewProps, type WeekCount } from './LeagueWeekView';
export { MonthNavigator, type MonthNavigatorProps } from './MonthNavigator';
export { TeamHeader } from './TeamHeader';
export { TeamListView, type TeamListHandle, type TeamListViewProps } from './TeamListView';
export { TEAM_CELL_MIN_HEIGHT, TEAM_SCALE_FILL, TEAM_SCALE_MAX, TEAM_SCALE_MIN, TeamMonthGrid, type TeamMonthGridProps } from './TeamMonthGrid';
export { TeamChips } from './TeamChips';
export { COMPACT_WIDTH, fmtRange, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, useNow, type WidgetSize } from './widget';
export { BAR_SHORT_BELOW, fmtMonthSpan, seasonDay, STALE_AFTER_MS, teamListTarget, type CalendarHandle, type CalendarLayout, type CalendarMode, type CalendarState, type CupState, type Destination, type PageHistory, type PageHistoryLabels, type TeamLayout, type TeamSpan, type TeamTarget, type ViewSnapshot } from './calendarState';

export interface CalendarViewProps {
  data: CalendarData;
  /** The Slate's moneyline odds and every view's live scores (the app shell passes liveOddsStore()); none: no odds, no live scores, no request. */
  odds?: SlateOdds;
  /** The Slate's cold-weather flags (the app shell passes liveColdStore()); none: no flags, no request. */
  cold?: SlateCold;
  size: WidgetSize;
  /**
   * Initial state; anything missing gets a default (League → List, default day). `teamDate` (a team link
   * opened in a new tab): the Team view opens on this date instead of the next game. `snap` (a reloaded tab): the page
   * as it was — its months, weeks, the Team List's row at the top and the scroll position (the state comes in the rest).
   */
  initial?: Partial<CalendarState> & { teamDate?: string; cup?: Partial<CupState>; st?: StandingsSet; sy?: number; /** Standings, a past season: the playoff series outlined */ ss?: string; snap?: ViewSnapshot };
  /**
   * The URL of a team's Team view (team links: Ctrl / middle-click → new tab). Given → every team name, logo
   * and tricode is a link (a plain click switches to that Team view here); none → no team links.
   */
  teamHref?: (to: TeamTarget) => string;
  /** The URL of the Cup page on a group or the bracket (Cup labels: Ctrl / middle-click → new tab). None → the labels aren't links. */
  cupHref?: (focus: CupFocus) => string;
  /** The URL of a past season's page in Standings, on one of its playoff series ("View series": Ctrl / middle-click → new tab). */
  seasonHref?: (year: number, series: string) => string;
  /** Fixed clock (ms) for tests or replays; default: live clock. */
  now?: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** The game page URL for a game (or undefined): every matchup (lists, calendar cells, week lines) links to it, new tab. */
  gameLink?: GameLink;
  /** Told whenever the user changes mode, layout, team, day, weeks or the TV filter (e.g. to sync a URL). */
  onStateChange?: (state: CalendarState) => void;
  /** Shown first in the top bar (e.g. "NBA schedule 2026-27"). */
  title?: string;
  /** Small muted note at the end of the top bar (e.g. the time zone); a tooltip icon on phones. */
  note?: string;
  /** When the data was generated (ISO): "Data updated …" under the note, orange (--ck-stale) once older than STALE_AFTER_MS. */
  updatedAt?: string;
  /**
   * Told after every change of the view, as a whole snapshot: "push" for a new page (a destination,
   * a team, a view, an option, a picked date, Today), "replace" for a day step (‹ ›, ← →, the strip) or the first render.
   * `prev` (with push): the page being left, with its scroll position, for its history entry.
   */
  onNavigate?: (snap: ViewSnapshot, how: 'push' | 'replace', prev?: ViewSnapshot) => void;
  /** Set to a handle that puts a snapshot back on screen (the shell's back / forward). */
  handle?: RefObject<CalendarHandle | null>;
  /** The in-app ← → (page history), at the far left of the top bar; none: not shown. */
  pageHistory?: PageHistory;
}

const DEFAULT_TEAM = TEAMS[0]!.id;
/**
 * The content width from which the page rows are one layer: the team chips (two lines, ~1130 px) with How over the
 * dates beside them (the widest date block, the Team Calendar's with its span switch: ~610 px).
 */
export const ONE_LAYER_MIN_WIDTH = 1800;
/** The Team mode a team link opens (names, logos, tricodes anywhere: game cards, standings, the Cup, popups). */
export const TEAM_LINK_LAYOUT: TeamLayout = 'calendar';
/** The condensed standings popup, in the Standings destination's chunk, loaded on first use. */
const StandingsPopup = lazy(() => import('./Standings').then((m) => ({ default: m.StandingsPopup })));

export function CalendarView({ data, odds, cold, size: outerSize, initial, now: fixedNow, timeZone, onOpenGame, gameLink, onStateChange, title, note, updatedAt, teamHref, cupHref, seasonHref, onNavigate, handle, pageHistory }: CalendarViewProps) {
  // The clock (moves at local midnight and on waking, no minute tick); today's date and the stale stamp read it.
  // `now` (the default day, the next game, games over) is the time the widget opened.
  const clock = useClock(fixedNow, timeZone, localDate);
  const [openedAt] = useState(() => clock.get());
  const now = fixedNow ?? openedAt;
  const size = outerSize;
  const compact = isCompact(size);
  const [state, setState] = useState<CalendarState>(() => ({
    mode: initial?.mode ?? 'league',
    layout: initial?.layout ?? 'list',
    teamId: initial?.teamId && TEAM_BY_ID.has(initial.teamId) ? initial.teamId : DEFAULT_TEAM,
    date: initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) ? initial.date : seasonDay(data, localDate(now, timeZone)),
    tvOnly: initial?.tvOnly ?? false,
    showRest: initial?.showRest ?? true,
    weeks: initial?.weeks === 2 ? 2 : 1,
    teamSpan: initial?.teamSpan === 1 || initial?.teamSpan === 2 ? initial.teamSpan : 'month',
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  // the day strips' squares: the matchup and its hoopsjunkie page
  const stripGames = useMemo(() => stripGamesOf(data, gameLink), [data, gameLink]);
  const tooltip = useTooltip(stripGames);
  // A square of the season-series popup is its game's hoopsjunkie page
  const streakPop = useStreakPopup(data, { gameLink });
  const seasonHrefRef = useRef(seasonHref);
  seasonHrefRef.current = seasonHref;
  const viewSeriesRef = useRef<(year: number, key: string) => void>(undefined);
  const [viewSeries] = useState(() => ({ href: (year: number, key: string) => seasonHrefRef.current?.(year, key) ?? '', open: (year: number, key: string) => viewSeriesRef.current?.(year, key) }));
  const series = useSeriesPopup(data, { gameLink, viewSeries });
  // A Slate card's game button: player props and injury links
  const gameLinksPop = useGameLinksPopup(data, { cold });
  // A Cup label's group table (or the two teams' way through the Cup)
  const cupPop = useCupPopup(data, { linked: !!cupHref });

  const update = useCallback(
    (patch: Partial<CalendarState>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );
  const { slate, list, teamMap } = scheduleShape(state, size);
  // The Cup and Standings: desktop only, like the Slate; a narrower widget shows the League views meanwhile (the state
  // keeps "cup" or "standings").
  const slateFits = !compact && size.width >= SLATE_MIN_WIDTH;
  const cup = state.mode === 'cup' && slateFits;
  const standings = state.mode === 'standings' && slateFits;
  const destination: Destination = cup ? 'cup' : standings ? 'standings' : 'schedule';
  const lastScope = useRef<'league' | 'team'>(state.mode === 'team' ? 'team' : 'league');
  if (state.mode === 'league' || state.mode === 'team') lastScope.current = state.mode;
  const goDestination = (d: Destination) => update({ mode: d === 'schedule' ? lastScope.current : d });
  const places: Destination[] = slateFits ? ['schedule', 'cup', 'standings'] : ['schedule'];
  // the condensed standings popup over any view (desktop)
  const [stPop, setStPop] = useState(false);
  const closeStPop = useCallback(() => setStPop(false), []);
  // today's date from the clock: the view re-renders when the date changes (midnight), not every minute
  const today = useSyncExternalStore(clock.subscribe, () => localDate(clock.get(), timeZone));
  // Below BAR_SHORT_BELOW px the one-row bar takes the short date ("Fri, Nov 6, 2026") and "TV only"
  const barShort = !compact && size.width < BAR_SHORT_BELOW;
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // The bar's slots, filled by the active destination (through portals) once they are in the page. They stay the same
  // elements for the page's life (the ⓘ slot sits in its popover, which stays in the page closed); only a change of
  // note swaps the ⓘ's.
  const [slots, setSlots] = useState<BarSlots>();
  useLayoutEffect(() => {
    const q = (sel: string) => root.current!.querySelector<HTMLElement>(sel)!;
    setSlots({ crumbs: q('.ck-crumbs-slot'), what: q('.ck-bar-what'), sub: q('.ck-bar-sub'), date: q('.ck-bar-date'), options: q('.ck-bar-options'), info: q('.ck-info-slot') });
  }, [note]);

  // What each destination tells the shell (its date on show, page label, copy, selection kind, page-history parts)
  const scheduleApi = useRef<ScheduleApi>(undefined);
  const cupApi = useRef<CupApi>(undefined);
  const standingsApi = useRef<StandingsApi>(undefined);
  const destRef = useRef(destination);
  destRef.current = destination;
  const apiOf = (): DestinationApi => (destRef.current === 'cup' ? cupApi : destRef.current === 'standings' ? standingsApi : scheduleApi).current!;
  /** The date on show in the active destination. */
  const lookingAt = () => apiOf().lookingAt();

  // Marquee selection of games (desktop/tablet, mouse): only to copy several games as one image. The selected ids live
  // in a store, so selecting re-renders only the highlight <style> and the bar, never the views.
  const [selection] = useState(createSelectionStore);
  const marquee = useRef<HTMLDivElement>(null);
  const onMarquee = useMarqueeSelection(selection, marquee);
  // a new view, team, span or toggle clears it; the destinations clear it on their own periods and views
  const viewKey = [state.mode, state.layout, state.teamId, state.tvOnly, state.showRest, state.weeks, state.teamSpan, compact].join('|');
  useEffect(() => selection.clear(), [viewKey, selection]);

  // Team links open the team's Calendar (List is one click away in its bar). The date being looked at is read when a
  // link is pressed, never rendered into the links (no re-render of the cards when it changes).
  const teamHrefRef = useRef(teamHref);
  teamHrefRef.current = teamHref;
  const [teamLinks] = useState<TeamLinks>(() => ({
    href: (teamId, view) => teamHrefRef.current?.({ teamId, layout: view ?? TEAM_LINK_LAYOUT, date: lookingAt(), state: stateRef.current }) ?? '',
  }));
  /** A team link's plain click (or the scope picker's team, in its own mode): that team's Team view here, on the date being looked at. */
  const openTeam = (teamId: number, view?: TeamLayout, fromRecord = false) => {
    const date = lookingAt();
    const layout = view ?? TEAM_LINK_LAYOUT;
    const s = stateRef.current;
    // League's Slate stays League's layout (Team shows its List meanwhile), so League comes back to the Slate
    // a record's link (the team's List): every game with the rest days between them
    const rest = fromRecord ? { showRest: true } : {};
    update({ mode: 'team', teamId, layout: layout === 'list' && s.layout === 'slate' ? 'slate' : layout, ...rest });
    scheduleApi.current!.showTeam(teamId, layout, date, { ...s, ...rest });
    setStPop(false); // a team link in the standings popup: the popup closes on the new view
  };
  const openTeamRef = useRef(openTeam);
  openTeamRef.current = openTeam;
  const openTeamStable = useCallback((teamId: number, view?: TeamLayout) => openTeamRef.current(teamId, view), []);
  // Cup labels: the Cup page on the game's group (Groups) or on the bracket (Simulator)
  const cupHrefRef = useRef(cupHref);
  cupHrefRef.current = cupHref;
  const [cupLinks] = useState<CupLinks>(() => ({ href: (focus) => cupHrefRef.current?.(focus) ?? '' }));
  const openCup = (gameId: string) => {
    const g = data.games.find((x) => x.gameId === gameId);
    const focus = g && cupFocusOf(g);
    if (!focus) return;
    cupPop.close();
    setStPop(false);
    update({ mode: 'cup' });
    cupApi.current!.go({ tab: focus.kind === 'bracket' ? 'simulator' : 'standings', focus: cupFocusParam(focus) });
  };
  // "View series" (the season-series popup's playoff line): Standings on that past season, the series outlined
  viewSeriesRef.current = (year, key) => {
    series.close();
    setStPop(false);
    update({ mode: 'standings' });
    standingsApi.current!.showSeries(year, key);
  };
  const openCupRef = useRef(openCup);
  openCupRef.current = openCup;
  // One handler pair for every team link of the widget (popups included: they render inside it), capture phase so it
  // runs before the game link around a team (MatchLink) or a calendar cell's own click.
  const teamPress = useCallback(
    (e: ReactPointerEvent) => {
      const hit = teamLinkTarget(e.target);
      if (hit) hit.a.href = teamLinks.href(hit.teamId, hit.view); // fresh for the click, middle-click or context menu that follows
    },
    [teamLinks],
  );
  const teamClick = useCallback(
    (e: ReactMouseEvent) => {
      const cupHit = cupLinkTarget(e.target);
      if (cupHit) {
        e.stopPropagation();
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openCupRef.current(cupHit.gameId);
        return;
      }
      const hit = teamLinkTarget(e.target);
      if (!hit) return;
      e.stopPropagation();
      hit.a.href = teamLinks.href(hit.teamId, hit.view);
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // the browser's new tab / window
      e.preventDefault();
      openTeamRef.current(hit.teamId, hit.view === 'list' ? 'list' : undefined, hit.view === 'list');
    },
    [teamLinks],
  );

  // ---- Page history. After every render (the shell's or a destination's) that changed the page, the host is told:
  // a new page (push) or the same page moved by a day step (replace). A restore (back / forward) is told nothing.
  const scrollAt = useRef<{ id: string; top: number }>(undefined);
  const jump = useRef(false); // a picked date or Today: a new page although only the date changed
  const markJump = useCallback(() => void (jump.current = true), []);
  const restoring = useRef(false);
  // a reloaded page's scroll position comes back like a restored one's (the Team List uses its row at the top instead)
  const pendingScroll = useRef<{ id: string; top: number } | undefined>(initial?.snap?.scroll && initial.snap.scroll.id !== 'team-list' ? initial.snap.scroll : undefined);
  const last = useRef<{ page: string; date: string; snap?: ViewSnapshot }>({ page: '', date: '' });
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  // the shared state and size as last rendered (the destinations' parts come from their own last render)
  const shown = useRef({ state, slateFits });
  shown.current = { state, slateFits };
  const history = {
    /** What makes a new page vs. a day step (the date-only fields); a view's parts that aren't on show don't count. */
    keys: () => {
      const { state: s, slateFits: fits } = shown.current;
      const c = cupApi.current!;
      const inCup = s.mode === 'cup' && fits;
      const other = inCup || (s.mode === 'standings' && fits);
      return {
        page: JSON.stringify([s.mode, other ? '' : s.layout, s.mode === 'team' || (inCup && c.teamScoped) ? s.teamId : 0, s.tvOnly, s.weeks, s.teamSpan, s.showRest, inCup ? c.pageKey() : '', other && !inCup ? [standingsApi.current!.set, standingsApi.current!.season ?? 0] : '']),
        date: JSON.stringify([s.date, ...scheduleApi.current!.dateKey(), inCup ? c.night : '']),
      };
    },
    snap: (): ViewSnapshot => {
      const sch = scheduleApi.current!.snap();
      return { state: stateRef.current, leagueMonth: sch.leagueMonth, teamMonth: sch.teamMonth, teamWeek: sch.teamWeek, teamListMonth: sch.teamListMonth, teamListTo: sch.teamListTo, cup: cupApi.current!.state, st: standingsApi.current!.set, sy: standingsApi.current!.season, top: sch.top, at: lookingAt(), label: apiOf().label() };
    },
    check: () => {
      const k = history.keys();
      const was = last.current;
      if (was.page === k.page && was.date === k.date) return;
      const snap = history.snap();
      const how = !was.snap ? 'replace' : was.page !== k.page || jump.current ? 'push' : 'replace';
      const prev = was.snap && { ...was.snap, scroll: scrollAt.current };
      last.current = { page: k.page, date: k.date, snap };
      jump.current = false;
      if (restoring.current) return void (restoring.current = false);
      if (how === 'push') scrollAt.current = undefined;
      onNavigateRef.current?.(snap, how, how === 'push' ? prev : undefined);
    },
  };
  const historyRef = useRef(history);
  historyRef.current = history;
  const rendered = useCallback(() => historyRef.current.check(), []);
  useEffect(() => rendered());
  // the Team List's row at the top follows the scrolling into the page's snapshot — only while the page on screen is the
  // one last told (a new list writes its store in its own effects, before the change is told)
  const onTop = useCallback((top: string) => {
    const l = last.current;
    const k = historyRef.current.keys();
    if (l.snap?.top !== undefined && k.page === l.page && k.date === l.date) l.snap = { ...l.snap, top: top || l.snap.top };
  }, []);
  // a restored page's scroll position, once its rows are on screen
  useEffect(() => {
    const want = pendingScroll.current;
    if (!want) return;
    pendingScroll.current = undefined;
    const id = requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLElement>(`[data-testid="${want.id}"]`);
      if (el) el.scrollTop = want.top;
    });
    return () => cancelAnimationFrame(id);
  });
  const restore = (snap: ViewSnapshot) => {
    restoring.current = true;
    const s = snap.state;
    stateRef.current = s;
    setState(s);
    onStateChange?.(s);
    scheduleApi.current!.restore(snap);
    cupApi.current!.restore(snap.cup);
    standingsApi.current!.setSet(snap.st ?? 'main');
    standingsApi.current!.setSeason(snap.sy);
    setStPop(false);
    pendingScroll.current = snap.scroll && snap.scroll.id !== 'team-list' ? snap.scroll : undefined;
    scrollAt.current = undefined;
  };
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    if (!handle) return;
    handle.current = { restore: (snap) => restoreRef.current(snap), snap: () => ({ ...historyRef.current.snap(), scroll: scrollAt.current }) };
    return () => void (handle.current = null);
  }, [handle]);

  // "Go anywhere": every place, view, team (Calendar and List), Cup view and season and standings column set
  const searchEntries = useCallback((): SearchEntry[] => {
    const go = (fn: () => void) => () => {
      setStPop(false);
      fn();
    };
    const out: SearchEntry[] = WHERE.filter(([d]) => shown.current.slateFits || d === 'schedule').map(([d, label, tip]) => entry(label, 'Place', tip, go(() => update({ mode: d === 'schedule' ? lastScope.current : d })), 0));
    const views: ['list' | 'calendar' | 'slate', string][] = [['list', 'List'], ['calendar', 'Calendar'], ...(shown.current.slateFits ? ([['slate', 'Slate']] as ['slate', string][]) : [])];
    for (const [layout, label] of views) out.push(entry(`All teams · ${label}`, 'Schedule', 'league every team' + (layout === 'slate' ? ' cards notes odds' : ''), go(() => update({ mode: 'league', layout })), 1));
    for (const t of TEAMS) {
      const words = `${t.tricode} ${t.conference} ${t.division}`;
      out.push(entry(fullName(t), 'Team', `${words} calendar`, go(() => openTeamRef.current(t.id, 'calendar')), 1));
      out.push(entry(`${fullName(t)} · List`, 'Team', words, go(() => openTeamRef.current(t.id, 'list')), 2));
    }
    if (shown.current.slateFits) {
      for (const [tab, label] of cupTabs) out.push(entry(`NBA Cup · ${label}`, 'Cup', 'in-season tournament', go(() => (update({ mode: 'cup' }), cupApi.current!.go({ tab }))), 1));
      for (const y of CUP_SEASONS) out.push(entry(`NBA Cup ${y}`, 'Cup history', 'past cups champion', go(() => (update({ mode: 'cup' }), cupApi.current!.go({ tab: 'history', hs: y }))), 2));
      for (const [set, label] of SET_OPTIONS) out.push(entry(`Standings · ${label}`, 'Standings', 'table columns', go(() => (update({ mode: 'standings' }), standingsApi.current!.setSeason(undefined), standingsApi.current!.setSet(set))), 2));
      for (const y of HISTORY_YEARS) out.push(entry(`NBA ${seasonLabel(y)}`, 'Past season', `${y} standings playoffs bracket champions history`, go(() => (update({ mode: 'standings' }), standingsApi.current!.setSeason(y))), 2));
    }
    return out;
  }, [update]);

  // Standings grows with its content (a past season's page is long, and the pinned header sticks only inside the page's
  // own box); the other pages as before
  const fill = destination !== 'standings' && (list || slate);
  // The page rows scroll away under the pinned header (NAV_PATTERN.md §2). A Schedule calendar fills the window under the
  // header once they have: its height grows by what scrolls away (the page's top padding and the rows), so it keeps the
  // size it had under the old one-row bar instead of shrinking for rows that are only on screen at the top.
  const [scrollAway, setScrollAway] = useState(0);
  const measureAway = useRef<() => void>(undefined);
  measureAway.current = () => {
    const rows = bar.current;
    const r = root.current;
    const header = r?.querySelector<HTMLElement>('.ck-header');
    if (!rows || !r || !header) return;
    const px = (el: Element) => parseFloat(getComputedStyle(el).marginBottom) || 0;
    const contentTop = r.getBoundingClientRect().top + window.scrollY + rows.offsetTop + rows.offsetHeight + px(rows);
    const v = Math.max(0, Math.round(contentTop - header.offsetHeight - px(header)));
    setScrollAway((was) => (was === v ? was : v));
  };
  // before every paint (the rows change with the view, the page's top with the shell's size), and on a resize of the rows
  // between renders (fonts)
  useLayoutEffect(() => measureAway.current!());
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !bar.current) return;
    const ro = new ResizeObserver(() => measureAway.current!());
    ro.observe(bar.current);
    return () => ro.disconnect();
  }, []);
  // One menu layer (a full-size window): How and the dates sit beside the team chips, in their two lines' height, so a
  // team's calendar fits the window with the rows on screen — no stretch, no page scroll. The League calendars keep
  // filling the window under the header (their lines would shrink otherwise).
  const oneLayer = !compact && size.width >= ONE_LAYER_MIN_WIDTH;
  const stretch = destination === 'schedule' && !fill && !compact && !(oneLayer && state.mode === 'team') ? scrollAway : 0;
  const scheduleSize = useMemo(() => (stretch ? { width: size.width, height: size.height + stretch } : size), [size, stretch]);
  const onScrollCapture = (e: { target: EventTarget }) => {
    const el = e.target as HTMLElement;
    const id = el.dataset?.testid;
    if (id && el.hasAttribute('data-select-scroller')) scrollAt.current = { id, top: el.scrollTop };
  };

  const shared: DestinationProps = { active: false, data, size, now, today, timeZone, compact, barShort, slateFits, state, update, root, onOpenGame, gameLink, title, note, slots, selection, jump: markJump, rendered };

  return (
    <TeamLinkContext.Provider value={teamHref ? teamLinks : undefined}>
    {/* the Cup is a desktop page: narrower, its labels stay plain */}
    <CupLinkContext.Provider value={cupHref && slateFits ? cupLinks : undefined}>
    {/* live scores (CK-21) from the odds store: every view reads them through useLive */}
    <LiveScores.Provider value={odds}>
    <ClockProvider clock={clock}>
      <div
        ref={root}
        onPointerDownCapture={teamHref ? teamPress : undefined}
        onClickCapture={teamHref || cupHref ? teamClick : undefined}
        className={`ck-root ck-select-area${compact ? ' ck-compact' : ''}${barShort ? ' ck-bar-short' : ''}${compact || size.width < 1200 ? ' ck-bar-wrap' : ''}${teamMap ? ' ck-team-side' : ''}${oneLayer ? ' ck-one-layer' : ''}${fill ? ' ck-root-fill' : ' ck-root-grow'}`}
        onPointerDown={(e) => {
          if (apiOf().selKind) onMarquee(e);
        }}
        style={{ maxWidth: outerSize.width, height: fill ? size.height : undefined, minHeight: fill || compact ? undefined : size.height + stretch }}
        onMouseOver={(e) => (tooltip.handlers.onMouseOver(e), series.handlers.onMouseOver(e), streakPop.handlers.onMouseOver(e), gameLinksPop.handlers.onMouseOver(e), cupPop.handlers.onMouseOver(e))}
        onFocus={(e) => (tooltip.handlers.onFocus(e), series.handlers.onFocus(e), streakPop.handlers.onFocus(e), gameLinksPop.handlers.onFocus(e), cupPop.handlers.onFocus(e))}
        onMouseLeave={() => (tooltip.handlers.onMouseLeave(), series.handlers.onMouseLeave(), streakPop.handlers.onMouseLeave(), gameLinksPop.handlers.onMouseLeave(), cupPop.handlers.onMouseLeave())}
        onBlur={tooltip.handlers.onBlur}
        onScrollCapture={onScrollCapture}
      >
        {/* The pinned header (the same on every page, never changing height): ← →, the breadcrumb (the place, then the
            destination's parts), Go anywhere and the icon buttons — the Schedule's Options, ⓘ, Quick standings, Copy —
            and the Where tabs under them. */}
        <header className="ck-header" data-testid="top-bar" data-destination={destination}>
          {title && <h1 className="ck-title ck-sr">{title}</h1>}
          <div className="ck-head-row">
            {pageHistory && <PageArrows h={pageHistory} />}
            <nav className="ck-crumbs" aria-label="You are here" data-testid="breadcrumb">
              <CrumbPart c={{ id: 'place', label: WHERE.find(([d]) => d === destination)![1], items: WHERE.filter(([d]) => places.includes(d)).map(([d, label]) => ({ label, on: d === destination, go: () => goDestination(d) })) }} />
              <span className="ck-crumbs-slot" />
            </nav>
            <span className="ck-head-end">
              <GoAnywhere entries={searchEntries} />
              <span className="ck-bar-options" />
              {note && (
                <BarInfo note={note} updatedAt={compact ? undefined : updatedAt} now={now} timeZone={timeZone}>
                  <div className="ck-info-slot" />
                </BarInfo>
              )}
              {!note && <div className="ck-info-slot" hidden />}
              {slateFits && (
                <button type="button" className="ck-button ck-icon-button ck-st-button" aria-label="Quick standings" title="Quick standings" aria-expanded={stPop} aria-haspopup="dialog" data-testid="standings-button" onClick={() => setStPop((o) => !o)}>
                  <StandingsIcon />
                </button>
              )}
              <CopyButton label="Copy as image" copy={(button) => apiOf().copy(button)} testId="copy-view" />
            </span>
          </div>
          <WhereTabs value={destination} places={places} onChange={goDestination} />
        </header>
        {/* The page rows (scroll away with the page): What (the thing looked at, as chips), How (a small switch) and the
            dates; a destination without a What leaves its row out. */}
        <div className="ck-toolbar ck-bar1 ck-prows" data-testid="page-rows" ref={bar}>
          <div className="ck-bar-what" data-testid="what-row" />
          <div className="ck-bar-local" data-testid="bar-local" data-destination={destination}>
            <div className="ck-bar-sub" />
            <div className="ck-bar-date" />
          </div>
        </div>
        {/* every destination stays mounted, so its state lasts as long as the page; only the active one renders */}
        <ScheduleDestination {...shared} size={scheduleSize} active={destination === 'schedule'} odds={odds} cold={cold} teamDate={initial?.teamDate} initialSnap={initial?.snap} openTeam={openTeamStable} onTop={onTop} api={scheduleApi} />
        <CupDestination {...shared} active={cup} initial={initial?.cup} api={cupApi} />
        <StandingsDestination {...shared} active={standings} initial={initial?.st ?? initial?.snap?.st} initialSeason={initial?.sy ?? initial?.snap?.sy} initialSeries={initial?.ss} api={standingsApi} />
        {stPop && slateFits && (
          <Suspense fallback={null}>
            <StandingsPopup data={data} onClose={closeStPop} />
          </Suspense>
        )}
        {updatedAt && !compact && <StaleBanner updatedAt={updatedAt} now={now} timeZone={timeZone} />}
        {/* CK-23: the floating live scores window, kept while the page is open */}
        <LivePopoutHost data={data} timeZone={timeZone} />
        {tooltip.node}
        {series.node}
        {streakPop.node}
        {gameLinksPop.node}
        {cupPop.node}
        <div ref={marquee} className="ck-marquee" aria-hidden="true" data-testid="marquee" />
        <SelectionStyle store={selection} scope=".ck-select-area" />
      </div>
    </ClockProvider>
    </LiveScores.Provider>
    </CupLinkContext.Provider>
    </TeamLinkContext.Provider>
  );
}
