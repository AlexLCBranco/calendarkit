// Calendar widgets: team month grid and list, league list, league week view and count grid, and CalendarView,
// which combines them behind a League | Team and a List | Calendar switch in a one-row top bar.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dateFormat, defaultDay, isOver, localDate, monthOf, seasonMonths, teamGames, weekOf, type CalendarData } from '../data/model';
import { TEAMS, TEAM_BY_ID } from '../data/teams';
import { CaptureStage, CAPTURE_PAD } from './CaptureStage';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { CopyButton } from './CopyButton';
import { WEEK_MIN_WIDTH } from './dayflow';
import { LeagueListView, LeagueListWeek, listDays, listTitle, nearestDay } from './LeagueListView';
import { LeagueWeekView, type WeekCount } from './LeagueWeekView';
import { MonthNavigator } from './MonthNavigator';
import { monthNav, PeriodNav, TodayButton, type PeriodNavProps } from './PeriodNav';
import { Segmented } from './Segmented';
import { createSelectionStore, useMarqueeSelection } from './selection';
import { SelectionBar, SelectionStyle } from './SelectionBar';
import { SelectionCapture, type SelectionKind } from './SelectionCapture';
import { TeamHeader } from './TeamHeader';
import { TeamListView, type TeamListHandle } from './TeamListView';
import { TeamMonthGrid } from './TeamMonthGrid';
import { TeamPicker } from './TeamPicker';
import { useTooltip } from './Tooltip';
import { WeekPicker } from './WeekPicker';
import { fmtRange, isCompact, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, useNow, type WidgetSize } from './widget';
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

export type CalendarMode = 'team' | 'league';
export type CalendarLayout = 'list' | 'calendar';
/** Team → Calendar: a month grid (default) or 1 or 2 week rows. */
export type TeamSpan = 'month' | 1 | 2;

export interface CalendarState {
  mode: CalendarMode;
  /** List or Calendar; kept when switching League ↔ Team. */
  layout: CalendarLayout;
  teamId: number;
  /** League views: the day at the top of the list; the week view shows this day's week. */
  date: string;
  tvOnly: boolean;
  /** Team → List: a quiet row for each day without a game. */
  showRest: boolean;
  /** League → Calendar: 1 or 2 week rows. */
  weeks: WeekCount;
  /** Team → Calendar: month, 1 week or 2 weeks; kept across teams and List ↔ Calendar. */
  teamSpan: TeamSpan;
}

export interface CalendarViewProps {
  data: CalendarData;
  size: WidgetSize;
  /** Initial state; anything missing gets a default (League → List, default day). */
  initial?: Partial<CalendarState>;
  /** Fixed clock (ms) for tests or replays; default: live clock. */
  now?: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** Told whenever the user changes mode, layout, team, day, weeks or the TV filter (e.g. to sync a URL). */
  onStateChange?: (state: CalendarState) => void;
  /** Shown first in the top bar (e.g. "NBA schedule 2026-27"). */
  title?: string;
  /** Small muted note at the end of the top bar (e.g. the time zone); a tooltip icon on phones. */
  note?: string;
  /** When the data was generated (ISO): "Data updated …" under the note, orange once older than STALE_AFTER_MS. */
  updatedAt?: string;
}

/** Older than this, the "Data updated" stamp turns orange: the daily update (~11:00 UTC) may have failed. */
export const STALE_AFTER_MS = 36 * 3_600_000;

const DEFAULT_TEAM = TEAMS[0]!.id;


export function CalendarView({ data, size, initial, now: fixedNow, timeZone, onOpenGame, onStateChange, title, note, updatedAt }: CalendarViewProps) {
  const now = useNow(fixedNow);
  const compact = isCompact(size);
  const [state, setState] = useState<CalendarState>(() => ({
    mode: initial?.mode ?? 'league',
    layout: initial?.layout ?? 'list',
    teamId: initial?.teamId && TEAM_BY_ID.has(initial.teamId) ? initial.teamId : DEFAULT_TEAM,
    date: initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) ? initial.date : (defaultDay(data, now) ?? localDate(now, timeZone)),
    tvOnly: initial?.tvOnly ?? false,
    showRest: initial?.showRest ?? false,
    weeks: initial?.weeks === 2 ? 2 : 1,
    teamSpan: initial?.teamSpan === 1 || initial?.teamSpan === 2 ? initial.teamSpan : 'month',
  }));
  const [leagueMonth, setLeagueMonth] = useState(() => monthOf(state.date));
  const [teamMonth, setTeamMonth] = useState(() => monthOf(teamDefaultDate(data, state.teamId, now) ?? state.date));
  // Team week views: the first shown day (a Sunday)
  const [teamWeek, setTeamWeek] = useState(() => weekOf(teamDefaultDate(data, state.teamId, now) ?? state.date)[0]!);
  const [picking, setPicking] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tooltip = useTooltip();

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
  const list = state.layout === 'list';
  const team = state.mode === 'team';
  const today = localDate(now, timeZone);
  const weekView = !team && !list && size.width >= WEEK_MIN_WIDTH;
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
  const [teamAtNext, setTeamAtNext] = useState(true);

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
  else if (!team && list) {
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
  // the default day (same rule as on load); Team Calendar: the current month; Team List: the next game.
  const def = defaultDay(data, now) ?? today;
  if (nav && !compact) {
    if (teamWeeks) {
      const first = weekOf(data.dates[0] ?? today)[0]!;
      const last = weekOf(data.dates.at(-1) ?? today)[0]!;
      const w = weekOf(today)[0]! < first ? first : weekOf(today)[0]! > last ? last : weekOf(today)[0]!;
      nav = { ...nav, onToday: () => setTeamWeek(w), todayDisabled: teamWeek === w };
    } else if (team) {
      const months = seasonMonths(data);
      const cur = monthOf(today);
      const m = months.length && cur < months[0]! ? months[0]! : months.length && cur > months.at(-1)! ? months.at(-1)! : cur;
      nav = { ...nav, onToday: () => setTeamMonth(m), todayDisabled: teamMonth === m };
    } else if (list) {
      const day = nearestDay(days, def);
      nav = { ...nav, onToday: () => update({ date: day }), todayDisabled: nearestDay(days, state.date) === day };
    } else if (weekView) nav = { ...nav, onToday: () => update({ date: def }), todayDisabled: weekOf(state.date)[0] === weekOf(def)[0] };
    else nav = { ...nav, onToday: () => setLeagueMonth(monthOf(def)), todayDisabled: leagueMonth === monthOf(def) };
  }

  // "Copy view as image": render the view off-screen (CaptureStage), copy it, remove it.
  const [capture, setCapture] = useState<(node: HTMLElement) => void>();
  // The button records the size copied (CSS px) and the pixel ratio used: data-captured="1840x1010@4".
  const copyView = (button: HTMLButtonElement) =>
    new Promise<HTMLCanvasElement>((resolve, reject) =>
      setCapture(() => (node: HTMLElement) => {
        button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
        copyElement(node, 1)
          .then(resolve, reject)
          .finally(() => setCapture(undefined));
      }),
    );
  const listWeek = weekOf(nearestDay(days, state.date));
  const capturePeriod = team && list ? undefined : !team && list ? fmtRange(listWeek[0]!, listWeek[6]!) : nav?.title;
  const fullHeight = { width: size.width, height: 1e6 };

  // Marquee selection of games (desktop/tablet, mouse): only to copy several games as one image. The selected ids live
  // in a store, so selecting re-renders only the highlight <style> and the bar, never the views.
  const [selection] = useState(createSelectionStore);
  const marquee = useRef<HTMLDivElement>(null);
  const onMarquee = useMarqueeSelection(selection, marquee);
  const selKind: SelectionKind | undefined = compact ? undefined : team ? (list ? 'team-list' : 'team-calendar') : list ? 'league-list' : weekView ? 'league-week' : undefined;
  // a new view, team, period, span or toggle clears it (scrolling the League List doesn't)
  const viewKey = [state.mode, state.layout, state.teamId, state.tvOnly, state.showRest, state.weeks, state.teamSpan, teamMonth, teamWeek, leagueMonth, weekView ? weekOf(state.date)[0] : '', compact].join('|');
  useEffect(() => selection.clear(), [viewKey, selection]);
  const root = useRef<HTMLDivElement>(null);
  const [selCapture, setSelCapture] = useState<{ ids: ReadonlySet<string>; cellWidth?: number; teamScale?: number; weekStyle?: string; onReady: (node: HTMLElement) => void }>();
  const copySelection = (button: HTMLButtonElement) => {
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

  return (
    <div
      ref={root}
      className={`ck-root ck-select-area${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`}
      onPointerDown={selKind ? onMarquee : undefined}
      style={{ maxWidth: size.width, height: list ? size.height : undefined, minHeight: list || compact ? undefined : size.height }}
      {...tooltip.handlers}
    >
      <div className="ck-toolbar" data-testid="top-bar">
        {title && <h1 className={`ck-title${compact ? ' ck-sr' : ''}`}>{title}</h1>}
        <Segmented label="View" value={state.mode} options={[['league', 'League'], ['team', 'Team']]} onChange={(mode) => update({ mode })} />
        <Segmented label="Layout" value={state.layout} options={[['list', 'List'], ['calendar', 'Calendar']]} onChange={setLayout} />
        {team && <TeamPicker teamId={state.teamId} onChange={pickTeam} compact={compact} />}
        {nav && (
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
          </div>
        )}
        {team && list && !compact && (
          <div className="ck-nav ck-period">
            <TodayButton onClick={() => teamList.current?.toNext()} disabled={teamAtNext} />
          </div>
        )}
        {weekView && <Segmented label="Weeks" value={String(state.weeks) as '1' | '2'} options={[['1', '1 week'], ['2', '2 weeks']]} onChange={(w) => update({ weeks: w === '2' ? 2 : 1 })} />}
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
        <label className="ck-check">
          <input type="checkbox" aria-label="TV games only" checked={state.tvOnly} onChange={(e) => update({ tvOnly: e.target.checked })} /> {compact ? 'TV only' : 'TV games only'}
        </label>
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
        <CopyButton label="Copy view as image" copy={copyView} testId="copy-view" />
      </div>
      {team && <TeamHeader teamId={state.teamId} compact={compact} />}
      {team ? (
        list ? (
          <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} handle={teamList} onAtNext={setTeamAtNext} />
        ) : (
          <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} />
        )
      ) : list ? (
        <LeagueListView data={data} date={state.date} onSelectDate={onSelectDate} tvOnly={state.tvOnly} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} nav={false} />
      ) : weekView ? (
        <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} />
      ) : (
        <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />
      )}
      {tooltip.node}
      <div ref={marquee} className="ck-marquee" aria-hidden="true" data-testid="marquee" />
      <SelectionStyle store={selection} scope=".ck-select-area" />
      {selKind && <SelectionBar store={selection} copy={copySelection} />}
      {selCapture && selKind && (
        <CaptureStage
          onReady={selCapture.onReady}
          width={(list ? Math.min(size.width, team ? TEAM_LIST_MAX_WIDTH : LIST_MAX_WIDTH) : Math.max(selCapture.cellWidth ?? 0, 360)) + 2 * CAPTURE_PAD}
          className={list ? ' ck-root-fill' : ' ck-root-grow'}
        >
          <div className="ck-capture-head">
            {title && <span className="ck-title">{title}</span>}
            {!list && nav?.title && <span className="ck-capture-period">{nav.title}</span>}
            {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
            {note && <span className="ck-note">{note}</span>}
          </div>
          {team && <TeamHeader teamId={state.teamId} compact={compact} />}
          <SelectionCapture
            kind={selKind}
            data={data}
            ids={selCapture.ids}
            teamId={state.teamId}
            tvOnly={state.tvOnly}
            size={size}
            now={now}
            timeZone={timeZone}
            cellWidth={selCapture.cellWidth}
            teamScale={selCapture.teamScale}
            weekStyle={selCapture.weekStyle}
          />
        </CaptureStage>
      )}
      {capture && (
        <CaptureStage onReady={capture} width={(list ? Math.min(size.width, team ? TEAM_LIST_MAX_WIDTH : LIST_MAX_WIDTH) : size.width) + 2 * CAPTURE_PAD} className={`${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`} minHeight={list || compact ? undefined : size.height}>
          <div className="ck-capture-head">
            {title && <span className="ck-title">{title}</span>}
            {capturePeriod && <span className="ck-capture-period">{capturePeriod}</span>}
            {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
            {note && <span className="ck-note">{note}</span>}
          </div>
          {team && <TeamHeader teamId={state.teamId} compact={compact} />}
          {team ? (
            list ? (
              <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} showRest={state.showRest && !compact} size={fullHeight} now={now} timeZone={timeZone} />
            ) : (
              <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} tvOnly={state.tvOnly} nav={false} weeks={teamWeeks} start={teamWeek} />
            )
          ) : list ? (
            <LeagueListWeek data={data} date={state.date} tvOnly={state.tvOnly} size={size} now={now} timeZone={timeZone} />
          ) : weekView ? (
            <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} />
          ) : (
            <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />
          )}
        </CaptureStage>
      )}
    </div>
  );
}

/** Team view opens on the month of the team's next game not over yet (else its last game). */
function teamDefaultDate(data: CalendarData, teamId: number, now: number): string | undefined {
  const games = teamGames(data, teamId);
  return (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt;
}

/** "Data updated Oct 23, 08:29" in the viewer's zone; orange with a tooltip once the data is older than 36 h. */
function DataStamp({ updatedAt, now, timeZone }: { updatedAt: string; now: number; timeZone?: string }) {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  const stale = now - t > STALE_AFTER_MS;
  const when = dateFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(t);
  const tip = stale ? 'Data is more than 36 hours old: the daily update may have failed.' : undefined;
  return (
    <span className={`ck-stamp${stale ? ' ck-stamp-stale' : ''}`} data-testid="data-updated" data-tip={tip} tabIndex={stale ? 0 : undefined}>
      Data updated {when}
    </span>
  );
}
