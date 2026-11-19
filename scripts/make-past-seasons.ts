// Builds public/data/past-seasons.json — the two regular seasons before this one, every game with its final score,
// for the season-series popup's ◀ season ▶ (CK-17). Source: ESPN's public team schedules
// (site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/<team>/schedule?season=<end year>&seasontype=2) less
// the Cup Championship (as the current season's series, src/data/series.ts), one
// request per team and season, every game kept once (by ESPN's event id). Finished seasons don't change: run once per
// new season. Usage: npx tsx scripts/make-past-seasons.ts

import { writeFileSync } from 'node:fs';

const OUT = 'public/data/past-seasons.json';
/** ESPN's abbreviation → the NBA tricode the app uses, where they differ. */
const TRI: Record<string, string> = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
const TEAMS = ['atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs', 'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'no', 'ny', 'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'utah', 'wsh'];
/** "2025-26" ← ESPN's season 2026 (the year it ends). */
const SEASONS = [2026, 2025];

type Competitor = { homeAway: 'home' | 'away'; team: { abbreviation: string }; score?: { value: number } };
type Event = { id: string; date: string; competitions: { competitors: Competitor[]; notes?: { headline?: string }[]; status: { type: { completed: boolean; detail: string } } }[] };

const etDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
const tri = (a: string) => TRI[a] ?? a;

const out: Record<string, [string, string, string, number, number, string?][]> = {};
for (const season of SEASONS) {
  const label = `${season - 1}-${String(season).slice(2)}`;
  const games = new Map<string, [string, string, string, number, number, string?]>();
  for (const team of TEAMS) {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team}/schedule?season=${season}&seasontype=2`);
    if (!r.ok) throw new Error(`${team} ${season}: HTTP ${r.status}`);
    const j = (await r.json()) as { events?: Event[] };
    for (const e of j.events ?? []) {
      const c = e.competitions[0]!;
      if (!c.status.type.completed || games.has(e.id)) continue;
      // the Cup Championship is in ESPN's regular season but not in the standings or a season series (NBA Cup 101)
      if (c.notes?.some((n) => /Cup Championship/i.test(n.headline ?? ''))) continue;
      const away = c.competitors.find((x) => x.homeAway === 'away')!;
      const home = c.competitors.find((x) => x.homeAway === 'home')!;
      if (away.score?.value == null || home.score?.value == null) continue;
      const ot = /OT/.exec(c.status.type.detail) ? c.status.type.detail.replace(/^Final\/?/, '') : undefined;
      games.set(e.id, [etDate(e.date), tri(away.team.abbreviation), tri(home.team.abbreviation), away.score.value, home.score.value, ...(ot ? [ot] : [])] as [string, string, string, number, number, string?]);
    }
  }
  out[label] = [...games.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
  console.log(label, out[label].length, 'games');
}
writeFileSync(OUT, JSON.stringify({ source: 'ESPN team schedules (site.api.espn.com), regular season', fetched: new Date().toISOString().slice(0, 10), seasons: out }) + '\n');
