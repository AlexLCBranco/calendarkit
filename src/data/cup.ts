// NBA Cup group standings (round 11), worked out from the schedule feed's finished Cup group games — no hand-entered
// results. Pure: no UI, no clock; the Cup view calls it only when it is opened.
//
// What the feed gives (checked 2026-10-31 against the live feed): group games have gameSubtype "in-season" and
// gameSubLabel "West Group A" … "East Group C"; knockout games "in-season-knockout". Final scores only — no period
// scores, so overtime points can't be taken out (the Cup rules leave them out of point differential and points
// scored); an OT game ("Final/OT", "Final/2OT") counts with its final score and the view says so.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { TEAMS, TEAM_BY_ID, type Conference } from './teams';

/** Group play runs Oct 30 – Nov 27 (2026-27); only finished group games inside it count. */
export const CUP_GROUP_START = '2026-10-30';
export const CUP_GROUP_END = '2026-11-27';

/** The feed's group labels, in the view's order: West A/B/C on top, East A/B/C below. */
export const CUP_GROUPS = ['West Group A', 'West Group B', 'West Group C', 'East Group A', 'East Group B', 'East Group C'] as const;
export type CupGroup = (typeof CUP_GROUPS)[number];

/**
 * 2025-26 regular-season wins (82 games each, so wins alone order the records), tiebreaker 4. Source: stats.nba.com
 * leaguestandingsv3, Season=2025-26, fetched 2026-10-31; the 30 totals add up to 1230.
 */
export const LAST_SEASON_WINS: Readonly<Record<string, number>> = {
  OKC: 64, SAS: 62, DET: 60, BOS: 56, DEN: 54, NYK: 53, LAL: 53, CLE: 52, HOU: 52, MIN: 49,
  TOR: 46, ATL: 46, PHI: 45, PHX: 45, ORL: 45, CHA: 44, MIA: 43, POR: 42, LAC: 42, GSW: 37,
  MIL: 32, CHI: 31, NOP: 26, DAL: 26, MEM: 25, SAC: 22, UTA: 22, BKN: 20, IND: 19, WAS: 17,
};

/** Which rule set a team apart from the teams tied with it: head-to-head, point differential, points scored, last season. */
export type Tiebreak = 'h2h' | 'diff' | 'points' | 'last-season';

export interface CupTeamLine {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  /** Point differential in finished group games (final scores, OT included — see above). */
  diff: number;
  /** Points scored in finished group games. */
  points: number;
  /** Finished group games that went to overtime. */
  otGames: number;
  /** 1–5 inside the group. */
  rank: number;
  /** The rule that placed this team among the teams it was tied with on record; undefined when the record alone did. */
  tiebreak?: Tiebreak;
  /** Still tied after every rule: the order shown is only a stable one (by tricode). */
  tied: boolean;
  /** If group play ended today: leads the group, holds its conference's wild card, or neither. */
  status?: 'leader' | 'wild-card';
}

export interface CupGroupTable {
  group: CupGroup;
  conference: Conference;
  /** Short name for the card header: "WEST A". */
  short: string;
  teams: CupTeamLine[];
}

export interface WildCardRace {
  conference: Conference;
  /** The three 2nd-place teams, in wild-card order; the first holds it. */
  teams: (CupTeamLine & { group: CupGroup; wcTiebreak?: Exclude<Tiebreak, 'h2h'>; wcTied: boolean })[];
  /** The best of the rest: CUP_CHASERS teams neither leading nor 2nd in their group today, same order (record, then the list without head-to-head). */
  chasing: (CupTeamLine & { group: CupGroup })[];
}

export interface CupStandings {
  groups: CupGroupTable[];
  wildCards: WildCardRace[];
  /** ET date of the last finished group game counted, or undefined before the first. */
  through?: string;
  /** Finished group games counted. */
  games: number;
  /** Any of them went to overtime (their OT points are in the numbers). */
  hasOt: boolean;
}

/** The wild-card race lists the three 2nd-place teams and then this many of the rest (5 per conference in all). */
export const CUP_CHASERS = 2;

/** A finished Cup group-play game inside the group-play dates (knockout games never are). */
export const isCountedCupGame = (g: ScheduleGame) =>
  g.isCupGroupGame && g.status === 'final' && g.dateEt >= CUP_GROUP_START && g.dateEt <= CUP_GROUP_END && !!g.homeTeam.teamId && !!g.awayTeam.teamId;

const isOt = (g: ScheduleGame) => /^Final\/\d*OT$/i.test(g.statusText);

interface Acc {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  diff: number;
  points: number;
  otGames: number;
}

/**
 * Teams by group from every Cup group game in the feed (finished or not), so 0-0 teams are listed too. A group with no
 * labelled game for each of its 5 teams falls back to CUP_GROUP_TEAMS.
 */
export function cupGroupsOf(games: readonly ScheduleGame[]): Map<CupGroup, number[]> {
  const out = new Map<CupGroup, Set<number>>(CUP_GROUPS.map((g) => [g, new Set()]));
  for (const g of games) {
    if (!g.isCupGroupGame) continue;
    const set = out.get(g.gameSubLabel as CupGroup);
    if (!set) continue;
    for (const t of [g.homeTeam, g.awayTeam]) if (t.teamId) set.add(t.teamId);
  }
  const byTricode = new Map(TEAMS.map((t) => [t.tricode, t.id]));
  return new Map([...out].map(([k, v]) => [k, v.size === 5 ? [...v] : CUP_GROUP_TEAMS[k].map((tri) => byTricode.get(tri)!)]));
}

export function cupStandings(games: readonly ScheduleGame[]): CupStandings {
  const counted = games.filter(isCountedCupGame);
  const acc = new Map<number, Acc>();
  const line = (id: number): Acc => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { teamId: id, tricode: TEAM_BY_ID.get(id)?.tricode ?? String(id), w: 0, l: 0, diff: 0, points: 0, otGames: 0 }));
    return a;
  };
  for (const g of counted) {
    const h = line(g.homeTeam.teamId);
    const a = line(g.awayTeam.teamId);
    const hs = g.homeTeam.score;
    const as = g.awayTeam.score;
    const homeWon = hs > as;
    h.w += homeWon ? 1 : 0;
    h.l += homeWon ? 0 : 1;
    a.w += homeWon ? 0 : 1;
    a.l += homeWon ? 1 : 0;
    h.diff += hs - as;
    a.diff += as - hs;
    h.points += hs;
    a.points += as;
    if (isOt(g)) {
      h.otGames++;
      a.otGames++;
    }
  }

  const groups: CupGroupTable[] = [...cupGroupsOf(games)].map(([group, ids]) => {
    const teams = ids.map(line);
    const ranked = rank(teams, [h2h(counted), byDiff, byPoints, byLastSeason]);
    const conference: Conference = group.startsWith('West') ? 'West' : 'East';
    return {
      group,
      conference,
      short: group.replace(' Group ', ' ').toUpperCase(),
      teams: ranked.map((r, i) => ({ ...r.team, rank: i + 1, tiebreak: r.tiebreak as Tiebreak | undefined, tied: r.tied, status: i === 0 ? ('leader' as const) : undefined })),
    };
  });

  const wildCards: WildCardRace[] = (['West', 'East'] as const).map((conference) => {
    const seconds = groups.filter((g) => g.conference === conference && g.teams[1]).map((g) => ({ ...g.teams[1]!, group: g.group }));
    const ranked = rank(seconds, [byDiff, byPoints, byLastSeason]);
    const rest = groups.filter((g) => g.conference === conference).flatMap((g) => g.teams.slice(2).map((t) => ({ ...t, group: g.group })));
    const chasing = rank(rest, [byDiff, byPoints, byLastSeason]).slice(0, CUP_CHASERS).map((r) => r.team);
    return {
      conference,
      teams: ranked.map((r) => ({ ...r.team, wcTiebreak: r.tiebreak as WildCardRace['teams'][number]['wcTiebreak'], wcTied: r.tied })),
      chasing,
    };
  });
  for (const wc of wildCards) {
    const holder = wc.teams[0];
    if (!holder) continue;
    const t = groups.find((g) => g.group === holder.group)!.teams[1]!;
    t.status = 'wild-card';
    holder.status = 'wild-card';
  }

  return {
    groups,
    wildCards,
    through: counted.reduce<string | undefined>((m, g) => (!m || g.dateEt > m ? g.dateEt : m), undefined),
    games: counted.length,
    hasOt: counted.some(isOt),
  };
}

/** A tiebreaker: a number per team (higher is better) among the tied teams, or undefined when it can't be applied. */
interface Rule<T> {
  name: Tiebreak;
  value: (team: T, tied: readonly T[]) => number | undefined;
}

type Line = Pick<Acc, 'teamId' | 'tricode' | 'w' | 'l' | 'diff' | 'points'>;

/** 1. Head-to-head among the tied teams: wins minus losses in finished group games between them. */
function h2h(counted: readonly ScheduleGame[]): Rule<Line> {
  return {
    name: 'h2h',
    value: (team, tied) => {
      const ids = new Set(tied.map((t) => t.teamId));
      let n = 0;
      for (const g of counted) {
        const h = g.homeTeam.teamId;
        const a = g.awayTeam.teamId;
        if (!ids.has(h) || !ids.has(a) || (h !== team.teamId && a !== team.teamId)) continue;
        const won = (h === team.teamId) === g.homeTeam.score > g.awayTeam.score;
        n += won ? 1 : -1;
      }
      return n;
    },
  };
}
const byDiff: Rule<Line> = { name: 'diff', value: (t) => t.diff };
const byPoints: Rule<Line> = { name: 'points', value: (t) => t.points };
/** 4. Last season's record; not applied when a tied team has no number. */
const byLastSeason: Rule<Line> = { name: 'last-season', value: (t) => LAST_SEASON_WINS[t.tricode] };

interface Ranked<T> {
  team: T;
  tiebreak?: string;
  tied: boolean;
}

/**
 * Record first, as NBA standings: more wins minus losses (games over .500), then the better win % (1-0 above 2-1); a
 * team with no games is 0-0 and counts as .500 (level with 1-1).
 */
const recordKey = (t: Line) => [t.w - t.l, t.w + t.l ? t.w / (t.w + t.l) : 0.5] as const;

/**
 * Orders teams by record, then breaks each tie with the rules in order. When a rule splits a tie only in part, the
 * teams still level start again from the first rule among themselves (so a 3-way tie that leaves two teams level goes
 * back to their head-to-head). A tie no rule breaks keeps tricode order and is marked tied.
 */
export function rank<T extends Line>(teams: readonly T[], rules: readonly Rule<Line>[]): Ranked<T>[] {
  const sorted = [...teams].sort((a, b) => {
    const [ad, aw] = recordKey(a);
    const [bd, bw] = recordKey(b);
    return bd - ad || bw - aw || a.tricode.localeCompare(b.tricode);
  });
  const out: Ranked<T>[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    const [d, w] = recordKey(sorted[i]!);
    while (j < sorted.length && recordKey(sorted[j]!)[0] === d && recordKey(sorted[j]!)[1] === w) j++;
    out.push(...breakTie(sorted.slice(i, j), rules));
    i = j;
  }
  return out;
}

function breakTie<T extends Line>(tied: readonly T[], rules: readonly Rule<Line>[]): Ranked<T>[] {
  if (tied.length === 1) return [{ team: tied[0]!, tied: false }];
  for (const rule of rules) {
    const values = tied.map((t) => rule.value(t, tied));
    if (values.some((v) => v === undefined)) continue;
    if (values.every((v) => v === values[0])) continue;
    // buckets of equal value, best first
    const distinct = [...new Set(values as number[])].sort((a, b) => b - a);
    return distinct.flatMap((v) => {
      const bucket = tied.filter((_, k) => values[k] === v);
      if (bucket.length === 1) return [{ team: bucket[0]!, tiebreak: rule.name, tied: false }];
      // still level: start again from the first rule among the teams left (they keep this rule as the one that placed the bucket)
      return breakTie(bucket, rules).map((r) => ({ ...r, tiebreak: r.tiebreak ?? rule.name }));
    });
  }
  return tied.map((team) => ({ team, tied: true }));
}

/** The 2026-27 Cup groups (Alex's list; the feed has the same): used for a group the feed doesn't label. */
export const CUP_GROUP_TEAMS: Readonly<Record<CupGroup, readonly string[]>> = {
  'West Group A': ['DEN', 'DAL', 'UTA', 'HOU', 'PHX'],
  'West Group B': ['MIN', 'OKC', 'NOP', 'MEM', 'LAC'],
  'West Group C': ['GSW', 'SAS', 'POR', 'SAC', 'LAL'],
  'East Group A': ['DET', 'ORL', 'MIL', 'TOR', 'BKN'],
  'East Group B': ['MIA', 'PHI', 'CLE', 'NYK', 'IND'],
  'East Group C': ['WAS', 'BOS', 'ATL', 'CHI', 'CHA'],
};
