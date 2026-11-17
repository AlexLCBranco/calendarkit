// Moneyline odds from ESPN's public scoreboard (site.api.espn.com, no key; unofficial and
// undocumented — see docs/HISTORY.md). Pure: the server function (api/odds.ts) fetches, this reads.
// Checked 2026-11-04 on the live endpoints: a game not yet started carries `competitions[0].odds[0].moneyline`
// (provider DraftKings) with `home` / `away` → `open` / `close` → `odds` as American odds ("-136", "+115"); `close` is the
// current line. Once a game has started the scoreboard drops `odds`; the game's summary keeps the pre-game line in
// `pickcenter[0].moneyline` (same shape) — so a started or finished game shows the last odds before tip-off.

/** ESPN's team abbreviations where they differ from the NBA's tricodes (ESPN /teams, 2026-11-04: the other 24 match). */
export const ESPN_TRICODE: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
export const nbaTricode = (espn: string) => ESPN_TRICODE[espn] ?? espn;

/** American odds ("-136", "+115", "EVEN") → decimal, 2 places (1.74, 2.15, 2.00); anything else → undefined. */
export function decimalOdds(american: string | number | undefined | null): number | undefined {
  if (american == null) return undefined;
  const s = String(american).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EV') return 2;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) < 100) return undefined;
  const d = n > 0 ? 1 + n / 100 : 1 + 100 / -n;
  return Math.round(d * 100) / 100;
}

/** One game's moneyline: decimal odds per side and the bookmaker. */
export interface GameOdds {
  away: number;
  home: number;
  provider?: string;
}
/** A game ESPN has as finished (gauntlet GT-5): its final score, before the daily snapshot has it. */
export interface GameFinal {
  away: number;
  home: number;
  /** "Final", "Final/OT", "Final/2OT": as the snapshot writes it. */
  statusText: string;
}
/** The odds of one ET date, keyed "AWAY@HOME" by NBA tricodes; with the games ESPN has as finished (`finals`, same
    keys) and whether any game is being played (`live`: the store then asks more often). */
export interface DayOdds {
  date: string;
  games: Record<string, GameOdds>;
  finals?: Record<string, GameFinal>;
  live?: boolean;
}

type Moneyline = { home?: { close?: { odds?: string }; open?: { odds?: string } }; away?: { close?: { odds?: string }; open?: { odds?: string } } };
type EspnOdds = { provider?: { name?: string }; moneyline?: Moneyline };
type EspnStatus = { period?: number; type?: { state?: string; completed?: boolean } };
export type EspnEvent = {
  id: string;
  competitions: { competitors: { homeAway: 'home' | 'away'; team: { abbreviation: string }; score?: string }[]; odds?: EspnOdds[]; status?: EspnStatus }[];
  status?: EspnStatus;
};

/** The moneyline of an odds entry (current line = `close`, else `open`), or undefined. */
export function moneyline(o: EspnOdds | undefined): GameOdds | undefined {
  const ml = o?.moneyline;
  const away = decimalOdds(ml?.away?.close?.odds ?? ml?.away?.open?.odds);
  const home = decimalOdds(ml?.home?.close?.odds ?? ml?.home?.open?.odds);
  return away && home ? { away, home, provider: o?.provider?.name } : undefined;
}

/** "AWAY@HOME" in NBA tricodes for an ESPN event. */
export function eventKey(e: EspnEvent): string | undefined {
  const cs = e.competitions[0]?.competitors ?? [];
  const away = cs.find((c) => c.homeAway === 'away')?.team.abbreviation;
  const home = cs.find((c) => c.homeAway === 'home')?.team.abbreviation;
  return away && home ? `${nbaTricode(away)}@${nbaTricode(home)}` : undefined;
}

/** ESPN's state of an event: "pre" (not started), "in", "post". */
export const eventState = (e: EspnEvent) => e.competitions[0]?.status?.type?.state ?? e.status?.type?.state ?? 'pre';

/**
 * A day's odds from its scoreboard; started games (no odds there) from their summaries through `summary(id)` (the
 * pickcenter's pre-game line). A game with no odds anywhere is left out (the card shows none).
 */
export async function dayOdds(date: string, scoreboard: { events?: EspnEvent[] }, summary: (eventId: string) => Promise<{ pickcenter?: EspnOdds[] } | undefined>): Promise<DayOdds> {
  const games: Record<string, GameOdds> = {};
  await Promise.all(
    (scoreboard.events ?? []).map(async (e) => {
      const key = eventKey(e);
      if (!key) return;
      let odds = moneyline(e.competitions[0]?.odds?.[0]);
      if (!odds && eventState(e) !== 'pre') odds = moneyline((await summary(e.id).catch(() => undefined))?.pickcenter?.[0]);
      if (odds) games[key] = odds;
    }),
  );
  return { date, games };
}

/** "Final", "Final/OT", "Final/2OT" from the number of periods played (4 in regulation). */
export const finalText = (period: number | undefined) => {
  const ot = (period ?? 4) - 4;
  return ot <= 0 ? 'Final' : ot === 1 ? 'Final/OT' : `Final/${ot}OT`;
};

/**
 * The games ESPN's scoreboard has as finished (state "post" and completed), with both scores, keyed like the odds.
 * Checked 2026-11-17 on the live scoreboard: `competitors[].score` ("131"), `status.type.completed`, `status.period`.
 */
export function dayFinals(scoreboard: { events?: EspnEvent[] }): Record<string, GameFinal> {
  const out: Record<string, GameFinal> = {};
  for (const e of scoreboard.events ?? []) {
    const key = eventKey(e);
    const c = e.competitions[0];
    const status = c?.status ?? e.status;
    if (!key || !c || eventState(e) !== 'post' || status?.type?.completed === false) continue;
    const score = (side: 'home' | 'away') => Number(c.competitors.find((x) => x.homeAway === side)?.score);
    const away = score('away');
    const home = score('home');
    if (!Number.isFinite(away) || !Number.isFinite(home) || away === home) continue; // a half-written answer
    out[key] = { away, home, statusText: finalText(status?.period) };
  }
  return out;
}

/** Any game of the scoreboard being played. */
export const anyLive = (events: EspnEvent[] | undefined) => (events ?? []).some((e) => eventState(e) === 'in');

/**
 * How long the CDN keeps a day's answer (s-maxage, seconds). Every game over: the line can't change any more → a day.
 * A game being played: 2 minutes, so a final score shows soon after the game ends (gauntlet GT-5; at most 30 scoreboard
 * requests per hour per date reach ESPN, and only while games are on). Otherwise 10 minutes (lines move during the day; at
 * most 6 requests per hour per date, however many people open the Slate).
 */
export const oddsCacheSeconds = (events: EspnEvent[] | undefined) =>
  (events ?? []).length > 0 && (events ?? []).every((e) => eventState(e) === 'post') ? 86_400 : anyLive(events) ? 120 : 600;

/** YYYY-MM-DD → ESPN's `dates` (YYYYMMDD), or undefined for anything else. */
export const espnDate = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date.replaceAll('-', '') : undefined);
