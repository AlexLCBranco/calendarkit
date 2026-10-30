// Team → Calendar: one team's month (or 1 or 2 weeks), a game per day cell, back-to-back bars; content scaled to the cell.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { addDays, hasNationalTv, isOver, monthCells, nationalTv, opponentSecondNight, seasonMonths, teamGames, type B2BPair, type CalendarData } from '../data/model';
import { teamThreeInFour, type ThreeInFour } from '../data/scheduleTags';
import { TEAM_BY_ID } from '../data/teams';
import { CopyButton } from './CopyButton';
import { GameCard, type GameLink } from './GameCard';
import { monthNav, PeriodNav } from './PeriodNav';
import { fmtDate, isCompact, useTeamB2B, WEEKDAYS, type WidgetSize } from './widget';

/** Smallest team calendar row (px) on desktop/tablet; the grid fills the window above that. */
export const TEAM_CELL_MIN_HEIGHT = 92;
/** Team calendar (desktop/tablet): largest content scale, and the share of a cell's free height it may use. */
export const TEAM_SCALE_MAX = 2;
/**
 * Smallest scale (desktop/tablet). Below 1 only where even 1 doesn't fit the fullest cell: 1280 × 900 since the 3-in-4
 * chip (a cell with B2B + chip + "Peacock" + "NBC Sports Network" took 3 tag rows of a 115 px 6-week cell). Round 4's
 * "3in4·2nd" chip and "TV" pill don't lift it: a played game's score line with wide tricodes ("MEM 188 vs 186 MEM" +
 * logos, ~170 px) is wider than the 163 px cell, so it takes 2 lines (worst cell 93 px at scale 1, room 72 px).
 */
export const TEAM_SCALE_MIN = 0.8;
/** Week views (1 or 2 week rows): bigger cells, so a larger cap; the probe still decides (see PROJECT.md). */
export const TEAM_WEEK_SCALE_MAX = 3;
export const TEAM_SCALE_FILL = 0.9;

/**
 * The fullest cell the season can have, for sizing the team calendar: a national TV game (one "TV" pill in cells since
 * round 4), as a Cup Final, on night 1 of a travelling back-to-back, with the opponent on its 2nd night.
 */
function probeCard(data: CalendarData): Parameters<typeof GameCard>[0] | undefined {
  const tvText = (g: ScheduleGame) => nationalTv(g).join(' · ').length;
  const g = data.games.reduce<ScheduleGame | undefined>((best, x) => (x.homeTeam.teamId && (!best || tvText(x) > tvText(best)) ? x : best), undefined);
  if (!g) return undefined;
  // final with 3-digit scores (tabular digits: any 3 are as wide) in triple overtime, so a cell with a score fits too
  const game: ScheduleGame = { ...g, gameId: 'ck-probe', gameType: 'cup-final', status: 'final', statusText: 'Final/3OT', homeTeam: { ...g.homeTeam, score: 188 }, awayTeam: { ...g.awayTeam, score: 186 } };
  const pair = { teamId: g.homeTeam.teamId, first: game, second: game, code: 'AA', fromCity: '', toCity: '', travels: true, tip: '' } as B2BPair;
  // and in the widest 3-in-4 chip of the season: "7in11 · 2nd" (round 7: cells show the merged chip)
  const tif: ThreeInFour = { position: 3, sets: [], merged: { ids: Array(7).fill(''), dates: Array(7).fill('2026-11-01'), days: 11, position: 2 } };
  return { game, teamId: g.homeTeam.teamId, b2b: [{ pair, night: 1 }], tif, opponentB2B: ' ', now: 0, timeZone: 'UTC', teamFirst: true, logos: true, scores: true, tvPill: true, size: 'compact' };
}

export interface TeamMonthGridProps {
  data: CalendarData;
  teamId: number;
  month: string;
  onMonthChange: (month: string) => void;
  size: WidgetSize;
  now: number;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  /** The "↗" on each game cell: raised with its id; the host opens the game's page. */
  gameLink?: GameLink;
  /** National TV games only. */
  tvOnly?: boolean;
  /** Own month header (default); off when the host shows the navigation (CalendarView's top bar). */
  nav?: boolean;
  /** Week views: show `weeks` week rows from `start` (a Sunday) instead of `month`. */
  weeks?: 1 | 2;
  start?: string;
}

type Bar = { kind: 'full' | 'start' | 'end'; i: number; pair: B2BPair };

export function TeamMonthGrid({ data, teamId, month, onMonthChange, size, now, timeZone, onOpenGame, gameLink, tvOnly = false, nav = true, weeks: weekRows, start }: TeamMonthGridProps) {
  const compact = isCompact(size);
  const byDate = useMemo(() => new Map(teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)).map((g) => [g.dateEt, g])), [data, teamId, tvOnly]);
  const b2b = useTeamB2B(data, teamId);
  const tif = teamThreeInFour(data, teamId);
  const [selected, setSelected] = useState<string | undefined>();
  const selectedGame = selected ? byDate.get(selected) : undefined;
  const weekView = !!weekRows && !!start;
  const cells = useMemo(() => (weekView ? Array.from({ length: 7 * weekRows }, (_, i) => addDays(start, i)) : monthCells(month)), [weekView, weekRows, start, month]);
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
  }, [cells, b2b, tvOnly]);

  const cardProps = (g: ScheduleGame) => ({
    game: g,
    teamId,
    b2b: b2b.byGame.get(g.gameId),
    tif: compact ? undefined : tif.get(g.gameId),
    opponentB2B: opponentSecondNight(data, g, teamId),
    now,
    timeZone,
  });
  const place = (i: number): CSSProperties => ({ gridRow: Math.floor(i / 7) + 2, gridColumn: (i % 7) + 1 });

  // Desktop/tablet: cell content scaled (CSS zoom) to use the cell. The scale is the largest (0.05 steps, from
  // TEAM_SCALE_MAX down to TEAM_SCALE_MIN) at which the fullest possible cell (probeCard) fits a cell of a 6-week month — the smallest
  // cells — so it doesn't change from month to month. Week views: the shown cells (all the same size), up to
  // TEAM_WEEK_SCALE_MAX. The probe is rendered only while measuring, before paint.
  const probe = useMemo(() => probeCard(data), [data]);
  const [scale, setScale] = useState({ key: '', s: 1 });
  const key = `${size.width}x${size.height}${weekView ? `w${weekRows}` : ''}`;
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
    const h6 = weekView ? c.height : Math.max(TEAM_CELL_MIN_HEIGHT, (weeks * (c.height + gap)) / 6 - gap);
    const num = cell.querySelector('.ck-daynum')!.getBoundingClientRect();
    const room = (h6 - (num.bottom - c.top) - px(cs.rowGap) - px(cs.paddingBottom) - px(cs.borderBottomWidth)) * TEAM_SCALE_FILL;
    card.parentElement!.style.width = `${c.width}px`;
    let s = weekView ? TEAM_WEEK_SCALE_MAX : TEAM_SCALE_MAX;
    for (; s > TEAM_SCALE_MIN; s = Math.round((s - 0.05) * 100) / 100) {
      card.style.zoom = String(s);
      if (card.getBoundingClientRect().height <= room && card.scrollWidth <= card.clientWidth) break;
    }
    setScale({ key, s: Math.max(TEAM_SCALE_MIN, s) });
  });
  const s = compact ? 1 : scale.s;

  return (
    <section className="ck-team-month" aria-label={`${TEAM_BY_ID.get(teamId)?.name ?? 'Team'} schedule`} data-span={weekView ? `${weekRows}w` : 'month'}>
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
              {/* week views can cross a month: the 1st says which */}
              <span className="ck-daynum">{weekView && date.endsWith('-01') ? fmtDate(date, { month: 'short', day: 'numeric' }) : Number(date.slice(8))}</span>
              {g && <GameCard {...cardProps(g)} teamFirst={!compact} logos={!compact} scores={!compact} shortB2B={compact} tvPill={!compact} size="compact" onOpenGame={compact ? undefined : onOpenGame} gameLink={compact ? undefined : gameLink} />}
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
