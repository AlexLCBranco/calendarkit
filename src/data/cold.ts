// Cold-weather flag (CK-16): a game is flagged when the arena's city is extremely cold at tip-off — it matters for
// the players' travel even though the game is indoors. "Feels like" (apparent temperature) from Open-Meteo
// (open-meteo.com: free, no key, non-commercial use; CC BY 4.0, attribution COLD_ATTRIBUTION wherever a
// temperature shows). Where the arenas are: arenas.ts (Wikidata coordinates, a source per entry).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { arenaOf } from './geo';
import { addDays } from './model';

/** Flagged at or below this feels-like temperature at tip-off (°C). */
export const COLD_FEELS_LIKE_C = -10;
export const COLD_ATTRIBUTION = 'Weather data by Open-Meteo.com';
export const COLD_ATTRIBUTION_URL = 'https://open-meteo.com/';

export const isCold = (feelsC: number | undefined) => feelsC !== undefined && feelsC <= COLD_FEELS_LIKE_C;

/** "−14 °C" (a real minus sign, whole degrees). */
export const fmtTemp = (c: number) => `${Math.round(c) < 0 ? '−' : ''}${Math.abs(Math.round(c))} °C`;

/** The games with a set tip-off and a known arena: [game, lat, lon, tip-off ms]. */
const located = (games: readonly ScheduleGame[]) =>
  games.flatMap((g) => {
    const a = arenaOf(g);
    return a && g.startTimeUtc ? [{ g, lat: a.lat, lon: a.lon, tip: Date.parse(g.startTimeUtc) }] : [];
  });

/**
 * One Open-Meteo request for a night's games (several places in one call): hourly feels-like temperature in UTC from
 * the ET date to two days later (a late tip-off is the next UTC day). Undefined when no game can be placed.
 */
export function coldRequest(date: string, games: readonly ScheduleGame[]): string | undefined {
  const at = located(games);
  if (!at.length) return undefined;
  const q = new URLSearchParams({
    latitude: at.map((x) => x.lat.toFixed(4)).join(','),
    longitude: at.map((x) => x.lon.toFixed(4)).join(','),
    hourly: 'apparent_temperature',
    timezone: 'GMT',
    start_date: date,
    end_date: addDays(date, 2),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

type Answer = { hourly?: { time?: string[]; apparent_temperature?: (number | null)[] } };

/** gameId → feels-like °C at tip-off (the hour it starts in), from the answer to coldRequest(date, games). */
export function coldOf(games: readonly ScheduleGame[], answer: Answer | Answer[]): Map<string, number> {
  const list = Array.isArray(answer) ? answer : [answer];
  const out = new Map<string, number>();
  located(games).forEach((x, i) => {
    const h = list[i]?.hourly;
    if (!h?.time || !h.apparent_temperature) return;
    const hour = new Date(Math.floor(x.tip / 3_600_000) * 3_600_000).toISOString().slice(0, 13);
    const j = h.time.findIndex((t) => t.startsWith(hour));
    const v = j >= 0 ? h.apparent_temperature[j] : null;
    if (typeof v === 'number') out.set(x.g.gameId, v);
  });
  return out;
}
