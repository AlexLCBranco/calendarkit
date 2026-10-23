// Calendar widgets: team month grid, league day view, month navigator, and CalendarView, which combines them.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import {
  addDays,
  addMonths,
  countsByDate,
  defaultDay,
  hasNationalTv,
  isBackToBack,
  isOver,
  localDate,
  monthCells,
  monthOf,
  seasonMonths,
  nationalTv,
  teamGames,
  teamLabel,
  tipoff,
  weekOf,
  type CalendarData,
} from '../data/model';
import { DIVISIONS, TEAMS, TEAM_BY_ID, teamLogo } from '../data/teams';
import { GameCard } from './GameCard';
import './calendar.css';

export interface WidgetSize {
  width: number;
  height: number;
}

/** Below this width the widgets switch to their compact layout (phones, small board widgets). */
export const COMPACT_WIDTH = 640;
const isCompact = (size: WidgetSize) => size.width < COMPACT_WIDTH;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar-date formatting (the date is already an NBA game date; no time zone conversion). */
const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const fmtMonth = (month: string) => fmtDate(`${month}-01`, { month: 'long', year: 'numeric' });

/** The given clock, or a live one ticking every minute. */
export function useNow(fixed?: number): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return setNow(fixed);
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixed]);
  return fixed ?? now;
}

const b2bIds = (data: CalendarData, g: ScheduleGame) =>
  [g.homeTeam.teamId, g.awayTeam.teamId].filter((id) => isBackToBack(data, id, g.dateEt));

// ---------------------------------------------------------------- team picker

export function TeamPicker({ teamId, onChange }: { teamId: number; onChange: (teamId: number) => void }) {
  return (
    <select className="ck-select" aria-label="Team" value={teamId} onChange={(e) => onChange(Number(e.target.value))}>
      {DIVISIONS.map(({ conference, division }) => (
        <optgroup key={division} label={`${conference} · ${division}`}>
          {TEAMS.filter((t) => t.division === division).map((t) => (
            <option key={t.id} value={t.id}>
              {t.city} {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- month header (shared)

function MonthHeader({ month, months, onMonthChange }: { month: string; months: string[]; onMonthChange: (m: string) => void }) {
  const i = months.indexOf(month);
  return (
    <div className="ck-nav">
      <button type="button" className="ck-arrow" aria-label="Previous month" disabled={i <= 0} onClick={() => onMonthChange(addMonths(month, -1))}>
        ‹
      </button>
      <h2 className="ck-nav-title">{fmtMonth(month)}</h2>
      <button type="button" className="ck-arrow" aria-label="Next month" disabled={i < 0 || i >= months.length - 1} onClick={() => onMonthChange(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- team month grid

export interface TeamMonthGridProps {
  data: CalendarData;
  teamId: number;
  month: string;
  onMonthChange: (month: string) => void;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
}

export function TeamMonthGrid({ data, teamId, month, onMonthChange, size, now, timeZone, onOpenGame }: TeamMonthGridProps) {
  const compact = isCompact(size);
  const byDate = useMemo(() => new Map(teamGames(data, teamId).map((g) => [g.dateEt, g])), [data, teamId]);
  const [selected, setSelected] = useState<string | undefined>();
  const selectedGame = selected ? byDate.get(selected) : undefined;
  const months = seasonMonths(data);

  return (
    <section className="ck-team-month" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} schedule`}>
      <MonthHeader month={month} months={months} onMonthChange={onMonthChange} />
      <div className="ck-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {monthCells(month).map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const g = byDate.get(date);
          const cls = `ck-cell${g ? ' ck-cell-game' : ''}${g && isOver(g, now) ? ' ck-cell-past' : ''}${selected === date ? ' ck-cell-selected' : ''}`;
          return (
            <div key={date} className={cls} role="gridcell" data-date={date} onClick={() => g && setSelected(date)}>
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {g && <GameCard game={g} teamId={teamId} backToBackTeamIds={b2bIds(data, g)} now={now} timeZone={timeZone} size="compact" onOpenGame={compact ? undefined : onOpenGame} />}
            </div>
          );
        })}
      </div>
      {compact && selectedGame && (
        <div className="ck-detail">
          <div className="ck-detail-date">{fmtDate(selectedGame.dateEt, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <GameCard game={selectedGame} teamId={teamId} backToBackTeamIds={b2bIds(data, selectedGame)} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- league: day view

export interface LeagueDayViewProps {
  data: CalendarData;
  date: string;
  onDateChange: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
}

export function LeagueDayView({ data, date, onDateChange, tvOnly, size, now, timeZone, onOpenGame }: LeagueDayViewProps) {
  const compact = isCompact(size);
  const first = data.dates[0] ?? date;
  const last = data.dates.at(-1) ?? date;
  const all = data.byDate.get(date) ?? [];
  const games = tvOnly ? all.filter(hasNationalTv) : all;
  const counts = useMemo(() => countsByDate(data, tvOnly), [data, tvOnly]);
  const today = localDate(now, timeZone);

  return (
    <section className="ck-league-day" aria-label="League schedule by day">
      <div className="ck-nav">
        <button type="button" className="ck-arrow" aria-label="Previous day" disabled={date <= first} onClick={() => onDateChange(addDays(date, -1))}>
          ‹
        </button>
        <h2 className="ck-nav-title" data-testid="day-title">
          {fmtDate(date, { weekday: compact ? 'short' : 'long', month: compact ? 'short' : 'long', day: 'numeric', year: 'numeric' })}
        </h2>
        <button type="button" className="ck-arrow" aria-label="Next day" disabled={date >= last} onClick={() => onDateChange(addDays(date, 1))}>
          ›
        </button>
      </div>
      <div className="ck-week" role="tablist" aria-label="Week">
        {weekOf(date).map((d) => {
          const n = counts.get(d) ?? 0;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === date}
              className={`ck-weekday${d === date ? ' ck-weekday-selected' : ''}${d === today ? ' ck-weekday-today' : ''}`}
              disabled={d < first || d > last}
              onClick={() => onDateChange(d)}
              data-date={d}
            >
              <span className="ck-weekday-name">{fmtDate(d, { weekday: 'short' })}</span>
              <span className="ck-weekday-num">{Number(d.slice(8))}</span>
              <span className="ck-weekday-count">{n ? n : '–'}</span>
            </button>
          );
        })}
      </div>
      <div className="ck-daylist" data-testid="day-games">
        {games.length === 0 && <p className="ck-empty">{all.length ? 'No national TV games this day.' : 'No games this day.'}</p>}
        {games.map((g) => (
          <GameCard key={g.gameId} game={g} backToBackTeamIds={b2bIds(data, g)} now={now} timeZone={timeZone} size={compact ? 'compact' : 'regular'} onOpenGame={onOpenGame} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- league: month navigator

export interface MonthNavigatorProps {
  data: CalendarData;
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  /** Local calendar date to highlight as today. */
  today?: string;
}

/** Month overview for navigation only: number of games per day; clicking a day jumps to it. */
export function MonthNavigator({ data, month, onMonthChange, selectedDate, onSelectDate, tvOnly, size, today }: MonthNavigatorProps) {
  const compact = isCompact(size);
  const counts = useMemo(() => countsByDate(data, tvOnly), [data, tvOnly]);
  return (
    <section className="ck-month-nav" aria-label="Month navigator">
      <MonthHeader month={month} months={seasonMonths(data)} onMonthChange={onMonthChange} />
      <div className="ck-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {monthCells(month).map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const n = counts.get(date) ?? 0;
          return (
            <button
              key={date}
              type="button"
              className={`ck-cell ck-count-cell${n ? ' ck-cell-game' : ''}${selectedDate === date ? ' ck-cell-selected' : ''}${today === date ? ' ck-cell-today' : ''}`}
              disabled={!n}
              onClick={() => onSelectDate(date)}
              data-date={date}
              aria-label={`${fmtDate(date, { month: 'long', day: 'numeric' })}: ${n} game${n === 1 ? '' : 's'}`}
            >
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {n > 0 && <span className="ck-count">{n}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- league: full month

/**
 * Below this widget width a game line doesn't fit a 7-column cell, so League → Month falls back to the count
 * navigator. The cutoff is a 768 px window: 768 − 32 px page padding − up to 17 px scrollbar (the app reserves the
 * scrollbar's space with scrollbar-gutter, and measures its real content width) = 719, so 718.
 */
export const FULL_MONTH_MIN_WIDTH = 718;
/** Below this width the month grid uses 2 px gaps and cell padding (instead of 4 px). */
const ROOMY_MONTH_WIDTH = 1000;

/**
 * Month game line geometry in px (at full size). Widths are fixed rather than measured at runtime: the text is the
 * bundled Inter font, so they are the same on every OS. `tri` fits the widest tricode (MEM, 26.95 px at 11 px
 * semibold). Line: logo · gap · AWAY · sep · logo · gap · HOME · pillGap · TV.
 */
export const MONTH_LINE = { logo: 16, gap: 2, tri: 28, sep: 6, pillGap: 2, pill: 15, font: 11, labelFont: 10, rowGap: 3, groupGap: 7 } as const;
export const MONTH_LINE_WIDTH = 2 * (MONTH_LINE.logo + MONTH_LINE.gap + MONTH_LINE.tri) + MONTH_LINE.sep + MONTH_LINE.pillGap + MONTH_LINE.pill;
/** Space between game columns inside a day cell. */
export const MONTH_COL_GAP = 10;

/** Inner width of one day cell for a given widget width (matches the grid gap, cell padding and border in CSS). */
export function monthCellInner(width: number): number {
  const roomy = width >= ROOMY_MONTH_WIDTH;
  const gridGap = roomy ? 4 : 2;
  const pad = roomy ? 4 : 2;
  return (width - 6 * gridGap) / 7 - 2 * pad - 2;
}

/** Game columns per day cell: as many full-size lines as fit, with MONTH_COL_GAP between them; at least 1. */
export function monthColumns(width: number): number {
  return Math.max(1, Math.floor((monthCellInner(width) + MONTH_COL_GAP) / (MONTH_LINE_WIDTH + MONTH_COL_GAP)));
}

/**
 * Lines keep their full size; only between the 768 px cutoff and ~860 px windows, where one line is wider than the
 * cell, they scale down to fit.
 */
export const monthLineScale = (width: number) => Math.min(1, monthCellInner(width) / MONTH_LINE_WIDTH);

export interface LeagueMonthViewProps {
  data: CalendarData;
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate?: string;
  /** Raised when a day with games is clicked. */
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  /** Local calendar date to highlight as today. */
  today?: string;
  /** IANA zone for the time labels; default: the browser's local zone. */
  timeZone?: string;
}

function MonthTeam({ team, b2b }: { team: ScheduleGame['homeTeam']; b2b: boolean }) {
  const logo = teamLogo(team.teamId);
  const label = teamLabel(team);
  return (
    <>
      {logo ? (
        <span className="ck-logo-backing">
          <img src={logo} alt="" width={16} height={16} />
        </span>
      ) : (
        <span className="ck-logo-empty" aria-hidden="true" />
      )}
      <span className="ck-mtri" data-tricode={label}>
        <span className="ck-mtri-text">
          {label}
          {b2b && <span className="ck-b2b-mark" data-tip="Back-to-back" aria-label="Back-to-back" role="img" tabIndex={0} />}
        </span>
      </span>
    </>
  );
}

function MonthGameLine({ data, game }: { data: CalendarData; game: ScheduleGame }) {
  const tv = nationalTv(game);
  const b2b = (id: number) => isBackToBack(data, id, game.dateEt);
  return (
    <li className="ck-month-game" data-game-id={game.gameId} aria-label={`${teamLabel(game.awayTeam)} at ${teamLabel(game.homeTeam)}${tv.length ? `, national TV: ${tv.join(', ')}` : ''}`}>
      <MonthTeam team={game.awayTeam} b2b={b2b(game.awayTeam.teamId)} />
      <MonthTeam team={game.homeTeam} b2b={b2b(game.homeTeam.teamId)} />
      <span className="ck-tv-slot">
        {tv.length > 0 && (
          <span className="ck-tv-pill" data-tip={tv.join(', ')} aria-label={`National TV: ${tv.join(', ')}`} tabIndex={0}>
            TV
          </span>
        )}
      </span>
    </li>
  );
}

/** A day's games grouped by local tip-off label ("20:00", "00:30 (+1)", "TBD"), keeping tip-off order. */
function timeGroups(games: ScheduleGame[], timeZone?: string): { label: string; games: ScheduleGame[] }[] {
  const out: { label: string; games: ScheduleGame[] }[] = [];
  for (const g of games) {
    const label = tipoff(g, timeZone).label;
    const last = out.at(-1);
    if (last && last.label === label) last.games.push(g);
    else out.push({ label, games: [g] });
  }
  return out;
}

type TimeGroup = ReturnType<typeof timeGroups>[number];
/** A column's piece of a time group; `repeat` when the group started in the previous column (label shown again). */
export interface ColumnGroup extends TimeGroup {
  repeat: boolean;
}

/**
 * Flows a day's time groups into `cols` columns in newspaper order (down column 1, then column 2, …), choosing the
 * break points that make the tallest column as short as possible. Each column starts at a game, so a label never
 * ends a column. Splitting a group (its label repeats atop the next column) costs one game row, so a group is only
 * split when that balances the columns by more than a row. Heights are estimated from MONTH_LINE, not measured.
 */
export function flowDay(groups: TimeGroup[], cols: number): ColumnGroup[][] {
  const L = MONTH_LINE;
  const labelH = L.labelFont * 1.25 + 2; // .ck-tlabel line-height + margin
  const rowH = L.logo + L.rowGap;
  const flat = groups.flatMap((grp, gi) => grp.games.map((g, i) => ({ g, gi, first: i === 0 })));
  const n = flat.length;
  // Column = games [a, b), as group pieces.
  const column = (a: number, b: number) => {
    const out: ColumnGroup[] = [];
    for (let i = a; i < b; i++) {
      const { g, gi, first } = flat[i]!;
      if (out.at(-1)?.label === groups[gi]!.label) out.at(-1)!.games.push(g);
      else out.push({ label: groups[gi]!.label, games: [g], repeat: !first });
    }
    return out;
  };
  const height = (c: ColumnGroup[]) => c.reduce((h, grp, i) => h + (i ? L.groupGap : 0) + labelH + grp.games.length * rowH - L.rowGap, 0);
  const parts = (cuts: number[]) => [...cuts, n].map((e, i, ends) => column(i ? ends[i - 1]! : 0, e));
  const k = Math.max(1, Math.min(cols, n));
  let best: { cost: number; splits: number; cuts: number[] } | undefined;
  // Try every set of up to k − 1 break points (n ≤ ~15 games, 2 columns at most sizes: a handful of cases).
  const walk = (cuts: number[], from: number) => {
    const p = parts(cuts);
    const splits = p.filter((c) => c[0]!.repeat).length;
    const cost = Math.max(...p.map(height)) + splits * rowH;
    // on a tie: fewer split groups, then the later break (earlier columns the longer ones, as in a newspaper)
    if (!best || cost < best.cost - 0.01 || (cost <= best.cost + 0.01 && splits <= best.splits)) best = { cost, splits, cuts };
    if (cuts.length < k - 1) for (let c = from; c < n; c++) walk([...cuts, c], c + 1);
  };
  if (n) walk([], 1);
  const out: ColumnGroup[][] = best ? parts(best.cuts) : [];
  while (out.length < cols) out.push([]);
  return out;
}

/**
 * Month calendar listing every game of each day, grouped by tip-off time, flowed as one list into as many columns
 * as fit (newspaper order, balanced; see flowDay). Lines: logos + tricodes (away left, home right), TV pill, B2B marks. Click a day → onSelectDate.
 */
export function LeagueMonthView({ data, month, onMonthChange, selectedDate, onSelectDate, tvOnly, size, today, timeZone }: LeagueMonthViewProps) {
  const cols = monthColumns(size.width);
  const s = monthLineScale(size.width);
  const L = MONTH_LINE;
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`;
  const vars = {
    '--ck-logo': px(L.logo),
    '--ck-gap': px(L.gap),
    '--ck-tri': px(L.tri),
    '--ck-sep': px(L.sep),
    '--ck-pill-gap': px(L.pillGap),
    '--ck-pill': px(L.pill),
    '--ck-font': px(L.font),
    '--ck-label-font': px(L.labelFont),
    '--ck-row-gap': px(L.rowGap),
    '--ck-group-gap': px(L.groupGap),
    '--ck-col-gap': `${MONTH_COL_GAP}px`,
    '--ck-line': px(MONTH_LINE_WIDTH),
  } as CSSProperties;

  return (
    <section className={`ck-month-full${size.width < ROOMY_MONTH_WIDTH ? ' ck-month-tight' : ''}`} aria-label="League month" style={vars}>
      <MonthHeader month={month} months={seasonMonths(data)} onMonthChange={onMonthChange} />
      <div className="ck-month-legend" data-testid="month-legend">
        Away · Home
      </div>
      <div className="ck-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {d}
          </div>
        ))}
        {monthCells(month).map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const all = data.byDate.get(date) ?? [];
          const games = tvOnly ? all.filter(hasNationalTv) : all;
          const open = games.length ? () => onSelectDate(date) : undefined;
          return (
            <div
              key={date}
              role="gridcell"
              className={`ck-cell ck-month-cell${games.length ? ' ck-cell-game' : ''}${selectedDate === date ? ' ck-cell-selected' : ''}${today === date ? ' ck-cell-today' : ''}`}
              data-date={date}
              tabIndex={open ? 0 : undefined}
              aria-label={`${fmtDate(date, { month: 'long', day: 'numeric' })}: ${games.length} game${games.length === 1 ? '' : 's'}`}
              onClick={open}
              onKeyDown={open && ((e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()))}
            >
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {games.length > 0 && (
                <div className="ck-month-day" data-cols={cols} style={{ gridTemplateColumns: `repeat(${cols}, var(--ck-line))` }}>
                  {flowDay(timeGroups(games, timeZone), cols).map((col, ci) => (
                    <div key={ci} className="ck-mcol">
                      {col.map((grp) => (
                        <div key={grp.label} className="ck-tgroup">
                          <div className="ck-tlabel" data-repeat={grp.repeat || undefined}>
                            {grp.label}
                          </div>
                          <ul className="ck-tgames">
                            {grp.games.map((g) => (
                              <MonthGameLine key={g.gameId} data={data} game={g} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


// ---------------------------------------------------------------- CalendarView: the combined widget

export type CalendarMode = 'team' | 'league';

export interface CalendarState {
  mode: CalendarMode;
  teamId: number;
  /** League view: selected game date. */
  date: string;
  tvOnly: boolean;
}

export interface CalendarViewProps {
  data: CalendarData;
  size: WidgetSize;
  /** Initial state; anything missing gets a default (league view, default day). */
  initial?: Partial<CalendarState>;
  /** Fixed clock (ms) for tests or replays; default: live clock. */
  now?: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** Told whenever the user changes mode, team, day or the TV filter (e.g. to sync a URL). */
  onStateChange?: (state: CalendarState) => void;
}

const DEFAULT_TEAM = TEAMS[0]!.id;

export function CalendarView({ data, size, initial, now: fixedNow, timeZone, onOpenGame, onStateChange }: CalendarViewProps) {
  const now = useNow(fixedNow);
  const [state, setState] = useState<CalendarState>(() => ({
    mode: initial?.mode ?? 'league',
    teamId: initial?.teamId && TEAM_BY_ID.has(initial.teamId) ? initial.teamId : DEFAULT_TEAM,
    date: initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) ? initial.date : (defaultDay(data, now) ?? localDate(now, timeZone)),
    tvOnly: initial?.tvOnly ?? false,
  }));
  const [leagueMonth, setLeagueMonth] = useState<string | undefined>(); // set while the month navigator is open
  const [teamMonth, setTeamMonth] = useState(() => monthOf(teamDefaultDate(data, state.teamId, now) ?? state.date));

  const update = (patch: Partial<CalendarState>) => {
    const next = { ...state, ...patch };
    setState(next);
    onStateChange?.(next);
  };
  const pickTeam = (teamId: number) => {
    update({ teamId });
    setTeamMonth(monthOf(teamDefaultDate(data, teamId, now) ?? state.date));
  };

  return (
    <div className={`ck-root${isCompact(size) ? ' ck-compact' : ''}`} style={{ maxWidth: size.width }}>
      <div className="ck-toolbar">
        <div className="ck-tabs" role="tablist" aria-label="View">
          {(['league', 'team'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={state.mode === m} className={`ck-tab${state.mode === m ? ' ck-tab-selected' : ''}`} onClick={() => update({ mode: m })}>
              {m === 'league' ? 'League' : 'Team'}
            </button>
          ))}
        </div>
        {state.mode === 'team' ? (
          <TeamPicker teamId={state.teamId} onChange={pickTeam} />
        ) : (
          <div className="ck-league-tools">
            <button type="button" className={`ck-toggle${leagueMonth ? ' ck-toggle-on' : ''}`} aria-pressed={!!leagueMonth} onClick={() => setLeagueMonth(leagueMonth ? undefined : monthOf(state.date))}>
              Month
            </button>
            <label className="ck-check">
              <input type="checkbox" checked={state.tvOnly} onChange={(e) => update({ tvOnly: e.target.checked })} /> TV games only
            </label>
          </div>
        )}
      </div>
      {state.mode === 'team' ? (
        <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
      ) : leagueMonth && size.width >= FULL_MONTH_MIN_WIDTH ? (
        <LeagueMonthView
          data={data}
          month={leagueMonth}
          onMonthChange={setLeagueMonth}
          selectedDate={state.date}
          onSelectDate={(date) => {
            setLeagueMonth(undefined);
            update({ date });
          }}
          tvOnly={state.tvOnly}
          size={size}
          today={localDate(now, timeZone)}
          timeZone={timeZone}
        />
      ) : leagueMonth ? (
        <MonthNavigator
          today={localDate(now, timeZone)}
          data={data}
          month={leagueMonth}
          onMonthChange={setLeagueMonth}
          selectedDate={state.date}
          onSelectDate={(date) => {
            setLeagueMonth(undefined);
            update({ date });
          }}
          tvOnly={state.tvOnly}
          size={size}
        />
      ) : (
        <LeagueDayView data={data} date={state.date} onDateChange={(date) => update({ date })} tvOnly={state.tvOnly} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
      )}
    </div>
  );
}

/** Team view opens on the month of the team's next game not over yet (else its last game). */
function teamDefaultDate(data: CalendarData, teamId: number, now: number): string | undefined {
  const games = teamGames(data, teamId);
  return (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt;
}
