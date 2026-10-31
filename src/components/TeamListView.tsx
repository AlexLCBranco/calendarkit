// Team → List: every game of one team, one row each, opened at the next game.

import { memo, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { hasNationalTv, isOver, monthOf, opponentSecondNight, sideLabel, teamGames, teamRestDays, teamSeason, weekOf, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue } from '../data/fatigue';
import { TEAM_BY_ID } from '../data/teams';
import { GameCard, type GameLink } from './GameCard';
import { useActiveHighlight } from './ActiveHighlight';
import { ACTIVE_DAY } from './copyAsImage';
import type { ValueStore } from './valueStore';
import { WeekStrip } from './WeekStrip';
import { fmtDate, isCompact, TEAM_LIST_MAX_WIDTH, useTeamB2B, type WidgetSize } from './widget';

export interface TeamListViewProps {
  data: CalendarData;
  teamId: number;
  tvOnly: boolean;
  /** One quiet "Rest" row per day without a game, between the team's first and last game. */
  showRest?: boolean;
  /** Selection image: only these games (no rest rows); a B2B bracket only where both nights are in. */
  only?: ReadonlySet<string>;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** The "↗" on each game: raised with its id; the host opens the game's page. */
  gameLink?: GameLink;
  /** Set to a handle that scrolls back to the next game (the host's "Today" button). */
  handle?: RefObject<TeamListHandle | null>;
  /** Told whether the next game is at the top (true after opening and after `toNext`, false once scrolled away). */
  onAtNext?: (at: boolean) => void;
  /**
   * Desktop/tablet: the date of the row at the top goes here while scrolling (only on a change), and a week strip above
   * the list follows it. Only the strip and the host's title read it: scrolling never re-renders the rows (Rule #1).
   */
  topStore?: ValueStore<string>;
  /** Local calendar date shown in blue in the strip. */
  today?: string;
  /**
   * Round 9: only this month's rows ("YYYY-MM"); undefined = the whole season. Numbers, records, streaks and B2B nights
   * still come from the whole season; a B2B whose other night is in another month keeps its marks but no bracket.
   */
  month?: string;
  /** The strip, the picker or "Today" asked for a row in another month: the host shows that month (then the row is put at the top). */
  onMonthChange?: (month: string) => void;
}

export interface TeamListHandle {
  toNext: () => void;
  /** Scrolls the row of this date (game or rest day), or the next row after it, to the top. */
  toDate: (date: string) => void;
}

/** While scrolling, the title and week strip catch up with the row at the top at most this often (ms). */
export const FOLLOW_MS = 120;

/** Team list rows get the fatigue columns where the whole TEAM_LIST_MAX_WIDTH column fits (desktop). */
export const FATIGUE_COLUMNS_MIN_WIDTH = TEAM_LIST_MAX_WIDTH;

/** "Sun 15/11" */
export const rowDate = (date: string) => `${fmtDate(date, { weekday: 'short' })} ${date.slice(8)}/${date.slice(5, 7)}`;

/**
 * One team's games in order, one row each ("BOS vs CHI", both logos). Opens scrolled to the next game not over
 * (marked); the earlier games are above it. Back-to-back nights are bracketed on the left.
 */
export function TeamListView({ data, teamId, tvOnly, showRest = false, only, size, now, timeZone, onOpenGame, gameLink, handle, onAtNext, topStore, today, month, onMonthChange }: TeamListViewProps) {
  const compact = isCompact(size);
  const games = useMemo(() => teamGames(data, teamId).filter((g) => (!tvOnly || hasNationalTv(g)) && (!only || only.has(g.gameId))), [data, teamId, tvOnly, only]);
  // rest days come from all the team's games, so with the TV filter a non-TV game day is neither a row nor rest
  const allRows = useMemo(() => (showRest && !only ? withRest(games, teamRestDays(data, teamId)) : games), [games, showRest, data, teamId]);
  const rows = useMemo(() => (month ? allRows.filter((r) => monthOf(rowDateOf(r)) === month) : allRows), [allRows, month]);
  const b2b = useTeamB2B(data, teamId);
  const season = useMemo(() => teamSeason(data, teamId), [data, teamId]);
  const fatigue = leagueFatigue(data); // once per data set: both teams' Fatigue columns
  const cols = !compact && size.width >= FATIGUE_COLUMNS_MIN_WIDTH;
  const nextGame = games.find((g) => !isOver(g, now)) ?? games.at(-1);
  const next = nextGame?.gameId;
  const scroller = useRef<HTMLDivElement>(null);
  // scroll offset that puts the next game at the top (as far as the list can scroll); undefined while its row is in
  // another month
  const nextTop = () => {
    const el = scroller.current;
    const row = el?.querySelector<HTMLElement>('[data-next]');
    return el && row ? Math.min(row.offsetTop - el.querySelector<HTMLElement>('.ck-daylist')!.offsetTop, el.scrollHeight - el.clientHeight) : undefined;
  };
  const nextAt = useRef<number | undefined>(0); // nextTop(), as of the last measure
  const report = () => onAtNext?.(nextAt.current !== undefined && Math.abs((scroller.current?.scrollTop ?? 0) - nextAt.current) < 1);
  // Row tops (px into the list) and dates, measured after layout; the scroll handler only reads them.
  const tops = useRef<{ top: number; date: string }[]>([]);
  const tail = useRef<HTMLDivElement>(null);
  const measure = () => {
    const el = scroller.current;
    const list = el?.querySelector<HTMLElement>('.ck-daylist');
    if (!el || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-row-date]')];
    tops.current = rows.map((r) => ({ top: r.offsetTop - list.offsetTop, date: r.dataset.rowDate! }));
    // room after the last row so every row can reach the top (a strip day click, ‹ ›), as in the League List; written
    // straight to the spacer, no render
    if (tail.current) tail.current.style.height = `${Math.max(0, el.clientHeight - (rows.at(-1)?.offsetHeight ?? 0))}px`;
    nextAt.current = nextTop();
  };
  /** The date of the row at the top → the store (a no-op while it stays the same row's date). */
  const track = () => {
    const t = tops.current;
    const y = scroller.current?.scrollTop ?? 0;
    if (!topStore || !t.length) return;
    let lo = 0;
    let hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid]!.top <= y + 1) lo = mid;
      else hi = mid - 1;
    }
    topStore.set(t[lo]!.date);
  };
  const scrollTo = (top: number) => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.min(top, el.scrollHeight - el.clientHeight);
    report();
    track();
  };
  // A row in another month: the host switches months first, then the layout effect below puts it at the top.
  const pending = useRef<{ next: true } | { date: string }>(undefined);
  const otherMonth = (date: string) => !!month && !!onMonthChange && monthOf(date) !== month;
  const toNext = () => {
    if (nextGame && otherMonth(nextGame.dateEt)) {
      pending.current = { next: true };
      onMonthChange!(monthOf(nextGame.dateEt));
    } else scrollTo(nextTop() ?? 0);
  };
  /** The row of this date, or the next row after it (a day without a game → the next game). */
  const toDate = (date: string) => {
    const target = allRows.map(rowDateOf).find((d) => d >= date);
    if (!target) return;
    if (otherMonth(target)) {
      pending.current = { date: target };
      onMonthChange!(monthOf(target));
      return;
    }
    const row = tops.current.find((r) => r.date >= date);
    if (row) scrollTo(row.top);
  };
  if (handle) handle.current = { toNext, toDate };
  // While scrolling, the title and strip follow at most every FOLLOW_MS, and once more when the list stops: every change
  // costs the page a main-thread frame during an otherwise compositor-only scroll (following every row doubled the
  // gesture's main-thread time; PROJECT.md). Reads happen in a frame callback, after layout.
  const timer = useRef<{ last: number; trailing?: ReturnType<typeof setTimeout>; frame: number }>({ last: 0, frame: 0 });
  const follow = () => {
    const t = timer.current;
    if (t.frame) return;
    t.frame = requestAnimationFrame((now) => {
      t.frame = 0;
      t.last = now;
      report();
      track();
    });
  };
  const onScroll = () => {
    const t = timer.current;
    clearTimeout(t.trailing);
    t.trailing = setTimeout(follow, FOLLOW_MS);
    if (performance.now() - t.last >= FOLLOW_MS) follow();
  };
  useLayoutEffect(
    () => () => {
      cancelAnimationFrame(timer.current.frame);
      clearTimeout(timer.current.trailing);
    },
    [],
  );
  // reopen at the next game only when the list changes (not every minute as `now` ticks), rest rows included; after a
  // month change asked for by the strip, the picker or Today, at that row. A month without the next game opens at its 1st.
  useLayoutEffect(() => {
    measure();
    const p = pending.current;
    pending.current = undefined;
    if (p && 'date' in p) {
      const row = tops.current.find((r) => r.date >= p.date);
      scrollTo(row?.top ?? 0);
    } else scrollTo(nextTop() ?? 0);
  }, [rows]);
  // rows change size after the first layout (the font arriving, another width): measure again whenever the list does;
  // and when the scroller does (round 9: the week strip mounts above it after the first render, so the room after the
  // last row, sized from the scroller's height, was short and a month's last row couldn't reach the top)
  useLayoutEffect(() => {
    const list = scroller.current?.querySelector('.ck-daylist');
    if (!list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measure();
      track();
    });
    ro.observe(list);
    ro.observe(scroller.current!);
    return () => ro.disconnect();
  }, []);

  // The active day's row (the strip's selected day): a class on that row only and the overlay band over it, moved when
  // the store changes and placed again when the rows change; rows never re-render for it. The band fades on the
  // compositor (150 ms).
  const highlight = useActiveHighlight();
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!topStore || !el) return;
    const apply = () => {
      const d = topStore.get();
      for (const r of el.querySelectorAll<HTMLElement>(`.${ACTIVE_DAY}`)) if (r.dataset.rowDate !== d) r.classList.remove(ACTIVE_DAY);
      const row = d ? el.querySelector<HTMLElement>(`.ck-daylist > [data-row-date="${d}"]`) : null;
      row?.classList.add(ACTIVE_DAY);
      highlight.show(row ? { key: d, top: row.offsetTop, left: row.offsetLeft, width: row.offsetWidth, height: row.offsetHeight } : undefined);
    };
    apply();
    return topStore.subscribe(apply);
  }, [topStore, rows]);

  // the strip's days: what each date holds (game: opponent; rest day: a row only with "Show rest days")
  // (the whole season's rows: a day in the next month is still a day to click)
  const byDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(rowDateOf(r), typeof r === 'string' ? '' : sideLabel(r, teamId));
    return m;
  }, [allRows, teamId]);
  const gameDates = useMemo(() => games.map((g) => g.dateEt), [games]);

  return (
    <section className="ck-team-list" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} games`} style={{ maxHeight: size.height }}>
      {topStore && !compact && <TeamStrip store={topStore} byDate={byDate} gameDates={gameDates} today={today} onPick={toDate} />}
      <div className="ck-llist" ref={scroller} data-testid="team-list" onScroll={onScroll} data-select-scroller>
        {games.length === 0 && <p className="ck-empty">No games.</p>}
        <div className="ck-daylist ck-team-rows">
          {rows.map((g) =>
            typeof g === 'string' ? (
              <div key={g} className="ck-rest-row" data-rest={g} data-row-date={g} aria-label={`${rowDate(g)}, rest day`}>
                <span className="ck-date">{rowDate(g)}</span>
                <span className="ck-rest">Rest</span>
              </div>
            ) : (
              <GameCard
                key={g.gameId}
                game={g}
                teamId={teamId}
                teamFirst
                b2b={b2b.byGame.get(g.gameId)}
                bracketNights={
                  only || month
                    ? b2b.byGame
                        .get(g.gameId)
                        ?.filter((n) => {
                          const other = n.night === 1 ? n.pair.second : n.pair.first;
                          return only ? only.has(other.gameId) : monthOf(other.dateEt) === month;
                        })
                        .map((n) => n.night)
                    : undefined
                }
                opponentB2B={opponentSecondNight(data, g, teamId)}
                teamFatigue={cols ? fatigue.get(g.gameId) : undefined}
                fatigueColumns={cols}
                now={now}
                timeZone={timeZone}
                size={compact ? 'compact' : 'regular'}
                onOpenGame={onOpenGame}
                gameLink={gameLink}
                logos
                dateLabel={rowDate(g.dateEt)}
                next={g.gameId === next}
                season={season.get(g.gameId)}
                copyable
                rowDate={g.dateEt}
              />
            ),
          )}
        </div>
        {handle && <div ref={tail} aria-hidden="true" />}
        {topStore && highlight.layers}
      </div>
    </section>
  );
}

const rowDateOf = (r: ScheduleGame | string) => (typeof r === 'string' ? r : r.dateEt);

/** Games and rest days (dates) merged in date order. */
function withRest(games: ScheduleGame[], rest: string[]): (ScheduleGame | string)[] {
  const out: (ScheduleGame | string)[] = [];
  let r = 0;
  for (const g of games) {
    while (r < rest.length && rest[r]! < g.dateEt) out.push(rest[r++]!);
    out.push(g);
  }
  return out.concat(rest.slice(r));
}

/**
 * The Team List's week strip: the week of the row at the top, each day's opponent ("@ DET" / "vs CHI"); days without a
 * row dimmed and disabled; ‹ › = the previous / next week with a game. It reads only the week's Sunday from the store,
 * so it re-renders when the week changes; within a week only the old and new selected day do (WeekStrip
 * selectedStore). Before that, re-rendering the whole strip on every row change doubled the Team List scroll's
 * main-thread time (PROJECT.md).
 */
const TeamStrip = memo(function TeamStrip({ store, byDate, gameDates, today, onPick }: { store: ValueStore<string>; byDate: Map<string, string>; gameDates: string[]; today?: string; onPick: (date: string) => void }) {
  const sunday = useSyncExternalStore(store.subscribe, () => (store.get() ? weekOf(store.get())[0]! : ''));
  if (!sunday) return null;
  const week = weekOf(sunday);
  const before = gameDates.filter((d) => d < week[0]!).at(-1);
  const prev = before && gameDates.find((d) => d >= weekOf(before)[0]!);
  const next = gameDates.find((d) => d > week[6]!);
  return (
    <WeekStrip
      days={week.map((d) => ({ date: d, sub: byDate.get(d) ?? '', disabled: !byDate.has(d) }))}
      selectedStore={store}
      today={today}
      onPick={onPick}
      onPrev={() => prev && onPick(prev)}
      onNext={() => next && onPick(next)}
      prevDisabled={!prev}
      nextDisabled={!next}
    />
  );
});
