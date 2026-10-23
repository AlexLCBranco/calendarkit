// Calendar widgets: team month grid, league day view, month navigator, and CalendarView, which combines them.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange).

import { useEffect, useMemo, useState } from 'react';
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
  teamGames,
  weekOf,
  type CalendarData,
} from '../data/model';
import { DIVISIONS, TEAMS, TEAM_BY_ID } from '../data/teams';
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
}

/** Month overview for navigation only: number of games per day; clicking a day jumps to it. */
export function MonthNavigator({ data, month, onMonthChange, selectedDate, onSelectDate, tvOnly, size }: MonthNavigatorProps) {
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
              className={`ck-cell ck-count-cell${n ? ' ck-cell-game' : ''}${selectedDate === date ? ' ck-cell-selected' : ''}`}
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
      ) : leagueMonth ? (
        <MonthNavigator
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
