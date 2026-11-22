// The opponent's situation in one of a team's games, for the Team Calendar's cells: its record and streak (going into
// the game; after it once final — the season line's rule), and how tired or rested it is: the back-to-back night and
// legs (HH / HA / AH / AA), the 3-in-4 stretch, the days off before the game when 2 or more. Same rules and sources as
// every other view (leagueSeasonLines, leagueFatigue).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue, type TeamFatigue } from './fatigue';
import { leagueSeasonLines, perspective, teamLabel, teamSeason, type B2BPair, type CalendarData, type SeasonLine, type TeamRecord } from './model';
import { restLines, restTier, REST_MARK_DAYS } from './rest';
import type { ThreeInFour } from './scheduleTags';

export interface OpponentSituation {
  teamId: number;
  tricode: string;
  record?: TeamRecord;
  streak?: SeasonLine['streak'];
  /** The record and streak are the opponent's as of now: the game is too far ahead for the ones going into it. */
  now?: boolean;
  /** The opponent's back-to-back night this game is (the first pair when three days in a row make it two). */
  b2b?: { pair: B2BPair; night: 1 | 2 };
  tif?: ThreeInFour;
  /** Days since the opponent's previous game, when 2 or more (a back-to-back is 1: no rest mark). */
  rest?: { days: number; tier: 'long' | 'short'; tip: string };
  /** The fatigue tooltip (legs, dates, travel, the stretch, the record). */
  tip?: string;
}

const currentCache = new WeakMap<CalendarData, Map<number, SeasonLine | undefined>>();
/** A team's record and streak as of now: its last season line that has a record. */
export function currentLine(data: CalendarData, teamId: number): SeasonLine | undefined {
  let byTeam = currentCache.get(data);
  if (!byTeam) currentCache.set(data, (byTeam = new Map()));
  if (!byTeam.has(teamId)) byTeam.set(teamId, [...teamSeason(data, teamId).values()].findLast((l) => l.record));
  return byTeam.get(teamId);
}

/**
 * A team's streak for one of its games, the way the opponent's is read: after the game once final, going into it
 * before — and its current streak on a game further ahead than its next one (the streak going in isn't known yet).
 */
export function teamStreak(data: CalendarData, game: ScheduleGame, teamId: number): SeasonLine['streak'] {
  const own = leagueSeasonLines(data).get(game.gameId)?.get(teamId);
  return (own?.record || game.gameType !== 'regular' ? own : currentLine(data, teamId))?.streak;
}

/** `teamId`'s opponent in `game`, or undefined when the team isn't in it or the opponent isn't decided. */
export function opponentSituation(data: CalendarData, game: ScheduleGame, teamId: number): OpponentSituation | undefined {
  const side = perspective(game, teamId);
  const opp = side?.opponent;
  if (!opp?.teamId) return undefined;
  const own = leagueSeasonLines(data).get(game.gameId)?.get(opp.teamId);
  // a game further ahead than the opponent's next one: its record today (the last one known), said as such
  const line = own?.record || game.gameType !== 'regular' ? own : currentLine(data, opp.teamId);
  const f: TeamFatigue | undefined = leagueFatigue(data).get(game.gameId)?.get(opp.teamId);
  const pair = f?.pairs[0];
  const night = f?.nights[0];
  const off = f?.rest?.after;
  return {
    teamId: opp.teamId,
    tricode: teamLabel(opp),
    record: line?.record,
    streak: line?.streak,
    now: !!line && line !== own,
    b2b: pair && night ? { pair, night } : undefined,
    tif: f?.tif,
    rest: off && off.days >= REST_MARK_DAYS ? { days: off.days, tier: restTier(off.days), tip: restLines({ teamId: opp.teamId, after: off }, opp.teamId).join('\n') } : undefined,
    tip: f?.tip,
  };
}
