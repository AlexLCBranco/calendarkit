// Builds public/data/history/ (CK-24): every finished NBA season's final standings (East and West, the Main columns),
// its play-in (2020-21 on) and its playoff bracket with every game's score, plus index.json (champions and conference
// winners by season). Free sources only: ESPN's public standings and team schedules (site.api.espn.com); the bracket
// is checked as it is built (15 series, 8-4-2-1 by round, every winner with the wins its round needs, first-round seeds
// adding up to 9), and a season failing a check stops the run. Finished seasons don't change: run once per new season.
// Usage: npx tsx scripts/make-nba-history.ts [first end year] [last end year]

import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/data/history';
/** The first season kept (2001-02): ESPN has standings from 1984-85, but before 2001-02 its playoff games have gaps and
 * misfiled games (a 1990 Finals with four games, the All-Star game among the playoffs), so the checks fail there. */
export const FIRST = 2002;
const [first = FIRST, last = 2026] = process.argv.slice(2).map(Number);

/** ESPN's abbreviation → the NBA tricode, where they differ (current teams). */
const TRI: Record<string, string> = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
const tri = (a: string) => TRI[a] ?? a;

type Stat = { name: string; displayValue: string; value?: number };
type Entry = { team: { id: string; abbreviation: string; displayName: string }; stats: Stat[] };
type Competitor = { homeAway: 'home' | 'away'; team: { id: string; abbreviation: string }; score?: { value: number; displayValue: string } };
type Event = { id: string; date: string; competitions: { competitors: Competitor[]; notes?: { headline?: string }[]; status: { type: { completed: boolean; detail: string } } }[] };

async function get<T>(url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return (await r.json()) as T;
    if (i === 3) throw new Error(`${url}: HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
}

const etDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));

/** A team's games of one season type (3 playoffs, 5 play-in). For older seasons ESPN's `season=` is a year off (its
 * 1990 is the 1991 playoffs), so the answer is checked against the season's end year and asked again one lower. */
async function teamGames(espnId: string, year: number, type: 3 | 5): Promise<Event[]> {
  const url = (s: number) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule?season=${s}&seasontype=${type}`;
  const inYear = (evs: Event[]) => evs.filter((e) => etDate(e.date).startsWith(String(year)));
  const a = (await get<{ events?: Event[] }>(url(year))).events ?? [];
  if (!a.length || inYear(a).length === a.length) return a;
  const b = (await get<{ events?: Event[] }>(url(year - 1))).events ?? [];
  return inYear(b);
}

export interface Row { t: string; seed: number; w: number; l: number; pct: number; gb: number; home: string; road: string; conf: string; l10?: string; streak?: string; diff: number; clincher?: string }
export interface Game { id: string; date: string; away: string; home: string; as: number; hs: number; ot?: string; note?: string }
export interface Series { round: 1 | 2 | 3 | 4; conf?: 'East' | 'West'; a: string; b: string; aSeed: number; bSeed: number; winner: string; wins: [number, number]; games: Game[] }

const stat = (e: Entry, name: string) => e.stats.find((s) => s.name === name);
const num = (e: Entry, name: string) => Number(stat(e, name)?.value ?? stat(e, name)?.displayValue ?? 0);
const str = (e: Entry, name: string) => stat(e, name)?.displayValue;

const index: { year: number; label: string; champion: string; runnerUp: string; finals: [number, number]; east: string; west: string }[] = [];
const failed: string[] = [];
for (let year = first; year <= last; year++) {
  try {
  const label = `${year - 1}-${String(year).slice(2)}`;
  const st = await get<{ children?: { name: string; standings: { entries: Entry[] } }[] }>(`https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${year}&level=2`);
  const teams: Record<string, { name: string; espn: string }> = {};
  const standings: Record<'East' | 'West', Row[]> = { East: [], West: [] };
  for (const c of st.children ?? []) {
    const conf = /East/.test(c.name) ? 'East' : 'West';
    for (const e of c.standings.entries) {
      const t = tri(e.team.abbreviation);
      teams[t] = { name: e.team.displayName, espn: e.team.id };
      const gp = num(e, 'wins') + num(e, 'losses');
      standings[conf].push({
        t,
        seed: num(e, 'playoffSeed'),
        w: num(e, 'wins'),
        l: num(e, 'losses'),
        pct: num(e, 'winPercent'),
        gb: Number(str(e, 'gamesBehind')?.replace('-', '0') ?? 0) || 0,
        home: str(e, 'Home') ?? '',
        road: str(e, 'Road') ?? '',
        conf: str(e, 'vs. Conf.') ?? '',
        l10: str(e, 'Last Ten Games'),
        streak: str(e, 'streak'),
        diff: gp ? Math.round((num(e, 'pointDifferential') / gp) * 10) / 10 : 0,
        clincher: str(e, 'clincher') || undefined,
      });
    }
  }
  for (const conf of ['East', 'West'] as const) standings[conf].sort((x, y) => x.seed - y.seed);
  if (standings.East.length < 10 || standings.West.length < 10) throw new Error(`${label}: standings missing (${standings.East.length} East, ${standings.West.length} West)`);
  // the playoff seeds: the standings' (before the play-in), with 7 and 8 from the play-in from 2020-21 on
  const seeds = new Map([...standings.East, ...standings.West].map((r) => [r.t, r.seed]));
  const seedOf = (t: string) => seeds.get(t) ?? 0;
  const confOf = (t: string) => (standings.East.some((r) => r.t === t) ? 'East' : 'West');

  const toGame = (e: Event): Game | undefined => {
    const c = e.competitions[0]!;
    if (!c.status.type.completed) return undefined;
    const away = c.competitors.find((x) => x.homeAway === 'away')!;
    const home = c.competitors.find((x) => x.homeAway === 'home')!;
    if (away.score?.value == null || home.score?.value == null) return undefined;
    const ot = /OT/.test(c.status.type.detail) ? c.status.type.detail.replace(/^Final\/?/, '') : undefined;
    const note = c.notes?.[0]?.headline;
    return { id: e.id, date: etDate(e.date), away: tri(away.team.abbreviation), home: tri(home.team.abbreviation), as: away.score.value, hs: home.score.value, ...(ot ? { ot } : {}), ...(note ? { note } : {}) };
  };

  // play-in (2020-21 on): seeds 7-10 of each conference
  const playIn: Game[] = [];
  if (year >= 2021) {
    const seen = new Set<string>();
    for (const conf of ['East', 'West'] as const)
      for (const r of standings[conf].filter((x) => x.seed >= 7 && x.seed <= 10))
        for (const e of await teamGames(teams[r.t]!.espn, year, 5)) {
          const g = toGame(e);
          if (!g || seen.has(g.id)) continue;
          seen.add(g.id);
          playIn.push(g);
        }
    playIn.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
    if (playIn.length !== 6) throw new Error(`${label}: ${playIn.length} play-in games (6 expected)`);
    // per conference: 7 v 8 (its winner is the 7th seed), 9 v 10, then 7v8's loser v 9v10's winner (the 8th seed)
    const won = (g: Game) => (g.as > g.hs ? g.away : g.home);
    const lost = (g: Game) => (g.as > g.hs ? g.home : g.away);
    // ESPN's seeds 7-10 can already be the ones after the play-in, so its three games are told apart by how they link:
    // the last one is 7v8's loser against 9v10's winner
    for (const conf of ['East', 'West'] as const) {
      const four = new Set(standings[conf].filter((x) => x.seed >= 7 && x.seed <= 10).map((x) => x.t));
      const gs = playIn.filter((g) => four.has(g.away) && four.has(g.home));
      if (gs.length !== 3) throw new Error(`${label}: ${conf}: ${gs.length} play-in games (3 expected)`);
      const c = gs[2]!;
      const inC = (t: string) => t === c.away || t === c.home;
      const a = gs.slice(0, 2).find((g) => inC(lost(g)));
      const b2 = gs.slice(0, 2).find((g) => g !== a && inC(won(g)));
      if (!a || !b2) throw new Error(`${label}: ${conf} play-in games don't link up`);
      for (const t of four) seeds.set(t, 0);
      seeds.set(won(a), 7);
      seeds.set(won(c), 8);
    }
  }

  // playoffs: every team with a playoff seed
  const games = new Map<string, Game>();
  for (const conf of ['East', 'West'] as const)
    for (const r of standings[conf].filter((x) => seedOf(x.t) >= 1 && seedOf(x.t) <= 8))
      for (const e of await teamGames(teams[r.t]!.espn, year, 3)) {
        const g = toGame(e);
        if (g) games.set(g.id, g);
      }
  // series: games between the same two teams; a team's series in date order are its rounds
  const byPair = new Map<string, Game[]>();
  for (const g of [...games.values()].sort((x, y) => x.date.localeCompare(y.date))) {
    const k = [g.away, g.home].sort().join('|');
    byPair.set(k, [...(byPair.get(k) ?? []), g]);
  }
  const roundOf = new Map<string, number>();
  const teamSeries = new Map<string, string[]>();
  for (const [k] of [...byPair].sort((x, y) => x[1][0]!.date.localeCompare(y[1][0]!.date)))
    for (const t of k.split('|')) teamSeries.set(t, [...(teamSeries.get(t) ?? []), k]);
  for (const [k] of byPair) {
    const [a, b] = k.split('|') as [string, string];
    const ra = teamSeries.get(a)!.indexOf(k) + 1;
    const rb = teamSeries.get(b)!.indexOf(k) + 1;
    if (ra !== rb) throw new Error(`${label}: ${a}-${b} is round ${ra} for ${a}, ${rb} for ${b}`);
    roundOf.set(k, ra);
  }
  // ESPN's older seeds are sometimes wrong or missing (1984-85: Utah has none, San Antonio is 7th): each conference's
  // eight playoff teams are its first-round teams, and a first-round pair's seeds add up to 9
  for (const conf of ['East', 'West'] as const) {
    const pairs = [...byPair.keys()].filter((k) => roundOf.get(k) === 1 && confOf(k.split('|')[0]!) === conf).map((k) => k.split('|') as [string, string]);
    const inR1 = new Set(pairs.flat());
    for (const r of standings[conf]) if (!inR1.has(r.t)) seeds.set(r.t, 0);
    const ok = (t: string) => seedOf(t) >= 1 && seedOf(t) <= 8 && [...inR1].filter((u) => seedOf(u) === seedOf(t)).length === 1;
    // a team without a seed, a seed two teams have, and both sides of a pair whose seeds don't add up to 9 start over
    const bad = [...inR1].filter((t) => !ok(t));
    for (const [x, y] of pairs) if (ok(x) && ok(y) && seedOf(x) + seedOf(y) !== 9) bad.push(x, y);
    for (const t of bad) seeds.set(t, 0);
    for (let pass = 0; pass < 4; pass++)
      for (const [x, y] of pairs) {
        if (seedOf(x) && !seedOf(y)) seeds.set(y, 9 - seedOf(x));
        else if (seedOf(y) && !seedOf(x)) seeds.set(x, 9 - seedOf(y));
      }
    // a pair with neither seed known: the team at home in game 1 (home court) takes the higher of the two seeds left that add up to 9
    for (const [x, y] of pairs) {
      if (seedOf(x) || seedOf(y)) continue;
      const free = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => ![...inR1].some((t) => seedOf(t) === n));
      const hi = free.find((n) => free.includes(9 - n) && n < 9 - n);
      if (hi === undefined) continue;
      const host = byPair.get([x, y].sort().join('|'))![0]!.home;
      seeds.set(host, hi);
      seeds.set(host === x ? y : x, 9 - hi);
    }
    const left = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => ![...inR1].some((t) => seedOf(t) === n));
    const unseeded = [...inR1].filter((t) => !seedOf(t));
    if (left.length || unseeded.length) throw new Error(`${label}: ${conf} seeds not worked out (left ${left.join()}, unseeded ${unseeded.join()})`);
    // the table's seed column: the playoff seed (before 2020-21; from then on ESPN's place in the standings, 1-15)
    if (year < 2021) for (const r of standings[conf]) r.seed = seedOf(r.t);
  }
  for (const conf of ['East', 'West'] as const) standings[conf].sort((x, y) => (x.seed || 99) - (y.seed || 99) || y.pct - x.pct || y.w - x.w);
  const need = (round: number) => (round === 1 && year <= 2002 ? 3 : 4);
  const series: Series[] = [...byPair].map(([k, gs]) => {
    const [x, y] = k.split('|') as [string, string];
    const round = roundOf.get(k)! as Series['round'];
    // a = the higher seed (home court), b = the other
    const [a, b] = seedOf(x) <= seedOf(y) ? [x, y] : [y, x];
    const won = (t: string) => gs.filter((g) => (g.away === t ? g.as > g.hs : g.home === t && g.hs > g.as)).length;
    const wins: [number, number] = [won(a), won(b)];
    const winner = wins[0] > wins[1] ? a : b;
    if (Math.max(...wins) !== need(round)) throw new Error(`${label}: ${a}-${b} round ${round}: ${wins.join('-')} (${need(round)} wins needed)`);
    return { round, ...(round < 4 ? { conf: confOf(a) } : {}), a, b, aSeed: seedOf(a), bSeed: seedOf(b), winner, wins, games: gs };
  });
  series.sort((p, q) => p.round - q.round || (p.conf ?? '').localeCompare(q.conf ?? '') || p.aSeed - q.aSeed);
  const per = [1, 2, 3, 4].map((r) => series.filter((s) => s.round === r).length);
  if (per.join() !== '8,4,2,1') throw new Error(`${label}: series per round ${per.join()}`);
  for (const s of series.filter((x) => x.round === 1)) if (s.aSeed + s.bSeed !== 9) throw new Error(`${label}: first round ${s.a} (${s.aSeed}) v ${s.b} (${s.bSeed})`);
  const finals = series.find((s) => s.round === 4)!;
  const confWinner = (c: 'East' | 'West') => series.find((s) => s.round === 3 && s.conf === c)!.winner;
  const champion = finals.winner;
  const runnerUp = champion === finals.a ? finals.b : finals.a;
  index.push({ year, label, champion, runnerUp, finals: champion === finals.a ? finals.wins : [finals.wins[1], finals.wins[0]], east: confWinner('East'), west: confWinner('West') });

  mkdirSync(OUT, { recursive: true });
  const names = Object.fromEntries(Object.entries(teams).map(([t, v]) => [t, v.name]));
  writeFileSync(`${OUT}/${year}.json`, `${JSON.stringify({ year, label, names, standings, playIn, series })}\n`);
  console.log(`${label}: ${champion} over ${runnerUp} ${index.at(-1)!.finals.join('-')}; ${games.size} playoff games, ${playIn.length} play-in`);
  } catch (e) {
    // CHECK=1: report every season that fails its checks, then stop (to find where the data is complete)
    if (!process.env.CHECK) throw e;
    failed.push((e as Error).message);
    console.log(`FAILED ${(e as Error).message}`);
  }
}
if (failed.length) throw new Error(`${failed.length} seasons failed`);
if (first === FIRST) writeFileSync(`${OUT}/index.json`, `${JSON.stringify({ seasons: index.sort((a, b) => b.year - a.year) }, null, 0)}\n`);
