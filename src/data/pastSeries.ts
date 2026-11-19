// Earlier seasons' meetings for the season-series popup (CK-17): the two regular seasons before this one, from
// public/data/past-seasons.json (scripts/make-past-seasons.ts, ESPN's team schedules, the Cup Championship left out as
// in series.ts). Loaded only when the popup is switched to an earlier season (once per page); never at rest.

import { CALENDARKIT_BASE } from './address';

export const PAST_SEASONS_URL = `${CALENDARKIT_BASE}data/past-seasons.json`;
/** How many seasons back the popup goes (older ones matter little: rosters change). */
export const PAST_SEASONS_BACK = 2;

/** [ET date, away tricode, home tricode, away score, home score, overtime ("OT", "2OT")?] */
export type PastGame = [string, string, string, number, number, string?];
export interface PastSeasons {
  seasons: Record<string, PastGame[]>;
}

/** "2026-27" → "2024-25" for `back` = 2. */
export function seasonBefore(season: string, back: number): string {
  const start = Number(season.slice(0, 4)) - back;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** The meetings of two teams (tricodes, either order) in `season`, in date order; [] when the file lacks the season. */
export function pastMeetings(file: PastSeasons, season: string, a: string, b: string): PastGame[] {
  return (file.seasons[season] ?? []).filter((g) => (g[1] === a && g[2] === b) || (g[1] === b && g[2] === a));
}

/** "BOS leads 2–1", "Series split 2–2", "BOS won 3–1" — over a finished season: "won" / "split". */
export function pastStatus(games: PastGame[], a: string, b: string): string {
  if (!games.length) return 'No meetings';
  let wa = 0;
  let wb = 0;
  for (const g of games) {
    const winner = g[3] > g[4] ? g[1] : g[2];
    if (winner === a) wa++;
    else if (winner === b) wb++;
  }
  if (wa === wb) return `Series split ${wa}–${wb}`;
  return wa > wb ? `${a} won ${wa}–${wb}` : `${b} won ${wb}–${wa}`;
}

let loading: Promise<PastSeasons> | undefined;
/** The file, fetched once per page (a failure is forgotten, so a later switch tries again). */
export function loadPastSeasons(fetcher: (url: string) => Promise<PastSeasons> = (u) => fetch(u).then((r) => (r.ok ? (r.json() as Promise<PastSeasons>) : Promise.reject(new Error(`past seasons ${r.status}`))))): Promise<PastSeasons> {
  loading ??= fetcher(PAST_SEASONS_URL).catch((e: unknown) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
