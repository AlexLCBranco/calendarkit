// Team → List: every game of one team, one row each, opened at the next game.

import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { hasNationalTv, isOver, opponentSecondNight, teamGames, teamRestDays, teamSeason, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { teamThreeInFour } from '../data/scheduleTags';
import { TEAM_BY_ID } from '../data/teams';
import { GameCard } from './GameCard';
import { fmtDate, isCompact, TEAM_LIST_MAX_WIDTH, useTeamB2B, type WidgetSize } from './widget';

export interface TeamListViewProps {
  data: CalendarData;
  teamId: number;
  tvOnly: boolean;
  /** One quiet "Rest" row per day without a game, between the team's first and last game. */
  showRest?: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** Set to a handle that scrolls back to the next game (the host's "Today" button). */
  handle?: RefObject<TeamListHandle | null>;
  /** Told whether the next game is at the top (true after opening and after `toNext`, false once scrolled away). */
  onAtNext?: (at: boolean) => void;
}

export interface TeamListHandle {
  toNext: () => void;
}

/** Team list rows get the fatigue columns where the whole TEAM_LIST_MAX_WIDTH column fits (desktop). */
export const FATIGUE_COLUMNS_MIN_WIDTH = TEAM_LIST_MAX_WIDTH;

/** "Sun 15/11" */
export const rowDate = (date: string) => `${fmtDate(date, { weekday: 'short' })} ${date.slice(8)}/${date.slice(5, 7)}`;

/**
 * One team's games in order, one row each ("BOS vs CHI", both logos). Opens scrolled to the next game not over
 * (marked); the earlier games are above it. Back-to-back nights are bracketed on the left.
 */
export function TeamListView({ data, teamId, tvOnly, showRest = false, size, now, timeZone, onOpenGame, handle, onAtNext }: TeamListViewProps) {
  const compact = isCompact(size);
  const games = useMemo(() => teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)), [data, teamId, tvOnly]);
  // rest days come from all the team's games, so with the TV filter a non-TV game day is neither a row nor rest
  const rows = useMemo(() => (showRest ? withRest(games, teamRestDays(data, teamId)) : games), [games, showRest, data, teamId]);
  const b2b = useTeamB2B(data, teamId);
  const season = useMemo(() => teamSeason(data, teamId), [data, teamId]);
  const tif = teamThreeInFour(data, teamId);
  const cols = !compact && size.width >= FATIGUE_COLUMNS_MIN_WIDTH;
  const next = (games.find((g) => !isOver(g, now)) ?? games.at(-1))?.gameId;
  const scroller = useRef<HTMLDivElement>(null);
  // scroll offset that puts the next game at the top (as far as the list can scroll)
  const nextTop = () => {
    const el = scroller.current;
    const row = el?.querySelector<HTMLElement>('[data-next]');
    return el && row ? Math.min(row.offsetTop - el.querySelector<HTMLElement>('.ck-daylist')!.offsetTop, el.scrollHeight - el.clientHeight) : 0;
  };
  const report = () => onAtNext?.(Math.abs((scroller.current?.scrollTop ?? 0) - nextTop()) < 1);
  const toNext = () => {
    if (scroller.current) scroller.current.scrollTop = nextTop();
    report();
  };
  if (handle) handle.current = { toNext };
  // reopen at the next game only when the list changes (not every minute as `now` ticks), rest rows included
  useLayoutEffect(toNext, [rows]);

  return (
    <section className="ck-team-list" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} games`} style={{ maxHeight: size.height }}>
      <div className="ck-llist" ref={scroller} data-testid="team-list" onScroll={onAtNext && report}>
        {games.length === 0 && <p className="ck-empty">No games.</p>}
        <div className="ck-daylist ck-team-rows">
          {rows.map((g) =>
            typeof g === 'string' ? (
              <div key={g} className="ck-rest-row" data-rest={g} aria-label={`${rowDate(g)}, rest day`}>
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
                opponentB2B={opponentSecondNight(data, g, teamId)}
                tif={cols ? tif.get(g.gameId) : undefined}
                opponentTif={cols ? opponentTif(data, g, teamId) : undefined}
                fatigueColumns={cols}
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
            ),
          )}
        </div>
      </div>
    </section>
  );
}

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

/** The opponent's 3-in-4 for this game, over the opponent's own schedule. */
function opponentTif(data: CalendarData, g: ScheduleGame, teamId: number) {
  const opp = g.homeTeam.teamId === teamId ? g.awayTeam.teamId : g.homeTeam.teamId;
  return opp ? teamThreeInFour(data, opp).get(g.gameId) : undefined;
}
