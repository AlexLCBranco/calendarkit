// Daily (CK-19): public/data/ratings.json — each team's regular-season games played, possessions and points so far,
// for Standings' Ratings set (ORtg, DRtg, Net; src/data/ratings.ts). Source: ESPN's public team statistics
// (sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/<end year>/types/2/teams/<espn id>/statistics),
// one request per team; free, no key. NBA.com's own stats site turns away scripts (bot detection), so it isn't used.
// Points allowed come from the schedule the app already has (the same games, counted up to ESPN's games played).
// Writes nothing when any team is missing (the previous file stays). Usage: npx tsx scripts/update-ratings.ts [outFile]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseRatingsStats, type RatingsFile } from '../src/data/ratings';

const out = process.argv[2] ?? join(import.meta.dirname, '..', 'public', 'data', 'ratings.json');
const schedule = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'public', 'data', 'schedule.json'), 'utf8')) as { leagueSchedule: { seasonYear: string } };
/** "2026-27" → ESPN's season 2027 (the year it ends). */
const espnSeason = Number(schedule.leagueSchedule.seasonYear.slice(0, 4)) + 1;
/** ESPN's abbreviation → the NBA tricode the app uses, where they differ (as scripts/make-past-seasons.ts). */
const TRI: Record<string, string> = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };

const get = async (url: string): Promise<unknown> => {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (i >= 2) throw new Error(`${url}: HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
};

type TeamList = { sports: { leagues: { teams: { team: { id: string; abbreviation: string } }[] }[] }[] };
const list = (await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams')) as TeamList;
const espnTeams = list.sports[0]!.leagues[0]!.teams.map((t) => t.team);
if (espnTeams.length !== 30) throw new Error(`ESPN lists ${espnTeams.length} teams, not 30`);

const teams: RatingsFile['teams'] = {};
for (const t of espnTeams) {
  const stats = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${espnSeason}/types/2/teams/${t.id}/statistics`);
  teams[TRI[t.abbreviation] ?? t.abbreviation] = parseRatingsStats(stats);
}

const file: RatingsFile = { source: 'ESPN team statistics (sports.core.api.espn.com), regular season', season: schedule.leagueSchedule.seasonYear, teams };
const text = JSON.stringify(file) + '\n';
const before = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
if (before === text) console.log(`unchanged: ${out}`);
else {
  writeFileSync(out, text);
  console.log(`saved ${out}: ${Object.keys(teams).length} teams, season ${file.season}`);
}
