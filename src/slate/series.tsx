// Round 14 (item 5): the season-series chip ("G2/4": this is the 2nd of 4 regular-season meetings) and its popup — one
// square per meeting in order (played: winner, score, date; to come: muted, date only; this game outlined), the series'
// state on top ("DET leads 1–0"). A square's click raises `onPick(game)` (calendarkit: that day in the League List, the
// game highlighted); its "↗" is the game's hoopsjunkie page (the Slate cards' link rule), in a new tab.
// One popup per widget, like the tooltip: `useSeriesPopup()` gives handlers for the wrapper and the node to render. It
// stays open while the pointer is on the chip or on the popup, so its squares can be clicked; Escape closes it. It
// starts no timer at rest (only the short close delay after the pointer leaves).

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { dateFormat, finalScore, overtime, type CalendarData } from '../data/model';
import { leagueSeries, seriesChip, seriesStatus, type SeriesGame } from '../data/series';
import { TEAM_BY_ID } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { GameLink } from './links';
import { clampX } from './tooltip';

const CLOSE_MS = 180;
const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => dateFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? '?';

/** The chip for a game (leagueSeries(data).get(gameId)), or nothing when it isn't in a series. */
export function SeriesChip({ s, gameId }: { s?: SeriesGame; gameId: string }) {
  if (!s) return null;
  return (
    <span className="ck-series" data-series-game={gameId} data-testid="series-chip" tabIndex={0} aria-label={`Meeting ${s.n} of ${s.series.games.length} this season. ${seriesStatus(s.series, tri)}`}>
      {seriesChip(s)}
    </span>
  );
}

/** Plain text of a game's series, for tooltips in views too tight for the chip ("Season series: G2/4 · DET leads 1–0"). */
export const seriesLine = (data: CalendarData, game: ScheduleGame) => {
  const s = leagueSeries(data).get(game.gameId);
  return s ? `Season series: ${seriesChip(s)} · ${seriesStatus(s.series, tri)}` : undefined;
};

function Square({ g, current, onPick, gameLink }: { g: ScheduleGame; current: boolean; onPick?: (g: ScheduleGame) => void; gameLink?: GameLink }) {
  const r = finalScore(g, g.awayTeam.teamId);
  const ot = r && overtime(g);
  const url = gameLink?.(g);
  const date = fmtDate(g.dateEt, { month: 'short', day: 'numeric' });
  const where = `${tri(g.awayTeam.teamId)} @ ${tri(g.homeTeam.teamId)}`;
  const label = r ? `${date}, ${where}: ${r.win ? tri(g.awayTeam.teamId) : tri(g.homeTeam.teamId)} won ${Math.max(r.score, r.oppScore)}–${Math.min(r.score, r.oppScore)}${ot ? ` (${ot})` : ''}` : `${date}, ${where}: to come`;
  return (
    <div className={`ck-series-sq${r ? ' ck-series-played' : ' ck-series-next'}${current ? ' ck-series-current' : ''}`} data-game-id={g.gameId} data-testid="series-square">
      <button type="button" className="ck-series-pick" onClick={onPick && (() => onPick(g))} disabled={!onPick} aria-label={onPick ? `${label}. Show this day` : label}>
        {r && <span className="ck-series-win">{r.win ? tri(g.awayTeam.teamId) : tri(g.homeTeam.teamId)}</span>}
        {r && (
          <span className="ck-series-score">
            {Math.max(r.score, r.oppScore)}–{Math.min(r.score, r.oppScore)}
            {ot ? ` ${ot}` : ''}
          </span>
        )}
        <span className="ck-series-date">{date}</span>
      </button>
      {url && (
        <a className="ck-series-link" href={url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie" aria-label={`${where} ${date} on hoopsjunkie`} data-testid="series-link">
          ↗
        </a>
      )}
    </div>
  );
}

function Popup({ s, current, onPick, gameLink }: { s: SeriesGame; current: string; onPick?: (g: ScheduleGame) => void; gameLink?: GameLink }) {
  const [a, b] = s.series.teams;
  return (
    <>
      <div className="ck-series-head">
        <span className="ck-series-title">
          {tri(a)} – {tri(b)} · {s.series.games.length} meeting{s.series.games.length === 1 ? '' : 's'}
        </span>
        <span className="ck-series-status" data-testid="series-status">
          {seriesStatus(s.series, tri)}
        </span>
      </div>
      <div className="ck-series-row">
        {s.series.games.map((g) => (
          <Square key={g.gameId} g={g} current={g.gameId === current} onPick={onPick} gameLink={gameLink} />
        ))}
      </div>
    </>
  );
}

/** The widget's one series popup: spread `handlers` on the wrapper, render `node` inside it. */
export function useSeriesPopup(data: CalendarData | undefined, opts: { onPick?: (g: ScheduleGame) => void; gameLink?: GameLink } = {}) {
  const [open, setOpen] = useState<{ gameId: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const keep = () => clearTimeout(closer.current);
  const later = () => {
    keep();
    closer.current = setTimeout(() => setOpen(undefined), CLOSE_MS);
  };
  const over = (e: SyntheticEvent) => {
    const t = e.target as Element;
    if (ref.current?.contains(t)) return keep();
    const chip = t.closest?.('[data-series-game]');
    if (!chip) return open && later();
    keep();
    const r = chip.getBoundingClientRect();
    const gameId = chip.getAttribute('data-series-game')!;
    setOpen((o) => (o && o.gameId === gameId && o.top === r.top && o.x === r.left + r.width / 2 ? o : { gameId, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    el.style.left = `${clampX(open.x - el.offsetWidth / 2, el.offsetWidth)}px`;
    const below = open.bottom + 6;
    el.style.top = `${below + el.offsetHeight <= window.innerHeight - 4 ? below : Math.max(4, open.top - el.offsetHeight - 6)}px`;
  });
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(undefined);
    window.addEventListener('keydown', esc);
    return () => (window.removeEventListener('keydown', esc), keep());
  }, [open]);
  const s = open && data ? leagueSeries(data).get(open.gameId) : undefined;
  const pick = opts.onPick && ((g: ScheduleGame) => (setOpen(undefined), opts.onPick!(g)));
  return {
    handlers: {
      onMouseOver: over,
      onFocus: (e: SyntheticEvent) => ((e.target as Element).closest?.('[data-series-game]') || ref.current?.contains(e.target as Node) ? over(e) : undefined),
      onMouseLeave: () => open && later(),
    },
    node: s && (
      <div ref={ref} className="ck-series-pop" role="dialog" aria-label="Season series" data-testid="series-popup" data-capture-exclude="true" onMouseEnter={keep} onMouseLeave={later}>
        <Popup s={s} current={open!.gameId} onPick={pick} gameLink={opts.gameLink} />
      </div>
    ),
  };
}
