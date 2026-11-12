// Team names and cities from the raw NBA feed saved in tests/fixtures (independent of the app's code). The served
// snapshot keeps only the fields the app reads (scripts/slim-schedule.ts), and names aren't among them.

import { readFileSync } from 'node:fs';

type RawTeam = { teamId: number; teamTricode: string; teamName: string; teamCity: string };
const raw = JSON.parse(readFileSync('tests/fixtures/feed-2026-10-23.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { homeTeam: RawTeam; awayTeam: RawTeam }[] }[] } };

/** teamId → tricode, name ("Celtics") and city ("Boston"), for all 30 teams. */
export const FEED_TEAMS: Record<number, { id: number; tri: string; name: string; city: string }> = {};
for (const d of raw.leagueSchedule.gameDates)
  for (const g of d.games) for (const t of [g.homeTeam, g.awayTeam]) if (t.teamId) FEED_TEAMS[t.teamId] = { id: t.teamId, tri: t.teamTricode, name: t.teamName, city: t.teamCity };
