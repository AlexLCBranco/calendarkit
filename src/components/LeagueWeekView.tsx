// League → Calendar on desktop: 7 day columns, 1 or 2 week rows, every game of each day as a line.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { addDays, finalScore, hasNationalTv, isBackToBack, nationalTv, overtime, teamLabel, type CalendarData } from '../data/model';
import { CopyButton } from './CopyButton';
import { busiestDayHeight, flowDay, scoreFontFor, lineWidth, MONTH_COL_GAP, monthCellInner, monthColumns, ROOMY_WIDTH, scaleLine, timeGroups, weekScale } from './dayflow';
import { B2BDot, TeamLogo } from './GameCard';
import { fmtDate, plural, type WidgetSize } from './widget';

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

/** One side of a game line: logo (or, once the game is final, its score in the logo's slot) + tricode. */
function MonthTeam({ team, b2b, score }: { team: ScheduleGame['homeTeam']; b2b: boolean; score?: { n: number; win: boolean } }) {
  const label = teamLabel(team);
  return (
    <>
      {score ? <span className={`ck-mscore${score.win ? ' ck-score-win' : ''}`}>{score.n}</span> : <TeamLogo team={team} />}
      <span className={`ck-mtri${score ? (score.win ? ' ck-win' : ' ck-loss') : ''}`} data-tricode={label}>
        <span className="ck-mtri-text">
          {label}
          {b2b && <B2BDot tip="Back-to-back" />}
        </span>
      </span>
    </>
  );
}

export function MonthGameLine({ data, game }: { data: CalendarData; game: ScheduleGame }) {
  const tv = nationalTv(game);
  const b2b = (id: number) => isBackToBack(data, id, game.dateEt);
  // final: the scores take the logos' slots and the TV pill is dropped (its column stays, so the "@" stays put)
  const fin = game.status === 'final' ? finalScore(game, game.awayTeam.teamId) : undefined;
  // overtime: in the final line's empty TV slot, so the line keeps its width
  const ot = fin && overtime(game);
  return (
    <li
      className={`ck-month-game${fin ? ' ck-month-final' : ''}`}
      data-game-id={game.gameId}
      aria-label={`${teamLabel(game.awayTeam)} at ${teamLabel(game.homeTeam)}${fin ? `, final ${fin.score}–${fin.oppScore}${ot ? ` (${ot})` : ''}` : tv.length ? `, national TV: ${tv.join(', ')}` : ''}`}
    >
      <MonthTeam team={game.awayTeam} b2b={b2b(game.awayTeam.teamId)} score={fin && { n: fin.score, win: fin.win }} />
      <span className="ck-at">@</span>
      <MonthTeam team={game.homeTeam} b2b={b2b(game.homeTeam.teamId)} score={fin && { n: fin.oppScore, win: !fin.win }} />
      <span className="ck-tv-slot">
        {ot && (
          <span className="ck-ot" title="Overtime">
            {ot}
          </span>
        )}
        {!fin && tv.length > 0 && (
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
    '--ck-score-font': `${scoreFontFor(L.logo)}px`, // not L.scoreFont: see scoreFontFor
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
