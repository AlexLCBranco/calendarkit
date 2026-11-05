// Team views: large logo on its light disc + the team's full name.

import type { CSSProperties } from 'react';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { fullName } from './widget';
import { TeamLink } from '../slate/teamLink';

/** Big team logo on its light disc (round 15: a team link when `link`). */
function BigLogo({ teamId, px, link }: { teamId: number; px: number; link: boolean }) {
  const src = teamLogo(teamId);
  return (
    <TeamLink teamId={link ? teamId : 0} className="ck-logo-backing" style={{ '--ck-logo': `${px}px` } as CSSProperties} aria-label={link ? TEAM_BY_ID.get(teamId)?.tricode : undefined}>
      {src && <img src={src} alt="" width={px} height={px} />}
    </TeamLink>
  );
}

/**
 * Team views: large logo on its disc + full name; the Team List adds the month it shows (round 9), plain text.
 * `link` (round 15): logo and name link to the Team view — the Cup schedule's team; not the Team view's own header,
 * which would link to itself.
 */
export function TeamHeader({ teamId, compact = false, period, link = false }: { teamId: number; compact?: boolean; period?: string; link?: boolean }) {
  const t = TEAM_BY_ID.get(teamId);
  const name = t ? fullName(t) : 'Team';
  return (
    <div className="ck-team-header" data-testid="team-header">
      <BigLogo teamId={teamId} px={compact ? 40 : 48} link={link} />
      <h2 className="ck-team-name">{link ? <TeamLink teamId={teamId}>{name}</TeamLink> : name}</h2>
      {period && (
        <span className="ck-team-period" data-testid="team-month">
          {period}
        </span>
      )}
    </div>
  );
}
