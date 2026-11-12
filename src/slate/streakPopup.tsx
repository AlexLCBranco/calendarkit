// Hovering a streak ("W6", "L2") opens a popup of the streak's games, newest first: date, "vs" / "@"
// + the opponent (logo, tricode: a team link), the result, final score and margin ("W 118–104, +14"), OT when it went
// there. Each game is its hoopsjunkie page (new tab). Built on the series popup's behaviour (useHoverPopup): it stays
// open while the pointer is in it, never in a copy, and needs no request — the games come from the schedule loaded.
// A streak element carries data-streak="<teamId>|<gameId of the line (through it once final), or empty for the current streak>".

import { dateFormat, type CalendarData } from '../data/model';
import { streakGames } from '../data/streak';
import { TEAM_BY_ID } from '../data/teams';
import type { GameLink } from './links';
import { useHoverPopup } from './hoverPopup';
import { TeamLogo } from './parts';
import { TeamLink } from './teamLink';

const fmtDay = (date: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));

/** The attribute value for a streak element. */
export const streakAttr = (teamId: number, gameId?: string) => `${teamId}|${gameId ?? ''}`;

export function StreakList({ data, teamId, gameId, gameLink }: { data: CalendarData; teamId: number; gameId?: string; gameLink?: GameLink }) {
  const games = streakGames(data, teamId, gameId);
  if (!games.length) return null;
  const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
  const kind = games[0]!.win ? 'W' : 'L';
  return (
    <>
      <div className="ck-series-head">
        <span className="ck-series-title">
          <TeamLink teamId={teamId}>{tri}</TeamLink> · {games.length}-game {kind === 'W' ? 'winning' : 'losing'} streak
        </span>
      </div>
      <div className="ck-streak-rows" data-testid="streak-rows">
        {games.map((s) => {
          const url = gameLink?.(s.game);
          const text = `${s.win ? 'W' : 'L'} ${Math.max(s.score, s.oppScore)}–${Math.min(s.score, s.oppScore)}, ${s.score > s.oppScore ? '+' : '−'}${Math.abs(s.score - s.oppScore)}`;
          const game = (
            <>
              <span className="ck-streak-date">{fmtDay(s.game.dateEt)}</span>
              <span className={`ck-streak-res ck-streak-${s.win ? 'w' : 'l'}`}>{text}</span>
              {s.ot && <span className="ck-ot">{s.ot}</span>}
            </>
          );
          return (
            <div key={s.game.gameId} className="ck-streak-row" data-game-id={s.game.gameId} data-testid="streak-row">
              <span className="ck-streak-at">{s.home ? 'vs' : '@'}</span>
              <TeamLogo team={{ teamId: s.opponentId, teamTricode: s.opponent } as Parameters<typeof TeamLogo>[0]['team']} />
              <TeamLink teamId={s.opponentId} className="ck-streak-opp">
                {s.opponent}
              </TeamLink>
              {url ? (
                <a className="ck-streak-game" href={url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie">
                  {game}
                </a>
              ) : (
                <span className="ck-streak-game">{game}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The widget's one streak popup: spread `handlers` on the wrapper, render `node` inside it. */
export function useStreakPopup(data: CalendarData | undefined, opts: { gameLink?: GameLink } = {}) {
  return useHoverPopup(
    'data-streak',
    (value) => {
      const [team, gameId] = value.split('|');
      return data ? <StreakList data={data} teamId={Number(team)} gameId={gameId || undefined} gameLink={opts.gameLink} /> : null;
    },
    { className: 'ck-series-pop ck-streak-pop', label: 'Streak', testId: 'streak-popup' },
  );
}
