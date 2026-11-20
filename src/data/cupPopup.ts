// What the Cup label's popup shows for a game: a group game's group table (as the Cup page ranks it) with the game's
// two teams marked; a knockout game's two teams with their way through the Cup so far. Pure, from the schedule loaded.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { cupStandingsOf, type CupGroupTable, type CupTeamLine } from './cup';
import { cupBoard } from './cupSchedule';
import { cupRound, dateFormat, finalScore, type CalendarData } from './model';
import { TEAM_BY_ID } from './teams';

/** Where a Cup label leads on the Cup page: a group's card (Groups) or the knockout bracket (Simulator). */
export type CupFocus = { kind: 'group'; group: string } | { kind: 'bracket' };

/** The Cup page target of a game, or undefined for a game that isn't a Cup game. */
export function cupFocusOf(g: ScheduleGame): CupFocus | undefined {
  const r = cupRound(g);
  if (!r) return undefined;
  if (r !== 'group') return { kind: 'bracket' };
  return g.gameSubLabel ? { kind: 'group', group: g.gameSubLabel } : undefined;
}

/** The address value of a focus (`cg=`): "West Group A" or "bracket". */
export const cupFocusParam = (f: CupFocus) => (f.kind === 'group' ? f.group : 'bracket');

export interface CupPathStep {
  /** "Group play", "Quarterfinal", "Semifinal", "Final". */
  round: string;
  /** "1st in West A, 3-1" / "beat NYK 110–102" / "vs CLE, Tue, Dec 8". */
  text: string;
  result?: 'won' | 'lost';
}

export type CupPopupData =
  | { kind: 'groups'; tables: CupGroupTable[]; teams: number[] }
  | { kind: 'knockout'; round: string; paths: { teamId: number; tricode: string; steps: CupPathStep[] }[] };

const ROUND = { qf: 'Quarterfinal', sf: 'Semifinal', final: 'Final' } as const;
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const day = (d: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));
const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? 'TBD';

/** A team's way through the Cup: its group finish, then each knockout game it is in, in order. */
export function cupPath(data: CalendarData, teamId: number): CupPathStep[] {
  const { standings, byTeam } = cupStandingsOf(data);
  const line: CupTeamLine | undefined = byTeam.get(teamId);
  const table = standings.groups.find((g) => g.teams.some((t) => t.teamId === teamId));
  const steps: CupPathStep[] = [];
  if (line && table) {
    const how = line.status === 'leader' ? ', group winner' : line.status === 'wild-card' ? ', wild card' : '';
    steps.push({ round: 'Group play', text: `${ord(line.rank)} in ${table.group.replace(' Group ', ' ')}, ${line.w}-${line.l}${how}` });
  }
  const board = cupBoard(data);
  for (const r of ['qf', 'sf', 'final'] as const) {
    for (const g of board[r]) {
      const home = g.homeTeam.teamId === teamId;
      if (!home && g.awayTeam.teamId !== teamId) continue;
      const opp = tri(home ? g.awayTeam.teamId : g.homeTeam.teamId);
      const res = finalScore(g, teamId);
      steps.push(res ? { round: ROUND[r], text: `${res.win ? 'beat' : 'lost to'} ${opp} ${res.score}–${res.oppScore}`, result: res.win ? 'won' : 'lost' } : { round: ROUND[r], text: `${home ? 'vs' : '@'} ${opp}, ${day(g.dateEt)}` });
    }
  }
  return steps;
}

/** The popup's content for a game (by id), or undefined for a game that isn't a Cup game. */
export function cupPopupData(data: CalendarData, gameId: string): CupPopupData | undefined {
  const g = data.games.find((x) => x.gameId === gameId);
  const r = g && cupRound(g);
  if (!g || !r) return undefined;
  const teams = [g.awayTeam.teamId, g.homeTeam.teamId].filter(Boolean);
  if (r === 'group') {
    const { standings } = cupStandingsOf(data);
    // the game's own group first (the feed's label), then any other group one of its teams is in
    const tables = standings.groups.filter((t) => t.group === g.gameSubLabel || t.teams.some((x) => teams.includes(x.teamId)));
    tables.sort((a, b) => Number(b.group === g.gameSubLabel) - Number(a.group === g.gameSubLabel));
    return { kind: 'groups', tables, teams };
  }
  return { kind: 'knockout', round: ROUND[r], paths: teams.map((id) => ({ teamId: id, tricode: tri(id), steps: cupPath(data, id) })) };
}
