// Calendar widgets: team month grid and list, league list, league week view and count grid, and CalendarView,
// which combines them behind a League | Team and a List | Calendar switch in a one-row top bar.
// Self-contained: inputs are the calendar data and a size. No routing, no global state, no page layout; the
// host gets user intents through callbacks (onOpenGame, onStateChange).

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
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
  nationalTv,
  opponentSecondNight,
  seasonMonths,
  teamB2BPairs,
  teamGames,
  teamLabel,
  teamSeason,
  weekOf,
  type B2BPair,
  type CalendarData,
} from '../data/model';
import { DIVISIONS, TEAMS, TEAM_BY_ID, teamLogo, type Team } from '../data/teams';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { CopyButton } from './CopyButton';
import { busiestDayHeight, flowDay, lineWidth, MONTH_COL_GAP, monthCellInner, monthColumns, ROOMY_WIDTH, scaleLine, timeGroups, WEEK_MIN_WIDTH, weekScale } from './dayflow';
import { B2BDot, GameCard, TeamLogo, type B2BNight } from './GameCard';
import './calendar.css';

export { flowDay, monthCellInner, monthColumns, MONTH_COL_GAP, MONTH_LINE, MONTH_LINE_WIDTH, WEEK_MIN_WIDTH, WEEK_SCALE_MAX, weekScale, type ColumnGroup } from './dayflow';

export interface WidgetSize {
  width: number;
  height: number;
}

/** Below this width the widgets switch to their compact layout (phones, small board widgets). */
export const COMPACT_WIDTH = 640;
const isCompact = (size: WidgetSize) => size.width < COMPACT_WIDTH;

/** List layouts: content column width cap (centered); calendars use the full width. */
export const LIST_MAX_WIDTH = 960;
/** Smallest team calendar row (px) on desktop/tablet; the grid fills the window above that. */
export const TEAM_CELL_MIN_HEIGHT = 92;
/** Team calendar (desktop/tablet): largest content scale, and the share of a cell's free height it may use. */
export const TEAM_SCALE_MAX = 2;
export const TEAM_SCALE_FILL = 0.9;

/**
 * The fullest cell the season can have, for sizing the team calendar: the game with the longest national TV names,
 * as a Cup Final, on night 1 of a travelling back-to-back, with the opponent on its 2nd night.
 */
function probeCard(data: CalendarData): Parameters<typeof GameCard>[0] | undefined {
  const tvText = (g: ScheduleGame) => nationalTv(g).join(' · ').length;
  const g = data.games.reduce<ScheduleGame | undefined>((best, x) => (x.homeTeam.teamId && (!best || tvText(x) > tvText(best)) ? x : best), undefined);
  if (!g) return undefined;
  const game: ScheduleGame = { ...g, gameId: 'ck-probe', gameType: 'cup-final' };
  const pair = { teamId: g.homeTeam.teamId, first: game, second: game, code: 'AA', fromCity: '', toCity: '', travels: true, tip: '' } as B2BPair;
  return { game, teamId: g.homeTeam.teamId, b2b: [{ pair, night: 1 }], opponentB2B: ' ', now: 0, timeZone: 'UTC', teamFirst: true, logos: true, size: 'compact' };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar-date formatting (the date is already an NBA game date; no time zone conversion). */
const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const fmtMonth = (month: string) => fmtDate(`${month}-01`, { month: 'long', year: 'numeric' });
const plural = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

/** "Nov 15 – 21, 2026", "Nov 29 – Dec 5, 2026", "Dec 27, 2026 – Jan 2, 2027". */
export function fmtRange(from: string, to: string): string {
  const md = (d: string) => fmtDate(d, { month: 'short', day: 'numeric' });
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${md(from)}, ${from.slice(0, 4)} – ${md(to)}, ${to.slice(0, 4)}`;
  const end = from.slice(0, 7) === to.slice(0, 7) ? String(Number(to.slice(8))) : md(to);
  return `${md(from)} – ${end}, ${to.slice(0, 4)}`;
}

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

/** A team's back-to-back nights by gameId (a game can in theory be night 2 of one pair and night 1 of the next). */
function useTeamB2B(data: CalendarData, teamId: number) {
  return useMemo(() => {
    const pairs = teamB2BPairs(data, teamId);
    const byGame = new Map<string, B2BNight[]>();
    const add = (g: ScheduleGame, n: B2BNight) => byGame.set(g.gameId, [...(byGame.get(g.gameId) ?? []), n]);
    for (const pair of pairs) {
      add(pair.first, { pair, night: 1 });
      add(pair.second, { pair, night: 2 });
    }
    return { pairs, byGame };
  }, [data, teamId]);
}

/** Clamp a fixed-position popup/tooltip of width `w` into the viewport. */
const clampX = (x: number, w: number) => Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8));

// ---------------------------------------------------------------- tooltip (hover + focus, any [data-tip] inside)

/**
 * One floating tooltip for every `[data-tip]` element in the widget, shown on hover and keyboard focus. Fixed
 * positioning, so cells with overflow: hidden don't clip it, and clamped into the viewport.
 */
function useTooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: SyntheticEvent) => {
    const el = (e.target as Element).closest?.('[data-tip]');
    if (!el) return setTip(undefined);
    const r = el.getBoundingClientRect();
    const text = el.getAttribute('data-tip')!;
    setTip((t) => (t && t.text === text && t.x === r.left + r.width / 2 && t.top === r.top ? t : { text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
  };
  const hide = () => setTip(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    el.style.left = `${clampX(tip.x - el.offsetWidth / 2, el.offsetWidth)}px`;
    const above = tip.top - el.offsetHeight - 6;
    el.style.top = `${above >= 4 ? above : tip.bottom + 6}px`;
  });
  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);
  return {
    handlers: { onMouseOver: show, onFocus: show, onMouseLeave: hide, onBlur: hide },
    node: tip && (
      <div ref={ref} className="ck-tooltip" role="tooltip" data-testid="tooltip">
        {tip.text}
      </div>
    ),
  };
}

// ---------------------------------------------------------------- team picker

const PICKER_ORDER: Team[] = DIVISIONS.flatMap(({ division }) => TEAMS.filter((t) => t.division === division));
const fullName = (t: Team) => `${t.city} ${t.name}`;

/** Big team logo on its light disc. */
function BigLogo({ teamId, px }: { teamId: number; px: number }) {
  const src = teamLogo(teamId);
  return (
    <span className="ck-logo-backing" style={{ '--ck-logo': `${px}px` } as CSSProperties}>
      {src && <img src={src} alt="" width={px} height={px} />}
    </span>
  );
}

/**
 * Team picker with logos: a button (logo + name; tricode on phones) opening a listbox grouped by conference and
 * division. Keyboard: Enter/Space/↓ open; arrows move (←/→ jump a division), Home/End, a letter jumps to the next
 * team starting with it, Enter selects, Escape closes; focus returns to the button.
 */
export function TeamPicker({ teamId, onChange, compact = false }: { teamId: number; onChange: (teamId: number) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(teamId);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const team = TEAM_BY_ID.get(teamId)!;
  const id = `ck-team-${useId()}`;

  const openList = () => {
    const r = btn.current!.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
    setActive(teamId);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const pick = (t: number) => {
    close();
    if (t !== teamId) onChange(t);
  };
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    el.style.left = `${clampX(pos.left, el.offsetWidth)}px`;
    el.focus();
  }, [open, pos]);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-team-id="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close(false);
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const move = (by: number) => {
    const i = PICKER_ORDER.findIndex((t) => t.id === active);
    setActive(PICKER_ORDER[Math.max(0, Math.min(PICKER_ORDER.length - 1, i + by))]!.id);
  };
  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      ArrowRight: () => move(compact ? 15 : 5),
      ArrowLeft: () => move(compact ? -15 : -5),
      Home: () => setActive(PICKER_ORDER[0]!.id),
      End: () => setActive(PICKER_ORDER.at(-1)!.id),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => close(),
      Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      keys[e.key]!();
    } else if (/^[a-z]$/i.test(e.key)) {
      // next team (after the active one) whose city or name starts with the letter
      const i = PICKER_ORDER.findIndex((t) => t.id === active);
      const rot = [...PICKER_ORDER.slice(i + 1), ...PICKER_ORDER.slice(0, i + 1)];
      const hit = rot.find((t) => fullName(t).toLowerCase().startsWith(e.key.toLowerCase()) || t.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit) setActive(hit.id);
    }
  };

  return (
    <div className="ck-picker">
      <span id={`${id}-label`} className="ck-sr">
        Team
      </span>
      <button
        ref={btn}
        type="button"
        id={`${id}-button`}
        className="ck-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-button`}
        data-testid="team-picker"
        data-team-id={teamId}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <TeamLogo team={{ teamId } as ScheduleGame['homeTeam']} />
        <span className="ck-picker-name">{compact ? team.tricode : fullName(team)}</span>
        <span className="ck-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={list}
          className={`ck-picker-list${compact ? ' ck-picker-compact' : ''}`}
          role="listbox"
          aria-label="Teams"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          style={{ top: pos.top }}
        >
          {DIVISIONS.map(({ conference, division }) => (
            <div key={division} role="group" aria-labelledby={`${id}-${division}`} className="ck-picker-group">
              <div id={`${id}-${division}`} className="ck-picker-head" role="presentation">
                {conference} · {division}
              </div>
              {TEAMS.filter((t) => t.division === division).map((t) => (
                <div
                  key={t.id}
                  id={`${id}-${t.id}`}
                  role="option"
                  aria-selected={t.id === teamId}
                  data-team-id={t.id}
                  className={`ck-picker-option${t.id === active ? ' ck-picker-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t.id)}
                  onMouseEnter={() => setActive(t.id)}
                >
                  <TeamLogo team={{ teamId: t.id } as ScheduleGame['homeTeam']} />
                  {fullName(t)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Team views: large logo on its disc + full name. */
export function TeamHeader({ teamId, compact = false }: { teamId: number; compact?: boolean }) {
  const t = TEAM_BY_ID.get(teamId);
  return (
    <div className="ck-team-header" data-testid="team-header">
      <BigLogo teamId={teamId} px={compact ? 40 : 48} />
      <h2 className="ck-team-name">{t ? fullName(t) : 'Team'}</h2>
    </div>
  );
}

// ---------------------------------------------------------------- period navigation (shared)

interface PeriodNavProps {
  title: string;
  unit: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  testId?: string;
  /** Title is a button (e.g. opens the week picker). */
  onTitleClick?: () => void;
  titleExpanded?: boolean;
}

function PeriodNav({ title, unit, onPrev, onNext, prevDisabled, nextDisabled, testId = 'period-title', onTitleClick, titleExpanded }: PeriodNavProps) {
  return (
    <div className="ck-nav ck-period">
      <button type="button" className="ck-arrow" aria-label={`Previous ${unit}`} disabled={prevDisabled} onClick={onPrev}>
        ‹
      </button>
      {onTitleClick ? (
        <button type="button" className="ck-nav-title ck-title-button" data-testid={testId} aria-haspopup="dialog" aria-expanded={titleExpanded} onClick={onTitleClick}>
          {title}
          <span className="ck-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      ) : (
        <h2 className="ck-nav-title" data-testid={testId}>
          {title}
        </h2>
      )}
      <button type="button" className="ck-arrow" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext}>
        ›
      </button>
    </div>
  );
}

function monthNav(month: string, months: string[], onMonthChange: (m: string) => void): PeriodNavProps {
  const i = months.indexOf(month);
  return {
    title: fmtMonth(month),
    unit: 'month',
    onPrev: () => onMonthChange(addMonths(month, -1)),
    onNext: () => onMonthChange(addMonths(month, 1)),
    prevDisabled: i <= 0,
    nextDisabled: i < 0 || i >= months.length - 1,
  };
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
  /** National TV games only. */
  tvOnly?: boolean;
  /** Own month header (default); off when the host shows the navigation (CalendarView's top bar). */
  nav?: boolean;
}

type Bar = { kind: 'full' | 'start' | 'end'; i: number; pair: B2BPair };

export function TeamMonthGrid({ data, teamId, month, onMonthChange, size, now, timeZone, onOpenGame, tvOnly = false, nav = true }: TeamMonthGridProps) {
  const compact = isCompact(size);
  const byDate = useMemo(() => new Map(teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)).map((g) => [g.dateEt, g])), [data, teamId, tvOnly]);
  const b2b = useTeamB2B(data, teamId);
  const [selected, setSelected] = useState<string | undefined>();
  const selectedGame = selected ? byDate.get(selected) : undefined;
  const cells = monthCells(month);
  const weeks = cells.length / 7;
  const visible = (g: ScheduleGame) => !tvOnly || hasNationalTv(g);

  // B2B bars: one across both cells (through the gap) when the nights sit side by side in a week row; otherwise a
  // half on each shown night ending in an arrow toward the other (week break, or the other night in another month).
  const bars = useMemo(() => {
    const at = new Map(cells.flatMap((d, i) => (d ? [[d, i] as const] : [])));
    const out: Bar[] = [];
    for (const pair of b2b.pairs) {
      if (!visible(pair.first) || !visible(pair.second)) continue; // the other night is filtered out: label only
      const a = at.get(pair.first.dateEt);
      const b = at.get(pair.second.dateEt);
      if (a !== undefined && b === a + 1 && a % 7 !== 6) out.push({ kind: 'full', i: a, pair });
      else {
        if (a !== undefined) out.push({ kind: 'start', i: a, pair });
        if (b !== undefined) out.push({ kind: 'end', i: b, pair });
      }
    }
    return out;
  }, [month, b2b, tvOnly]);

  const cardProps = (g: ScheduleGame) => ({
    game: g,
    teamId,
    b2b: b2b.byGame.get(g.gameId),
    opponentB2B: opponentSecondNight(data, g, teamId),
    now,
    timeZone,
  });
  const place = (i: number): CSSProperties => ({ gridRow: Math.floor(i / 7) + 2, gridColumn: (i % 7) + 1 });

  // Desktop/tablet: cell content scaled (CSS zoom) to use the cell. The scale is the largest (0.05 steps, up to
  // TEAM_SCALE_MAX) at which the fullest possible cell (probeCard) fits a cell of a 6-week month — the smallest
  // cells — so it doesn't change from month to month. The probe is rendered only while measuring, before paint.
  const probe = useMemo(() => probeCard(data), [data]);
  const [scale, setScale] = useState({ key: '', s: 1 });
  const key = `${size.width}x${size.height}`;
  const measuring = !compact && !!probe && scale.key !== key;
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const g = grid.current;
    const cell = g?.querySelector<HTMLElement>('.ck-day-cell');
    const card = g?.querySelector<HTMLElement>('.ck-team-probe > .ck-card');
    if (!measuring || !g || !cell || !card) return;
    const cs = getComputedStyle(cell);
    const px = (v: string) => parseFloat(v) || 0;
    const c = cell.getBoundingClientRect();
    const gap = px(getComputedStyle(g).rowGap);
    const h6 = Math.max(TEAM_CELL_MIN_HEIGHT, (weeks * (c.height + gap)) / 6 - gap);
    const num = cell.querySelector('.ck-daynum')!.getBoundingClientRect();
    const room = (h6 - (num.bottom - c.top) - px(cs.rowGap) - px(cs.paddingBottom) - px(cs.borderBottomWidth)) * TEAM_SCALE_FILL;
    card.parentElement!.style.width = `${c.width}px`;
    let s = TEAM_SCALE_MAX;
    for (; s > 1; s = Math.round((s - 0.05) * 100) / 100) {
      card.style.zoom = String(s);
      if (card.getBoundingClientRect().height <= room && card.scrollWidth <= card.clientWidth) break;
    }
    setScale({ key, s: Math.max(1, s) });
  });
  const s = compact ? 1 : scale.s;

  return (
    <section className="ck-team-month" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} schedule`}>
      {nav && <PeriodNav {...monthNav(month, seasonMonths(data), onMonthChange)} />}
      <div
        ref={grid}
        className="ck-grid ck-team-grid"
        role="grid"
        data-weeks={weeks}
        data-scale={s}
        style={{ gridTemplateRows: `auto repeat(${weeks}, ${compact ? '1fr' : `minmax(${TEAM_CELL_MIN_HEIGHT}px, 1fr)`})`, '--ck-team-scale': s } as CSSProperties}
      >
        {measuring && (
          <div className="ck-cell ck-team-probe" aria-hidden="true">
            <GameCard {...probe} timeZone={timeZone} />
          </div>
        )}
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="ck-grid-head" role="columnheader" style={{ gridRow: 1, gridColumn: i + 1 }}>
            {compact ? d[0] : d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" style={place(i)} />;
          const g = byDate.get(date);
          const nights = g && b2b.byGame.get(g.gameId);
          const cls = `ck-cell ck-day-cell${g ? ' ck-cell-game' : ''}${g && isOver(g, now) ? ' ck-cell-past' : ''}${selected === date ? ' ck-cell-selected' : ''}`;
          return (
            <div key={date} className={cls} role="gridcell" data-date={date} data-b2b={nights?.map((n) => n.night).join(' ')} style={place(i)} onClick={() => g && setSelected(date)}>
              <span className="ck-daynum">{Number(date.slice(8))}</span>
              {g && <GameCard {...cardProps(g)} teamFirst={!compact} logos={!compact} shortB2B={compact} size="compact" onOpenGame={compact ? undefined : onOpenGame} />}
              {g && <CopyButton hover label="Copy day as image" of=".ck-day-cell" testId="copy-day" />}
            </div>
          );
        })}
        {bars.map((b) => (
          <div
            key={`${b.kind}${b.i}`}
            className={`ck-b2b-bar ck-b2b-bar-${b.kind}`}
            data-b2b-bar={b.kind}
            data-pair={`${b.pair.first.dateEt}/${b.pair.second.dateEt}`}
            aria-hidden="true"
            style={{ gridRow: Math.floor(b.i / 7) + 2, gridColumn: `${(b.i % 7) + 1} / span ${b.kind === 'full' ? 2 : 1}` }}
          />
        ))}
      </div>
      {compact && selectedGame && (
        <div className="ck-detail">
          <div className="ck-detail-date">{fmtDate(selectedGame.dateEt, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <GameCard {...cardProps(selectedGame)} teamFirst logos onOpenGame={onOpenGame} copyable />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- league: continuous list

export interface LeagueListViewProps {
  data: CalendarData;
  /** Day to show at the top: on open, and whenever the host changes it. */
  date: string;
  /** Raised when another day reaches the top of the list (scrolling, week strip, arrows). */
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** Own day title and arrows (default); off when the host shows the navigation (CalendarView's top bar). */
  nav?: boolean;
}

/** Height estimates (px) for a day not measured yet: sticky header + one card row per game (+ 6 px gap). */
const LIST_HEAD = 38;
const listRow = (compact: boolean) => (compact ? 27 : 35) + 6;
/** Days stay rendered this far (in viewport heights) above and below the visible part. */
const LIST_OVERSCAN = 0.75;

type ListDay = { date: string; games: ScheduleGame[] };

/** The list's game days (only TV games when filtered; days left without games are dropped). */
function listDays(data: CalendarData, tvOnly: boolean): ListDay[] {
  const out: ListDay[] = [];
  for (const d of data.dates) {
    const all = data.byDate.get(d)!;
    const games = tvOnly ? all.filter(hasNationalTv) : all;
    if (games.length) out.push({ date: d, games });
  }
  return out;
}

/** The list's day for a date: that day, else the next one with games, else the last. */
const nearestDay = (days: ListDay[], date: string) => (days.find((d) => d.date >= date) ?? days.at(-1))?.date ?? date;

/** Index of the day at scroll offset `y` (tops = cumulative day tops, plus the total at the end). */
function dayAt(tops: number[], y: number): number {
  let i = 0;
  while (i < tops.length - 2 && tops[i + 1]! <= y + 1) i++;
  return i;
}

const listTitle = (date: string, compact: boolean) => fmtDate(date, { weekday: compact ? 'short' : 'long', month: compact ? 'short' : 'long', day: 'numeric', year: 'numeric' });

/**
 * The league schedule as one continuous list of game days, each under a sticky header ("Sun, Nov 15 · 9 games").
 * Only the days near the viewport are rendered; the rest are spacers sized from measured (or estimated) heights,
 * and the day at the top stays put while heights above it get measured. The week strip follows the day at the top.
 */
export function LeagueListView({ data, date, onSelectDate, tvOnly, size, now, timeZone, onOpenGame, nav = true }: LeagueListViewProps) {
  const compact = isCompact(size);
  const days = useMemo(() => listDays(data, tvOnly), [data, tvOnly]);
  const index = useMemo(() => new Map(days.map((d, i) => [d.date, i])), [days]);
  const counts = useMemo(() => new Map(days.map((d) => [d.date, d.games.length])), [days]);
  const today = localDate(now, timeZone);

  // Measured day heights, keyed by date and game count; dropped when the width changes (cards rewrap).
  const heights = useRef({ width: size.width, map: new Map<string, number>() });
  if (heights.current.width !== size.width) heights.current = { width: size.width, map: new Map() };
  const hKey = (d: ListDay) => `${d.date}/${d.games.length}`;
  const [measured, setMeasured] = useState(0);
  const tops = useMemo(() => {
    const out = [0];
    for (const d of days) out.push(out.at(-1)! + (heights.current.map.get(hKey(d)) ?? LIST_HEAD + d.games.length * listRow(compact)));
    return out;
    // `measured` signals a change inside the heights ref
  }, [days, compact, measured, size.width]);

  const scroller = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(size.height);
  // The day at the top and how far into it the list is scrolled: kept in place across re-measuring.
  const anchor = useRef({ date: nearestDay(days, date), within: 0 });
  const [topDay, setTopDay] = useState(anchor.current.date);
  const [scrollTop, setScrollTop] = useState(() => tops[index.get(anchor.current.date) ?? 0] ?? 0);
  const reported = useRef(date);

  const jump = (d: string) => {
    const day = nearestDay(days, d);
    anchor.current = { date: day, within: 0 };
    setTopDay(day);
    setScrollTop(tops[index.get(day) ?? 0] ?? 0);
  };

  // The layout the browser last showed and the scroll position it was left at: a scroll is read against these.
  const painted = useRef({ tops, y: 0 });
  const follow = (y: number) => {
    const t = painted.current.tops;
    const i = dayAt(t, y);
    if (!days[i]) return;
    anchor.current = { date: days[i].date, within: y - t[i]! };
    painted.current.y = y;
    setTopDay(days[i].date);
  };
  const onScroll = () => {
    const y = scroller.current!.scrollTop;
    follow(y);
    setScrollTop(y);
  };

  // Host moved the date (e.g. a day picked in the calendar, the top bar's arrows): scroll there. Our own reports
  // are skipped.
  useEffect(() => {
    if (date !== reported.current) {
      reported.current = date;
      jump(date);
    }
  }, [date]);
  useEffect(() => {
    if (topDay !== reported.current) {
      reported.current = topDay;
      onSelectDate(topDay);
    }
  }, [topDay, onSelectDate]);

  // After every render: measure the rendered days; once heights are stable, put the anchor day back in place.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.clientHeight && el.clientHeight !== viewH) setViewH(el.clientHeight);
    // a user scroll whose event hasn't arrived yet: take it in first, or restoring the anchor would undo it
    if (Math.abs(el.scrollTop - painted.current.y) > 0.5) follow(el.scrollTop);
    let changed = false;
    for (const node of el.querySelectorAll<HTMLElement>('[data-day]')) {
      const h = node.getBoundingClientRect().height; // not offsetHeight: rows can be 28.5 px, rounding would drift
      const k = node.dataset.key!;
      if (h && Math.abs((heights.current.map.get(k) ?? 0) - h) > 0.01) {
        heights.current.map.set(k, h);
        changed = true;
      }
    }
    if (changed) return setMeasured((m) => m + 1);
    let i = index.get(anchor.current.date);
    if (i === undefined) {
      // the filter removed the anchor day: the nearest day that's left
      const day = nearestDay(days, anchor.current.date);
      anchor.current = { date: day, within: 0 };
      setTopDay(day);
      i = index.get(day) ?? 0;
    }
    const want = (tops[i] ?? 0) + anchor.current.within;
    if (Math.abs(el.scrollTop - want) > 0.5) el.scrollTop = want;
    painted.current = { tops, y: el.scrollTop };
    setScrollTop(want);
  });

  const lo = scrollTop - viewH * LIST_OVERSCAN;
  const hi = scrollTop + viewH * (1 + LIST_OVERSCAN);
  let start = 0;
  while (start < days.length - 1 && tops[start + 1]! <= lo) start++;
  let end = start;
  while (end < days.length && tops[end]! < hi) end++;
  const total = tops[days.length]!;
  const lastH = days.length ? total - tops[days.length - 1]! : 0;
  // room after the last day, so every day can reach the top
  const tail = Math.max(0, viewH - lastH);

  const ti = index.get(topDay) ?? 0;
  const go = (i: number) => days[i] && jump(days[i].date);

  return (
    <section className="ck-league-list" aria-label="League schedule" style={{ maxHeight: size.height }}>
      {nav && (
        <PeriodNav
          title={listTitle(topDay, compact)}
          unit="day"
          testId="day-title"
          onPrev={() => go(ti - 1)}
          onNext={() => go(ti + 1)}
          prevDisabled={ti <= 0}
          nextDisabled={ti >= days.length - 1}
        />
      )}
      <div className="ck-week" role="tablist" aria-label="Week">
        {weekOf(topDay).map((d) => {
          const n = counts.get(d) ?? 0;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === topDay}
              className={`ck-weekday${d === topDay ? ' ck-weekday-selected' : ''}${d === today ? ' ck-weekday-today' : ''}`}
              disabled={!n}
              onClick={() => jump(d)}
              data-date={d}
            >
              <span className="ck-weekday-name">{fmtDate(d, { weekday: 'short' })}</span>
              <span className="ck-weekday-num">{Number(d.slice(8))}</span>
              <span className="ck-weekday-count">{n ? n : '–'}</span>
            </button>
          );
        })}
      </div>
      <div className="ck-llist" ref={scroller} onScroll={onScroll} data-testid="league-list">
        {days.length === 0 && <p className="ck-empty">No games.</p>}
        <div style={{ height: tops[start] }} aria-hidden="true" />
        {days.slice(start, end).map((d) => (
          <ListDaySection key={d.date} day={d} dataKey={hKey(d)} data={data} compact={compact} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
        ))}
        <div style={{ height: total - tops[end]! + tail }} aria-hidden="true" />
      </div>
    </section>
  );
}

const dayHeading = (date: string, n: number) => `${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${plural(n)}`;

/** One game day of the league list: heading + its game cards, each with a copy button; the day has one too. */
function ListDaySection({ day, dataKey, data, compact, now, timeZone, onOpenGame }: { day: ListDay; dataKey?: string; data: CalendarData; compact: boolean; now: number; timeZone?: string; onOpenGame?: (gameId: string) => void }) {
  return (
    <section className="ck-lday" data-day={day.date} data-key={dataKey} aria-label={dayHeading(day.date, day.games.length)}>
      <h3 className="ck-lday-head">{dayHeading(day.date, day.games.length)}</h3>
      <CopyButton hover label="Copy day as image" of=".ck-lday" testId="copy-day" />
      <div className="ck-daylist">
        {day.games.map((g) => (
          <GameCard key={g.gameId} game={g} backToBackTeamIds={b2bIds(data, g)} now={now} timeZone={timeZone} size={compact ? 'compact' : 'regular'} onOpenGame={onOpenGame} logos copyable />
        ))}
      </div>
    </section>
  );
}

/** League list for an image: every game day of the week of `date`, all rendered (no scrolling, no virtualizing). */
function LeagueListWeek({ data, date, tvOnly, size, now, timeZone }: { data: CalendarData; date: string; tvOnly: boolean; size: WidgetSize; now: number; timeZone?: string }) {
  const week = new Set(weekOf(date));
  const days = listDays(data, tvOnly).filter((d) => week.has(d.date));
  return (
    <section className="ck-league-list" aria-label="League schedule">
      <div className="ck-llist">
        {days.length === 0 && <p className="ck-empty">No games.</p>}
        {days.map((d) => (
          <ListDaySection key={d.date} day={d} data={data} compact={isCompact(size)} now={now} timeZone={timeZone} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- team: list

export interface TeamListViewProps {
  data: CalendarData;
  teamId: number;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
}

/** "Sun 15/11" */
const rowDate = (date: string) => `${fmtDate(date, { weekday: 'short' })} ${date.slice(8)}/${date.slice(5, 7)}`;

/**
 * One team's games in order, one row each ("BOS vs CHI", both logos). Opens scrolled to the next game not over
 * (marked); the earlier games are above it. Back-to-back nights are bracketed on the left.
 */
export function TeamListView({ data, teamId, tvOnly, size, now, timeZone, onOpenGame }: TeamListViewProps) {
  const compact = isCompact(size);
  const games = useMemo(() => teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)), [data, teamId, tvOnly]);
  const b2b = useTeamB2B(data, teamId);
  const season = useMemo(() => teamSeason(data, teamId), [data, teamId]);
  const next = (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.gameId;
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const row = el?.querySelector<HTMLElement>('[data-next]');
    if (el && row) el.scrollTop = row.offsetTop - el.querySelector<HTMLElement>('.ck-daylist')!.offsetTop;
    // reopen at the next game only when the list changes (not every minute as `now` ticks)
  }, [games]);

  return (
    <section className="ck-team-list" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} games`} style={{ maxHeight: size.height }}>
      <div className="ck-llist" ref={scroller} data-testid="team-list">
        {games.length === 0 && <p className="ck-empty">No games.</p>}
        <div className="ck-daylist ck-team-rows">
          {games.map((g) => (
            <GameCard
              key={g.gameId}
              game={g}
              teamId={teamId}
              teamFirst
              b2b={b2b.byGame.get(g.gameId)}
              opponentB2B={opponentSecondNight(data, g, teamId)}
              now={now}
              timeZone={timeZone}
              size={compact ? 'compact' : 'regular'}
              onOpenGame={onOpenGame}
              logos
              dateLabel={rowDate(g.dateEt)}
              next={g.gameId === next}
              season={season.get(g.gameId)}
              copyable
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- league: count grid (month)

export interface MonthNavigatorProps {
  data: CalendarData;
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate?: string;
  /** Days to highlight (e.g. the week shown). */
  selectedDates?: string[];
  onSelectDate: (date: string) => void;
  tvOnly: boolean;
  size: WidgetSize;
  /** Local calendar date to highlight as today. */
  today?: string;
  /** Own month header (default); off when the host shows the navigation. */
  nav?: boolean;
}

/** Month overview for navigation only: number of games per day; clicking a day jumps to it. */
export function MonthNavigator({ data, month, onMonthChange, selectedDate, selectedDates, onSelectDate, tvOnly, size, today, nav = true }: MonthNavigatorProps) {
  const compact = isCompact(size);
  const counts = useMemo(() => countsByDate(data, tvOnly), [data, tvOnly]);
  const sel = new Set(selectedDates ?? (selectedDate ? [selectedDate] : []));
  const cells = monthCells(month);
  return (
    <section className="ck-month-nav" aria-label="Month navigator">
      {nav && <PeriodNav {...monthNav(month, seasonMonths(data), onMonthChange)} />}
      <div className="ck-grid ck-count-grid" role="grid" style={{ gridTemplateRows: `auto repeat(${cells.length / 7}, 1fr)` }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="ck-grid-head" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} className="ck-cell ck-cell-empty" />;
          const n = counts.get(date) ?? 0;
          return (
            <button
              key={date}
              type="button"
              className={`ck-cell ck-count-cell${n ? ' ck-cell-game' : ''}${sel.has(date) ? ' ck-cell-selected' : ''}${today === date ? ' ck-cell-today' : ''}`}
              disabled={!n}
              onClick={() => onSelectDate(date)}
              data-date={date}
              aria-label={`${fmtDate(date, { month: 'long', day: 'numeric' })}: ${plural(n)}`}
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

// ---------------------------------------------------------------- league: week view

export type WeekCount = 1 | 2;

export interface LeagueWeekViewProps {
  data: CalendarData;
  /** First day shown (a Sunday). */
  start: string;
  weeks: WeekCount;
  tvOnly: boolean;
  size: WidgetSize;
  /** Local calendar date to highlight as today. */
  today?: string;
  /** IANA zone for the time labels; default: the browser's local zone. */
  timeZone?: string;
  /** Raised when a day header is clicked (the host opens that day in the list). */
  onSelectDate: (date: string) => void;
}

function MonthTeam({ team, b2b }: { team: ScheduleGame['homeTeam']; b2b: boolean }) {
  const label = teamLabel(team);
  return (
    <>
      <TeamLogo team={team} />
      <span className="ck-mtri" data-tricode={label}>
        <span className="ck-mtri-text">
          {label}
          {b2b && <B2BDot tip="Back-to-back" />}
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
      <span className="ck-at">@</span>
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

/**
 * League → Calendar: 7 equal day columns, one or two week rows, every game of each day at full line size
 * (logos + tricodes, "AWAY @ HOME"; TV pill; B2B dot), grouped by local tip-off time. 1 week: one column
 * of games per day; 2 weeks: the day flows into as many columns as fit (see flowDay). Rows are equal and fill the
 * height they're given. A day header opens that day in the list.
 */
export function LeagueWeekView({ data, start, weeks, tvOnly, size, today, timeZone, onSelectDate }: LeagueWeekViewProps) {
  const cols = weeks === 1 ? 1 : monthColumns(size.width);
  // 1 week: lines scaled to the day cell (see weekScale). The cell's width is pure maths; its height is the widget
  // height below the grid's top (measured; it doesn't depend on the scale, so no feedback loop).
  const busiest = useMemo(() => busiestDayHeight(data.byDate, timeZone), [data, timeZone]);
  const grid = useRef<HTMLDivElement>(null);
  const [gridTop, setGridTop] = useState(0);
  useLayoutEffect(() => {
    const el = grid.current;
    const root = el?.closest('.ck-root') ?? el?.parentElement;
    if (el && root) setGridTop(el.getBoundingClientRect().top - root.getBoundingClientRect().top);
  }, [size.width, size.height]);
  const pad = size.width < ROOMY_WIDTH ? 2 : 4;
  const scale = weeks === 1 ? weekScale(monthCellInner(size.width), size.height - gridTop - 2 * pad - 2, busiest) : 1;
  const L = scaleLine(scale);
  const vars = {
    '--ck-logo': `${L.logo}px`,
    '--ck-gap': `${L.gap}px`,
    '--ck-tri': `${L.tri}px`,
    '--ck-sep': `${L.sep}px`,
    '--ck-at-font': `${L.atFont}px`,
    '--ck-pill-gap': `${L.pillGap}px`,
    '--ck-pill': `${L.pill}px`,
    '--ck-font': `${L.font}px`,
    '--ck-label-font': `${L.labelFont}px`,
    '--ck-label-gap': `${L.labelGap}px`,
    '--ck-row-gap': `${L.rowGap}px`,
    '--ck-group-gap': `${L.groupGap}px`,
    '--ck-dot': `${L.dot}px`,
    '--ck-col-gap': `${MONTH_COL_GAP}px`,
    '--ck-line': `${lineWidth(L)}px`,
  } as CSSProperties;
  const dates = Array.from({ length: 7 * weeks }, (_, i) => addDays(start, i));

  return (
    <section className={`ck-week-view${size.width < ROOMY_WIDTH ? ' ck-month-tight' : ''}`} aria-label="League week" data-weeks={weeks} data-scale={scale} style={vars}>
      <div ref={grid} className="ck-grid ck-week-grid" role="grid" style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}>
        {dates.map((date) => {
          const all = data.byDate.get(date) ?? [];
          const games = tvOnly ? all.filter(hasNationalTv) : all;
          const first = date.endsWith('-01') || date === start;
          return (
            <div
              key={date}
              role="gridcell"
              className={`ck-cell ck-month-cell${games.length ? ' ck-cell-game' : ''}${today === date ? ' ck-cell-today' : ''}`}
              data-date={date}
              data-count={games.length}
            >
              <button
                type="button"
                className="ck-wday"
                data-testid="day-header"
                disabled={!games.length}
                onClick={() => onSelectDate(date)}
                aria-label={`${fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${plural(games.length)}`}
              >
                <span className="ck-wday-name">{fmtDate(date, { weekday: 'short' })}</span>
                <span className="ck-wday-num">{first ? fmtDate(date, { month: 'short', day: 'numeric' }) : Number(date.slice(8))}</span>
                {games.length > 0 && <span className="ck-wday-count">{plural(games.length)}</span>}
              </button>
              {games.length > 0 && <CopyButton hover label="Copy day as image" of=".ck-month-cell" testId="copy-day" />}
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

/** Month popup of the week view: game counts per day; a click jumps to that day's week. */
function WeekPicker({ data, start, weeks, tvOnly, size, today, onPick, onClose }: { data: CalendarData; start: string; weeks: WeekCount; tvOnly: boolean; size: WidgetSize; today: string; onPick: (date: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(monthOf(addDays(start, 3)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.ck-cell-selected:not([disabled]), .ck-count-cell:not([disabled])')?.focus();
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-testid="period-title"]') && onClose();
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  return (
    <div ref={ref} className="ck-popup" role="dialog" aria-label="Jump to a week" data-testid="week-picker" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <MonthNavigator
        data={data}
        month={month}
        onMonthChange={setMonth}
        selectedDates={Array.from({ length: 7 * weeks }, (_, i) => addDays(start, i))}
        onSelectDate={onPick}
        tvOnly={tvOnly}
        size={{ width: Math.min(size.width, 360), height: 360 }}
        today={today}
      />
    </div>
  );
}

// ---------------------------------------------------------------- CalendarView: the combined widget

export type CalendarMode = 'team' | 'league';
export type CalendarLayout = 'list' | 'calendar';

export interface CalendarState {
  mode: CalendarMode;
  /** List or Calendar; kept when switching League ↔ Team. */
  layout: CalendarLayout;
  teamId: number;
  /** League views: the day at the top of the list; the week view shows this day's week. */
  date: string;
  tvOnly: boolean;
  /** League → Calendar: 1 or 2 week rows. */
  weeks: WeekCount;
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
}

const DEFAULT_TEAM = TEAMS[0]!.id;

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="ck-tabs" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={`ck-tab${value === v ? ' ck-tab-selected' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function CalendarView({ data, size, initial, now: fixedNow, timeZone, onOpenGame, onStateChange, title, note }: CalendarViewProps) {
  const now = useNow(fixedNow);
  const compact = isCompact(size);
  const [state, setState] = useState<CalendarState>(() => ({
    mode: initial?.mode ?? 'league',
    layout: initial?.layout ?? 'list',
    teamId: initial?.teamId && TEAM_BY_ID.has(initial.teamId) ? initial.teamId : DEFAULT_TEAM,
    date: initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) ? initial.date : (defaultDay(data, now) ?? localDate(now, timeZone)),
    tvOnly: initial?.tvOnly ?? false,
    weeks: initial?.weeks === 2 ? 2 : 1,
  }));
  const [leagueMonth, setLeagueMonth] = useState(() => monthOf(state.date));
  const [teamMonth, setTeamMonth] = useState(() => monthOf(teamDefaultDate(data, state.teamId, now) ?? state.date));
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
    setTeamMonth(monthOf(teamDefaultDate(data, teamId, now) ?? state.date));
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

  // Top bar navigation for the view on show.
  const days = useMemo(() => listDays(data, state.tvOnly), [data, state.tvOnly]);
  let nav: PeriodNavProps | undefined;
  if (team && !list) nav = monthNav(teamMonth, seasonMonths(data), setTeamMonth);
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

  return (
    <div
      className={`ck-root${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`}
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
        {weekView && <Segmented label="Weeks" value={String(state.weeks) as '1' | '2'} options={[['1', '1 week'], ['2', '2 weeks']]} onChange={(w) => update({ weeks: w === '2' ? 2 : 1 })} />}
        <label className="ck-check">
          <input type="checkbox" aria-label="TV games only" checked={state.tvOnly} onChange={(e) => update({ tvOnly: e.target.checked })} /> {compact ? 'TV only' : 'TV games only'}
        </label>
        {note &&
          (compact ? (
            <span className="ck-note ck-note-icon" data-tip={note} aria-label={note} role="img" tabIndex={0}>
              i
            </span>
          ) : (
            <span className="ck-note" data-testid="tz-note">
              {note}
            </span>
          ))}
        <CopyButton label="Copy view as image" copy={copyView} testId="copy-view" />
      </div>
      {team && <TeamHeader teamId={state.teamId} compact={compact} />}
      {team ? (
        list ? (
          <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} />
        ) : (
          <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} tvOnly={state.tvOnly} nav={false} />
        )
      ) : list ? (
        <LeagueListView data={data} date={state.date} onSelectDate={onSelectDate} tvOnly={state.tvOnly} size={size} now={now} timeZone={timeZone} onOpenGame={onOpenGame} nav={false} />
      ) : weekView ? (
        <LeagueWeekView data={data} start={weekOf(state.date)[0]!} weeks={state.weeks} tvOnly={state.tvOnly} size={size} today={today} timeZone={timeZone} onSelectDate={openDay} />
      ) : (
        <MonthNavigator today={today} data={data} month={leagueMonth} onMonthChange={setLeagueMonth} selectedDate={state.date} onSelectDate={openDay} tvOnly={state.tvOnly} size={size} nav={false} />
      )}
      {tooltip.node}
      {capture && (
        <CaptureStage onReady={capture} width={(list ? Math.min(size.width, LIST_MAX_WIDTH) : size.width) + 2 * CAPTURE_PAD} className={`${compact ? ' ck-compact' : ''}${list ? ' ck-root-fill' : ' ck-root-grow'}`} minHeight={list || compact ? undefined : size.height}>
          <div className="ck-capture-head">
            {title && <span className="ck-title">{title}</span>}
            {capturePeriod && <span className="ck-capture-period">{capturePeriod}</span>}
            {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
            {note && <span className="ck-note">{note}</span>}
          </div>
          {team && <TeamHeader teamId={state.teamId} compact={compact} />}
          {team ? (
            list ? (
              <TeamListView data={data} teamId={state.teamId} tvOnly={state.tvOnly} size={fullHeight} now={now} timeZone={timeZone} />
            ) : (
              <TeamMonthGrid data={data} teamId={state.teamId} month={teamMonth} onMonthChange={setTeamMonth} size={size} now={now} timeZone={timeZone} tvOnly={state.tvOnly} nav={false} />
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

/**
 * Off-screen copy of the current view for "Copy view as image": the whole view, not only the part a list has
 * scrolled to (team list: every game; league list: the week of the day at the top), under a caption with the
 * title, period, filter and time zone instead of the controls. Rendered only while copying; `onReady` gets the
 * node once fonts and logos are decoded.
 */
/** Padding around the view in a whole-view image (.ck-capture); the stage is this much wider so the view keeps its width. */
const CAPTURE_PAD = 12;

function CaptureStage({ onReady, width, minHeight, className, children }: { onReady: (node: HTMLElement) => void; width: number; minHeight?: number; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    const node = ref.current!;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    (async () => {
      await frame();
      await frame(); // layout effects (Team Calendar scale) have settled
      await document.fonts?.ready;
      await Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
      onReady(node);
    })();
  }, []);
  return createPortal(
    <div className="ck-capture-stage" aria-hidden="true">
      <div ref={ref} className={`ck-root ck-capture${className}`} style={{ width, minHeight }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Team view opens on the month of the team's next game not over yet (else its last game). */
function teamDefaultDate(data: CalendarData, teamId: number, now: number): string | undefined {
  const games = teamGames(data, teamId);
  return (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.dateEt;
}
