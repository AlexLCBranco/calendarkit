// Round 21 (items 10, 13): a Cup knockout game's venue and each team's rest / travel before it — from data only.
// Venue: the schedule feed's arena. A quarterfinal / semifinal is played at a team market: once the feed has the teams
// and the arena, the feed's home team is the host; before that, "venue TBD". The Championship is neutral (the feed names
// the arena: Hinkle Fieldhouse, Indianapolis, for 2026). In the simulator a game that isn't set yet is hosted by the
// higher seed (NBA.com "Cup 101"), at that team's home arena (src/map: the feed's arenas, never a guess).

import { cupRound } from './model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { Venue } from '../slate/VenueMarker';

/** The real schedule's venue for a knockout game. */
export function knockoutVenue(g: ScheduleGame): Venue {
  const round = cupRound(g);
  if (round === 'final') return g.arenaName ? { kind: 'neutral', arena: g.arenaName, city: g.arenaCity || undefined } : { kind: 'tbd' };
  if ((round === 'qf' || round === 'sf') && g.homeTeam.teamId && g.awayTeam.teamId && g.arenaName) return { kind: 'host', teamId: g.homeTeam.teamId };
  return { kind: 'tbd' };
}

