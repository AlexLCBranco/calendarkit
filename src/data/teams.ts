// Static 30-team table keyed by the schedule feed's teamId.

import { CALENDARKIT_BASE } from './address';

export type Conference = 'East' | 'West';
export type Division = 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';

export interface Team {
  id: number;
  tricode: string;
  city: string;
  name: string;
  conference: Conference;
  division: Division;
}

const T = (id: number, tricode: string, city: string, name: string, conference: Conference, division: Division): Team => ({
  id: 1610612700 + id,
  tricode,
  city,
  name,
  conference,
  division,
});

export const TEAMS: Team[] = [
  T(38, 'BOS', 'Boston', 'Celtics', 'East', 'Atlantic'),
  T(51, 'BKN', 'Brooklyn', 'Nets', 'East', 'Atlantic'),
  T(52, 'NYK', 'New York', 'Knicks', 'East', 'Atlantic'),
  T(55, 'PHI', 'Philadelphia', '76ers', 'East', 'Atlantic'),
  T(61, 'TOR', 'Toronto', 'Raptors', 'East', 'Atlantic'),
  T(41, 'CHI', 'Chicago', 'Bulls', 'East', 'Central'),
  T(39, 'CLE', 'Cleveland', 'Cavaliers', 'East', 'Central'),
  T(65, 'DET', 'Detroit', 'Pistons', 'East', 'Central'),
  T(54, 'IND', 'Indiana', 'Pacers', 'East', 'Central'),
  T(49, 'MIL', 'Milwaukee', 'Bucks', 'East', 'Central'),
  T(37, 'ATL', 'Atlanta', 'Hawks', 'East', 'Southeast'),
  T(66, 'CHA', 'Charlotte', 'Hornets', 'East', 'Southeast'),
  T(48, 'MIA', 'Miami', 'Heat', 'East', 'Southeast'),
  T(53, 'ORL', 'Orlando', 'Magic', 'East', 'Southeast'),
  T(64, 'WAS', 'Washington', 'Wizards', 'East', 'Southeast'),
  T(43, 'DEN', 'Denver', 'Nuggets', 'West', 'Northwest'),
  T(50, 'MIN', 'Minnesota', 'Timberwolves', 'West', 'Northwest'),
  T(60, 'OKC', 'Oklahoma City', 'Thunder', 'West', 'Northwest'),
  T(57, 'POR', 'Portland', 'Trail Blazers', 'West', 'Northwest'),
  T(62, 'UTA', 'Utah', 'Jazz', 'West', 'Northwest'),
  T(44, 'GSW', 'Golden State', 'Warriors', 'West', 'Pacific'),
  T(46, 'LAC', 'LA', 'Clippers', 'West', 'Pacific'),
  T(47, 'LAL', 'Los Angeles', 'Lakers', 'West', 'Pacific'),
  T(56, 'PHX', 'Phoenix', 'Suns', 'West', 'Pacific'),
  T(58, 'SAC', 'Sacramento', 'Kings', 'West', 'Pacific'),
  T(42, 'DAL', 'Dallas', 'Mavericks', 'West', 'Southwest'),
  T(45, 'HOU', 'Houston', 'Rockets', 'West', 'Southwest'),
  T(63, 'MEM', 'Memphis', 'Grizzlies', 'West', 'Southwest'),
  T(40, 'NOP', 'New Orleans', 'Pelicans', 'West', 'Southwest'),
  T(59, 'SAS', 'San Antonio', 'Spurs', 'West', 'Southwest'),
];

export const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));

/**
 * Local team logo (public/logos/<tricode>.svg, downloaded once by scripts/fetch-logos.ts; never the NBA CDN at
 * runtime). Undefined for an undecided team (teamId 0) or an unknown id.
 */
export function teamLogo(teamId: number): string | undefined {
  const t = TEAM_BY_ID.get(teamId);
  return t && `${CALENDARKIT_BASE}logos/${t.tricode}.svg`;
}

export const DIVISIONS: { conference: Conference; division: Division }[] = [
  { conference: 'East', division: 'Atlantic' },
  { conference: 'East', division: 'Central' },
  { conference: 'East', division: 'Southeast' },
  { conference: 'West', division: 'Northwest' },
  { conference: 'West', division: 'Pacific' },
  { conference: 'West', division: 'Southwest' },
];
