// Builds tests/fixtures/cup-knockout-2025.json (round 6, A4): NBA Cup 2025 knockout games in the schedule feed's real
// format (scheduleLeagueV2), for the game-link tests. Last season's knockout games aren't in any data reachable from
// here, so each game is a real game object from the saved 2026-10-23 feed with its fields set as the feed sets them for
// knockout games: gameId 002… (quarterfinals, semifinals: regular-season games) or 006… (the final), gameSubtype
// "in-season-knockout", gameLabel "Emirates NBA Cup" + gameSubLabel, isNeutral + Las Vegas arena for the semifinals and
// final, every date/time field in the feed's own conventions (gameDateEst = the ET date at 00:00 with a misleading "Z",
// gameDateTimeEst = ET wall time with "Z", gameDateTimeUTC = real UTC). Round 7 (1.2): the ET dates, matchups, away/home
// sides and final scores were checked 2026-10-30 against hoopsjunkie.io's real game pages (each page names its first
// team "Away"); two had the sides swapped (NYK was away at TOR, and the designated away team vs ORL) and PHX scored
// 89, now fixed. Tip-off times and arena fields other than the cities are still illustrative.
// node tests/fixtures/make-cup-knockout-2025.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const feed = JSON.parse(readFileSync(new URL('./feed-2026-10-23.json', import.meta.url), 'utf8'));
const template = feed.leagueSchedule.gameDates.flatMap((d) => d.games).find((g) => g.gameId === '0022600015');
const team = (tri) => {
  for (const g of feed.leagueSchedule.gameDates.flatMap((d) => d.games)) for (const t of [g.homeTeam, g.awayTeam]) if (t.teamTricode === tri) return { ...t };
  throw new Error(tri);
};
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** etDate "2025-12-09", etTime "19:30" (December: EST = UTC−5). */
function game({ id, etDate, etTime, away, home, sub, neutral, arena, awayScore, homeScore }) {
  const [h, m] = etTime.split(':').map(Number);
  const utc = new Date(Date.UTC(+etDate.slice(0, 4), +etDate.slice(5, 7) - 1, +etDate.slice(8, 10), h + 5, m));
  const iso = (d) => d.toISOString().replace('.000Z', 'Z');
  const g = structuredClone(template);
  const A = { ...team(away), score: awayScore, wins: 0, losses: 0, seed: 0 };
  const H = { ...team(home), score: homeScore, wins: 0, losses: 0, seed: 0 };
  Object.assign(g, {
    gameId: id,
    gameCode: `${etDate.replaceAll('-', '')}/${away}${home}`,
    gameStatus: 3,
    gameStatusText: 'Final',
    gameSequence: 1,
    gameDateEst: `${etDate}T00:00:00Z`,
    gameTimeEst: `1900-01-01T${etTime}:00Z`,
    gameDateTimeEst: `${etDate}T${etTime}:00Z`,
    gameDateUTC: `${etDate}T05:00:00Z`,
    gameTimeUTC: `1900-01-01T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:00Z`,
    gameDateTimeUTC: iso(utc),
    awayTeamTime: `${etDate}T${etTime}:00Z`,
    homeTeamTime: `${etDate}T${etTime}:00Z`,
    day: DAYS[new Date(`${etDate}T12:00:00Z`).getUTCDay()],
    monthNum: 12,
    weekNumber: 8,
    weekName: 'Week 8',
    gameLabel: 'Emirates NBA Cup',
    gameSubLabel: sub,
    gameSubtype: 'in-season-knockout',
    isNeutral: neutral,
    arenaName: arena[0],
    arenaCity: arena[1],
    arenaState: arena[2],
    homeTeam: H,
    awayTeam: A,
    pointsLeaders: [],
  });
  g.broadcasters = { ...g.broadcasters, nationalBroadcasters: [] };
  return g;
}
const VEGAS = ['T-Mobile Arena', 'Las Vegas', 'NV'];
const games = [
  game({ id: '0022501201', etDate: '2025-12-09', etTime: '19:30', away: 'NYK', home: 'TOR', sub: 'Quarterfinal', neutral: false, arena: ['Scotiabank Arena', 'Toronto', 'ON'], awayScore: 117, homeScore: 101 }),
  game({ id: '0022501202', etDate: '2025-12-09', etTime: '20:00', away: 'MIA', home: 'ORL', sub: 'Quarterfinal', neutral: false, arena: ['Kia Center', 'Orlando', 'FL'], awayScore: 108, homeScore: 117 }),
  game({ id: '0022501203', etDate: '2025-12-10', etTime: '21:30', away: 'PHX', home: 'OKC', sub: 'Quarterfinal', neutral: false, arena: ['Paycom Center', 'Oklahoma City', 'OK'], awayScore: 89, homeScore: 138 }),
  // the late game: 11:30 pm ET on Dec 10 = 04:30 UTC on Dec 11 (and Dec 11 in São Paulo, 01:30)
  game({ id: '0022501204', etDate: '2025-12-10', etTime: '23:30', away: 'SAS', home: 'LAL', sub: 'Quarterfinal', neutral: false, arena: ['Crypto.com Arena', 'Los Angeles', 'CA'], awayScore: 132, homeScore: 119 }),
  game({ id: '0022501229', etDate: '2025-12-13', etTime: '17:30', away: 'NYK', home: 'ORL', sub: 'Semifinal', neutral: true, arena: VEGAS, awayScore: 132, homeScore: 120 }),
  // 9:00 pm ET Dec 13 = 02:00 UTC Dec 14
  game({ id: '0022501230', etDate: '2025-12-13', etTime: '21:00', away: 'SAS', home: 'OKC', sub: 'Semifinal', neutral: true, arena: VEGAS, awayScore: 111, homeScore: 109 }),
  // the final (006…: not a regular-season game); 8:30 pm ET Dec 16 = 01:30 UTC Dec 17
  game({ id: '0062500001', etDate: '2025-12-16', etTime: '20:30', away: 'SAS', home: 'NYK', sub: 'Championship', neutral: true, arena: VEGAS, awayScore: 113, homeScore: 124 }),
];
const byDate = new Map();
for (const g of games) byDate.set(g.gameDateEst.slice(0, 10), [...(byDate.get(g.gameDateEst.slice(0, 10)) ?? []), g]);
const out = {
  meta: { ...feed.meta, time: '2025-12-17T11:00:00.000Z' },
  leagueSchedule: {
    seasonYear: '2025-26',
    leagueId: '00',
    gameDates: [...byDate].map(([d, gs]) => ({ gameDate: `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)} 00:00:00`, games: gs })),
    weeks: [],
  },
};
writeFileSync(new URL('./cup-knockout-2025.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(games.map((g) => `${g.gameId} ${g.gameDateEst.slice(0, 10)} ${g.gameDateTimeUTC} ${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode} ${g.gameSubLabel}${g.isNeutral ? ' (neutral)' : ''}`).join('\n'));
