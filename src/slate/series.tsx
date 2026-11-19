// The season-series chip ("G2/4": this is the 2nd of 4 regular-season meetings) and its popup — one
// square per meeting in order (played: winner, score, date; to come: muted, date only; this game outlined), the series'
// state on top ("DET leads 1–0"). A square's click raises `onPick(game)` (calendarkit: that day in the League List, the
// game highlighted); its "↗" is the game's hoopsjunkie page (the Slate cards' link rule), in a new tab.
// One popup per widget, like the tooltip: `useSeriesPopup()` gives handlers for the wrapper and the node to render. It
// stays open while the pointer is on the chip or on the popup, so its squares can be clicked; Escape closes it. It
// starts no timer at rest (only the short close delay after the pointer leaves).

import { dateFormat, finalScore, overtime, type CalendarData } from '../data/model';
import { leagueRematches, leagueSeries, rematchesShown, seriesChip, seriesStatus, type Rematch, type SeriesGame } from '../data/series';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { GameLink } from './links';
import { useHoverPopup } from './hoverPopup';
import { TeamLink } from './teamLink';

const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => dateFormat('en-US', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? '?';

const dayShort = (date: string) => fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' });

/** "BOS: back-to-back meeting, also played Tue, Nov 18" (and / or "plays again Fri, Nov 21"). */
export const rematchLine = (r: Rematch) =>
  `${tri(r.teamId)}: back-to-back meeting, ${[r.prev && `also played ${dayShort(r.prev.dateEt)}`, r.next && `plays again ${dayShort(r.next.dateEt)}`].filter(Boolean).join(', ')}`;

/**
 * The chip for a game (leagueSeries(data).get(gameId)), or nothing when it isn't in a series. `rematch`: the game's
 * back-to-back meetings (leagueRematches); the chip is marked (its look only, never its size) when a team counted has
 * one — `focus`: a team's own views, where only that team counts.
 */
export function SeriesChip({ s, gameId, rematch, focus }: { s?: SeriesGame; gameId: string; rematch?: Rematch[]; focus?: number }) {
  if (!s) return null;
  const marked = rematchesShown(rematch, focus);
  return (
    <span className={`ck-series${marked.length ? ' ck-series-rematch' : ''}`} data-series-game={gameId} data-testid="series-chip" data-rematch={marked.length ? marked.map((r) => tri(r.teamId)).join(' ') : undefined} tabIndex={0} aria-label={`Meeting ${s.n} of ${s.series.games.length} this season. ${seriesStatus(s.series, tri)}${marked.map((r) => `. ${rematchLine(r)}`).join('')}`}>
      {seriesChip(s)}
    </span>
  );
}

/** Plain text of a game's series, for tooltips in views too tight for the chip ("Season series: G2/4 · DET leads 1–0"). */
export const seriesLine = (data: CalendarData, game: ScheduleGame) => {
  const s = leagueSeries(data).get(game.gameId);
  return s ? `Season series: ${seriesChip(s)} · ${seriesStatus(s.series, tri)}` : undefined;
};

/**
 * One meeting of the season series. The whole
 * square is the game's hoopsjunkie page (a new tab); it was a button that showed that day in the League List, with a
 * small "↗" beside it for the page. Without a URL (undecided teams, no host link) it is plain, not clickable-looking.
 */
function Square({ g, current, gameLink }: { g: ScheduleGame; current: boolean; gameLink?: GameLink }) {
  const r = finalScore(g, g.awayTeam.teamId);
  const ot = r && overtime(g);
  const url = gameLink?.(g);
  const date = fmtDate(g.dateEt, { month: 'short', day: 'numeric' });
  const where = `${tri(g.awayTeam.teamId)} @ ${tri(g.homeTeam.teamId)}`;
  const label = r ? `${date}, ${where}: ${r.win ? tri(g.awayTeam.teamId) : tri(g.homeTeam.teamId)} won ${Math.max(r.score, r.oppScore)}–${Math.min(r.score, r.oppScore)}${ot ? ` (${ot})` : ''}` : `${date}, ${where}: to come`;
  const logo = teamLogo(g.homeTeam.teamId);
  // where it is played, as the day strips say it: the home team's logo, "BOS @ DEN"
  const body = (
    <>
      <span className="ck-series-match" data-testid="series-match">
        {logo && (
          <span className="ck-sq-logo">
            <img src={logo} alt="" width={16} height={16} />
          </span>
        )}
        {where}
      </span>
      {r && <span className="ck-series-win">{r.win ? tri(g.awayTeam.teamId) : tri(g.homeTeam.teamId)}</span>}
      {r && (
        <span className="ck-series-score">
          {Math.max(r.score, r.oppScore)}–{Math.min(r.score, r.oppScore)}
          {ot ? ` ${ot}` : ''}
        </span>
      )}
      <span className="ck-series-date">{date}</span>
    </>
  );
  return (
    <div className={`ck-series-sq${r ? ' ck-series-played' : ' ck-series-next'}${current ? ' ck-series-current' : ''}`} data-game-id={g.gameId} data-testid="series-square">
      {url ? (
        <a className="ck-series-pick" href={url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie" aria-label={`${label}. Open on hoopsjunkie`} data-testid="series-link">
          {body}
        </a>
      ) : (
        <span className="ck-series-pick ck-series-plain" aria-label={label}>
          {body}
        </span>
      )}
    </div>
  );
}

function Popup({ s, current, gameLink, rematch }: { s: SeriesGame; current: string; gameLink?: GameLink; rematch?: Rematch[] }) {
  const [a, b] = s.series.teams;
  return (
    <>
      <div className="ck-series-head">
        <span className="ck-series-title">
          <TeamLink teamId={a}>{tri(a)}</TeamLink> – <TeamLink teamId={b}>{tri(b)}</TeamLink> · {s.series.games.length} meeting{s.series.games.length === 1 ? '' : 's'}
        </span>
        <span className="ck-series-status" data-testid="series-status">
          {seriesStatus(s.series, tri)}
        </span>
      </div>
      {rematch?.map((r) => (
        <div key={r.teamId} className="ck-series-rematch-line" data-testid="rematch-line">
          {rematchLine(r)}
        </div>
      ))}
      <div className="ck-series-row">
        {s.series.games.map((g) => (
          <Square key={g.gameId} g={g} current={g.gameId === current} gameLink={gameLink} />
        ))}
      </div>
    </>
  );
}

/** The widget's one series popup: spread `handlers` on the wrapper, render `node` inside it (on useHoverPopup). */
export function useSeriesPopup(data: CalendarData | undefined, opts: { gameLink?: GameLink } = {}) {
  return useHoverPopup(
    'data-series-game',
    (gameId) => {
      const s = data ? leagueSeries(data).get(gameId) : undefined;
      return s ? <Popup s={s} current={gameId} gameLink={opts.gameLink} rematch={leagueRematches(data!).get(gameId)} /> : null;
    },
    { className: 'ck-series-pop', label: 'Season series', testId: 'series-popup' },
  );
}
