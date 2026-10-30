// League → Slate (round 7): one day of games as cards, two columns, like a search engine's "today" grid — built to be
// copied as an image and pasted onto the gauntlet whiteboard. The day changes only with ← / → (top bar or keyboard,
// CalendarView); the cards scroll inside the view when they don't fit. Each card: both teams (logo, full name, record
// going in, Fatigue component), "@" before the home team, the tip-off time or the final score (OT), the Cup / play-off
// labels and the national TV names — the League List row's facts, laid out as a card.

import { memo, type CSSProperties } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { finalScore, leagueRecords, markers, nationalTv, overtime, teamLabel, tipoff, type CalendarData, type TeamRecord } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { Fatigue } from './Fatigue';
import { MatchLink, TeamLogo, TipTime, type GameLink } from './GameCard';
import { listDays } from './LeagueListView';
import { slateImageSize, SLATE_COPY_GAP } from './slate';
import { LIST_MAX_WIDTH } from './widget';

export interface SlateViewProps {
  data: CalendarData;
  /** The day shown (ET game date); a day without games shows "No games". */
  date: string;
  tvOnly: boolean;
  timeZone?: string;
  gameLink?: GameLink;
}

/** The day's games (TV games only when filtered), in tip-off order. */
export const slateGames = (data: CalendarData, date: string, tvOnly: boolean) => listDays(data, tvOnly).find((d) => d.date === date)?.games ?? [];

/** Slate on desktop only: from the lists' column width (960 px; the grid is that wide), so not on tablets or phones. */
export const SLATE_MIN_WIDTH = LIST_MAX_WIDTH;

export function SlateView({ data, date, tvOnly, timeZone, gameLink }: SlateViewProps) {
  const games = slateGames(data, date, tvOnly);
  return (
    <section className="ck-slate" aria-label="Games of the day" data-day={date}>
      <div className="ck-slate-scroll" data-testid="slate" data-select-scroller>
        {games.length === 0 && <p className="ck-empty">No games.</p>}
        <div className="ck-slate-grid">
          {games.map((g) => (
            <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} gameLink={gameLink} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The copied image (and a selection's): the cards in `cols` columns, SLATE_COPY_GAP apart and half of it around them,
 * on nothing — only the cards are opaque. `cardWidth`: the on-screen card width, so cards wrap their text as on screen.
 */
export function SlateCopy({ data, games, cols, cardWidth, timeZone }: { data: CalendarData; games: ScheduleGame[]; cols: number; cardWidth: number; timeZone?: string }) {
  return (
    <div className="ck-slate-copy" style={{ width: slateImageSize(games.length, cols, { width: cardWidth, height: 0 }).width, '--ck-slate-cols': cols, '--ck-slate-card': `${cardWidth}px`, '--ck-slate-gap': `${SLATE_COPY_GAP}px` } as CSSProperties}>
      {games.map((g) => (
        <SlateCard key={g.gameId} data={data} game={g} timeZone={timeZone} />
      ))}
    </div>
  );
}

/** One game as a card. */
export const SlateCard = memo(function SlateCard({ data, game, timeZone, gameLink }: { data: CalendarData; game: ScheduleGame; timeZone?: string; gameLink?: GameLink }) {
  const fx = leagueFatigue(data).get(game.gameId);
  const rec = leagueRecords(data).get(game.gameId);
  const result = finalScore(game, game.awayTeam.teamId);
  const ot = result && overtime(game);
  const tip = tipoff(game, timeZone);
  const tv = nationalTv(game);
  const marks = markers(game);
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  const label = `${away} at ${home}, ${tip.label}${result ? `, final ${away} ${result.score}, ${home} ${result.oppScore}${ot ? ` (${ot})` : ''}` : ''}`;
  return (
    <article className={`ck-slate-card${result ? ' ck-slate-final' : ''}`} data-game-id={game.gameId} aria-label={label}>
      {/* the head: tip-off time (or "Final OT") on the left, the Cup / play-off labels and the TV names on the right */}
      <div className="ck-slate-head">
        {result ? (
          <span className="ck-slate-status" data-testid="slate-status">
            Final{ot && <span className="ck-ot"> {ot}</span>}
          </span>
        ) : (
          <span className={`ck-slate-status ck-slate-time${tip.tbd ? ' ck-tbd' : ''}`} data-testid="tipoff">
            <TipTime tip={tip} />
          </span>
        )}
        <span className="ck-slate-tags">
          {marks.map((m) => (
            <span key={m.kind + m.short} className={`ck-tag ck-${m.kind}`} title={m.long}>
              {m.long}
            </span>
          ))}
          {game.ifNecessary === 'true' && <span className="ck-tag">if nec.</span>}
          {tv.length > 0 && (
            <span className="ck-tag ck-tv" title="US national TV" data-testid="tv-badge">
              {tv.join(' · ')}
            </span>
          )}
        </span>
      </div>
      <MatchLink game={game} gameLink={gameLink} className="ck-slate-teams">
        <TeamRow team={game.awayTeam} f={fx?.get(game.awayTeam.teamId)} rec={rec?.get(game.awayTeam.teamId)} score={result && { n: result.score, win: result.win }} />
        <TeamRow team={game.homeTeam} f={fx?.get(game.homeTeam.teamId)} rec={rec?.get(game.homeTeam.teamId)} score={result && { n: result.oppScore, win: !result.win }} home />
      </MatchLink>
    </article>
  );
});

/** "[@] [logo] Wizards 3-1 [fatigue] 113": one team; the home team's row starts with the "@" (the away row keeps its room). */
function TeamRow({ team, f, rec, score, home = false }: { team: ScheduleGame['homeTeam']; f?: TeamFatigue; rec?: TeamRecord; score?: { n: number; win: boolean }; home?: boolean }) {
  const t = TEAM_BY_ID.get(team.teamId);
  const loss = score && !score.win ? ' ck-loss' : '';
  return (
    <span className={`ck-slate-row${loss}`} data-side={home ? 'home' : 'away'}>
      <span className="ck-slate-at" aria-hidden={!home}>
        {home ? '@' : ''}
      </span>
      <TeamLogo team={team} />
      <span className="ck-slate-name" data-tricode={teamLabel(team)}>
        {t?.name ?? teamLabel(team)}
      </span>
      <span className="ck-slate-rec">{rec ? `${rec.wins}-${rec.losses}` : ''}</span>
      <Fatigue f={f} team={teamLabel(team)} />
      <span className={`ck-slate-score${score?.win ? ' ck-score-win' : ''}`}>{score?.n ?? ''}</span>
    </span>
  );
}
