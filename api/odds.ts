// Round 14 (item 4): GET /calendar/api/odds?date=YYYY-MM-DD → the moneyline odds of that ET date's games, decimal, keyed
// "AWAY@HOME" ({ date, games: { "PHI@DET": { away: 2.15, home: 1.74, provider: "DraftKings" } } }). A Vercel function so
// the browser makes one small same-origin request and the CDN caches it (src/data/odds.ts: oddsCacheSeconds); ESPN
// needs no key, so nothing secret lives here. Any failure answers 502 with no odds: the Slate then shows none.

import { dayOdds, espnDate, oddsCacheSeconds, type EspnEvent } from '../src/data/odds.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function GET(request: Request): Promise<Response> {
  const date = new URL(request.url).searchParams.get('date');
  const day = espnDate(date);
  if (!day) return Response.json({ error: 'date=YYYY-MM-DD' }, { status: 400 });
  try {
    const board = await json<{ events?: EspnEvent[] }>(`${BASE}/scoreboard?dates=${day}`);
    const odds = await dayOdds(date!, board, (id) => json(`${BASE}/summary?event=${encodeURIComponent(id)}`));
    const age = oddsCacheSeconds(board.events);
    return Response.json(odds, { headers: { 'cache-control': `public, max-age=60, s-maxage=${age}, stale-while-revalidate=${age}` } });
  } catch (e) {
    return Response.json({ date, games: {}, error: String(e) }, { status: 502, headers: { 'cache-control': 'public, max-age=60, s-maxage=60' } });
  }
}
