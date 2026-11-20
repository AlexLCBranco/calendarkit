// The teams as chips (NAV_PATTERN.md: a What is never a dropdown): every team visible and one click away, grouped by
// conference, then division (a small gap between divisions; the division in each chip's tooltip). From 1600 px a chip
// shows the logo and tricode, East over West; narrower, the logo alone, both conferences on one line.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { DIVISIONS, TEAMS, type Conference } from '../data/teams';
import { TeamLogo } from './GameCard';
import { fullName } from './widget';

const CONFS: Conference[] = ['East', 'West'];

/**
 * `all`: an "All teams" chip first (no team = the league views). `teamId` undefined: nothing picked (or All teams).
 */
export function TeamChips({ teamId, onPick, all = false, label = 'Team' }: { teamId?: number; onPick: (teamId: number | undefined) => void; all?: boolean; label?: string }) {
  return (
    <div className="ck-team-chips" role="radiogroup" aria-label={label} data-testid="team-chips">
      {all && (
        <button type="button" role="radio" aria-checked={teamId === undefined} className={`ck-chip-btn ck-chip-all${teamId === undefined ? ' ck-chip-on' : ''}`} data-text="All teams" data-testid="team-chip-all" title="Every team: the whole league" onClick={() => teamId !== undefined && onPick(undefined)}>
          All teams
        </button>
      )}
      {CONFS.map((conf) => (
        <div key={conf} className="ck-chip-conf" role="group" aria-label={`${conf}ern Conference`}>
          <span className="ck-chip-conf-label" aria-hidden="true">
            {conf}
          </span>
          {DIVISIONS.filter((d) => d.conference === conf).map(({ division }) => (
            <span key={division} className="ck-chip-div" role="group" aria-label={`${division} division`}>
              {TEAMS.filter((t) => t.division === division).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === teamId}
                  aria-label={fullName(t)}
                  title={`${fullName(t)} · ${division} division`}
                  className={`ck-chip-btn ck-team-chip${t.id === teamId ? ' ck-chip-on' : ''}`}
                  data-team-id={t.id}
                  data-testid="team-chip"
                  onClick={() => t.id !== teamId && onPick(t.id)}
                >
                  <TeamLogo team={{ teamId: t.id } as ScheduleGame['homeTeam']} link={false} />
                  <span className="ck-team-chip-tri" aria-hidden="true">
                    {t.tricode}
                  </span>
                </button>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
