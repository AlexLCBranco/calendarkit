// The daily snapshot keeps only the fields calendarkit reads; the raw feed is ~4 MB, mostly fields no view shows
// (local broadcasters, radio, points leaders, the feed's own date variants). The JSON keeps the feed's shape, so the
// shared parser (src/shared/nba-schedule/parse.ts, owned by rotationkit) reads the slim file unchanged.
// Adding code that reads another feed field means adding it here: tests/slim-schedule.test.ts fails until then.

type Obj = Record<string, unknown>;

/** Per game: what the shared parser reads, plus what src/ reads off a ScheduleGame. */
export const GAME_FIELDS = [
  'gameId',
  'gameStatus',
  'gameStatusText',
  'gameDateEst',
  'gameDateTimeUTC',
  'gameSubtype',
  'gameSubLabel',
  'ifNecessary',
  'isNeutral',
  'arenaName',
  'arenaCity',
  'arenaState',
  'broadcasters',
  'homeTeam',
  'awayTeam',
] as const;
/** Per team side (records, standings and seeds are worked out from the scores, never taken from the feed). */
export const TEAM_FIELDS = ['teamId', 'teamTricode', 'score'] as const;
/** Only national TV is shown (model.ts nationalTv), by its display name. */
export const BROADCASTER_LISTS = ['nationalBroadcasters'] as const;
export const BROADCASTER_FIELDS = ['broadcasterDisplay'] as const;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const pick = (o: Obj, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

function slimGame(g: Obj): Obj {
  const out = pick(g, GAME_FIELDS);
  for (const side of ['homeTeam', 'awayTeam']) if (isObj(g[side])) out[side] = pick(g[side], TEAM_FIELDS);
  if (isObj(g.broadcasters)) {
    const b = g.broadcasters;
    out.broadcasters = Object.fromEntries(
      BROADCASTER_LISTS.filter((k) => Array.isArray(b[k])).map((k) => [k, (b[k] as unknown[]).map((x) => (isObj(x) ? pick(x, BROADCASTER_FIELDS) : x))]),
    );
  }
  return out;
}

/**
 * The feed with every field the app never reads left out. Kept: `meta.time` (the data stamp, the deploy and freshness
 * checks), `leagueSchedule.{seasonYear, leagueId, weeks}` and each date's `games` (what the parser reads), the fields
 * above per game, and anything else at the top level (`calendarkit`: our own regulation totals).
 */
export function slimSchedule(json: Obj): Obj {
  const ls = json.leagueSchedule as Obj;
  const { meta, leagueSchedule: _ls, ...rest } = json;
  return {
    ...(isObj(meta) ? { meta: { time: meta.time } } : {}),
    leagueSchedule: {
      seasonYear: ls.seasonYear,
      leagueId: ls.leagueId,
      weeks: ls.weeks,
      gameDates: (ls.gameDates as Obj[]).map((d) => ({ games: (d.games as Obj[]).map(slimGame) })),
    },
    ...rest,
  };
}
