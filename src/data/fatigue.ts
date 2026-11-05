// Schedule fatigue for every team in every game, for the league views (week view and League List): back-to-back
// nights (with the plane on a change of metro), 3-in-4 positions and a tooltip per team. Same rules as the team views
// (teamB2BPairs, teamThreeInFour, leagueRecords); computed once per data set, never per render or scroll.

import { leagueRecords, sideLabel, teamB2BPairs, type B2BPair, type CalendarData } from './model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { mergedChip, mergedDays, mergedTip, teamThreeInFour, type ThreeInFour } from './scheduleTags';
import { TEAM_BY_ID } from './teams';

export interface TeamFatigue {
  /** The back-to-back nights this game is for the team (usually none or one; 3 days in a row make it both). */
  nights: (1 | 2)[];
  /** The pairs those nights belong to. */
  pairs: B2BPair[];
  /** The team changes metro between the two nights of one of those pairs. */
  travels: boolean;
  tif?: ThreeInFour;
  /** Tooltip: leg and code, both games with dates and opponents, travel, the merged 3-in-4 stretch, record going in. */
  tip: string;
  /** The tooltip's day strip for the 3-in-4 stretch (mergedDays: "YYYY-MM-DD:g|r|t …"), when there is one. */
  days?: string;
}

/** The team has something to show in this game: a back-to-back night or a 3-in-4 set (the Fatigue component isn't empty). */
export const hasFatigue = (f?: TeamFatigue) => !!f && (f.nights.length > 0 || !!f.tif);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const where = (g: B2BPair['first'], teamId: number) => (g.homeTeam.teamId === teamId ? 'home' : 'away');

/**
 * v1.40.1: leagueFatigue is lazy. Up to v1.40.0 it worked out all 30 teams' season, records and ~2 500 tooltips the
 * first time any league view rendered — on the load path of the week view, whose first render went from ~270 to ~330 ms
 * on the Windows PC at 71de8aa (v1.16.0, round 5's Fatigue component, which made the week view read it). Now a team's
 * back-to-backs and 3-in-4 sets are worked out when one of its games is first asked for, the season records only when
 * a tooltip is first read, and each tooltip text and day strip on first read. Same values (tests/fatigue-lazy.test.ts).
 */
function lazyTexts(base: Omit<TeamFatigue, 'tip' | 'days'>, tip: () => string, days: () => string | undefined): TeamFatigue {
  let t: string | undefined;
  let d: { v: string | undefined } | undefined;
  return Object.defineProperties(base as TeamFatigue, {
    tip: { enumerable: true, get: () => (t ??= tip()) },
    days: { enumerable: true, get: () => (d ??= { v: days() }).v },
  });
}

/** One team's fatigue in each of its games (gameId → TeamFatigue). */
function teamFatigue(data: CalendarData, teamId: number, records: () => ReturnType<typeof leagueRecords>): Map<string, TeamFatigue> {
  const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
  const pairsByGame = new Map<string, { pair: B2BPair; night: 1 | 2 }[]>();
  for (const pair of teamB2BPairs(data, teamId)) {
    for (const [g, night] of [[pair.first, 1], [pair.second, 2]] as const) pairsByGame.set(g.gameId, [...(pairsByGame.get(g.gameId) ?? []), { pair, night }]);
  }
  const tifs = teamThreeInFour(data, teamId);
  const out = new Map<string, TeamFatigue>();
  for (const g of data.games) {
    if (g.homeTeam.teamId !== teamId && g.awayTeam.teamId !== teamId) continue;
    const legs = pairsByGame.get(g.gameId) ?? [];
    const tif = tifs.get(g.gameId);
    const tip = () => {
      const rec = records().get(g.gameId)?.get(teamId);
      const lines = legs.flatMap(({ pair, night }) => [
        `${tri} — ${night}/2 · ${pair.code} (${night === 1 ? '1st' : '2nd'} night of a back-to-back)`,
        `${md(pair.first.dateEt)} ${sideLabel(pair.first, teamId)} (${where(pair.first, teamId)}) → ${md(pair.second.dateEt)} ${sideLabel(pair.second, teamId)} (${where(pair.second, teamId)})`,
        ...(pair.travels ? [`Travels ${pair.fromCity} → ${pair.toCity}`] : []),
      ]);
      if (!legs.length) lines.push(`${tri} — ${tif ? mergedChip(tif.merged) : 'rested'}`);
      // round 6: overlapping 3-in-4 sets as one stretch (was a line per set); the tooltip draws its days under the text
      if (tif) lines.push(`${mergedChip(tif.merged)}: ${mergedTip(tif.merged)}`);
      if (rec) lines.push(`Record going in: ${rec.wins}-${rec.losses}`);
      return lines.join('\n');
    };
    out.set(g.gameId, lazyTexts({ nights: legs.map((l) => l.night), pairs: legs.map((l) => l.pair), travels: legs.some((l) => l.pair.travels), tif }, tip, () => tif && mergedDays(tif.merged)));
  }
  return out;
}

/**
 * gameId → teamId → fatigue, filled on demand: `get` works out only that game's two teams (once each); any other read
 * (size, iteration, has) fills every game first, so the map always looks complete. Inner maps list the teams in
 * `data.teamDates` order, as before.
 */
class LazyLeagueFatigue extends Map<string, Map<number, TeamFatigue>> {
  #teams = new Map<number, Map<string, TeamFatigue>>();
  #games = new Map<string, ScheduleGame>();
  #order = new Map<number, number>();
  #all = false;
  #records?: ReturnType<typeof leagueRecords>;
  constructor(private readonly data: CalendarData) {
    super();
    for (const g of data.games) this.#games.set(g.gameId, g);
    [...data.teamDates.keys()].forEach((id, i) => this.#order.set(id, i));
  }
  #team(id: number) {
    let t = this.#teams.get(id);
    if (!t) this.#teams.set(id, (t = teamFatigue(this.data, id, () => (this.#records ??= leagueRecords(this.data)))));
    return t;
  }
  #fill(gameId: string): Map<number, TeamFatigue> | undefined {
    const hit = super.get(gameId);
    if (hit) return hit;
    const g = this.#games.get(gameId);
    if (!g) return undefined;
    const ids = [g.homeTeam.teamId, g.awayTeam.teamId].filter((id) => this.#order.has(id)).sort((a, b) => this.#order.get(a)! - this.#order.get(b)!);
    const m = new Map<number, TeamFatigue>();
    for (const id of ids) {
      const f = this.#team(id).get(gameId);
      if (f) m.set(id, f);
    }
    if (!m.size) return undefined;
    super.set(gameId, m);
    return m;
  }
  #fillAll() {
    if (this.#all) return;
    this.#all = true;
    // the order the eager version built: by team (teamDates order), each team's games in data order
    const ids = new Set<string>();
    for (const id of this.#order.keys()) for (const gameId of this.#team(id).keys()) ids.add(gameId);
    const filled = new Map([...ids].map((gameId) => [gameId, this.#fill(gameId)!] as const));
    super.clear();
    for (const [k, v] of filled) super.set(k, v);
  }
  override get(gameId: string) {
    return this.#fill(gameId);
  }
  override has(gameId: string) {
    return !!this.#fill(gameId);
  }
  override get size() {
    this.#fillAll();
    return super.size;
  }
  override keys() {
    this.#fillAll();
    return super.keys();
  }
  override values() {
    this.#fillAll();
    return super.values();
  }
  override entries() {
    this.#fillAll();
    return super.entries();
  }
  override [Symbol.iterator]() {
    return this.entries();
  }
  override forEach(cb: (v: Map<number, TeamFatigue>, k: string, m: Map<string, Map<number, TeamFatigue>>) => void, thisArg?: unknown) {
    this.#fillAll();
    super.forEach(cb, thisArg);
  }
}

const cache = new WeakMap<CalendarData, Map<string, Map<number, TeamFatigue>>>();

/** gameId → teamId → that team's fatigue in the game (every game, both teams, "rested" ones too). */
export function leagueFatigue(data: CalendarData): Map<string, Map<number, TeamFatigue>> {
  const hit = cache.get(data);
  if (hit) return hit;
  const out = new LazyLeagueFatigue(data);
  cache.set(data, out);
  return out;
}
