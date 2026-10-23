// Synthetic games for targeted cases. Built from a real raw game and passed through the shared module's
// deriveGame, so derived fields (gameType, dateEt, startTimeUtc, TBD, Cup flags) come from the module.

import fixture from '../src/shared/nba-schedule/fixture.json';
import { deriveGame, type RawScheduleGame, type Schedule, type ScheduleGame } from '../src/shared/nba-schedule/parse';
import { buildCalendarData } from '../src/data/model';
import { TEAMS } from '../src/data/teams';

const template = (fixture.leagueSchedule.gameDates as unknown as { games: RawScheduleGame[] }[])[0]!.games[0]!;

export const TEAM = { BOS: 1610612738, NYK: 1610612752, LAL: 1610612747, DEN: 1610612743, MIA: 1610612748 } as const;
const TRI: Record<number, string> = Object.fromEntries(TEAMS.map((t) => [t.id, t.tricode]));

let seq = 0;

export interface GameSpec {
  id?: string;
  /** NBA (ET) game date. */
  date: string;
  /** Real UTC start, or null for a TBD time. */
  utc: string | null;
  home?: number;
  away?: number;
  natl?: string[];
  subtype?: string;
  subLabel?: string;
  raw?: Partial<RawScheduleGame>;
}

const team = (id: number) => ({ ...template.homeTeam, teamId: id, teamTricode: id ? TRI[id] ?? 'XXX' : '', teamName: id ? 'Team' : '', score: 0 });

export function game(s: GameSpec): ScheduleGame {
  const id = s.id ?? `00226${String(9000 + ++seq).padStart(5, '0')}`;
  const raw: RawScheduleGame = {
    ...template,
    gameId: id,
    gameStatus: 1,
    gameStatusText: s.utc ? '7:00 pm ET' : 'TBD',
    gameDateEst: `${s.date}T00:00:00Z`,
    gameDateTimeUTC: s.utc ?? `${s.date}T05:00:00Z`,
    gameSubtype: s.subtype ?? '',
    gameSubLabel: s.subLabel ?? '',
    homeTeam: team(s.home ?? TEAM.BOS),
    awayTeam: team(s.away ?? TEAM.NYK),
    broadcasters: {
      ...template.broadcasters,
      nationalBroadcasters: (s.natl ?? []).map((n) => ({ ...template.broadcasters.nationalBroadcasters![0]!, broadcasterDisplay: n })),
    },
    ...s.raw,
  };
  return deriveGame(raw, '2026-27');
}

export const scheduleOf = (games: ScheduleGame[]): Schedule => ({ seasonYear: '2026-27', leagueId: '00', weeks: [], games });
export const dataOf = (games: ScheduleGame[]) => buildCalendarData(scheduleOf(games));
