// The Schedule destination: League (List · Calendar · Slate) or Team (List · Calendar) by the scope picker.

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addDays, addMonths, hasNationalTv, isOver, localDate, monthOf, seasonMonths, sideLabel, teamGames, weekOf, type CalendarData } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { slateCopyCardWidth, slateCopyColumns, slateCopyZoom, slateImageSize, slatePixelRatio } from '../slate/layout';
import { localNotesStore } from '../slate/notes';
import type { SlateOdds } from '../slate/odds';
import { slateCopyCup } from '../slate/SlateCard';
import { fmtShortMonth, fmtMonthSpan, seasonDay, teamDefaultDate, teamListTarget, type CalendarLayout, type CalendarState, type TeamLayout, type TeamSpan, type ViewSnapshot } from './calendarState';
import { CaptureStage, CAPTURE_PAD } from './CaptureStage';
import { capturePixelRatio, copyAsImage, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { DatePicker } from './DatePicker';
import { WEEK_MIN_WIDTH } from './dayflow';
import { DestinationFrame, leagueListWidth, SelectionCopyStage, useSelectionCopy, type DestinationApi, type DestinationProps } from './destination';
import { FatigueLegend } from './FatigueMark';
import { FATIGUE_SLOTS_MIN_WIDTH, leagueListStyle, LeagueListView, ListDaySection, listDays, listTitle, nearestDay } from './LeagueListView';
import { LeagueWeekView } from './LeagueWeekView';
import { hoverHandlers, useClearHover, useHoverRow } from './MapHover';
import { MonthNavigator } from './MonthNavigator';
import { monthNav, PeriodNav, type PeriodNavProps } from './PeriodNav';
import { OptionsIcon } from './Menu';
import { PopoverButton } from './Popover';
import { Segmented } from './Segmented';
import { SelectionBar } from './SelectionBar';
import type { SelectionKind } from './SelectionCapture';
import { SlateCopy, slateGames, SlateView, SLATE_MIN_WIDTH } from './SlateView';
import { TeamHeader } from './TeamHeader';
import { TeamListView, type TeamListHandle, type TeamListOpen } from './TeamListView';
import { TeamMonthGrid } from './TeamMonthGrid';
import { TeamPicker } from './TeamPicker';
import { createValueStore, useValue, type ValueStore } from './valueStore';
import { WeekPicker } from './WeekPicker';
import { fmtRange, isCompact, LEAGUE_MAP_GAP, LEAGUE_MAP_MIN, leagueSideBySide, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, type WidgetSize } from './widget';

const NO_GAMES: readonly ScheduleGame[] = [];
/** The League List's map, its own chunk (outline + styles), loaded after the list is on screen. */
const LeagueMap = lazy(() => import('../map/LeagueMap'));
/** The Team List's map: the selected team's road trip, beside the list on desktop. */
const TeamMap = lazy(() => import('../map/TeamMap'));
/** The Team List keeps its 1110 px column; the map comes where LEAGUE_MAP_MIN is left beside it (1920: ~706 px; 1280: none). */
const teamMapFits = (width: number) => width >= TEAM_LIST_MAX_WIDTH + LEAGUE_MAP_GAP + LEAGUE_MAP_MIN;

/**
 * Which Schedule view the state shows at this size. The shell reads it too: the root's sizing and the top bar's
 * auto-hide follow the view. `list` also holds outside the Schedule (the Cup and Standings keep the state's layout).
 */
export function scheduleShape(state: CalendarState, size: WidgetSize) {
  const compact = isCompact(size);
  const team = state.mode === 'team';
  // League → Slate, the Cup and Standings: desktop only. A narrower widget shows the League views meanwhile (the state
  // keeps "slate" or "cup", so they come back).
  const slateFits = !compact && size.width >= SLATE_MIN_WIDTH;
  const other = (state.mode === 'cup' || state.mode === 'standings') && slateFits;
  const slate = !team && !other && state.layout === 'slate' && slateFits;
  const list = state.layout === 'list' || (state.layout === 'slate' && !slate);
  const teamMap = team && list && !compact && teamMapFits(size.width);
  return { team, slate, list, teamMap };
}

export interface ScheduleApi extends DestinationApi {
  /** The date-only parts of the page (a change is a day step). */
  dateKey(): unknown[];
  snap(): Pick<ViewSnapshot, 'leagueMonth' | 'teamMonth' | 'teamWeek' | 'teamListMonth' | 'teamListTo' | 'top'>;
  restore(snap: ViewSnapshot): void;
  /** A team link: the Team view's month, week and List row for `date` (the shell sets the mode and team). */
  showTeam(teamId: number, layout: TeamLayout, date: string, s: CalendarState): void;
}

export interface ScheduleProps extends DestinationProps {
  odds?: SlateOdds;
  /** A team link opened in a new tab: the Team view opens on this date instead of the next game. */
  teamDate?: string;
  /** A reloaded tab: its months, weeks and Team List row as they were (the shell sets the state). */
  initialSnap?: ViewSnapshot;
  /** A team link's or the scope picker's team: that team's Team view (the shell's team-link rule). */
  openTeam: (teamId: number, view?: TeamLayout) => void;
  /** Page history: the Team List's row at the top changed while its page is the one on screen. */
  onTop: (top: string) => void;
  api: RefObject<ScheduleApi | undefined>;
}

export function ScheduleDestination(p: ScheduleProps) {
  const { active, data, size, now, today, timeZone, compact, barShort, slateFits, state, update, root, onOpenGame, gameLink, title, note, slots, selection, jump, odds, openTeam } = p;
  const { team, slate, list, teamMap } = scheduleShape(state, size);
  const snap0 = p.initialSnap;
  const [leagueMonth, setLeagueMonth] = useState(() => snap0?.leagueMonth ?? monthOf(state.date));
  const initialTeamDate = p.teamDate && /^\d{4}-\d{2}-\d{2}$/.test(p.teamDate) ? p.teamDate : undefined;
  const [teamMonth, setTeamMonth] = useState(() => snap0?.teamMonth ?? monthOf(initialTeamDate ?? teamDefaultDate(data, state.teamId, now) ?? state.date));
  // Team week views: the first shown day (a Sunday)
  const [teamWeek, setTeamWeek] = useState(() => snap0?.teamWeek ?? weekOf(initialTeamDate ?? teamDefaultDate(data, state.teamId, now) ?? state.date)[0]!);
  // Team List: the row a team link (or a reloaded page) asked for (once; the list scrolls it to the top)
  const [teamOpen, setTeamOpen] = useState<TeamListOpen | undefined>(() => (snap0?.top && state.mode === 'team' ? { date: snap0.top } : initialTeamDate ? { date: teamListTarget(data, state.teamId, state.tvOnly, state.showRest && !compact, initialTeamDate) } : undefined));
  // the League week view's week picker
  const [picking, setPicking] = useState(false);
  // the lists' date picker
  const [datePick, setDatePick] = useState(false);
  // Slate notes: the games' notes, saved in localStorage (notes.ts); "Hide all notes" is a view toggle, on at every
  // load and never stored (as "Show rest days"); the stored notes are untouched by it
  const [notes] = useState(localNotesStore);
  useEffect(() => notes.listen(), [notes]);
  const [hideNotes, setHideNotes] = useState(true);
  const [slateFocus, setSlateFocus] = useState<{ teamId: number; date: string }>();

  const pickTeam = (teamId: number) => {
    update({ teamId });
    const d = teamDefaultDate(data, teamId, now) ?? state.date;
    setTeamMonth(monthOf(d));
    setTeamWeek(weekOf(d)[0]!);
  };
  const setLayout = (layout: CalendarLayout) => {
    setPicking(false);
    // Slate is a league-wide day view, always offered. From a team: All teams on the date being looked
    // at, that team's game highlighted and scrolled into view (or a note when it doesn't play that day).
    if (layout === 'slate' && state.mode === 'team') {
      const date = nearestDay(days, lookingAt());
      setSlateFocus({ teamId: state.teamId, date });
      return update({ mode: 'league', layout, date });
    }
    if (layout === 'calendar') setLeagueMonth(monthOf(state.date));
    update({ layout });
  };
  const onSelectDate = useCallback((date: string) => update({ date }), [update]);
  const openDay = (date: string) => update({ date, layout: 'list' });

  // Midnight with the tab open (also on waking from sleep or coming back to the tab — the clock reads the
  // time then): every view still showing the old today moves to the new one; a view moved to another day stays put.
  const shownToday = useRef(today);
  const stateRef = useRef(state);
  stateRef.current = state;
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
  // every row with it
  const [teamAtNext] = useState(() => createValueStore(true));
  // Team List: the date of the row at the top (written while scrolling; read only by the title and the week strip)
  const [teamTop] = useState(() => createValueStore(''));
  // Team List: one calendar month at a time. Opening the list, another team or the TV filter → the month of
  // the next game not over (the row the list opens at); the strip, the date picker and Today move it from there.
  const teamListKey = `${state.teamId}|${state.tvOnly}|${team && list}`;
  const [teamListAt, setTeamListAt] = useState<{ key: string; month: string; to?: string }>(() => (snap0 && team && list ? { key: teamListKey, month: snap0.teamListMonth, to: snap0.teamListTo } : { key: teamListKey, month: teamOpen ? monthOf(teamOpen.date) : teamListMonthOf(data, state.teamId, state.tvOnly, now) }));
  let teamListMonth = teamListAt.month;
  // The last month loaded (Load earlier / more games); one month unless the buttons added some
  let teamListTo = teamListAt.to ?? teamListMonth;
  if (teamListAt.key !== teamListKey) {
    teamListMonth = teamListMonthOf(data, state.teamId, state.tvOnly, now);
    teamListTo = teamListMonth;
    setTeamListAt({ key: teamListKey, month: teamListMonth });
  }
  const setTeamListMonth = useCallback((month: string) => setTeamListAt((a) => ({ key: a.key, month })), []);
  // the same page with more rows: its history entry is updated (replace), so back to it brings the months back
  const loadTeamMonths = useCallback((month: string, to: string) => setTeamListAt((a) => ({ key: a.key, month, to })), []);
  const teamListPeriod = fmtMonthSpan(teamListMonth, teamListTo);

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
      title: listTitle(cur, compact || barShort),
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
      pick: { open: picking, onToggle: () => setPicking((p) => !p) },
    };
  } else if (!team) nav = { ...monthNav(leagueMonth, seasonMonths(data), setLeagueMonth), pick: compact ? undefined : { open: datePick, onToggle: () => setDatePick((o) => !o) } };
  // The Team Calendar gets the calendar picker too (every view with a date has one)
  if (team && !list && nav && !compact) nav = { ...nav, pick: { open: datePick, onToggle: () => setDatePick((o) => !o) } };

  // "Today" (desktop/tablet; phones have no room in the top bar): back to today's games in each view. League:
  // today (the day strip's today, kept inside the season — the rule the page opens with); Team Calendar: the
  // current month; Team List: the next game.
  const def = seasonDay(data, today);
  const asJump = (fn: () => void) => () => (jump(), fn());
  if (nav && !compact) {
    if (teamWeeks) {
      const w = teamWeekOf(data, today);
      nav = { ...nav, onToday: asJump(() => setTeamWeek(w)), todayDisabled: teamWeek === w };
    } else if (team) {
      const m = teamMonthOf(data, today);
      nav = { ...nav, onToday: asJump(() => setTeamMonth(m)), todayDisabled: teamMonth === m };
    } else if (list || slate) {
      const day = nearestDay(days, def);
      nav = { ...nav, onToday: asJump(() => update({ date: day })), todayDisabled: nearestDay(days, state.date) === day };
    } else if (weekView) nav = { ...nav, onToday: asJump(() => update({ date: def })), todayDisabled: weekOf(state.date)[0] === weekOf(def)[0] };
    else nav = { ...nav, onToday: asJump(() => setLeagueMonth(monthOf(def))), todayDisabled: leagueMonth === monthOf(def) };
  }

  // Slate and the League List: the day changes with ← / → — the top bar's arrows, or the arrow keys
  // anywhere but in a field, a tab row or an open picker (they keep their own arrow keys). Scrolling never changes the
  // day. One listener for whichever of the two is on show, so the keys never act twice.
  const dayKeys = active && (slate || (!team && list));
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
    // the card size: info-only cards as on screen; with notes no wider than the enlarged info and the label need
    // (slateCopyCardWidth); rows as tall as the tallest card. The copy draws the info larger (the note box under it keeps
    // its size), so its cards are that much taller: each card's info height × (zoom − 1) more — an estimate (the note
    // may wrap narrower than on screen); the real heights follow once drawn
    const cup = slateCopyCup(data, games);
    const onScreen = cards[0]!.getBoundingClientRect().width;
    const width = hideNotes ? onScreen : slateCopyCardWidth(onScreen, cup);
    const zoom = slateCopyZoom(width, cup, !hideNotes);
    const grown = (c: HTMLElement) => c.getBoundingClientRect().height + (c.querySelector('.ck-slate-info')?.getBoundingClientRect().height ?? 0) * (zoom - 1);
    const shown = { width, height: Math.max(...cards.map(grown)) };
    const page = { width: window.innerWidth, height: window.innerHeight };
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      // the columns from the estimated card; once drawn, from the copy's real card height (zoomed text rounds its own
      // way) — if that picks other columns, it is laid out once more, then taken
      const stage = (card: { width: number; height: number }, again: boolean) => {
        const cols = slateCopyColumns(games.length, card, page);
        setSlateCapture({
          games,
          cols,
          card,
          onReady: (node) => {
            const real = { width: card.width, height: Math.max(...[...node.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => c.getBoundingClientRect().height)) };
            if (again && slateCopyColumns(games.length, real, page) !== cols) return stage(real, false);
            const ratio = capturePixelRatio(node.scrollWidth, node.scrollHeight, slatePixelRatio(slateImageSize(games.length, cols, real), page));
            button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${ratio}`;
            copyAsImage(node, { pixelRatio: ratio, zoom: 1 }) // no background: transparent around the cards
              .then(resolve, reject)
              .finally(() => setSlateCapture(undefined));
          },
        });
      };
      stage(shown, true);
    });
  };

  // "Copy view as image": render the view off-screen (CaptureStage), copy it, remove it. The button records the size
  // copied (CSS px) and the pixel ratio used: data-captured="1840x1010@4".
  const [capture, setCapture] = useState<(node: HTMLElement) => void>();
  const copyView = (button: HTMLButtonElement) =>
    slate ? copySlate(button, slateGames(data, nearestDay(days, state.date), state.tvOnly)) :
    new Promise<HTMLCanvasElement>((resolve, reject) =>
      setCapture(() => (node: HTMLElement) => {
        button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
        copyElement(node, 1)
          .then(resolve, reject)
          .finally(() => setCapture(undefined));
      }),
    );
  // League List copies: the day on show, its rows as on screen (same zoom and column)
  const listDay = days.find((d) => d.date === nearestDay(days, state.date));
  const listStyle = leagueListStyle(size.width);
  const listWidth = leagueListWidth(size);
  const capturePeriod = team && list ? undefined : nav?.title; // the Team List's month is in its header
  const fullHeight = { width: size.width, height: 1e6 };

  // Marquee selection of games (desktop/tablet, mouse): only to copy several games as one image
  const selKind: SelectionKind | undefined = compact ? undefined : team ? (list ? 'team-list' : 'team-calendar') : slate ? 'league-slate' : list ? 'league-list' : weekView ? 'league-week' : undefined;
  // another period or day clears it (scrolling the League List doesn't); the shell clears it on the rest
  const shownWeek = weekView ? weekOf(state.date)[0] : '';
  const slateDay = slate ? state.date : '';
  useEffect(() => selection.clear(), [teamMonth, teamWeek, leagueMonth, shownWeek, slateDay, selection]);
  const [selCapture, copyListSelection] = useSelectionCopy(root, selection);
  const copySelection = (button: HTMLButtonElement) => {
    if (!slate) return copyListSelection(button);
    const ids = selection.get();
    return copySlate(button, slateGames(data, nearestDay(days, state.date), state.tvOnly).filter((g) => ids.has(g.gameId)));
  };
  // The game hovered in the League List or on its map; the list's row is lit without re-rendering it
  const [mapHover] = useState(() => createValueStore(''));
  useHoverRow(mapHover, root);
  useClearHover(mapHover, `${state.mode}|${state.layout}|${nearestDay(days, state.date)}|${state.tvOnly}|${state.teamId}`);

  /** The date on show: the day (League List / Slate), the row at the top (Team List), today if it is in the shown week or month, else its first day. */
  const lookingAt = (): string => {
    const inRange = (from: string, to: string) => (today >= from && today <= to ? today : from);
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
  /** The scope picker's "×" / "All teams": the league views on the date being looked at. */
  const toAllTeams = () => {
    const date = lookingAt();
    setLeagueMonth(monthOf(date));
    update({ mode: 'league', date });
  };
  const slateFocusTeam = slate && slateFocus && slateFocus.date === nearestDay(days, state.date) ? slateFocus.teamId : undefined;
  useEffect(() => {
    if (slateFocus && slateFocusTeam === undefined) setSlateFocus(undefined);
  }, [slateFocus, slateFocusTeam]);

  // the Team List's row at the top follows the scrolling into the page's snapshot
  const onTop = p.onTop;
  useEffect(() => teamTop.subscribe(() => onTop(teamTop.get())), [teamTop, onTop]);
  useEffect(() => p.rendered());

  p.api.current = {
    dateKey: () => [leagueMonth, teamMonth, teamWeek, teamListMonth, teamListTo],
    snap: () => ({ leagueMonth, teamMonth, teamWeek, teamListMonth, teamListTo, top: team && list ? teamTop.get() || undefined : undefined }),
    restore: (snap) => {
      const s = snap.state;
      const sTeam = s.mode === 'team';
      const sList = s.layout === 'list' || (s.layout === 'slate' && (sTeam || !slateFits));
      setLeagueMonth(snap.leagueMonth);
      setTeamMonth(snap.teamMonth);
      setTeamWeek(snap.teamWeek);
      setTeamListAt({ key: `${s.teamId}|${s.tvOnly}|${sTeam && sList}`, month: snap.teamListMonth, to: snap.teamListTo });
      setTeamOpen(sTeam && sList && snap.top ? { date: snap.top } : undefined);
      setPicking(false);
      setDatePick(false);
    },
    showTeam: (teamId, layout, date, s) => {
      setTeamMonth(monthOf(date));
      setTeamWeek(weekOf(date)[0]!);
      const target = teamListTarget(data, teamId, s.tvOnly, s.showRest && !compact, date);
      setTeamListAt({ key: `${teamId}|${s.tvOnly}|${layout === 'list'}`, month: monthOf(target) });
      setTeamOpen({ date: target });
      setPicking(false);
    },
    lookingAt,
    label: () => {
      if (team) {
        const t = TEAM_BY_ID.get(state.teamId);
        const period = list ? (teamListTo !== teamListMonth ? `${fmtShortMonth(teamListMonth)} – ${fmtShortMonth(teamListTo)}` : fmtShortMonth(teamListMonth)) : teamWeeks ? fmtRange(teamWeek, addDays(teamWeek, 7 * teamWeeks - 1)) : fmtShortMonth(teamMonth);
        return `${t ? `${t.city} ${t.name}` : 'Team'}, ${period}`;
      }
      const view = slate ? 'Slate' : list ? 'List' : 'Calendar';
      const when = list || slate ? listTitle(nearestDay(days, state.date), true) : weekView ? fmtRange(weekOf(state.date)[0]!, addDays(weekOf(state.date)[0]!, 7 * state.weeks - 1)) : fmtShortMonth(leagueMonth);
      return `All teams, ${view} · ${when}`;
    },
    copy: copyView,
    selKind,
  };

  if (!active) return null;
  const teamListProps = { data, teamId: state.teamId, tvOnly: state.tvOnly, showRest: state.showRest && !compact, size, now, timeZone, onOpenGame, gameLink, handle: teamList, openAt: teamOpen, onAtNext: teamAtNext.set, topStore: teamTop, month: teamListMonth, monthTo: teamListTo, onLoadMonths: compact ? undefined : loadTeamMonths, onMonthChange: setTeamListMonth, runs: !compact };
  const leagueList = <LeagueListView data={data} date={state.date} onSelectDate={onSelectDate} tvOnly={state.tvOnly} size={size} now={now} today={today} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} nav={false} legend={false} />;

  // The bar, in this order: sub-views (List · Calendar · Slate, the scope picker); date controls (the date block,
  // then the week view's weeks or the Team Calendar's span); the options in the Options popover
  const date = (
    <>
    <div className="ck-period-wrap ck-date-block" data-testid="date-block">
      {team && list && !compact ? (
        <TeamListNav short={barShort} store={teamTop} games={teamPickGames} atNext={teamAtNext} pick={{ open: datePick, onToggle: () => setDatePick((o) => !o) }} onDate={(d) => teamList.current?.toDate(d)} onToday={() => (jump(), teamList.current?.toNext())} />
      ) : (
        nav && <PeriodNav {...nav} />
      )}
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
            jump();
            update({ date: weekOf(date)[0]! });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {datePick && !compact && !weekView && (
        <DatePicker
          data={data}
          date={team && list ? teamTop.get() || today : team ? lookingAt() : nearestDay(days, state.date)}
          tvOnly={state.tvOnly}
          today={today}
          cell={team && list ? teamPickCell : undefined}
          onPick={(date) => {
            setDatePick(false);
            jump();
            if (team && list) teamList.current?.toDate(date);
            else if (team) {
              setTeamMonth(monthOf(date));
              setTeamWeek(weekOf(date)[0]!);
            } else if (list || slate) update({ date });
            else setLeagueMonth(monthOf(date));
          }}
          onClose={closeDatePick}
        />
      )}
    </div>
      {weekView && <Segmented label="Weeks" className=" ck-tabs-small" value={String(state.weeks) as '1' | '2'} options={barShort ? [['1', '1w', '1 week'], ['2', '2w', '2 weeks']] : [['1', '1 week'], ['2', '2 weeks']]} onChange={(w) => update({ weeks: w === '2' ? 2 : 1 })} />}
      {team && !list && !compact && (
        <Segmented
          label="Span"
          className=" ck-tabs-small"
          value={String(state.teamSpan) as '1' | '2' | 'month'}
          options={barShort ? [['1', '1w', '1 week'], ['2', '2w', '2 weeks'], ['month', 'Mo', 'Month']] : [['1', '1 week'], ['2', '2 weeks'], ['month', 'Month']]}
          onChange={(v) => setTeamSpan(v === 'month' ? 'month' : v === '2' ? 2 : 1)}
        />
      )}
    </>
  );

  const sub = (
    <>
      <Segmented label="Layout" value={slate ? 'slate' : list ? 'list' : 'calendar'} options={[['list', 'List'], ['calendar', 'Calendar'], ...(!slateFits ? [] : ([['slate', 'Slate']] as [CalendarLayout, string][]))]} onChange={setLayout} />
      <TeamPicker allTeams teamId={team ? state.teamId : undefined} onChange={team ? pickTeam : (id) => openTeam(id, state.layout === 'calendar' && !slate ? 'calendar' : 'list')} onClear={toAllTeams} compact={compact} />
    </>
  );
  const options = (
    <PopoverButton label="Options" testId="options-button" buttonClass={state.tvOnly ? ' ck-opt-on' : ''} title={state.tvOnly ? 'Options — TV games only is on' : 'Options'} icon={<OptionsIcon />}>
      <span className="ck-pop-head">Options</span>
      <label className="ck-check" title="Only games on US national TV">
        <input type="checkbox" aria-label="TV games only" checked={state.tvOnly} onChange={(e) => update({ tvOnly: e.target.checked })} /> TV games only
      </label>
      {team && list && !compact && (
        <label className="ck-check" title="Show the days without a game between the rows">
          <input type="checkbox" aria-label="Show rest days" checked={state.showRest} onChange={(e) => update({ showRest: e.target.checked })} /> Rest days (Team List)
        </label>
      )}
    </PopoverButton>
  );

  // The League List's legend: in the ⓘ popover, not under the list
  const leagueKey = !team && list && (
    <div className="ck-info-key">
      <span className="ck-pop-head">League List key</span>
      <FatigueLegend component={size.width >= FATIGUE_SLOTS_MIN_WIDTH} />
    </div>
  );

  let body: ReactNode;
  if (team) {
    body = teamMap ? (
      <div className="ck-league-split" {...hoverHandlers(mapHover)}>
        <TeamListView {...teamListProps} />
        <div className="ck-map-slot">
          <NextFrame>
            <Suspense fallback={null}>
              <TeamMap data={data} teamId={state.teamId} now={now} room={{ width: size.width - TEAM_LIST_MAX_WIDTH - LEAGUE_MAP_GAP, height: size.height - 120 }} hover={mapHover} />
            </Suspense>
          </NextFrame>
        </div>
      </div>
    ) : list ? (
      <TeamListView {...teamListProps} />
    ) : (
      <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} today={today} runs={!compact} />
    );
  } else if (slate) {
    body = <SlateView focusTeam={slateFocusTeam} today={today} data={data} date={nearestDay(days, state.date)} tvOnly={state.tvOnly} timeZone={timeZone} gameLink={gameLink} width={size.width} notes={notes} odds={odds} hideNotes={hideNotes} onHideNotes={setHideNotes} />;
  } else if (list && leagueSideBySide(size.width)) {
    // The map beside the list (desktop); it stays put while a busy night scrolls
    body = (
      <div className="ck-league-split" {...hoverHandlers(mapHover)}>
        {leagueList}
        <div className="ck-map-slot">
          <NextFrame>
            <Suspense fallback={null}>
              <LeagueMap data={data} games={listDay?.games ?? NO_GAMES} room={{ width: size.width - listWidth - LEAGUE_MAP_GAP, height: size.height - 48 }} hover={mapHover} />
            </Suspense>
          </NextFrame>
        </div>
      </div>
    );
  } else if (list) body = leagueList;
  else if (weekView) body = <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} gameLink={gameLink} />;
  else body = <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />;

  return (
    <DestinationFrame slots={slots} sub={sub} date={date} options={options} info={leagueKey}>
      {team && <TeamHeader teamId={state.teamId} compact={compact} period={list && !compact ? teamListPeriod : undefined} />}
      {body}
      {!list && !slate && !compact && nav && <SideArrows nav={nav} />}
      {selKind && <SelectionBar store={selection} copy={copySelection} />}
      {slateCapture && (
        <CaptureStage key={slateCapture.cols} onReady={slateCapture.onReady} width={slateImageSize(slateCapture.games.length, slateCapture.cols, slateCapture.card).width} className=" ck-slate-capture">
          <SlateCopy data={data} games={slateCapture.games} cols={slateCapture.cols} cardWidth={slateCapture.card.width} timeZone={timeZone} notes={hideNotes ? undefined : notes} odds={odds?.get(slateCapture.games[0]!.dateEt)} />
        </CaptureStage>
      )}
      {selCapture && selKind && selKind !== 'league-slate' && <SelectionCopyStage capture={selCapture} kind={selKind} list={list} team={team} teamId={state.teamId} period={nav?.title} p={p} />}
      {capture && (
        <CaptureStage onReady={capture} width={(list ? (team ? Math.min(size.width, TEAM_LIST_MAX_WIDTH) : listWidth) : size.width) + 2 * CAPTURE_PAD} className={`${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`} minHeight={list || compact ? undefined : size.height}>
          <div className="ck-capture-head">
            {title && <span className="ck-title">{title}</span>}
            {capturePeriod && <span className="ck-capture-period">{capturePeriod}</span>}
            {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
            {note && <span className="ck-note">{note}</span>}
          </div>
          {team && <TeamHeader teamId={state.teamId} compact={compact} period={list ? teamListPeriod : undefined} />}
          {team ? (
            list ? (
              <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={fullHeight} now={now} timeZone={timeZone} month={teamListMonth} monthTo={teamListTo} runs={!compact} />
            ) : (
              <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} today={today} runs={!compact} />
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
    </DestinationFrame>
  );
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

/**
 * The calendar views' second pair of arrows, at the grid's left and right sides (in the page margin beside it): the same
 * step as the bar's ‹ › (1 week, 2 weeks or a month). Never in an image (the copies render the view without them).
 */
function SideArrows({ nav }: { nav: PeriodNavProps }) {
  const prev = useRef<HTMLButtonElement>(null);
  // as wide as the page margin beside the grid (the smaller side), so they never cover a cell
  useLayoutEffect(() => {
    const root = prev.current?.closest<HTMLElement>('.ck-root');
    if (!root) return;
    const fit = () => {
      const r = root.getBoundingClientRect();
      const room = root.classList.contains('ck-has-rail') ? 16 : Math.min(r.left, document.documentElement.clientWidth - r.right);
      root.style.setProperty('--ck-side-w', `${Math.max(14, Math.min(40, Math.floor(room) - 2))}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const step = nav.unit === 'week' || nav.unit === 'month' ? `one ${nav.unit}` : nav.unit;
  return (
    <>
      <button type="button" ref={prev} className="ck-side-arrow ck-side-prev" data-testid="side-prev" data-capture-exclude="true" aria-label={`Back ${step}`} title={`Back ${step}`} disabled={nav.prevDisabled} onClick={nav.onPrev}>
        <svg viewBox="0 0 16 48" aria-hidden="true"><path d="M12 6 3 24l9 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button type="button" className="ck-side-arrow ck-side-next" data-testid="side-next" data-capture-exclude="true" aria-label={`Forward ${step}`} title={`Forward ${step}`} disabled={nav.nextDisabled} onClick={nav.onNext}>
        <svg viewBox="0 0 16 48" aria-hidden="true"><path d="M4 6l9 18-9 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </>
  );
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

/** The months from a team's first to its last game. */
function teamListMonths(games: readonly ScheduleGame[]): string[] {
  const out: string[] = [];
  const last = games.at(-1);
  for (let m = games[0] && monthOf(games[0].dateEt); m && last && m <= monthOf(last.dateEt); m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Team List's date block (the same ‹ date › · calendar · Today as every view): the date of the row at
 * the top ("Sunday, November 15, 2026") from the store, so scrolling re-renders only this; ‹ › go to the previous / next
 * game; Today (the next game) disabled while the list is there.
 */
function TeamListNav({ short = false, store, games, atNext, pick, onDate, onToday }: { short?: boolean; store: ValueStore<string>; games: readonly ScheduleGame[]; atNext: ValueStore<boolean>; pick: PeriodNavProps['pick']; onDate: (date: string) => void; onToday: () => void }) {
  const top = useValue(store);
  const at = useValue(atNext);
  const prev = top ? games.findLast((g) => g.dateEt < top) : undefined;
  const next = top ? games.find((g) => g.dateEt > top) : undefined;
  return (
    <PeriodNav
      title={top ? listTitle(top, short) : ''}
      unit="game"
      testId="team-day-title"
      titleClass=" ck-team-day-title"
      onPrev={() => prev && onDate(prev.dateEt)}
      onNext={() => next && onDate(next.dateEt)}
      prevDisabled={!prev}
      nextDisabled={!next}
      pick={pick}
      onToday={onToday}
      todayDisabled={at}
    />
  );
}
