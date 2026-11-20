// The season-series chip ("G2/4": this is the 2nd of 4 regular-season meetings) and its popup — one
// square per meeting in order (played: winner, score, date; to come: muted, date only; this game outlined), the series'
// state on top ("DET leads 1–0"). A square's click raises `onPick(game)` (calendarkit: that day in the League List, the
// game highlighted); its "↗" is the game's hoopsjunkie page (the Slate cards' link rule), in a new tab.
// One popup per widget, like the tooltip: `useSeriesPopup()` gives handlers for the wrapper and the node to render. It
// stays open while the pointer is on the chip or on the popup, so its squares can be clicked; Escape closes it. It
// starts no timer at rest (only the short close delay after the pointer leaves).

import { dateFormat, finalScore, overtime, type CalendarData } from '../data/model';
import { leagueRematches, leagueSeries, rematchesShown, seriesChip, seriesStatus, type Rematch, type SeriesGame } from '../data/series';
import { TEAM_BY_ID, TEAMS, teamLogo } from '../data/teams';
import { useEffect, useState } from 'react';
import { loadPastSeasons, pastMeetings, pastStatus, PAST_SEASONS_BACK, seasonBefore, type PastGame, type PastSeasons } from '../data/pastSeries';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { GameLink } from './links';
import { useHoverPopup } from './hoverPopup';
import { TeamLink } from './teamLink';
import { useLive } from './live';

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
function Square({ g: snapshotGame, current, gameLink }: { g: ScheduleGame; current: boolean; gameLink?: GameLink }) {
  // live scores (CK-21): final once ESPN has it finished; LIVE and the score so far while it is being played
  const { game: g, live } = useLive(snapshotGame);
  const r = finalScore(g, g.awayTeam.teamId);
  const ot = r && overtime(g);
  const url = gameLink?.(g);
  const date = fmtDate(g.dateEt, { month: 'short', day: 'numeric' });
  const where = `${tri(g.awayTeam.teamId)} @ ${tri(g.homeTeam.teamId)}`;
  const label = r ? `${date}, ${where}: ${r.win ? tri(g.awayTeam.teamId) : tri(g.homeTeam.teamId)} won ${Math.max(r.score, r.oppScore)}–${Math.min(r.score, r.oppScore)}${ot ? ` (${ot})` : ''}` : live ? `${date}, ${where}: live ${live.away}–${live.home}` : `${date}, ${where}: to come`;
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
      {live && (
        <span className="ck-series-score ck-series-live" data-testid="series-live">
          <span className="ck-live-tag">LIVE</span> {live.away}–{live.home}
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

/** An earlier season's meeting (CK-17): "BOS @ DEN", the winner, the score, the date; no link (ESPN's data has no NBA game id). */
function PastSquare({ g }: { g: PastGame }) {
  const [date, away, home, as, hs, ot] = g;
  const homeId = TEAMS.find((t) => t.tricode === home)?.id;
  const logo = homeId ? teamLogo(homeId) : undefined;
  const day = fmtDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="ck-series-sq ck-series-played ck-series-past" data-testid="series-square" data-date={date}>
      <span className="ck-series-pick ck-series-plain" aria-label={`${day}, ${away} @ ${home}: ${as > hs ? away : home} won ${Math.max(as, hs)}–${Math.min(as, hs)}${ot ? ` (${ot})` : ''}`}>
        <span className="ck-series-match" data-testid="series-match">
          {logo && (
            <span className="ck-sq-logo">
              <img src={logo} alt="" width={16} height={16} />
            </span>
          )}
          {away} @ {home}
        </span>
        <span className="ck-series-win">{as > hs ? away : home}</span>
        <span className="ck-series-score">
          {Math.max(as, hs)}–{Math.min(as, hs)}
          {ot ? ` ${ot}` : ''}
        </span>
        <span className="ck-series-date">{day}</span>
      </span>
    </div>
  );
}

function Popup({ s, current, gameLink, rematch, season }: { s: SeriesGame; current: string; gameLink?: GameLink; rematch?: Rematch[]; /** This season ("2026-27") */ season: string }) {
  const [a, b] = s.series.teams;
  // ◀ season ▶: 0 = this season, up to PAST_SEASONS_BACK back (loaded on the first switch)
  const [back, setBack] = useState(0);
  const [past, setPast] = useState<PastSeasons | 'failed'>();
  useEffect(() => {
    if (back > 0 && !past) loadPastSeasons().then(setPast, () => setPast('failed'));
  }, [back, past]);
  const shown = back ? seasonBefore(season, back) : season;
  const old = back && past && past !== 'failed' ? pastMeetings(past, shown, tri(a), tri(b)) : undefined;
  const count = back ? old?.length : s.series.games.length;
  return (
    <>
      <div className="ck-series-head">
        <span className="ck-series-title">
          <TeamLink teamId={a}>{tri(a)}</TeamLink> – <TeamLink teamId={b}>{tri(b)}</TeamLink>
          <span data-testid="series-count">{count === undefined ? '' : ` · ${count} meeting${count === 1 ? '' : 's'}`}</span>
        </span>
        <span className="ck-series-seasons" role="group" aria-label="Season">
          <button type="button" className="ck-series-season-step" disabled={back >= PAST_SEASONS_BACK} onClick={() => setBack(back + 1)} aria-label="Earlier season" data-testid="series-prev-season">
            ◀
          </button>
          <span className="ck-series-season" data-testid="series-season">
            {shown}
          </span>
          <button type="button" className="ck-series-season-step" disabled={back === 0} onClick={() => setBack(back - 1)} aria-label="Later season" data-testid="series-next-season">
            ▶
          </button>
        </span>
        <span className="ck-series-status" data-testid="series-status">
          {!back ? seriesStatus(s.series, tri) : old ? pastStatus(old, tri(a), tri(b)) : past === 'failed' ? 'Not available' : 'Loading…'}
        </span>
      </div>
      {!back &&
        rematch?.map((r) => (
          <div key={r.teamId} className="ck-series-rematch-line" data-testid="rematch-line">
            {rematchLine(r)}
          </div>
        ))}
      <div className="ck-series-row">
        {!back
          ? s.series.games.map((g) => <Square key={g.gameId} g={g} current={g.gameId === current} gameLink={gameLink} />)
          : old?.map((g) => <PastSquare key={g[0] + g[1]} g={g} />)}
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
      return s ? <Popup key={gameId} s={s} current={gameId} gameLink={opts.gameLink} rematch={leagueRematches(data!).get(gameId)} season={data!.seasonYear} /> : null;
    },
    { className: 'ck-series-pop', label: 'Season series', testId: 'series-popup' },
  );
}
