// Round 14 (item 4): moneyline odds from ESPN's public scoreboard (site.api.espn.com, no key; unofficial and
// undocumented — PROJECT.md "### Round 14", item 4). Pure: the server function (api/odds.ts) fetches, this reads.
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
/** The odds of one ET date, keyed "AWAY@HOME" by NBA tricodes. */
export interface DayOdds {
  date: string;
  games: Record<string, GameOdds>;
}

type Moneyline = { home?: { close?: { odds?: string }; open?: { odds?: string } }; away?: { close?: { odds?: string }; open?: { odds?: string } } };
type EspnOdds = { provider?: { name?: string }; moneyline?: Moneyline };
export type EspnEvent = {
  id: string;
  competitions: { competitors: { homeAway: 'home' | 'away'; team: { abbreviation: string } }[]; odds?: EspnOdds[]; status?: { type?: { state?: string } } }[];
  status?: { type?: { state?: string } };
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

/**
 * How long the CDN keeps a day's answer (s-maxage, seconds). Every game over: the line can't change any more → a day.
 * Otherwise 10 minutes (lines move during the day; at most 6 scoreboard requests per hour per date reach ESPN, however
 * many people open the Slate).
 */
export const oddsCacheSeconds = (events: EspnEvent[] | undefined) => ((events ?? []).length > 0 && (events ?? []).every((e) => eventState(e) === 'post') ? 86_400 : 600);

/** YYYY-MM-DD → ESPN's `dates` (YYYYMMDD), or undefined for anything else. */
export const espnDate = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date.replaceAll('-', '') : undefined);
