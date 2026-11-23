// A finished NBA Cup (src/data/cupHistory.json, built from the NBA's own data by scripts/build-cup-history.ts), shaped
// for CK-43's pages: the final group tables and wild-card race as Cup › Groups shows them, and each knockout game's
// details for the bracket (how each team got there, its seed, its record going in, rest and travel). Nothing here is
// recomputed with today's rules: places, wild cards, seeds and the race order are the NBA's own (istGroupRank,
// clinchedIstWildcard, istKnockoutRank, istWildcardRank).

import history from './cupHistory.json';
import { ARENAS, type Arena } from './arenas';
import { homeArena, miles, zoneOf } from './geo';
import { overtimeOf, type CalendarData } from './model';

export type Season = (typeof history.seasons)[number];
export type HTeam = Season['teams'][number];
export type Ko = Season['knockout'][number];
export type KoSide = Ko['home'];

export const SEASONS: readonly Season[] = history.seasons;
export const seasonOf = (year: number | undefined) => SEASONS.find((s) => s.year === year);
export const cupName = (s: Season) => (s.year === 2023 ? 'In-Season Tournament' : 'NBA Cup');

const GROUP_ORDER = ['West Group A', 'West Group B', 'West Group C', 'East Group A', 'East Group B', 'East Group C'];

/** The six final group tables, West A/B/C then East A/B/C, each in the NBA's final order. */
export function pastGroups(s: Season) {
  return GROUP_ORDER.map((group) => ({
    group,
    short: group.replace(' Group ', ' ').toUpperCase(),
    teams: s.teams
      .filter((t) => t.group === group)
      .sort((a, b) => a.groupRank - b.groupRank)
      .map((t) => ({ ...t, rank: t.groupRank, status: t.groupWinner ? ('leader' as const) : t.wildCard ? ('wild-card' as const) : undefined })),
  }));
}

/** The final wild-card race per conference: its three 2nd-place teams (the wild card first), then the two best of the rest — in the NBA's wild-card order. */
export function pastRaces(s: Season) {
  return (['West', 'East'] as const).map((conference) => {
    const conf = s.teams.filter((t) => t.conference === conference).sort((a, b) => (a.wildCardRank ?? 99) - (b.wildCardRank ?? 99));
    const line = (t: HTeam) => ({ teamId: t.teamId, tricode: t.tricode, w: t.w, l: t.l, diff: t.diff, group: t.group, rank: t.groupRank });
    const seconds = conf.filter((t) => t.groupRank === 2).sort((a, b) => Number(b.wildCard) - Number(a.wildCard));
    return { conference, teams: seconds.map(line), chasing: conf.filter((t) => t.groupRank > 2).slice(0, 2).map(line) };
  });
}

/**
 * Arenas under an earlier name: the same building as a table entry (its coordinates). Footprint Center is Phoenix's
 * arena (wikidata Q1538690, the table's Mortgage Matchup Center) under its 2021–2025 name.
 */
const FORMER_NAMES: Readonly<Record<string, string>> = { 'Footprint Center|Phoenix': 'Mortgage Matchup Center' };
const norm = (s: string) => s.trim().toLowerCase();

/** A stored arena's map entry (name and city as the NBA's schedule had them that season); undefined when not known. */
export function pastArena(arena: string | undefined, city: string | undefined): Arena | undefined {
  if (!arena || !city) return undefined;
  const name = FORMER_NAMES[`${arena}|${city}`] ?? arena;
  return ARENAS.find((a) => norm(a.arena) === norm(name) && norm(a.city) === norm(city));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * The game's host: the home team when the game is in its own home arena (today's home arena, matched as a building so
 * an earlier name counts: FORMER_NAMES), else none — a neutral court.
 */
export function pastHost(data: CalendarData, k: Ko): number | undefined {
  const at = pastArena(k.arena, k.city);
  const own = homeArena(data, k.home.teamId);
  return at && own && at === own ? k.home.teamId : undefined;
}

export interface PastPrep {
  /** "2d rest · ✈ 1,140 mi, ET→CT" (the current Cup's line); rest alone when the trip can't be worked out. */
  text: string;
  tip: string;
  rest: number;
  travel?: { miles: number; from?: string; to?: string };
}

/** A knockout team's rest and travel before the game: from its previous game (date, arena) in that season's schedule. */
export function pastPrep(data: CalendarData, k: Ko, side: KoSide): PastPrep | undefined {
  const p = side.prev;
  if (!p) return undefined;
  const rest = daysBetween(p.date, k.date) - 1;
  const atHome = pastHost(data, k) === side.teamId;
  const from = pastArena(p.arena, p.city);
  const to = pastArena(k.arena, k.city);
  const travel = !atHome && from && to ? { miles: Math.round(miles(from, to)), from: zoneOf(from), to: zoneOf(to) } : undefined;
  const travelText = travel && travel.miles >= 1 ? ` · ✈ ${travel.miles.toLocaleString('en-US')} mi${travel.from && travel.to && travel.from !== travel.to ? `, ${travel.from}→${travel.to}` : ''}` : '';
  const tip = `${side.tricode}: last played ${p.date} (${p.home ? 'vs' : '@'} ${p.opponent}, ${p.city}) — ${rest} day${rest === 1 ? '' : 's'} off${atHome ? '; no travel (at home)' : travel ? `; ${travel.miles.toLocaleString('en-US')} miles to ${k.city}` : !from || !to ? '; trip unknown (arena not on the map)' : ''}`;
  return { text: `${rest}d rest${travelText}`, tip, rest, travel };
}

/** How a team got to the knockout rounds: its group, group winner or wild card, group record and differential. */
export function pastQualified(s: Season, teamId: number) {
  const t = s.teams.find((x) => x.teamId === teamId);
  if (!t) return undefined;
  return { group: t.group.replace(' Group ', ' '), how: t.groupWinner ? 'Group winner' : 'Wild card', w: t.w, l: t.l, diff: t.diff, seed: t.seed };
}

/** "OT" / "2OT" when the game went to overtime. */
export const pastOt = (k: Ko) => overtimeOf(k.status);

export const pastWinner = (k: Ko) => (k.home.score > k.away.score ? k.home : k.away);

/**
 * A season's rules where they differed from the current (2026-27) rules — from the NBA's own published rules only
 * (checked 2026-11-23). Only one difference could be confirmed from an NBA.com page: until 2025-26 the semifinals and
 * the Championship were played at a neutral site (T-Mobile Arena, Las Vegas); from 2026-27 the semifinals are at the
 * higher seed's arena and the Championship at Hinkle Fieldhouse. Other rule details of 2023-24 and 2024-25 couldn't be
 * found on NBA.com, so nothing else is claimed.
 */
export const RULE_NOTES: Readonly<Record<number, { text: string; source: string }>> = Object.fromEntries(
  [2023, 2024, 2025].map((y) => [
    y,
    {
      text: 'Semifinals and final at a neutral site, T-Mobile Arena, Las Vegas (since 2026-27 the semifinals are at the higher seed’s arena)',
      source: 'NBA.com, "NBA Cup Semifinals to be played in team markets beginning in 2026-27" (2025-09-10): https://www.nba.com/news/nba-cup-semifinals-home-arenas-2026-27',
    },
  ]),
);
