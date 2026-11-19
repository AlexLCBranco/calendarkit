// The games behind a Standings cell (CK-18), in its hover pop-up: one row per game — date, "vs OPP" / "@ OPP",
// the result and score (or the tip-off time to come) — each the game's page in a new tab, like the streak pop-up's rows.

import { dateFormat, finalScore, overtime, tipoff, type CalendarData } from '../data/model';
import type { CellGamesKey } from '../data/standings';
import { TEAM_BY_ID } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { GameLink } from '../slate/links';

/** The attribute a cell carries: "<teamId>:<cell>". */
export const CELL_ATTR = 'data-st-games';

const TITLE: Record<CellGamesKey, string> = {
  wl: 'last 5 results',
  left: 'games left',
  leftHome: 'home games left',
  leftRoad: 'road games left',
  leftB2b: 'back-to-backs left (2nd nights)',
  b2b1: '1st nights of back-to-backs',
  b2b2: '2nd nights of back-to-backs',
};
const day = (d: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

export function CellGamesList({ teamId, cell, games, gameLink, timeZone }: { data: CalendarData; teamId: number; cell: CellGamesKey; games: ScheduleGame[]; gameLink?: GameLink; timeZone?: string }) {
  const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
  return (
    <>
      <div className="ck-series-head">
        <span className="ck-series-title">
          {tri} · {games.length} {TITLE[cell]}
        </span>
      </div>
      <ul className="ck-st-games-list" data-testid="st-games">
        {games.map((g) => {
          const home = g.homeTeam.teamId === teamId;
          const opp = home ? g.awayTeam : g.homeTeam;
          const r = finalScore(g, teamId);
          const ot = r && overtime(g);
          const url = gameLink?.(g);
          const body = (
            <>
              <span className="ck-st-g-date">{day(g.dateEt)}</span>
              <span className="ck-st-g-opp">
                {g.isNeutral ? 'vs' : home ? 'vs' : '@'} {TEAM_BY_ID.get(opp.teamId)?.tricode ?? opp.teamTricode}
              </span>
              <span className={`ck-st-g-res${r ? (r.win ? ' ck-st-good' : ' ck-st-bad') : ''}`}>{r ? `${r.win ? 'W' : 'L'} ${r.score}–${r.oppScore}${ot ? ` ${ot}` : ''}` : tipoff(g, timeZone).label}</span>
            </>
          );
          return (
            <li key={g.gameId} data-game-id={g.gameId}>
              {url ? (
                <a className="ck-st-g" href={url} target="_blank" rel="noopener noreferrer" data-testid="st-game-link">
                  {body}
                </a>
              ) : (
                <span className="ck-st-g">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
