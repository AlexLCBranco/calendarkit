// Team → List: every game of one team, one row each, opened at the next game.

import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { hasNationalTv, isOver, opponentSecondNight, teamGames, teamSeason, type CalendarData } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { GameCard } from './GameCard';
import { fmtDate, isCompact, useTeamB2B, type WidgetSize } from './widget';

export interface TeamListViewProps {
  data: CalendarData;
  teamId: number;
  tvOnly: boolean;
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

/** "Sun 15/11" */
const rowDate = (date: string) => `${fmtDate(date, { weekday: 'short' })} ${date.slice(8)}/${date.slice(5, 7)}`;

/**
 * One team's games in order, one row each ("BOS vs CHI", both logos). Opens scrolled to the next game not over
 * (marked); the earlier games are above it. Back-to-back nights are bracketed on the left.
 */
export function TeamListView({ data, teamId, tvOnly, size, now, timeZone, onOpenGame, handle, onAtNext }: TeamListViewProps) {
  const compact = isCompact(size);
  const games = useMemo(() => teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)), [data, teamId, tvOnly]);
  const b2b = useTeamB2B(data, teamId);
  const season = useMemo(() => teamSeason(data, teamId), [data, teamId]);
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
  // reopen at the next game only when the list changes (not every minute as `now` ticks)
  useLayoutEffect(toNext, [games]);

  return (
    <section className="ck-team-list" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} games`} style={{ maxHeight: size.height }}>
      <div className="ck-llist" ref={scroller} data-testid="team-list" onScroll={onAtNext && report}>
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
