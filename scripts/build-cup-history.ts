// Round 21 (item 9): builds src/data/cupHistory.json — every finished NBA Cup (2023-24 on), as it happened, from the
// NBA's own data: the final group standings (stats.nba.com iststandings: ranks, records, differentials, points, wild
// cards, knockout seeds, each team's group games) and that season's schedule (stats.nba.com scheduleleaguev2: scores,
// knockout games and their arenas). Past editions never change, so the file is committed and the app never fetches
// them. Nothing is computed with today's rules (tiebreaker 4, for one, used a different "previous season" each year).
// Usage: npx tsx scripts/build-cup-history.ts [season …]   (default: 2023-24 2024-25 2025-26)

import { writeFileSync } from 'node:fs';
import { DEFAULT_HEADERS } from '../src/shared/nba-schedule/node';

const H = { ...DEFAULT_HEADERS, Origin: 'https://www.nba.com', Accept: 'application/json, text/plain, */*', 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true' };
const seasons = process.argv.slice(2).length ? process.argv.slice(2) : ['2023-24', '2024-25', '2025-26'];

type RawTeam = { teamId: number; teamAbbreviation: string; conference: string; istGroup: string; istGroupRank: number; wins: number; losses: number; diff: number; pts: number; oppPts: number; clinchedIstGroup: number; clinchedIstWildcard: number; istKnockoutRank: number | null; games: { gameId: string; opponentTeamAbbreviation: string; location: 'H' | 'A'; gameStatus: number; outcome: 'W' | 'L' }[] };
type RawGame = { gameId: string; gameDateEst: string; gameStatusText: string; gameSubtype: string; gameSubLabel: string; arenaName: string; arenaCity: string; homeTeam: { teamId: number; teamTricode: string; score: number }; awayTeam: { teamId: number; teamTricode: string; score: number } };

const get = async (url: string) => {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

const out = [];
for (const season of seasons) {
  const standingsUrl = `https://stats.nba.com/stats/iststandings?LeagueID=00&Season=${season}&Section=group`;
  const scheduleUrl = `https://stats.nba.com/stats/scheduleleaguev2?Season=${season}&LeagueID=00`;
  const st = (await get(standingsUrl)) as { teams: RawTeam[] };
  const sc = (await get(scheduleUrl)) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
  const games = new Map(sc.leagueSchedule.gameDates.flatMap((d) => d.games).map((g) => [g.gameId, g]));
  const cup = [...games.values()].filter((g) => g.gameSubtype === 'in-season' || g.gameSubtype === 'in-season-knockout' || /^006/.test(g.gameId));
  if (st.teams.length !== 30) throw new Error(`${season}: ${st.teams.length} teams in the standings`);
  const teams = st.teams.map((t) => ({
    teamId: t.teamId,
    tricode: t.teamAbbreviation,
    conference: t.conference,
    group: t.istGroup,
    groupRank: t.istGroupRank,
    w: t.wins,
    l: t.losses,
    diff: t.diff,
    points: t.pts,
    groupWinner: t.clinchedIstGroup === 1,
    wildCard: t.clinchedIstWildcard === 1,
    seed: t.istKnockoutRank ?? undefined,
    games: t.games.map((x) => {
      const g = games.get(x.gameId);
      const home = x.location === 'H';
      const me = g && (home ? g.homeTeam : g.awayTeam);
      const opp = g && (home ? g.awayTeam : g.homeTeam);
      return { gameId: x.gameId, opponent: x.opponentTeamAbbreviation, home, win: x.outcome === 'W', date: g?.gameDateEst.slice(0, 10), score: me?.score, oppScore: opp?.score, status: g?.gameStatusText.trim() };
    }),
  }));
  const knockout = cup
    .filter((g) => g.gameSubtype !== 'in-season')
    .map((g) => ({
      gameId: g.gameId,
      round: /^006/.test(g.gameId) || /championship/i.test(g.gameSubLabel) ? 'final' : /semi/i.test(g.gameSubLabel) ? 'sf' : 'qf',
      conference: /east/i.test(g.gameSubLabel) ? 'East' : /west/i.test(g.gameSubLabel) ? 'West' : undefined,
      date: g.gameDateEst.slice(0, 10),
      arena: g.arenaName,
      city: g.arenaCity,
      status: g.gameStatusText.trim(),
      home: { teamId: g.homeTeam.teamId, tricode: g.homeTeam.teamTricode, score: g.homeTeam.score },
      away: { teamId: g.awayTeam.teamId, tricode: g.awayTeam.teamTricode, score: g.awayTeam.score },
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
  out.push({ season, year: Number(season.slice(0, 4)), sources: [standingsUrl, scheduleUrl], fetched: new Date().toISOString().slice(0, 10), teams, knockout, groupDates: [...new Set(cup.filter((g) => g.gameSubtype === 'in-season').map((g) => g.gameDateEst.slice(0, 10)))].sort() });
  console.log(season, teams.length, 'teams,', knockout.length, 'knockout games');
}
writeFileSync('src/data/cupHistory.json', `${JSON.stringify({ note: 'Built by scripts/build-cup-history.ts from the NBA (stats.nba.com); do not edit by hand.', seasons: out }, null, 1)}\n`);
