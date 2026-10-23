// NBA schedule feed parser (cdn.nba.com/static/json/staticData/scheduleLeagueV2.json).
// Browser-safe: no imports, no Node APIs. Every raw field is kept; derived fields are added alongside.

export const SCHEDULE_URL = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';

export interface ScheduleBroadcaster {
  broadcasterScope: string;
  broadcasterMedia: string;
  broadcasterId: number;
  broadcasterDisplay: string;
  broadcasterAbbreviation: string;
  broadcasterDescription: string;
  tapeDelayComments: string;
  broadcasterVideoLink: string;
  broadcasterTeamId: number;
  broadcasterRanking: number | null;
  localizationRegion: string;
  [key: string]: unknown;
}

export interface ScheduleTeam {
  /** 0 while a knockout opponent is still to be decided. */
  teamId: number;
  teamName: string;
  teamCity: string;
  /** "" while a knockout opponent is still to be decided. */
  teamTricode: string;
  teamSlug: string;
  wins: number;
  losses: number;
  score: number;
  seed: number;
  [key: string]: unknown;
}

/** One game exactly as the feed has it. Unknown/new fields are kept too. */
export interface RawScheduleGame {
  gameId: string;
  gameCode: string;
  /** 1 scheduled, 2 live, 3 final. */
  gameStatus: number;
  /** e.g. "Final", "Final/OT", "7:30 pm ET", "TBD", "3rd Qtr" (may have trailing spaces). */
  gameStatusText: string;
  gameSequence: number;
  /** US Eastern date at 00:00 with a misleading "Z" suffix. */
  gameDateEst: string;
  /** Eastern time on a dummy 1900-01-01 date, misleading "Z" suffix. */
  gameTimeEst: string;
  /** Eastern date+time, misleading "Z" suffix (it is NOT UTC). */
  gameDateTimeEst: string;
  gameDateUTC: string;
  gameTimeUTC: string;
  /** Real UTC start time (a placeholder while the time is TBD). */
  gameDateTimeUTC: string;
  awayTeamTime: string;
  homeTeamTime: string;
  day: string;
  monthNum: number;
  weekNumber: number;
  weekName: string;
  /** "true" | "false" as a string. */
  ifNecessary: string;
  seriesGameNumber: string;
  gameLabel: string;
  gameSubLabel: string;
  seriesText: string;
  arenaName: string;
  arenaState: string;
  arenaCity: string;
  postponedStatus: string;
  branchLink: string;
  /** e.g. "in-season", "in-season-knockout", "Global Games", "". */
  gameSubtype: string;
  isNeutral: boolean;
  broadcasters: Record<string, ScheduleBroadcaster[]>;
  homeTeam: ScheduleTeam;
  awayTeam: ScheduleTeam;
  pointsLeaders?: unknown[];
  [key: string]: unknown;
}

/** Game type from the 3-digit gameId prefix. */
export type GameType = 'preseason' | 'regular' | 'all-star' | 'playoffs' | 'play-in' | 'cup-final' | 'unknown';

const TYPE_BY_PREFIX: Record<string, GameType> = {
  '001': 'preseason',
  '002': 'regular',
  '003': 'all-star',
  '004': 'playoffs',
  '005': 'play-in',
  '006': 'cup-final',
};

export interface ScheduleGame extends RawScheduleGame {
  /** Season of the feed, e.g. "2026-27". */
  seasonYear: string;
  gameType: GameType;
  status: 'scheduled' | 'live' | 'final' | 'unknown';
  /** Trimmed gameStatusText. */
  statusText: string;
  /** US Eastern calendar date, "YYYY-MM-DD". */
  dateEt: string;
  /** Start time as a real UTC ISO string; null while the time is TBD. */
  startTimeUtc: string | null;
  timeTbd: boolean;
  /** True while either team is still to be decided (knockout games). */
  teamsTbd: boolean;
  isCupGroupGame: boolean;
  isCupKnockout: boolean;
}

export interface ScheduleWeek {
  weekNumber: number;
  weekName: string;
  startDate: string;
  endDate: string;
  [key: string]: unknown;
}

export interface Schedule {
  seasonYear: string;
  leagueId: string;
  weeks: ScheduleWeek[];
  /** All games in feed order (by date), every game type. */
  games: ScheduleGame[];
}

export class ScheduleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleParseError';
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function gameTypeOf(gameId: string): GameType {
  return TYPE_BY_PREFIX[gameId.slice(0, 3)] ?? 'unknown';
}

/** Add derived fields to one raw game. */
export function deriveGame(g: RawScheduleGame, seasonYear: string): ScheduleGame {
  const statusText = String(g.gameStatusText ?? '').trim();
  const timeTbd = g.gameStatus === 1 && /^tbd$/i.test(statusText);
  const teamsTbd = !g.homeTeam?.teamId || !g.awayTeam?.teamId || !g.homeTeam.teamTricode || !g.awayTeam.teamTricode;
  return {
    ...g,
    seasonYear,
    gameType: gameTypeOf(g.gameId),
    status: g.gameStatus === 1 ? 'scheduled' : g.gameStatus === 2 ? 'live' : g.gameStatus === 3 ? 'final' : 'unknown',
    statusText,
    dateEt: String(g.gameDateEst ?? '').slice(0, 10),
    startTimeUtc: timeTbd || !g.gameDateTimeUTC ? null : g.gameDateTimeUTC,
    timeTbd,
    teamsTbd,
    isCupGroupGame: g.gameSubtype === 'in-season',
    isCupKnockout: g.gameSubtype === 'in-season-knockout',
  };
}

/** Parse the raw feed JSON (already JSON.parse'd). Throws ScheduleParseError on an unexpected shape. */
export function parseSchedule(json: unknown): Schedule {
  if (!isObj(json) || !isObj(json.leagueSchedule)) throw new ScheduleParseError('missing leagueSchedule');
  const ls = json.leagueSchedule;
  if (typeof ls.seasonYear !== 'string') throw new ScheduleParseError('missing leagueSchedule.seasonYear');
  if (!Array.isArray(ls.gameDates)) throw new ScheduleParseError('missing leagueSchedule.gameDates');
  const games: ScheduleGame[] = [];
  for (const d of ls.gameDates) {
    if (!isObj(d) || !Array.isArray(d.games)) throw new ScheduleParseError('gameDates entry without games');
    for (const g of d.games) {
      if (!isObj(g) || typeof g.gameId !== 'string' || !isObj(g.homeTeam) || !isObj(g.awayTeam)) {
        throw new ScheduleParseError(`malformed game in gameDates (${isObj(g) ? String(g.gameId) : typeof g})`);
      }
      games.push(deriveGame(g as RawScheduleGame, ls.seasonYear));
    }
  }
  return {
    seasonYear: ls.seasonYear,
    leagueId: String(ls.leagueId ?? ''),
    weeks: Array.isArray(ls.weeks) ? (ls.weeks as ScheduleWeek[]) : [],
    games,
  };
}

/** Regular-season games (gameId 002…), which include NBA Cup group and knockout games but not the Cup final. */
export const regularSeason = (s: Schedule) => s.games.filter((g) => g.gameType === 'regular');
export const finished = (games: ScheduleGame[]) => games.filter((g) => g.status === 'final');
