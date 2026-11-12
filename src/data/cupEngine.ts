// The ONE NBA Cup rules engine — group standings, tiebreakers, wild cards, knockout seeding and hosts — over
// plain results, so the Cup standings (real games), the simulator (real + picked games), the "decided" tags and the
// stakes chips all use the same rules. Built from the rules the Cup standings implement (cup.ts),
// checked against NBA.com "Emirates NBA Cup 101" (fetched 2026-11-06, https://www.nba.com/news/nba-cup-101):
//  - group ties: head-to-head (group games), point differential, points scored, 2025-26 record, random drawing; a rule
//    that splits a tie only in part sends the teams still level back to rule 1;
//  - wild card (the best 2nd-place team per conference): the same list without head-to-head; group ties first;
//  - OT: 0 in the point differential, only regulation points in points scored;
//  - knockout: per conference the 3 group winners are seeds 1–3 (by record, then the same tiebreakers), the wild card
//    seed 4; Quarterfinals 1 v 4 and 2 v 3 hosted by the better record (seeds 1 and 2); Semifinals at the higher seed's
//    arena; the Championship at a neutral site (2026-27: Hinkle Fieldhouse — from the schedule feed, not assumed here).
//  - A rule the engine can't apply because a picked (simulated) game has no margin is never guessed: the teams it would
//    separate are marked `undecided` with that rule and the games that need a margin.
// Pure: no UI, no clock.

import { TEAM_BY_ID, type Conference } from './teams';

export const CUP_GROUPS = ['West Group A', 'West Group B', 'West Group C', 'East Group A', 'East Group B', 'East Group C'] as const;
export type CupGroup = (typeof CUP_GROUPS)[number];
export const conferenceOf = (g: CupGroup): Conference => (g.startsWith('West') ? 'West' : 'East');

/** Which rule set a team apart from the teams tied with it: head-to-head, point differential, points scored, last season. */
export type Tiebreak = 'h2h' | 'diff' | 'points' | 'last-season';

/**
 * One group game's result from the engine's side. Real games: the final score (OT: `ot`, and `regulation` points when
 * known). A pick: the winner, and the margin when the detailed mode gave one (`margin` undefined = "quick pick").
 */
export interface GroupResult {
  gameId: string;
  home: number;
  away: number;
  winner: number;
  /** Winner's margin as it counts in the differential (an OT game: 0); undefined: unknown (a quick pick). */
  margin?: number;
  /** Points scored as they count in rule 3 ([away, home]); undefined: unknown (a pick). */
  points?: readonly [number, number];
  ot?: boolean;
  /** A pick, not a real result. */
  picked?: boolean;
}

export interface EngineLine {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  diff: number;
  points: number;
  /** Games (picked, no margin) whose margin the differential doesn't know. */
  unknownDiff: string[];
  /** Games (picked) whose points rule 3 doesn't know. */
  unknownPoints: string[];
}

export interface RankedLine extends EngineLine {
  rank: number;
  tiebreak?: Tiebreak;
  tied: boolean;
  /** The order here depends on a margin not given: the rule that would decide, and the games that need a margin. */
  undecided?: { rule: Tiebreak; games: string[] };
}

export interface EngineGroup {
  group: CupGroup;
  conference: Conference;
  teams: RankedLine[];
}

export interface EngineWildCard {
  conference: Conference;
  /** The three 2nd-place teams, in wild-card order (the first holds it). */
  teams: (RankedLine & { group: CupGroup; wcTiebreak?: Exclude<Tiebreak, 'h2h'>; wcTied: boolean; wcUndecided?: { rule: Tiebreak; games: string[] } })[];
}

export interface Seed {
  seed: 1 | 2 | 3 | 4;
  teamId: number;
  group: CupGroup;
  wildCard: boolean;
  /** The tiebreaker that placed it among the group winners (seeds 1–3), if one did. */
  tiebreak?: Tiebreak;
  /** The seeding (or the team itself) depends on a margin not given. */
  undecided?: { rule: Tiebreak; games: string[] };
}

export interface KnockoutGame {
  round: 'qf' | 'sf' | 'final';
  conference?: Conference;
  /** Seeds (qf) or the winners of the games named (sf, final); undefined while undecided. */
  high?: number;
  low?: number;
  /** The host team (qf, sf: the higher seed); the final is neutral. */
  host?: number;
}

export interface EngineResult {
  groups: EngineGroup[];
  wildCards: EngineWildCard[];
  seeds: Record<Conference, Seed[]>;
  /** The quarterfinals by seeds: 1 v 4 and 2 v 3 per conference, hosted by seeds 1 and 2. */
  quarterfinals: { conference: Conference; high: Seed; low: Seed; host: number }[];
}

// ---------------------------------------------------------------------------------------------------------- ranking

/** A tiebreaker: per team a number (higher is better), undefined when it can't be applied, 'unknown' when a margin is missing. */
export interface Rule<T> {
  name: Tiebreak;
  value: (team: T, tied: readonly T[]) => number | undefined | { unknown: string[] };
}

export interface Ranked<T> {
  team: T;
  tiebreak?: Tiebreak;
  tied: boolean;
  undecided?: { rule: Tiebreak; games: string[] };
}

type Line = Pick<EngineLine, 'teamId' | 'tricode' | 'w' | 'l' | 'diff' | 'points'> & Partial<Pick<EngineLine, 'unknownDiff' | 'unknownPoints'>>;

/** Record first, as NBA standings: games over .500, then win % (a team with no games counts as .500). */
const recordKey = (t: Line) => [t.w - t.l, t.w + t.l ? t.w / (t.w + t.l) : 0.5] as const;

/**
 * Orders teams by record, then breaks each tie with the rules in order. When a rule splits a tie only in part, the teams
 * still level start again from the first rule among themselves. A tie no rule breaks keeps tricode order and is marked
 * tied; a tie a rule could break but for a missing margin is marked undecided (and kept in tricode order).
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
    const unknown = values.filter((v): v is { unknown: string[] } => typeof v === 'object' && v !== null);
    if (unknown.length) {
      const games = [...new Set(unknown.flatMap((u) => u.unknown))];
      return tied.map((team) => ({ team, tied: false, undecided: { rule: rule.name, games } }));
    }
    if (values.some((v) => v === undefined)) continue;
    const nums = values as number[];
    if (nums.every((v) => v === nums[0])) continue;
    const distinct = [...new Set(nums)].sort((a, b) => b - a);
    return distinct.flatMap((v) => {
      const bucket = tied.filter((_, k) => nums[k] === v);
      if (bucket.length === 1) return [{ team: bucket[0]!, tiebreak: rule.name, tied: false }];
      return breakTie(bucket, rules).map((r) => ({ ...r, tiebreak: r.tiebreak ?? rule.name }));
    });
  }
  return tied.map((team) => ({ team, tied: true }));
}

/** 1. Head-to-head among the tied teams: wins minus losses in their games (a pick's winner counts: it needs no margin). */
export function h2hRule(results: readonly GroupResult[]): Rule<Line> {
  return {
    name: 'h2h',
    value: (team, tied) => {
      const ids = new Set(tied.map((t) => t.teamId));
      let n = 0;
      for (const r of results) {
        if (!ids.has(r.home) || !ids.has(r.away) || (r.home !== team.teamId && r.away !== team.teamId)) continue;
        n += r.winner === team.teamId ? 1 : -1;
      }
      return n;
    },
  };
}
export const diffRule: Rule<Line> = { name: 'diff', value: (t) => (t.unknownDiff?.length ? { unknown: t.unknownDiff } : t.diff) };
export const pointsRule: Rule<Line> = { name: 'points', value: (t) => (t.unknownPoints?.length ? { unknown: t.unknownPoints } : t.points) };
/** 4. Last season's record (wins of 82); not applied when a tied team has no number. */
export const lastSeasonRule = (wins: Readonly<Record<string, number>>): Rule<Line> => ({ name: 'last-season', value: (t) => wins[t.tricode] });

// ---------------------------------------------------------------------------------------------------------- compute

/** Lines from results: W-L, differential and points, and which picked games leave them unknown. */
export function linesOf(teams: Iterable<number>, results: readonly GroupResult[]): Map<number, EngineLine> {
  const out = new Map<number, EngineLine>();
  for (const id of teams) out.set(id, { teamId: id, tricode: TEAM_BY_ID.get(id)?.tricode ?? String(id), w: 0, l: 0, diff: 0, points: 0, unknownDiff: [], unknownPoints: [] });
  for (const r of results) {
    for (const [me, opp] of [[r.home, r.away], [r.away, r.home]] as const) {
      const l = out.get(me);
      if (!l) continue;
      const won = r.winner === me;
      if (won) l.w++;
      else l.l++;
      if (r.margin === undefined) l.unknownDiff.push(r.gameId);
      else l.diff += won ? r.margin : -r.margin;
      if (!r.points) l.unknownPoints.push(r.gameId);
      else l.points += me === r.home ? r.points[1] : r.points[0];
      void opp;
    }
  }
  return out;
}

/**
 * The whole Cup picture from `results` (the games decided, real or picked): each group ranked, each conference's
 * wild-card race, seeds 1–4 and the quarterfinals. `groups`: every group's 5 teams; `lastSeason`: rule 4's wins.
 */
export function computeCup(groups: ReadonlyMap<CupGroup, readonly number[]>, results: readonly GroupResult[], lastSeason: Readonly<Record<string, number>>): EngineResult {
  const lines = linesOf([...groups.values()].flat(), results);
  const last = lastSeasonRule(lastSeason);
  const h2h = h2hRule(results);
  const engineGroups: EngineGroup[] = CUP_GROUPS.filter((g) => groups.has(g)).map((group) => {
    const ranked = rank(groups.get(group)!.map((id) => lines.get(id)!), [h2h, diffRule, pointsRule, last]);
    return { group, conference: conferenceOf(group), teams: ranked.map((r, i) => ({ ...r.team, rank: i + 1, tiebreak: r.tiebreak, tied: r.tied, undecided: r.undecided })) };
  });
  const wildCards: EngineWildCard[] = (['West', 'East'] as const).map((conference) => {
    const seconds = engineGroups.filter((g) => g.conference === conference && g.teams[1]).map((g) => ({ ...g.teams[1]!, group: g.group }));
    const ranked = rank(seconds, [diffRule, pointsRule, last]);
    return { conference, teams: ranked.map((r) => ({ ...r.team, wcTiebreak: r.tiebreak as Exclude<Tiebreak, 'h2h'> | undefined, wcTied: r.tied, wcUndecided: r.undecided })) };
  });
  const seeds = {} as Record<Conference, Seed[]>;
  const quarterfinals: EngineResult['quarterfinals'] = [];
  for (const conference of ['West', 'East'] as const) {
    const winners = engineGroups.filter((g) => g.conference === conference).map((g) => ({ ...g.teams[0]!, group: g.group }));
    const ranked = rank(winners, [h2h, diffRule, pointsRule, last]);
    const wc = wildCards.find((w) => w.conference === conference)!.teams[0];
    const list: Seed[] = ranked.map((r, i) => ({ seed: (i + 1) as 1 | 2 | 3, teamId: r.team.teamId, group: r.team.group, wildCard: false, tiebreak: r.tiebreak, undecided: r.undecided ?? r.team.undecided }));
    if (wc) list.push({ seed: 4, teamId: wc.teamId, group: wc.group, wildCard: true, undecided: wc.wcUndecided ?? wc.undecided });
    seeds[conference] = list;
    if (list.length === 4) {
      quarterfinals.push({ conference, high: list[0]!, low: list[3]!, host: list[0]!.teamId });
      quarterfinals.push({ conference, high: list[1]!, low: list[2]!, host: list[1]!.teamId });
    }
  }
  return { groups: engineGroups, wildCards, seeds, quarterfinals };
}

/** The semifinal of a conference: the two quarterfinal winners, hosted by the higher seed. */
export function semifinal(seeds: readonly Seed[], winnerA: number, winnerB: number): { high: number; low: number; host: number } {
  const seedOf = (id: number) => seeds.find((s) => s.teamId === id)?.seed ?? 9;
  const [high, low] = seedOf(winnerA) <= seedOf(winnerB) ? [winnerA, winnerB] : [winnerB, winnerA];
  return { high, low, host: high };
}
