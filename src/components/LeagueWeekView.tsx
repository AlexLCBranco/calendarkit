// League → Calendar on desktop: 7 day columns, 1 or 2 week rows, every game of each day as a line.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { addDays, finalScore, hasNationalTv, nationalTv, overtime, teamLabel, type CalendarData } from '../data/model';
import { CopyButton } from './CopyButton';
import { busiestDayHeight, flowDay, MONTH_LINE, TWO_WEEK_SPACING, scoreFontFor, lineWidth, MONTH_COL_GAP, monthCellInner, monthColumns, ROOMY_WIDTH, scaleLine, timeGroups, weekScale } from './dayflow';
import { hasFatigue, leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { Fatigue } from './Fatigue';
import { FATIGUE_LEGEND_H, FatigueLegend, FatigueMark } from './FatigueMark';
import { MatchLink, TeamLogo, type GameLink } from './GameCard';
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
  /** The "↗" on each game line: raised with its id; the host opens the game's page. */
  gameLink?: GameLink;
}

/** A team's tricode (fatigue marks on it; winner bold, loser muted once final). */
function MonthTri({ team, fatigue, score, plane }: { team: ScheduleGame['homeTeam']; fatigue?: TeamFatigue; score?: { n: number; win: boolean }; plane: boolean }) {
  const label = teamLabel(team);
  return (
    <span className={`ck-mtri${score ? (score.win ? ' ck-win' : ' ck-loss') : ''}`} data-tricode={label}>
      <FatigueMark f={fatigue} className="ck-mtri-text" plane={plane}>
        {label}
      </FatigueMark>
    </span>
  );
}

/** A score in its own slot (empty before the game, so the "@" stays put). */
const MonthScore = ({ score }: { score?: { n: number; win: boolean } }) => <span className={`ck-mscore${score?.win ? ' ck-score-win' : ''}`}>{score?.n}</span>;

/** `fxRow` (1-week mode): a second row with each team's compact Fatigue component under its side, when either has any. */
export function MonthGameLine({ data, game, gameLink, fxRow = false }: { data: CalendarData; game: ScheduleGame; gameLink?: GameLink; fxRow?: boolean }) {
  const tv = nationalTv(game);
  const fat = leagueFatigue(data).get(game.gameId); // once per data set
  // final: the scores fill their slots and the TV pill is dropped (its column stays: OT goes there)
  const fin = game.status === 'final' ? finalScore(game, game.awayTeam.teamId) : undefined;
  // overtime: in the final line's empty TV slot, so the line keeps its width
  const ot = fin && overtime(game);
  const away = fat?.get(game.awayTeam.teamId);
  const home = fat?.get(game.homeTeam.teamId);
  const fx = fxRow && (hasFatigue(away) || hasFatigue(home));
  return (
    <li
      className={`ck-month-game${fin ? ' ck-month-final' : ''}${fx ? ' ck-month-fx' : ''}`}
      data-game-id={game.gameId}
      aria-label={`${teamLabel(game.awayTeam)} at ${teamLabel(game.homeTeam)}${fin ? `, final ${fin.score}–${fin.oppScore}${ot ? ` (${ot})` : ''}` : tv.length ? `, national TV: ${tv.join(', ')}` : ''}`}
    >
      {/* logos, tricodes, scores and "@": the link to the game page (a subgrid on the line's columns, round 5) */}
      <MatchLink game={game} gameLink={gameLink} className="ck-mline">
        <TeamLogo team={game.awayTeam} />
        <MonthTri team={game.awayTeam} fatigue={away} plane={!fxRow} score={fin && { n: fin.score, win: fin.win }} />
        <MonthScore score={fin && { n: fin.score, win: fin.win }} />
        <span className="ck-at">@</span>
        <MonthScore score={fin && { n: fin.oppScore, win: !fin.win }} />
        <MonthTri team={game.homeTeam} fatigue={home} plane={!fxRow} score={fin && { n: fin.oppScore, win: !fin.win }} />
        <TeamLogo team={game.homeTeam} />
      </MatchLink>
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
      {fx && (
        <span className="ck-mfx">
          <Fatigue f={away} team={teamLabel(game.awayTeam)} size="compact" />
          <Fatigue f={home} team={teamLabel(game.homeTeam)} size="compact" badge="right" />
        </span>
      )}
    </li>
  );
}

/**
 * League → Calendar: 7 equal day columns, one or two week rows, every game of each day at full line size
 * (logos + tricodes, "AWAY @ HOME"; TV pill; fatigue marks on the tricodes), grouped by local tip-off time. 1 week: one column
 * of games per day; 2 weeks: the day flows into as many columns as fit (see flowDay). Rows are equal and fill the
 * height they're given. A day header opens that day in the list.
 */
export function LeagueWeekView({ data, start, weeks, tvOnly, size, today, timeZone, onSelectDate, gameLink }: LeagueWeekViewProps) {
  const cols = weeks === 1 ? 1 : monthColumns(size.width);
  // 1 week: lines scaled to the day cell (see weekScale). The cell's width is pure maths; its height is the widget
  // height below the grid's top (measured; it doesn't depend on the scale, so no feedback loop).
  const fxGame = useMemo(() => {
    const fat = leagueFatigue(data);
    return (g: ScheduleGame) => [...(fat.get(g.gameId)?.values() ?? [])].some(hasFatigue);
  }, [data]);
  const busiest = useMemo(() => busiestDayHeight(data.byDate, timeZone, weeks === 1 ? fxGame : undefined), [data, timeZone, weeks, fxGame]);
  const grid = useRef<HTMLDivElement>(null);
  const [gridTop, setGridTop] = useState(0);
  useLayoutEffect(() => {
    const el = grid.current;
    const root = el?.closest('.ck-root') ?? el?.parentElement;
    if (el && root) setGridTop(el.getBoundingClientRect().top - root.getBoundingClientRect().top);
  }, [size.width, size.height]);
  const pad = size.width < ROOMY_WIDTH ? 2 : 4;
  const scale = weeks === 1 ? weekScale(monthCellInner(size.width), size.height - gridTop - FATIGUE_LEGEND_H - 2 * pad - 2, busiest) : 1;
  const L = weeks === 1 ? scaleLine(scale) : { ...MONTH_LINE, ...TWO_WEEK_SPACING };
  const vars = {
    '--ck-logo': `${L.logo}px`,
    '--ck-gap': `${L.gap}px`,
    '--ck-sgap': `${L.sgap}px`,
    '--ck-score': `${L.score}px`,
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
    '--ck-label-line': String(L.labelLine),
    '--ck-dot': `${L.dot}px`,
    '--ck-score-font': `${scoreFontFor(L.score)}px`, // not L.scoreFont: see scoreFontFor
    '--ck-col-gap': `${MONTH_COL_GAP}px`,
    '--ck-line': `${lineWidth(L)}px`,
    '--ck-fx-row': `${L.fxRow}px`,
    '--ck-fx-gap': `${L.fxGap}px`,
    '--ck-fx-font': `${L.fxFont}px`,
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
                  {flowDay(timeGroups(games, timeZone), cols, L).map((col, ci) => (
                    <div key={ci} className="ck-mcol">
                      {col.map((grp) => (
                        <div key={grp.label} className="ck-tgroup">
                          <div className="ck-tlabel" data-repeat={grp.repeat || undefined}>
                            {grp.label}
                          </div>
                          <ul className="ck-tgames">
                            {grp.games.map((g) => (
                              <MonthGameLine key={g.gameId} data={data} game={g} gameLink={gameLink} fxRow={weeks === 1} />
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
      <FatigueLegend component={weeks === 1} />
    </section>
  );
}
