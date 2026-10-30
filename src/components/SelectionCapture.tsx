// What "Copy selected games" renders off-screen: only the selected games, drawn by the same components as the view
// they were selected in, in on-screen order, without the gaps of the games left out. Lists: the rows stacked (League
// List: under each game's day header). Calendars (Team Calendar in any span, League week view): the games grouped
// under their day header, days in order, as a compact list of day cells (no empty cells).

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { hasNationalTv, opponentSecondNight, type CalendarData } from '../data/model';
import { teamThreeInFour } from '../data/scheduleTags';
import { timeGroups } from './dayflow';
import { GameCard } from './GameCard';
import { listDays } from './LeagueListView';
import { FATIGUE_SLOTS_MIN_WIDTH, ListDaySection } from './LeagueListView';
import { MonthGameLine } from './LeagueWeekView';
import { TeamListView } from './TeamListView';
import { fmtDate, plural, useTeamB2B, type WidgetSize } from './widget';

export type SelectionKind = 'team-list' | 'league-list' | 'team-calendar' | 'league-week';

export interface SelectionCaptureProps {
  kind: SelectionKind;
  data: CalendarData;
  ids: ReadonlySet<string>;
  teamId: number;
  tvOnly: boolean;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  /** Calendars: the on-screen day cell width (px), so each day looks as it does in the grid. */
  cellWidth?: number;
  /** Team Calendar: the on-screen content scale. */
  teamScale?: number;
  /** League week view: the on-screen line variables (`style` of .ck-week-view), so lines are drawn at the same size. */
  weekStyle?: string;
  /** League week view: 1 week (the lines get their Fatigue row, as on screen). */
  weeks?: 1 | 2;
}

/** "Fri 23 Oct · 2 games" */
const dayHead = (date: string, n: number) => `${fmtDate(date, { weekday: 'short' })} ${Number(date.slice(8))} ${fmtDate(date, { month: 'short' })} · ${plural(n)}`;

/** The selected games grouped by day, days in order (the shown games are already in date and tip-off order). */
function byDay(games: ScheduleGame[]): [string, ScheduleGame[]][] {
  const out = new Map<string, ScheduleGame[]>();
  for (const g of games) out.set(g.dateEt, [...(out.get(g.dateEt) ?? []), g]);
  return [...out];
}

export function SelectionCapture(p: SelectionCaptureProps) {
  const { kind, data, ids, teamId, tvOnly, size, now, timeZone } = p;
  if (kind === 'team-list') return <TeamListView data={data} teamId={teamId} tvOnly={tvOnly} size={{ width: size.width, height: 1e6 }} now={now} timeZone={timeZone} only={ids} />;
  if (kind === 'league-list') {
    const days = listDays(data, tvOnly)
      .map((d) => ({ date: d.date, games: d.games.filter((g) => ids.has(g.gameId)) }))
      .filter((d) => d.games.length);
    return (
      <section className="ck-league-list" aria-label="Selected games">
        <div className="ck-llist">
          {days.map((d) => (
            <ListDaySection key={d.date} day={d} data={data} compact={false} fatigueSlots={size.width >= FATIGUE_SLOTS_MIN_WIDTH} now={now} timeZone={timeZone} />
          ))}
        </div>
      </section>
    );
  }
  const games = data.games.filter((g) => ids.has(g.gameId) && (!tvOnly || hasNationalTv(g)));
  return kind === 'team-calendar' ? <TeamDays {...p} games={games} /> : <WeekDays {...p} games={games} />;
}

/** Team Calendar: each day with selected games as its cell (same card), header instead of the day number. */
function TeamDays({ data, teamId, now, timeZone, games, cellWidth, teamScale = 1 }: SelectionCaptureProps & { games: ScheduleGame[] }) {
  const b2b = useTeamB2B(data, teamId);
  const tif = teamThreeInFour(data, teamId);
  return (
    <div className="ck-team-grid ck-sel-days" style={{ '--ck-team-scale': teamScale } as CSSProperties}>
      {byDay(games).map(([date, gs]) => (
        <div key={date} className="ck-cell ck-day-cell ck-sel-day" data-date={date} style={{ width: cellWidth }}>
          <span className="ck-sel-dayhead">{dayHead(date, gs.length)}</span>
          {gs.map((g) => (
            <GameCard key={g.gameId} game={g} teamId={teamId} b2b={b2b.byGame.get(g.gameId)} tif={tif.get(g.gameId)} shortTif tvPill opponentB2B={opponentSecondNight(data, g, teamId)} now={now} timeZone={timeZone} teamFirst logos scores size="compact" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** League week view: each day with selected games as its cell (same lines, time groups), at the on-screen size. */
function WeekDays({ data, timeZone, games, cellWidth, weekStyle, weeks }: SelectionCaptureProps & { games: ScheduleGame[] }) {
  const ref = useRef<HTMLElement>(null);
  // the live view's line variables (set before the capture waits its two frames)
  useLayoutEffect(() => {
    if (ref.current && weekStyle) ref.current.style.cssText = weekStyle;
  }, [weekStyle]);
  return (
    <section ref={ref} className="ck-week-view ck-sel-days" aria-label="Selected games">
      {byDay(games).map(([date, gs]) => (
        <div key={date} className="ck-cell ck-month-cell ck-sel-day" data-date={date} style={{ width: cellWidth }}>
          <span className="ck-sel-dayhead">{dayHead(date, gs.length)}</span>
          <div className="ck-month-day" style={{ gridTemplateColumns: 'var(--ck-line)' }}>
            <div className="ck-mcol">
              {timeGroups(gs, timeZone).map((grp) => (
                <div key={grp.label} className="ck-tgroup">
                  <div className="ck-tlabel">{grp.label}</div>
                  <ul className="ck-tgames">
                    {grp.games.map((g) => (
                      <MonthGameLine key={g.gameId} data={data} game={g} fxRow={weeks === 1} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
