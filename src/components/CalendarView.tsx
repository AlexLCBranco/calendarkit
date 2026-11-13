// CalendarView: the widget's shell. It holds the state every destination shares (CalendarState: what the host stores
// in the URL), the one-row top bar's frame (page history ← →, the destination switch, the ⓘ / Quick standings / Copy
// end), page history, team links, sizing and the overlays; Schedule, Cup and Standings each own their own state and
// fill the bar's slots with their own controls (ScheduleDestination, CupDestination, StandingsDestination).
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange, onNavigate).

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { localDate, type CalendarData } from '../data/model';
import { TEAMS, TEAM_BY_ID } from '../data/teams';
import type { SlateOdds } from '../slate/odds';
import { useSeriesPopup } from '../slate/series';
import { useStreakPopup } from '../slate/streakPopup';
import { TeamLinkContext, teamLinkTarget, type TeamLinks } from '../slate/teamLink';
import { useTooltip } from '../slate/tooltip';
import { BAR_SHORT_BELOW, seasonDay, type CalendarHandle, type CalendarState, type CupState, type Destination, type PageHistory, type TeamLayout, type TeamTarget, type ViewSnapshot } from './calendarState';
import { ClockProvider, useClock } from './clock';
import { CopyButton } from './CopyButton';
import { CupDestination, type CupApi } from './CupDestination';
import type { BarSlots, DestinationApi, DestinationProps } from './destination';
import type { GameLink } from './GameCard';
import { ScheduleDestination, scheduleShape, type ScheduleApi } from './ScheduleDestination';
import { Segmented } from './Segmented';
import { createSelectionStore, useMarqueeSelection } from './selection';
import { SelectionStyle } from './SelectionBar';
import { SLATE_MIN_WIDTH } from './SlateView';
import { StandingsDestination } from './StandingsDestination';
import { MenuSwitch, Rail, RAIL_WIDTH, useMenuVariant } from './Menu';
import { BarInfo, PageArrows, StandingsIcon } from './TopBar';
import { isCompact, type WidgetSize } from './widget';
import './calendar.css';

// The widgets live in their own files; re-exported here so hosts and tests keep one entry point.
export { flowDay, monthCellInner, monthColumns, MONTH_COL_GAP, MONTH_LINE, MONTH_LINE_WIDTH, WEEK_MIN_WIDTH, WEEK_SCALE_MAX, weekScale, type ColumnGroup } from './dayflow';
export { LeagueListView, type LeagueListViewProps } from './LeagueListView';
export { LeagueWeekView, type LeagueWeekViewProps, type WeekCount } from './LeagueWeekView';
export { MonthNavigator, type MonthNavigatorProps } from './MonthNavigator';
export { TeamHeader } from './TeamHeader';
export { TeamListView, type TeamListHandle, type TeamListViewProps } from './TeamListView';
export { TEAM_CELL_MIN_HEIGHT, TEAM_SCALE_FILL, TEAM_SCALE_MAX, TEAM_SCALE_MIN, TeamMonthGrid, type TeamMonthGridProps } from './TeamMonthGrid';
export { TeamPicker } from './TeamPicker';
export { COMPACT_WIDTH, fmtRange, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, useNow, type WidgetSize } from './widget';
export { BAR_SHORT_BELOW, fmtMonthSpan, seasonDay, STALE_AFTER_MS, teamListTarget, type CalendarHandle, type CalendarLayout, type CalendarMode, type CalendarState, type CupState, type Destination, type PageHistory, type PageHistoryLabels, type TeamLayout, type TeamSpan, type TeamTarget, type ViewSnapshot } from './calendarState';

export interface CalendarViewProps {
  data: CalendarData;
  /** The Slate's moneyline odds (the app shell passes liveOddsStore()); none: no odds, no request. */
  odds?: SlateOdds;
  size: WidgetSize;
  /**
   * Initial state; anything missing gets a default (League → List, default day). `teamDate` (a team link
   * opened in a new tab): the Team view opens on this date instead of the next game. `snap` (a reloaded tab): the page
   * as it was — its months, weeks, the Team List's row at the top and the scroll position (the state comes in the rest).
   */
  initial?: Partial<CalendarState> & { teamDate?: string; cup?: Partial<CupState>; snap?: ViewSnapshot };
  /**
   * The URL of a team's Team view (team links: Ctrl / middle-click → new tab). Given → every team name, logo
   * and tricode is a link (a plain click switches to that Team view here); none → no team links.
   */
  teamHref?: (to: TeamTarget) => string;
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
/** The Team mode a team link opens (names, logos, tricodes anywhere: game cards, standings, the Cup, popups). */
export const TEAM_LINK_LAYOUT: TeamLayout = 'calendar';
/** The condensed standings popup, in the Standings destination's chunk, loaded on first use. */
const StandingsPopup = lazy(() => import('./Standings').then((m) => ({ default: m.StandingsPopup })));

export function CalendarView({ data, odds, size: outerSize, initial, now: fixedNow, timeZone, onOpenGame, gameLink, onStateChange, title, note, updatedAt, teamHref, onNavigate, handle, pageHistory }: CalendarViewProps) {
  // The clock (moves at local midnight and on waking, no minute tick); today's date and the stale stamp read it.
  // `now` (the default day, the next game, games over) is the time the widget opened.
  const clock = useClock(fixedNow, timeZone, localDate);
  const [openedAt] = useState(() => clock.get());
  const now = fixedNow ?? openedAt;
  // The menu variant on show (Menu.tsx); the rail (desktop only) takes its width from the views'
  const [menu, setMenu] = useMenuVariant();
  const rail = menu === 'rail' && !isCompact(outerSize);
  const size = useMemo(() => (rail ? { width: outerSize.width - RAIL_WIDTH, height: outerSize.height } : outerSize), [rail, outerSize]);
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
  const tooltip = useTooltip();
  // A square of the season-series popup is its game's hoopsjunkie page
  const streakPop = useStreakPopup(data, { gameLink });
  const series = useSeriesPopup(data, { gameLink });

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
  const destinations: [Destination, string][] = [['schedule', 'Schedule'], ...(slateFits ? ([['cup', 'Cup'], ['standings', 'Standings']] as [Destination, string][]) : [])];
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
    const q = (sel: string) => bar.current!.querySelector<HTMLElement>(sel)!;
    setSlots({ sub: q('.ck-bar-sub'), date: q('.ck-bar-date'), options: q('.ck-bar-options'), info: q('.ck-info-slot') });
  }, [note]);

  // What each destination tells the shell (its date on show, page label, copy, selection kind, page-history parts)
  const scheduleApi = useRef<ScheduleApi>(undefined);
  const cupApi = useRef<CupApi>(undefined);
  const standingsApi = useRef<DestinationApi>(undefined);
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
    href: (teamId) => teamHrefRef.current?.({ teamId, layout: TEAM_LINK_LAYOUT, date: lookingAt(), state: stateRef.current }) ?? '',
  }));
  /** A team link's plain click (or the scope picker's team, in its own mode): that team's Team view here, on the date being looked at. */
  const openTeam = (teamId: number, view?: TeamLayout) => {
    const date = lookingAt();
    const layout = view ?? TEAM_LINK_LAYOUT;
    const s = stateRef.current;
    // League's Slate stays League's layout (Team shows its List meanwhile), so League comes back to the Slate
    update({ mode: 'team', teamId, layout: layout === 'list' && s.layout === 'slate' ? 'slate' : layout });
    scheduleApi.current!.showTeam(teamId, layout, date, s);
    setStPop(false); // a team link in the standings popup: the popup closes on the new view
  };
  const openTeamRef = useRef(openTeam);
  openTeamRef.current = openTeam;
  const openTeamStable = useCallback((teamId: number, view?: TeamLayout) => openTeamRef.current(teamId, view), []);
  // One handler pair for every team link of the widget (popups included: they render inside it), capture phase so it
  // runs before the game link around a team (MatchLink) or a calendar cell's own click.
  const teamPress = useCallback(
    (e: ReactPointerEvent) => {
      const hit = teamLinkTarget(e.target);
      if (hit) hit.a.href = teamLinks.href(hit.teamId); // fresh for the click, middle-click or context menu that follows
    },
    [teamLinks],
  );
  const teamClick = useCallback(
    (e: ReactMouseEvent) => {
      const hit = teamLinkTarget(e.target);
      if (!hit) return;
      e.stopPropagation();
      hit.a.href = teamLinks.href(hit.teamId);
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // the browser's new tab / window
      e.preventDefault();
      openTeamRef.current(hit.teamId);
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
        page: JSON.stringify([s.mode, other ? '' : s.layout, s.mode === 'team' || (inCup && c.teamScoped) ? s.teamId : 0, s.tvOnly, s.weeks, s.teamSpan, s.showRest, inCup ? c.pageKey() : '']),
        date: JSON.stringify([s.date, ...scheduleApi.current!.dateKey(), inCup ? c.night : '']),
      };
    },
    snap: (): ViewSnapshot => {
      const sch = scheduleApi.current!.snap();
      return { state: stateRef.current, leagueMonth: sch.leagueMonth, teamMonth: sch.teamMonth, teamWeek: sch.teamWeek, teamListMonth: sch.teamListMonth, teamListTo: sch.teamListTo, cup: cupApi.current!.state, top: sch.top, at: lookingAt(), label: apiOf().label() };
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

  const fill = list || slate;
  const onScrollCapture = (e: { target: EventTarget }) => {
    const el = e.target as HTMLElement;
    const id = el.dataset?.testid;
    if (id && el.hasAttribute('data-select-scroller')) scrollAt.current = { id, top: el.scrollTop };
  };

  const shared: DestinationProps = { active: false, data, size, now, today, timeZone, compact, barShort, slateFits, state, update, root, onOpenGame, gameLink, title, note, slots, selection, jump: markJump, rendered };

  return (
    <TeamLinkContext.Provider value={teamHref ? teamLinks : undefined}>
    <ClockProvider clock={clock}>
      <div
        ref={root}
        onPointerDownCapture={teamHref ? teamPress : undefined}
        onClickCapture={teamHref ? teamClick : undefined}
        className={`ck-root ck-select-area${compact ? ' ck-compact' : ''}${barShort ? ' ck-bar-short' : ''}${compact || size.width < 1200 ? ' ck-bar-wrap' : ''}${teamMap ? ' ck-team-side' : ''}${fill ? ' ck-root-fill' : ' ck-root-grow'}${rail ? ' ck-has-rail' : ''}`}
        onPointerDown={(e) => {
          if (apiOf().selKind) onMarquee(e);
        }}
        style={{ maxWidth: outerSize.width, height: fill ? size.height : undefined, minHeight: fill || compact ? undefined : size.height, paddingLeft: rail ? RAIL_WIDTH : undefined }}
        onMouseOver={(e) => (tooltip.handlers.onMouseOver(e), series.handlers.onMouseOver(e), streakPop.handlers.onMouseOver(e))}
        onFocus={(e) => (tooltip.handlers.onFocus(e), series.handlers.onFocus(e), streakPop.handlers.onFocus(e))}
        onMouseLeave={() => (tooltip.handlers.onMouseLeave(), series.handlers.onMouseLeave(), streakPop.handlers.onMouseLeave())}
        onBlur={tooltip.handlers.onBlur}
        onScrollCapture={onScrollCapture}
      >
        <div className="ck-toolbar ck-bar1" data-testid="top-bar" data-destination={destination} data-menu={rail ? 'rail' : 'packed'} ref={bar}>
          {/* One row, packed to the left in a fixed order (menu.css): page history and the destinations (packed bar
              only; the rail has them), the destination's sub-views, its date controls; at the right end the icon buttons
              — the destination's Options, ⓘ, Quick standings, Copy. Never hidden. */}
          {title && <h1 className="ck-title ck-sr">{title}</h1>}
          {!rail && (
            <div className="ck-bar-left" data-testid="bar-global">
              {pageHistory && <PageArrows h={pageHistory} />}
              <Segmented label="Destination" className=" ck-tabs-dest" value={destination} options={destinations} onChange={goDestination} />
            </div>
          )}
          <div className="ck-bar-local" data-testid="bar-local" data-destination={destination}>
            <div className="ck-bar-sub" />
            <div className="ck-bar-date" />
          </div>
          <span className="ck-bar-end">
            <span className="ck-bar-options" />
            {note && (
              <BarInfo note={note} updatedAt={compact ? undefined : updatedAt} now={now} timeZone={timeZone}>
                <div className="ck-info-slot" />
                {!compact && <MenuSwitch value={menu} onChange={setMenu} />}
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
        {rail && <Rail value={destination} options={destinations} onChange={goDestination} pageHistory={pageHistory} />}
        {/* every destination stays mounted, so its state lasts as long as the page; only the active one renders */}
        <ScheduleDestination {...shared} active={destination === 'schedule'} odds={odds} teamDate={initial?.teamDate} initialSnap={initial?.snap} openTeam={openTeamStable} onTop={onTop} api={scheduleApi} />
        <CupDestination {...shared} active={cup} initial={initial?.cup} api={cupApi} />
        <StandingsDestination {...shared} active={standings} api={standingsApi} />
        {stPop && slateFits && (
          <Suspense fallback={null}>
            <StandingsPopup data={data} onClose={closeStPop} />
          </Suspense>
        )}
        {tooltip.node}
        {series.node}
        {streakPop.node}
        <div ref={marquee} className="ck-marquee" aria-hidden="true" data-testid="marquee" />
        <SelectionStyle store={selection} scope=".ck-select-area" />
      </div>
    </ClockProvider>
    </TeamLinkContext.Provider>
  );
}
