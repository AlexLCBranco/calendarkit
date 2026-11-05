// Calendar widgets: team month grid and list, league list, league week view and count grid, and CalendarView,
// which combines them behind a League | Team and a List | Calendar switch in a one-row top bar.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange).

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { TeamLinkContext, teamLinkTarget, type TeamLinks } from '../slate/teamLink';
import { addDays, addMonths, dateFormat, hasNationalTv, isOver, localDate, monthOf, seasonMonths, sideLabel, teamGames, weekOf, type CalendarData } from '../data/model';
import { TEAMS, TEAM_BY_ID } from '../data/teams';
import { CaptureStage, CAPTURE_PAD } from './CaptureStage';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { capturePixelRatio, copyAsImage, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { CLOCK_TICK_EVENT, ClockProvider, useClock, useClockValue } from './clock';
import { CopyButton } from './CopyButton';
import type { GameLink } from './GameCard';
import { DatePickButton, DatePicker } from './DatePicker';
import { WEEK_MIN_WIDTH } from './dayflow';
import { leagueListStyle, LeagueListView, ListDaySection, listDays, listTitle, nearestDay } from './LeagueListView';
import { LeagueWeekView, type WeekCount } from './LeagueWeekView';
import { hoverHandlers, useClearHover, useHoverRow } from './MapHover';
import { MonthNavigator } from './MonthNavigator';
import { monthNav, PeriodNav, TodayButton, type PeriodNavProps } from './PeriodNav';
import { Segmented } from './Segmented';
import { SET_OPTIONS, type StandingsSet } from './standingsSets';
import { createSelectionStore, useMarqueeSelection } from './selection';
import { SelectionBar, SelectionStyle } from './SelectionBar';
import { SelectionCapture, type SelectionKind } from './SelectionCapture';
import { slateCopyColumns, slateImageSize, slatePixelRatio } from '../slate/layout';
import type { SlateOdds } from '../slate/odds';
import { SlateCopy, slateGames, SlateView, SLATE_MIN_WIDTH } from './SlateView';
import { localNotesStore } from '../slate/notes';
import { TeamHeader } from './TeamHeader';
import { TeamListView, type TeamListHandle, type TeamListOpen } from './TeamListView';
import { TeamMonthGrid } from './TeamMonthGrid';
import { TeamPicker } from './TeamPicker';
import { useTooltip } from '../slate/tooltip';
import { useSeriesPopup } from '../slate/series';
import { createValueStore, useValue, type ValueStore } from './valueStore';
import { WeekPicker } from './WeekPicker';
import { fmtMonth, fmtRange, isCompact, LEAGUE_LIST_COLUMN, LEAGUE_MAP_GAP, LEAGUE_MAP_MIN, leagueSideBySide, leagueZoom, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, type WidgetSize } from './widget';
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

/** League, Team, or (desktop) Cup: the NBA Cup group standings (round 11), or (desktop) Standings (round 17). */
export type CalendarMode = 'team' | 'league' | 'cup' | 'standings';
/** List, Calendar, or (League, desktop) Slate: a day of games as cards (round 7). */
export type CalendarLayout = 'list' | 'calendar' | 'slate';
/** Team → Calendar: a month grid (default) or 1 or 2 week rows. */
export type TeamSpan = 'month' | 1 | 2;

export interface CalendarState {
  mode: CalendarMode;
  /** List, Calendar or Slate; kept when switching League ↔ Team (Team shows its List while it is Slate). */
  layout: CalendarLayout;
  teamId: number;
  /** League views: the day at the top of the list; the week view shows this day's week. */
  date: string;
  tvOnly: boolean;
  /** Team → List: a quiet row for each day without a game. On by default (round 7, 2.2); the app shell never stores it. */
  showRest: boolean;
  /** League → Calendar: 1 or 2 week rows. */
  weeks: WeekCount;
  /** Team → Calendar: month, 1 week or 2 weeks; kept across teams and List ↔ Calendar. */
  teamSpan: TeamSpan;
}

export interface CalendarViewProps {
  data: CalendarData;
  /** Round 14: the Slate's moneyline odds (the app shell passes liveOddsStore()); none: no odds, no request. */
  odds?: SlateOdds;
  size: WidgetSize;
  /**
   * Initial state; anything missing gets a default (League → List, default day). `teamDate` (round 15, a team link
   * opened in a new tab): the Team view opens on this date instead of the next game.
   */
  initial?: Partial<CalendarState> & { teamDate?: string };
  /**
   * Round 15: the URL of a team's Team view (team links: Ctrl / middle-click → new tab). Given → every team name, logo
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
}

/** Team List or Team Calendar: the Team mode a team link opens (the one used last). */
export type TeamLayout = 'list' | 'calendar';

/** Where a team link goes: the team, in the Team mode used last, on the date being looked at; `state` for the rest of the URL. */
export interface TeamTarget {
  teamId: number;
  layout: TeamLayout;
  date: string;
  state: CalendarState;
}

/** Older than this, the "Data updated" stamp turns orange: the daily update (~11:00 UTC) may have failed. */
export const STALE_AFTER_MS = 36 * 3_600_000;

const NO_GAMES: readonly ScheduleGame[] = [];
const DEFAULT_TEAM = TEAMS[0]!.id;
/** Round 8: the League List's map, its own chunk (outline + styles), loaded after the list is on screen. */
const LeagueMap = lazy(() => import('../map/LeagueMap'));
/** The Team List's map (after round 8): the selected team's road trip, beside the list on desktop. */
const TeamMap = lazy(() => import('../map/TeamMap'));
/** The Team List keeps its 1110 px column; the map comes where LEAGUE_MAP_MIN is left beside it (1920: ~706 px; 1280: none). */
/** Round 11: the Cup standings, their own chunk, loaded (and worked out) only when the Cup view is opened. */
const CupView = lazy(() => import('./CupView'));
/** Round 17: the standings view and the header's condensed popup, one chunk, loaded (and computed) on first use. */
const standingsChunk = () => import('./Standings');
const StandingsView = lazy(standingsChunk);
const StandingsPopup = lazy(() => standingsChunk().then((m) => ({ default: m.StandingsPopup })));
type CupState = { tab: 'standings' | 'schedule'; list: 'league' | 'team'; by: 'group' | 'date'; teamId?: number; night?: string };
const CUP_START: CupState = { tab: 'standings', list: 'league', by: 'group' };
const teamMapFits = (width: number) => width >= TEAM_LIST_MAX_WIDTH + LEAGUE_MAP_GAP + LEAGUE_MAP_MIN;


export function CalendarView({ data, odds, size, initial, now: fixedNow, timeZone, onOpenGame, gameLink, onStateChange, title, note, updatedAt, teamHref }: CalendarViewProps) {
  // The clock (round 7: moves at local midnight and on waking, no minute tick); today's date and the stale stamp read it.
  // `now` (the default day, the next game, games over) is the time the widget opened.
  const clock = useClock(fixedNow, timeZone, localDate);
  const [openedAt] = useState(() => clock.get());
  const now = fixedNow ?? openedAt;
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
  const [leagueMonth, setLeagueMonth] = useState(() => monthOf(state.date));
  // round 15: a team link opened in a new tab names the date to open the Team view on
  const initialTeamDate = initial?.teamDate && /^\d{4}-\d{2}-\d{2}$/.test(initial.teamDate) ? initial.teamDate : undefined;
  const [teamMonth, setTeamMonth] = useState(() => monthOf(initialTeamDate ?? teamDefaultDate(data, state.teamId, now) ?? state.date));
  // Team week views: the first shown day (a Sunday)
  const [teamWeek, setTeamWeek] = useState(() => weekOf(initialTeamDate ?? teamDefaultDate(data, state.teamId, now) ?? state.date)[0]!);
  // Team List: the row a team link asked for (once; the list scrolls it to the top)
  const [teamOpen, setTeamOpen] = useState<TeamListOpen | undefined>(() => (initialTeamDate ? { date: teamListTarget(data, state.teamId, state.tvOnly, state.showRest && !compact, initialTeamDate) } : undefined));
  const [picking, setPicking] = useState(false);
  // the lists' date picker (round 4)
  const [datePick, setDatePick] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tooltip = useTooltip();
  // Slate notes (round 9): the games' notes, saved in localStorage (notes.ts); "Hide all notes" is a view toggle, never stored
  const [notes] = useState(localNotesStore);
  useEffect(() => notes.listen(), [notes]);
  const [hideNotes, setHideNotes] = useState(false);

  const update = useCallback(
    (patch: Partial<CalendarState>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );
  const pickTeam = (teamId: number) => {
    update({ teamId });
    const d = teamDefaultDate(data, teamId, now) ?? state.date;
    setTeamMonth(monthOf(d));
    setTeamWeek(weekOf(d)[0]!);
  };
  const setLayout = (layout: CalendarLayout) => {
    if (layout === 'calendar') setLeagueMonth(monthOf(state.date));
    setPicking(false);
    update({ layout });
  };
  const onSelectDate = useCallback((date: string) => update({ date }), [update]);
  const openDay = (date: string) => update({ date, layout: 'list' });
  // round 14 (item 5): a square of the season-series popup → that day in the League List, the game highlighted (a class
  // on its row, set after the day renders; cleared by the next jump or another day)
  const [picked, setPicked] = useState<string>();
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.querySelectorAll('.ck-series-picked').forEach((r) => r.classList.remove('ck-series-picked'));
    if (!picked || state.mode !== 'league' || state.layout !== 'list') return;
    const row = el.querySelector<HTMLElement>(`[data-testid="league-list"] [data-game-id="${picked}"]`);
    if (!row) return setPicked(undefined); // another day: the highlight is gone
    row.classList.add('ck-series-picked');
    row.scrollIntoView?.({ block: 'nearest' });
  });
  const series = useSeriesPopup(data, { gameLink, onPick: (g) => (setPicked(g.gameId), update({ mode: 'league', layout: 'list', date: g.dateEt })) });
  const team = state.mode === 'team';
  // League → Slate (round 7): desktop only. A Team view, or a widget too narrow for it, shows the List meanwhile (the
  // state keeps "slate", so League comes back to it).
  const slateFits = !compact && size.width >= SLATE_MIN_WIDTH;
  // Cup (round 11): desktop only, like the Slate; a narrower widget shows the League views meanwhile (the state keeps "cup").
  const cup = state.mode === 'cup' && slateFits;
  // Standings (round 17): desktop only too
  const standings = state.mode === 'standings' && slateFits;
  /** A desktop view that isn't a schedule (Cup, Standings): no layout, period, weeks or TV switches. */
  const other = cup || standings;
  // round 18: the column set both conference tables show — kept while the page is open, never stored
  const [stSet, setStSet] = useState<StandingsSet>('main');
  // the condensed popup over any view (desktop)
  const [stPop, setStPop] = useState(false);
  const closeStPop = useCallback(() => setStPop(false), []);
  const slate = !team && !other && state.layout === 'slate' && slateFits;
  // Cup (round 12): Standings | Schedule, the schedule's League | Team, its team and night — never remembered: leaving the
  // Cup view resets them, so it always opens on Standings (then League; no team until one is picked).
  const [cupView, setCupView] = useState<CupState>(CUP_START);
  useEffect(() => {
    if (!cup) setCupView(CUP_START);
  }, [cup]);
  const cupSchedule = cup && cupView.tab === 'schedule';
  const cupTeam = cupSchedule && cupView.list === 'team';
  const onCupNight = useCallback((night: string) => setCupView((v) => (v.night === night ? v : { ...v, night })), []);
  const list = state.layout === 'list' || (state.layout === 'slate' && !slate);
  // today's date from the clock: the view re-renders when the date changes (midnight), not every minute
  const today = useSyncExternalStore(clock.subscribe, () => localDate(clock.get(), timeZone));
  // Midnight with the tab open (round 6, B3; also on waking from sleep or coming back to the tab — the clock reads the
  // time then): every view still showing the old today moves to the new one; a view moved to another day stays put.
  const shownToday = useRef(today);
  useEffect(() => {
    const was = shownToday.current;
    shownToday.current = today;
    if (was === today) return;
    const s = stateRef.current;
    const old = seasonDay(data, was);
    const all = listDays(data, s.tvOnly);
    // the league date: the List's day at the top, or the week view's week
    if (s.layout !== 'calendar' ? nearestDay(all, s.date) === nearestDay(all, old) : weekOf(s.date)[0] === weekOf(old)[0]) update({ date: seasonDay(data, today) });
    setLeagueMonth((m) => (m === monthOf(old) ? monthOf(seasonDay(data, today)) : m));
    setTeamMonth((m) => (m === teamMonthOf(data, was) ? teamMonthOf(data, today) : m));
    setTeamWeek((w) => (w === teamWeekOf(data, was) ? teamWeekOf(data, today) : w));
  }, [today, data, update]);
  const weekView = !team && !list && !slate && size.width >= WEEK_MIN_WIDTH;
  // Team → Calendar week views (desktop/tablet; phones keep the month)
  const teamWeeks = team && !list && !compact && state.teamSpan !== 'month' ? state.teamSpan : undefined;
  // Month → week: the week of today if today is in the shown month, else the month's first week. Week → month: the
  // month of the first shown day. 1 ↔ 2 weeks keeps the first day.
  const setTeamSpan = (teamSpan: TeamSpan) => {
    if (teamSpan !== 'month' && state.teamSpan === 'month') setTeamWeek(weekOf(monthOf(today) === teamMonth ? today : `${teamMonth}-01`)[0]!);
    if (teamSpan === 'month' && state.teamSpan !== 'month') setTeamMonth(monthOf(teamWeek));
    update({ teamSpan });
  };
  const teamList = useRef<TeamListHandle>(null);
  // the picker closes when the view changes; Escape puts the focus back on its icon
  useEffect(() => setDatePick(false), [state.mode, state.layout, state.teamId]);
  const datePickOpen = useRef(false);
  datePickOpen.current = datePick || picking;
  const closeDatePick = (keyboard: boolean) => {
    setDatePick(false);
    if (keyboard) root.current?.querySelector<HTMLElement>('[data-testid="date-pick"]')?.focus();
  };
  // Team List picker: game days show the opponent; a day without a game goes to the next game (none after the last)
  const teamPickGames = useMemo(() => (team && list ? teamGames(data, state.teamId).filter((g) => !state.tvOnly || hasNationalTv(g)) : []), [data, state.teamId, state.tvOnly, team, list]);
  const teamPickCell = useMemo(() => {
    const byDate = new Map(teamPickGames.map((g) => [g.dateEt, sideLabel(g, state.teamId)]));
    const last = teamPickGames.at(-1)?.dateEt ?? '';
    return (date: string) => ({ enabled: date <= last, label: byDate.get(date) });
  }, [teamPickGames, state.teamId]);
  // whether the next game is at the top (the Today button): a store, so scrolling away doesn't re-render the view and
  // every row with it (it did once per scroll away before round 4)
  const [teamAtNext] = useState(() => createValueStore(true));
  // Team List: the date of the row at the top (written while scrolling; read only by the title and the week strip)
  const [teamTop] = useState(() => createValueStore(''));
  // Team List (round 9): one calendar month at a time. Opening the list, another team or the TV filter → the month of
  // the next game not over (the row the list opens at); the strip, the date picker and Today move it from there.
  const teamListKey = `${state.teamId}|${state.tvOnly}|${team && list}`;
  const [teamListAt, setTeamListAt] = useState(() => ({ key: teamListKey, month: teamOpen ? monthOf(teamOpen.date) : teamListMonthOf(data, state.teamId, state.tvOnly, now) }));
  let teamListMonth = teamListAt.month;
  if (teamListAt.key !== teamListKey) {
    teamListMonth = teamListMonthOf(data, state.teamId, state.tvOnly, now);
    setTeamListAt({ key: teamListKey, month: teamListMonth });
  }
  const setTeamListMonth = useCallback((month: string) => setTeamListAt((a) => ({ ...a, month })), []);

  // Top bar navigation for the view on show.
  const days = useMemo(() => listDays(data, state.tvOnly), [data, state.tvOnly]);
  let nav: PeriodNavProps | undefined;
  if (teamWeeks) {
    const span = 7 * teamWeeks;
    nav = {
      title: fmtRange(teamWeek, addDays(teamWeek, span - 1)),
      unit: teamWeeks === 1 ? 'week' : '2 weeks',
      onPrev: () => setTeamWeek(addDays(teamWeek, -span)),
      onNext: () => setTeamWeek(addDays(teamWeek, span)),
      prevDisabled: teamWeek <= weekOf(data.dates[0] ?? teamWeek)[0]!,
      nextDisabled: addDays(teamWeek, span) > (data.dates.at(-1) ?? teamWeek),
    };
  } else if (team && !list) nav = monthNav(teamMonth, seasonMonths(data), setTeamMonth);
  else if (team && compact) nav = { ...monthNav(teamListMonth, teamListMonths(teamPickGames), setTeamListMonth), testId: 'team-month' };
  else if (!team && (list || slate)) {
    const cur = nearestDay(days, state.date);
    const i = days.findIndex((d) => d.date === cur);
    nav = {
      title: listTitle(cur, compact),
      unit: 'day',
      testId: 'day-title',
      onPrev: () => days[i - 1] && update({ date: days[i - 1]!.date }),
      onNext: () => days[i + 1] && update({ date: days[i + 1]!.date }),
      prevDisabled: i <= 0,
      nextDisabled: i < 0 || i >= days.length - 1,
      pick: compact ? undefined : { open: datePick, onToggle: () => setDatePick((o) => !o) },
    };
  } else if (weekView) {
    const start = weekOf(state.date)[0]!;
    const span = 7 * state.weeks;
    const unit = state.weeks === 1 ? 'week' : '2 weeks';
    nav = {
      title: fmtRange(start, addDays(start, span - 1)),
      unit,
      onPrev: () => update({ date: addDays(start, -span) }),
      onNext: () => update({ date: addDays(start, span) }),
      prevDisabled: start <= weekOf(data.dates[0] ?? start)[0]!,
      nextDisabled: addDays(start, span) > (data.dates.at(-1) ?? start),
      onTitleClick: () => setPicking((p) => !p),
      titleExpanded: picking,
    };
  } else if (!team) nav = monthNav(leagueMonth, seasonMonths(data), setLeagueMonth);

  // "Today" (desktop/tablet; phones have no room in the top bar): back to today's games in each view. League:
  // today (the day strip's today, kept inside the season — the rule the page opens with, round 6); Team Calendar: the
  // current month; Team List: the next game.
  const def = seasonDay(data, today);
  if (nav && !compact) {
    if (teamWeeks) {
      const w = teamWeekOf(data, today);
      nav = { ...nav, onToday: () => setTeamWeek(w), todayDisabled: teamWeek === w };
    } else if (team) {
      const m = teamMonthOf(data, today);
      nav = { ...nav, onToday: () => setTeamMonth(m), todayDisabled: teamMonth === m };
    } else if (list || slate) {
      const day = nearestDay(days, def);
      nav = { ...nav, onToday: () => update({ date: day }), todayDisabled: nearestDay(days, state.date) === day };
    } else if (weekView) nav = { ...nav, onToday: () => update({ date: def }), todayDisabled: weekOf(state.date)[0] === weekOf(def)[0] };
    else nav = { ...nav, onToday: () => setLeagueMonth(monthOf(def)), todayDisabled: leagueMonth === monthOf(def) };
  }

  // Slate (round 7) and the League List (round 8): the day changes with ← / → — the top bar's arrows, or the arrow keys
  // anywhere but in a field, a tab row or an open picker (they keep their own arrow keys). Scrolling never changes the
  // day. One listener for whichever of the two is on show, so the keys never act twice.
  const dayKeys = !other && (slate || (!team && list));
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    if (!dayKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || datePickOpen.current) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="tablist"], [role="listbox"], [role="grid"], [role="dialog"]')) return;
      const n = navRef.current;
      if (!n) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft' && !n.prevDisabled) n.onPrev();
      if (e.key === 'ArrowRight' && !n.nextDisabled) n.onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayKeys]);

  // Slate copies (whole day or a selection): the cards on a transparent page, in the column count that suits the page
  // (this window's shape — the whiteboard's page is the window), SLATE_COPY_GAP apart, sharp at 2× their fitted size.
  const [slateCapture, setSlateCapture] = useState<{ games: ScheduleGame[]; cols: number; card: { width: number; height: number }; onReady: (node: HTMLElement) => void }>();
  const copySlate = (button: HTMLButtonElement, games: ScheduleGame[]) => {
    const cards = [...(root.current?.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card') ?? [])];
    if (!games.length || !cards.length) return Promise.reject(new Error('no games to copy'));
    // the on-screen card size: same width, so the text wraps the same; rows as tall as the tallest card
    const card = { width: cards[0]!.getBoundingClientRect().width, height: Math.max(...cards.map((c) => c.getBoundingClientRect().height)) };
    const page = { width: window.innerWidth, height: window.innerHeight };
    const cols = slateCopyColumns(games.length, card, page);
    return new Promise<HTMLCanvasElement>((resolve, reject) =>
      setSlateCapture({
        games,
        cols,
        card,
        onReady: (node) => {
          const ratio = capturePixelRatio(node.scrollWidth, node.scrollHeight, slatePixelRatio(slateImageSize(games.length, cols, card), page));
          button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${ratio}`;
          copyAsImage(node, { pixelRatio: ratio, zoom: 1 }) // no background: transparent around the cards
            .then(resolve, reject)
            .finally(() => setSlateCapture(undefined));
        },
      }),
    );
  };

  // Cup copies: the group cards under their heading, as on screen (the rules and wild-card panels stay out); the Schedule
  // (round 12): the night on show as the League List copies its day, or the team's Cup games with its header — as on screen
  // (the Schedule never scrolls, so the node on screen is the whole view)
  const copyCup = (button: HTMLButtonElement) => {
    const node = root.current?.querySelector<HTMLElement>(cupSchedule ? (cupTeam ? '[data-testid="cup-team"]' : '[data-testid="cup-league"] [data-testid="cup-copy"]') : '[data-testid="cup-grid"]');
    if (!node) return Promise.reject(new Error('the Cup standings are not on screen yet'));
    button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
    return copyElement(node, cupSchedule ? undefined : 1);
  };

  // "Copy view as image": render the view off-screen (CaptureStage), copy it, remove it.
  const [capture, setCapture] = useState<(node: HTMLElement) => void>();
  // The button records the size copied (CSS px) and the pixel ratio used: data-captured="1840x1010@4".
  // Standings (round 17/18): the heading, both conference tables in the current column set and the legend, as on screen
  const copyStandings = (button: HTMLButtonElement) => {
    const node = root.current?.querySelector<HTMLElement>('[data-testid="standings-capture"]');
    if (!node) return Promise.reject(new Error('the standings are not on screen yet'));
    button.dataset.captured = `${node.scrollWidth}x${node.scrollHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
    return copyElement(node, 1);
  };
  const copyView = (button: HTMLButtonElement) =>
    standings ? copyStandings(button) :
    cup ? copyCup(button) :
    slate ? copySlate(button, slateGames(data, nearestDay(days, state.date), state.tvOnly)) :
    new Promise<HTMLCanvasElement>((resolve, reject) =>
      setCapture(() => (node: HTMLElement) => {
        button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
        copyElement(node, 1)
          .then(resolve, reject)
          .finally(() => setCapture(undefined));
      }),
    );
  // League List copies (round 8): the day on show, its rows as on screen (same zoom and column); no week copy any more
  const listDay = days.find((d) => d.date === nearestDay(days, state.date));
  const listStyle = leagueListStyle(size.width);
  const leagueListWidth = listStyle ? Math.ceil(LEAGUE_LIST_COLUMN * leagueZoom(size.width)) : Math.min(size.width, LIST_MAX_WIDTH);
  const capturePeriod = team && list ? undefined : nav?.title; // the Team List's month is in its header
  const fullHeight = { width: size.width, height: 1e6 };

  // Marquee selection of games (desktop/tablet, mouse): only to copy several games as one image. The selected ids live
  // in a store, so selecting re-renders only the highlight <style> and the bar, never the views.
  const [selection] = useState(createSelectionStore);
  const marquee = useRef<HTMLDivElement>(null);
  const onMarquee = useMarqueeSelection(selection, marquee);
  const selKind: SelectionKind | undefined = compact || standings ? undefined : cup ? (cupSchedule ? (cupTeam ? (cupView.teamId !== undefined ? 'team-list' : undefined) : 'league-list') : undefined) : team ? (list ? 'team-list' : 'team-calendar') : slate ? 'league-slate' : list ? 'league-list' : weekView ? 'league-week' : undefined;
  // a new view, team, period, span or toggle clears it (scrolling the League List doesn't)
  const viewKey = [state.mode, state.layout, state.teamId, state.tvOnly, state.showRest, state.weeks, state.teamSpan, teamMonth, teamWeek, leagueMonth, weekView ? weekOf(state.date)[0] : '', slate ? state.date : '', compact, cupView.tab, cupView.list, cupView.by, cupView.teamId, cupView.night].join('|');
  useEffect(() => selection.clear(), [viewKey, selection]);
  const root = useRef<HTMLDivElement>(null);
  // round 8 (Part 3): the game hovered in the League List or on its map; the list's row is lit without re-rendering it
  const [mapHover] = useState(() => createValueStore(''));
  useHoverRow(mapHover, root);
  useClearHover(mapHover, `${state.mode}|${state.layout}|${nearestDay(days, state.date)}|${state.tvOnly}|${state.teamId}`);
  const teamMap = team && list && !compact && teamMapFits(size.width);
  const [selCapture, setSelCapture] = useState<{ ids: ReadonlySet<string>; cellWidth?: number; teamScale?: number; weekStyle?: string; onReady: (node: HTMLElement) => void }>();
  // what a selection image is drawn as: the Cup Schedule's lists like the League / Team List (round 12)
  const selList = cupSchedule || list;
  const selTeam = cup ? cupTeam : team;
  const selTeamId = cupTeam ? cupView.teamId ?? state.teamId : state.teamId;
  const copySelection = (button: HTMLButtonElement) => {
    if (slate) {
      const ids = selection.get();
      return copySlate(button, slateGames(data, nearestDay(days, state.date), state.tvOnly).filter((g) => ids.has(g.gameId)));
    }
    const el = root.current!;
    const cell = el.querySelector('.ck-team-grid .ck-day-cell, .ck-week-grid .ck-month-cell');
    return new Promise<HTMLCanvasElement>((resolve, reject) =>
      setSelCapture({
        ids: selection.get(),
        cellWidth: cell ? cell.getBoundingClientRect().width : undefined,
        teamScale: Number(el.querySelector<HTMLElement>('.ck-team-grid')?.dataset.scale ?? 1),
        weekStyle: el.querySelector('.ck-week-view')?.getAttribute('style') ?? undefined,
        onReady: (node) => {
          button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
          copyElement(node, 1)
            .then(resolve, reject)
            .finally(() => setSelCapture(undefined));
        },
      }),
    );
  };

  // Round 15: team links. The Team mode used last (List or Calendar; this page only — nothing is stored, as for the
  // other toggles; a page opened on a Team view starts from its mode, else List) and the date being looked at are read
  // when a link is pressed, never rendered into the links (no re-render of the cards when they change).
  const lastTeamLayout = useRef<TeamLayout>(initial?.mode === 'team' && initial.layout === 'calendar' ? 'calendar' : 'list');
  const shownTeamLayout: TeamLayout | undefined = team ? (list ? 'list' : 'calendar') : undefined;
  if (shownTeamLayout) lastTeamLayout.current = shownTeamLayout;
  /** The date on show: the day (League List / Slate, a Cup night), the row at the top (Team List), today if it is in the shown week or month, else its first day. */
  const lookingAt = (): string => {
    const inRange = (from: string, to: string) => (today >= from && today <= to ? today : from);
    if (standings) return seasonDay(data, today);
    if (cup) {
      const night = cupSchedule && cupView.list === 'league' && cupView.by === 'date' ? cupView.night : undefined;
      return night ?? seasonDay(data, today);
    }
    if (team) {
      if (list) return teamTop.get() || `${teamListMonth}-01`;
      if (teamWeeks) return inRange(teamWeek, addDays(teamWeek, 7 * teamWeeks - 1));
      return inRange(`${teamMonth}-01`, `${teamMonth}-31`);
    }
    if (list || slate) return nearestDay(days, state.date);
    if (weekView) {
      const start = weekOf(state.date)[0]!;
      return inRange(start, addDays(start, 7 * state.weeks - 1));
    }
    return inRange(`${leagueMonth}-01`, `${leagueMonth}-31`);
  };
  const lookingAtRef = useRef(lookingAt);
  lookingAtRef.current = lookingAt;
  const teamHrefRef = useRef(teamHref);
  teamHrefRef.current = teamHref;
  const [teamLinks] = useState<TeamLinks>(() => ({
    href: (teamId) => teamHrefRef.current?.({ teamId, layout: lastTeamLayout.current, date: lookingAtRef.current(), state: stateRef.current }) ?? '',
  }));
  /** A team link's plain click: that team's Team view here, in the last-used mode, on the date being looked at. */
  const openTeam = (teamId: number) => {
    const date = lookingAtRef.current();
    const layout = lastTeamLayout.current;
    const s = stateRef.current;
    // League's Slate stays League's layout (Team shows its List meanwhile), so League comes back to the Slate
    update({ mode: 'team', teamId, layout: layout === 'list' && s.layout === 'slate' ? 'slate' : layout });
    setTeamMonth(monthOf(date));
    setTeamWeek(weekOf(date)[0]!);
    const target = teamListTarget(data, teamId, s.tvOnly, s.showRest && !compact, date);
    setTeamListAt({ key: `${teamId}|${s.tvOnly}|${layout === 'list'}`, month: monthOf(target) });
    setTeamOpen({ date: target });
    setPicking(false);
    setStPop(false); // a team link in the standings popup: the popup closes on the new view
  };
  const openTeamRef = useRef(openTeam);
  openTeamRef.current = openTeam;
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

  return (
    <TeamLinkContext.Provider value={teamHref ? teamLinks : undefined}>
    <ClockProvider clock={clock}>
      <div
        ref={root}
        onPointerDownCapture={teamHref ? teamPress : undefined}
        onClickCapture={teamHref ? teamClick : undefined}
        className={`ck-root ck-select-area${compact ? ' ck-compact' : ''}${teamMap ? ' ck-team-side' : ''}${list || slate ? ' ck-root-fill' : ' ck-root-grow'}`}
        onPointerDown={selKind ? onMarquee : undefined}
        style={{ maxWidth: size.width, height: list || slate ? size.height : undefined, minHeight: list || slate || compact ? undefined : size.height }}
        onMouseOver={(e) => (tooltip.handlers.onMouseOver(e), series.handlers.onMouseOver(e))}
        onFocus={(e) => (tooltip.handlers.onFocus(e), series.handlers.onFocus(e))}
        onMouseLeave={() => (tooltip.handlers.onMouseLeave(), series.handlers.onMouseLeave())}
        onBlur={tooltip.handlers.onBlur}
      >
        <div className="ck-toolbar" data-testid="top-bar">
          {/* round 17: phones, and the Team views on desktop (the team header names the team; with the Standings tab and button their
              busiest row, Team → Calendar, no longer fit 1920 px), keep the title for screen readers only */}
          {title && <h1 className={`ck-title${compact || team ? ' ck-sr' : ''}`}>{title}</h1>}
          <Segmented label="View" className=" ck-tabs-view" value={cup ? 'cup' : standings ? 'standings' : state.mode === 'cup' || state.mode === 'standings' ? 'league' : state.mode} options={[['league', 'League'], ['team', 'Team'], ...(slateFits ? ([['cup', 'Cup'], ['standings', 'Standings']] as [CalendarMode, string][]) : [])]} onChange={(mode) => update({ mode })} />
          {cup && <Segmented label="Cup view" value={cupView.tab} options={[['standings', 'Standings'], ['schedule', 'Schedule']]} onChange={(tab) => setCupView((v) => ({ ...v, tab }))} />}
          {cupSchedule && <Segmented label="Cup list" value={cupView.list} options={[['league', 'League'], ['team', 'Team']]} onChange={(list) => setCupView((v) => ({ ...v, list }))} />}
          {cupSchedule && !cupTeam && <Segmented label="Cup layout" value={cupView.by} options={[['group', 'By group'], ['date', 'By date']]} onChange={(by) => setCupView((v) => ({ ...v, by }))} />}
          {standings && <Segmented label="Standings columns" value={stSet} options={SET_OPTIONS} onChange={setStSet} />}
          {cupTeam && <TeamPicker teamId={cupView.teamId} onChange={(teamId) => setCupView((v) => ({ ...v, teamId }))} />}
          {!other && <Segmented label="Layout" value={slate ? 'slate' : list ? 'list' : 'calendar'} options={[['list', 'List'], ['calendar', 'Calendar'], ...(team || !slateFits ? [] : ([['slate', 'Slate']] as [CalendarLayout, string][]))]} onChange={setLayout} />}
          {team && <TeamPicker teamId={state.teamId} onChange={pickTeam} compact={compact} />}
          {nav && !other && (
            <div className="ck-period-wrap">
              <PeriodNav {...nav} />
              {picking && weekView && (
                <WeekPicker
                  data={data}
                  start={weekOf(state.date)[0]!}
                  weeks={state.weeks}
                  tvOnly={state.tvOnly}
                  size={size}
                  today={today}
                  onPick={(date) => {
                    setPicking(false);
                    update({ date: weekOf(date)[0]! });
                  }}
                  onClose={() => setPicking(false)}
                />
              )}
              {datePick && !team && (list || slate) && !compact && (
                <DatePicker
                  data={data}
                  date={nearestDay(days, state.date)}
                  tvOnly={state.tvOnly}
                  today={today}
                  onPick={(date) => {
                    setDatePick(false);
                    update({ date });
                  }}
                  onClose={closeDatePick}
                />
              )}
            </div>
          )}
          {team && list && !compact && (
            <div className="ck-period-wrap">
              <div className="ck-nav ck-period">
                <TeamDayTitle store={teamTop} />
                <DatePickButton open={datePick} onClick={() => setDatePick((o) => !o)} />
                <StoreTodayButton store={teamAtNext} onClick={() => teamList.current?.toNext()} />
              </div>
              {datePick && (
                <DatePicker
                  data={data}
                  date={teamTop.get() || today}
                  tvOnly={state.tvOnly}
                  today={today}
                  cell={teamPickCell}
                  onPick={(date) => {
                    setDatePick(false);
                    teamList.current?.toDate(date);
                  }}
                  onClose={closeDatePick}
                />
              )}
            </div>
          )}
          {weekView && !other && <Segmented label="Weeks" value={String(state.weeks) as '1' | '2'} options={[['1', '1 week'], ['2', '2 weeks']]} onChange={(w) => update({ weeks: w === '2' ? 2 : 1 })} />}
          {team && !list && !compact && (
            <Segmented
              label="Span"
              value={String(state.teamSpan) as '1' | '2' | 'month'}
              options={[['1', '1 week'], ['2', '2 weeks'], ['month', 'Month']]}
              onChange={(v) => setTeamSpan(v === 'month' ? 'month' : v === '2' ? 2 : 1)}
            />
          )}
          {team && list && !compact && (
            <label className="ck-check">
              <input type="checkbox" aria-label="Show rest days" checked={state.showRest} onChange={(e) => update({ showRest: e.target.checked })} /> Show rest days
            </label>
          )}
          {!other && <label className="ck-check">
            <input type="checkbox" aria-label="TV games only" checked={state.tvOnly} onChange={(e) => update({ tvOnly: e.target.checked })} /> {compact ? 'TV only' : 'TV games only'}
          </label>}
          {note &&
            (compact ? (
              <span className="ck-note ck-note-icon" data-tip={note} aria-label={note} role="img" tabIndex={0}>
                i
              </span>
            ) : (
              <span className="ck-notes">
                <span className="ck-note" data-testid="tz-note">
                  {note}
                </span>
                {updatedAt && <DataStamp updatedAt={updatedAt} now={now} timeZone={timeZone} />}
              </span>
            ))}
          {slateFits && (
            <button type="button" className="ck-st-button" aria-expanded={stPop} aria-haspopup="dialog" data-testid="standings-button" onClick={() => setStPop((o) => !o)}>
              Standings
            </button>
          )}
          <CopyButton label="Copy view as image" copy={copyView} testId="copy-view" />
        </div>
        {team && <TeamHeader teamId={state.teamId} compact={compact} period={list && !compact ? fmtMonth(teamListMonth) : undefined} />}
        {standings ? (
          <Suspense fallback={<p className="ck-empty">Loading the standings…</p>}>
            <StandingsView data={data} set={stSet} />
          </Suspense>
        ) : cup ? (
          <Suspense fallback={<p className="ck-empty">Loading the Cup standings…</p>}>
            <CupView data={data} schedule={cupSchedule ? { list: cupView.list, by: cupView.by, teamId: cupView.teamId, size, now, today, timeZone, onOpenGame, gameLink, onNight: onCupNight } : undefined} />
          </Suspense>
        ) : team ? (
          teamMap ? (
            <div className="ck-league-split" {...hoverHandlers(mapHover)}>
              <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} handle={teamList} openAt={teamOpen} onAtNext={teamAtNext.set} topStore={teamTop} today={today} month={teamListMonth} onMonthChange={setTeamListMonth} />
              <div className="ck-map-slot">
                <NextFrame>
                  <Suspense fallback={null}>
                    <TeamMap data={data} teamId={state.teamId} now={now} room={{ width: size.width - TEAM_LIST_MAX_WIDTH - LEAGUE_MAP_GAP, height: size.height - 120 }} hover={mapHover} />
                  </Suspense>
                </NextFrame>
              </div>
            </div>
          ) : list ? (
            <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} handle={teamList} openAt={teamOpen} onAtNext={teamAtNext.set} topStore={teamTop} today={today} month={teamListMonth} onMonthChange={setTeamListMonth} />
          ) : (
            <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} today={today} />
          )
        ) : slate ? (
          <SlateView data={data} date={nearestDay(days, state.date)} tvOnly={state.tvOnly} timeZone={timeZone} gameLink={gameLink} width={size.width} notes={notes} odds={odds} hideNotes={hideNotes} onHideNotes={setHideNotes} />
        ) : list && leagueSideBySide(size.width) ? (
          // round 8: the map beside the list (desktop); it stays put while a busy night scrolls
          <div className="ck-league-split" {...hoverHandlers(mapHover)}>
            <LeagueListView data={data} date={state.date} onSelectDate={onSelectDate} tvOnly={state.tvOnly} size={size} now={now} today={today} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} nav={false} />
            <div className="ck-map-slot">
              <NextFrame>
                <Suspense fallback={null}>
                  <LeagueMap data={data} games={listDay?.games ?? NO_GAMES} room={{ width: size.width - leagueListWidth - LEAGUE_MAP_GAP, height: size.height - 48 }} hover={mapHover} />
                </Suspense>
              </NextFrame>
            </div>
          </div>
        ) : list ? (
          <LeagueListView data={data} date={state.date} onSelectDate={onSelectDate} tvOnly={state.tvOnly} size={size} now={now} today={today} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} nav={false} />
        ) : weekView ? (
          <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} gameLink={gameLink} />
        ) : (
          <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />
        )}
        {stPop && slateFits && (
          <Suspense fallback={null}>
            <StandingsPopup data={data} onClose={closeStPop} />
          </Suspense>
        )}
        {tooltip.node}
        {series.node}
        <div ref={marquee} className="ck-marquee" aria-hidden="true" data-testid="marquee" />
        <SelectionStyle store={selection} scope=".ck-select-area" />
        {selKind && <SelectionBar store={selection} copy={copySelection} />}
        {slateCapture && (
          <CaptureStage onReady={slateCapture.onReady} width={slateImageSize(slateCapture.games.length, slateCapture.cols, slateCapture.card).width} className=" ck-slate-capture">
            <SlateCopy data={data} games={slateCapture.games} cols={slateCapture.cols} cardWidth={slateCapture.card.width} timeZone={timeZone} notes={hideNotes ? undefined : notes} odds={odds?.get(slateCapture.games[0]!.dateEt)} />
          </CaptureStage>
        )}
        {selCapture && selKind && selKind !== 'league-slate' && (
          <CaptureStage
            onReady={selCapture.onReady}
            width={(selList ? (selTeam ? Math.min(size.width, TEAM_LIST_MAX_WIDTH) : leagueListWidth) : Math.max(selCapture.cellWidth ?? 0, 360)) + 2 * CAPTURE_PAD}
            className={selList ? ' ck-root-fill' : ' ck-root-grow'}
          >
            <div className="ck-capture-head">
              {title && <span className="ck-title">{title}</span>}
              {cup && <span className="ck-capture-period">NBA Cup</span>}
              {!selList && nav?.title && <span className="ck-capture-period">{nav.title}</span>}
              {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
              {note && <span className="ck-note">{note}</span>}
            </div>
            {selTeam && <TeamHeader teamId={selTeamId} compact={compact} />}
            <SelectionCapture
              kind={selKind}
              data={data}
              ids={selCapture.ids}
              teamId={selTeamId}
              tvOnly={state.tvOnly && !cup}
              cup={cup}
              size={size}
              now={now}
              timeZone={timeZone}
              cellWidth={selCapture.cellWidth}
              teamScale={selCapture.teamScale}
              weekStyle={selCapture.weekStyle}
              weeks={state.weeks}
            />
          </CaptureStage>
        )}
        {capture && (
          <CaptureStage onReady={capture} width={(list ? (team ? Math.min(size.width, TEAM_LIST_MAX_WIDTH) : leagueListWidth) : size.width) + 2 * CAPTURE_PAD} className={`${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`} minHeight={list || compact ? undefined : size.height}>
            <div className="ck-capture-head">
              {title && <span className="ck-title">{title}</span>}
              {capturePeriod && <span className="ck-capture-period">{capturePeriod}</span>}
              {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
              {note && <span className="ck-note">{note}</span>}
            </div>
            {team && <TeamHeader teamId={state.teamId} compact={compact} period={list ? fmtMonth(teamListMonth) : undefined} />}
            {team ? (
              list ? (
                <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={fullHeight} now={now} timeZone={timeZone} month={teamListMonth} />
              ) : (
                <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} today={today} />
              )
            ) : list ? (
              <section className={`ck-league-list${listStyle ? ' ck-league-side' : ''}`} aria-label="League schedule" style={listStyle}>
                <div className="ck-llist">{listDay ? <ListDaySection day={listDay} data={data} compact={compact} fatigueSlots={size.width >= LIST_MAX_WIDTH} now={now} timeZone={timeZone} series /> : <p className="ck-empty">No games.</p>}</div>
              </section>
            ) : weekView ? (
              <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} />
            ) : (
              <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />
            )}
          </CaptureStage>
        )}
      </div>
    </ClockProvider>
    </TeamLinkContext.Provider>
  );
}

/** Team view opens on the month of the team's next game not over yet (else its last game). */
/** The league views' day for the local date `today` (round 6, B2: the page always opens on it): today, kept inside the season. */
export function seasonDay(data: CalendarData, today: string): string {
  const first = data.dates[0];
  const last = data.dates.at(-1);
  return !first || !last ? today : today < first ? first : today > last ? last : today;
}

/**
 * Renders its children from the frame after it mounts: the maps come one frame after their list, so switching to a
 * list view costs what it did before the maps (perf guard "switching views"; the Team List switch measured 120 ms
 * against a 121.5 ms limit with the map in the same frame).
 */
function NextFrame({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on ? <>{children}</> : null;
}

/** Team Calendar: the month with `today`, kept inside the season's months. */
function teamMonthOf(data: CalendarData, today: string): string {
  const months = seasonMonths(data);
  const cur = monthOf(today);
  return months.length && cur < months[0]! ? months[0]! : months.length && cur > months.at(-1)! ? months.at(-1)! : cur;
}

/** Team Calendar week views: the week (its Sunday) with `today`, kept inside the season's weeks. */
function teamWeekOf(data: CalendarData, today: string): string {
  const first = weekOf(data.dates[0] ?? today)[0]!;
  const last = weekOf(data.dates.at(-1) ?? today)[0]!;
  const w = weekOf(today)[0]!;
  return w < first ? first : w > last ? last : w;
}

/** Team List: the month of the next game not over (TV filter applied), else of the last game. */
function teamListMonthOf(data: CalendarData, teamId: number, tvOnly: boolean, now: number): string {
  const games = teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g));
  return monthOf((games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt ?? data.dates[0] ?? localDate(now));
}

/**
 * Round 15: the Team List row a team link opens at for `date`: that day (a game, or a rest day while rest days show and it
 * is inside the team's season), else the team's next game after it, else its last game.
 */
export function teamListTarget(data: CalendarData, teamId: number, tvOnly: boolean, showRest: boolean, date: string): string {
  const games = teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g));
  const first = games[0]?.dateEt;
  const last = games.at(-1)?.dateEt;
  if (!first || !last) return date;
  if (showRest && date >= first && date <= last) return date;
  return games.find((g) => g.dateEt >= date)?.dateEt ?? last;
}

/** The months from a team's first to its last game. */
function teamListMonths(games: readonly ScheduleGame[]): string[] {
  const out: string[] = [];
  const last = games.at(-1);
  for (let m = games[0] && monthOf(games[0].dateEt); m && last && m <= monthOf(last.dateEt); m = addMonths(m, 1)) out.push(m);
  return out;
}

function teamDefaultDate(data: CalendarData, teamId: number, now: number): string | undefined {
  const games = teamGames(data, teamId);
  return (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt;
}

/** "Data updated Oct 23, 08:29" in the viewer's zone; orange with a tooltip once the data is older than 36 h. */
function DataStamp({ updatedAt, now, timeZone }: { updatedAt: string; now: number; timeZone?: string }) {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  const stale = useClockValue((n) => n - t > STALE_AFTER_MS, now);
  // turns orange when it crosses 36 h: one timeout makes the clock read the time then (it has no minute tick, round 7)
  useEffect(() => {
    const left = t + STALE_AFTER_MS - Date.now();
    if (stale || left <= 0 || left > 2 ** 31 - 1) return;
    const id = setTimeout(() => window.dispatchEvent(new Event(CLOCK_TICK_EVENT)), left + 50);
    return () => clearTimeout(id);
  }, [t, stale]);
  const when = dateFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(t);
  const tip = stale ? 'Data is more than 36 hours old: the daily update may have failed.' : undefined;
  return (
    <span className={`ck-stamp${stale ? ' ck-stamp-stale' : ''}`} data-testid="data-updated" data-tip={tip} tabIndex={stale ? 0 : undefined}>
      Data updated {when}
    </span>
  );
}

/** Team List: the date of the row at the top ("Sunday, November 15, 2026"), from the store — re-renders alone. */
function TeamDayTitle({ store }: { store: ValueStore<string> }) {
  const date = useValue(store);
  return (
    <h2 className="ck-nav-title ck-team-day-title" data-testid="team-day-title">
      {date ? listTitle(date, false) : ''}
    </h2>
  );
}

/** Today, disabled while the store says the list is already there. */
function StoreTodayButton({ store, onClick }: { store: ValueStore<boolean>; onClick: () => void }) {
  return <TodayButton onClick={onClick} disabled={useValue(store)} />;
}
