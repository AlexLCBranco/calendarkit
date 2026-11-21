// A team's heading: large logo on its light disc + the team's full name. The copies of the Team views (the screen has
// the team box in the header instead) and the Cup's team schedule.

import type { CSSProperties } from 'react';
import type { ConfPosition } from '../data/standings';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { fullName } from './widget';
import { TeamLink } from '../slate/teamLink';
import { InjuriesLink } from './TeamPicker';

/** Big team logo on its light disc (a team link when `link`). */
function BigLogo({ teamId, px, link }: { teamId: number; px: number; link: boolean }) {
  const src = teamLogo(teamId);
  return (
    <TeamLink teamId={link ? teamId : 0} className="ck-logo-backing" style={{ '--ck-logo': `${px}px` } as CSSProperties} aria-label={link ? TEAM_BY_ID.get(teamId)?.tricode : undefined}>
      {src && <img src={src} alt="" width={px} height={px} />}
    </TeamLink>
  );
}

/**
 * Team views: large logo on its disc + full name; the Team List adds the team's current conference position after
 * the name (its rows have no room for it) and the month it shows, plain text.
 * `link`: logo and name link to the Team view — the Cup schedule's team; not the Team view's own header,
 * which would link to itself.
 */
export function TeamHeader({ teamId, compact = false, period, link = false, position, injuries = false }: { teamId: number; compact?: boolean; period?: string; link?: boolean; position?: ConfPosition; /** the team's Injuries link after its name (the Cup's team schedule) */ injuries?: boolean }) {
  const t = TEAM_BY_ID.get(teamId);
  const name = t ? fullName(t) : 'Team';
  return (
    <div className="ck-team-header" data-testid="team-header">
      <BigLogo teamId={teamId} px={compact ? 40 : 48} link={link} />
      <h2 className="ck-team-name">{link ? <TeamLink teamId={teamId}>{name}</TeamLink> : name}</h2>
      {position && (
        <span className="ck-team-pos" data-testid="team-pos" title="Current conference standings">
          {`${position.ordinal} in the ${position.conference}`}
        </span>
      )}
      {injuries && <InjuriesLink teamId={teamId} />}
      {period && (
        <span className="ck-team-period" data-testid="team-month">
          {period}
        </span>
      )}
    </div>
  );
}
