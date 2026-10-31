// Team views: large logo on its light disc + the team's full name.

import type { CSSProperties } from 'react';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { fullName } from './widget';

/** Big team logo on its light disc. */
function BigLogo({ teamId, px }: { teamId: number; px: number }) {
  const src = teamLogo(teamId);
  return (
    <span className="ck-logo-backing" style={{ '--ck-logo': `${px}px` } as CSSProperties}>
      {src && <img src={src} alt="" width={px} height={px} />}
    </span>
  );
}

/** Team views: large logo on its disc + full name; the Team List adds the month it shows (round 9), plain text. */
export function TeamHeader({ teamId, compact = false, period }: { teamId: number; compact?: boolean; period?: string }) {
  const t = TEAM_BY_ID.get(teamId);
  return (
    <div className="ck-team-header" data-testid="team-header">
      <BigLogo teamId={teamId} px={compact ? 40 : 48} />
      <h2 className="ck-team-name">{t ? fullName(t) : 'Team'}</h2>
      {period && (
        <span className="ck-team-period" data-testid="team-month">
          {period}
        </span>
      )}
    </div>
  );
}
