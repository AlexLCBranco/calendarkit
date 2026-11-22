// Team Calendar, Month range: the line above the weekday names — the team's full name, its record and its place in the
// conference on the left, the month centred over the grid. Each piece opens what it names.

import { useMemo } from 'react';
import type { CalendarData } from '../data/model';
import { conferencePositions, fmtRec, leagueStandings } from '../data/standings';
import { TEAM_BY_ID } from '../data/teams';
import { fmtMonth, fullName } from './widget';

/**
 * The team's record and conference place, read from the Standings page's own table (leagueStandings: the same
 * tie-breaks), so the two can never disagree. No place before the team's first finished game, as everywhere else.
 */
export function teamStanding(data: CalendarData, teamId: number): { record: string; place?: string; placeTip?: string } | undefined {
  const s = leagueStandings(data);
  const row = [...s.West, ...s.East].find((t) => t.teamId === teamId);
  if (!row) return undefined;
  const pos = conferencePositions(data).get(teamId);
  return { record: fmtRec(row), place: pos && `${pos.ordinal} ${pos.conference}`, placeTip: pos && `${pos.ordinal} in the ${pos.conference}` };
}

export interface TeamMonthHeadProps {
  data: CalendarData;
  teamId: number;
  /** YYYY-MM */
  month: string;
  onTeam: () => void;
  onStandings: () => void;
  onMonth: () => void;
}

export function TeamMonthHead({ data, teamId, month, onTeam, onStandings, onMonth }: TeamMonthHeadProps) {
  const team = TEAM_BY_ID.get(teamId);
  const st = useMemo(() => teamStanding(data, teamId), [data, teamId]);
  if (!team) return null;
  const name = fullName(team);
  const when = fmtMonth(month);
  return (
    // a control strip, not part of the calendar: never in an image (the copies have their own team heading)
    <div className="ck-tmh" data-testid="team-month-head" data-capture-exclude="true" data-no-marquee="true">
      <div className="ck-tmh-left">
        <button type="button" className="ck-tmh-part ck-tmh-name" data-testid="tmh-team" title={`${name}: pick another team`} onClick={onTeam}>
          {name}
        </button>
        {st && (
          <button type="button" className="ck-tmh-part ck-tmh-rec" data-testid="tmh-record" title={`Record ${st.record}: open Standings`} onClick={onStandings}>
            {st.record}
          </button>
        )}
        {st?.place && (
          <button type="button" className="ck-tmh-part ck-tmh-pos" data-testid="tmh-place" title={`${st.placeTip}: open Standings`} onClick={onStandings}>
            {st.place}
          </button>
        )}
      </div>
      {/* the date picker stays open under a press on its own opener (DatePicker's outside check) */}
      <button type="button" className="ck-tmh-part ck-tmh-month" data-testid="tmh-month" data-date-opener="true" title={`${when}: pick a date`} onClick={onMonth}>
        {when}
      </button>
      <span />
    </div>
  );
}
