// What is mathematically certain in the NBA Cup — a team that has clinched a knockout spot
// ("IN"), one that can no longer get one ("OUT"), and what tonight's results would settle. Uses the shared engine only
// (cupEngine.ts): every win/loss completion of a conference's remaining group games is run through computeCup with the
// margins unknown, so the engine itself says when a spot would depend on a margin — such a completion counts as "could
// go either way". Never "probably": a team is IN only when it qualifies in every completion with nothing undecided in
// its way, OUT only when it qualifies in none and can't by a margin either.
// Exact, but exhaustive: only run when a conference has at most MAX_OPEN games left (2^12 = 4096 completions); with more,
// nothing is claimed (in practice the tags matter on the last two group nights, when 9–12 games are left).

import { computeCup, conferenceOf, type CupGroup, type EngineResult, type GroupResult } from './cupEngine';
import type { Conference } from './teams';
import { CUP_GROUP_END, cupGroupsOf, isCountedCupGame, LAST_SEASON_WINS, realResults } from './cup';
import type { RegulationTotals } from './regulation';
import type { ScheduleGame } from '../shared/nba-schedule/parse';

export const MAX_OPEN = 12;

export interface OpenGame {
  gameId: string;
  home: number;
  away: number;
}

/** A team's fate in one completion: in, out, or unknown (it depends on a margin). */
type Fate = 'in' | 'out' | 'unknown';

/**
 * In one engine result: does `teamId` get a knockout spot (leads its group, or holds its conference's wild card)?
 * 'unknown' when a margin (an undecided tie) or a random drawing (a tie no rule breaks) could change that.
 */
export function fateOf(res: EngineResult, teamId: number): Fate {
  const g = res.groups.find((x) => x.teams.some((t) => t.teamId === teamId))!;
  const t = g.teams.find((x) => x.teamId === teamId)!;
  // the places the team could take: its own, or any in the tie a margin would decide (teams sharing the same games list)
  const bucket = t.undecided ? g.teams.filter((y) => y.undecided?.games === t.undecided!.games) : [t];
  const ranks = bucket.map((y) => y.rank);
  const [lo, hi] = [Math.min(...ranks), Math.max(...ranks)];
  if (t.tied && lo <= 2) return 'unknown'; // a random drawing
  if (hi === 1) return 'in';
  if (lo === 1) return 'unknown';
  if (lo >= 3) return 'out';
  if (hi > 2) return 'unknown';
  // surely 2nd in its group: the wild card — unless anything in the race is still open
  const conf = res.groups.filter((x) => x.conference === g.conference);
  const wc = res.wildCards.find((w) => w.conference === g.conference)!;
  if (conf.some((x) => x.teams.slice(0, 3).some((y) => y.undecided || (y.tied && y.rank <= 2))) || wc.teams.some((x) => x.wcUndecided || x.wcTied)) return 'unknown';
  return wc.teams[0]?.teamId === teamId ? 'in' : 'out';
}

/** Every completion (2^n) of `open`: each game won by home or away, no margin. */
function* completions(open: readonly OpenGame[]): Generator<GroupResult[]> {
  const n = open.length;
  for (let mask = 0; mask < 1 << n; mask++)
    yield open.map((g, k) => ({ gameId: g.gameId, home: g.home, away: g.away, winner: mask & (1 << k) ? g.home : g.away, picked: true }));
}

export interface Decided {
  /** teamId → 'in' (clinched) or 'out' (eliminated); teams with nothing certain are absent. */
  fate: Map<number, 'in' | 'out'>;
  /** Conferences where too many games are left to check (nothing claimed there). */
  skipped: Conference[];
}

/**
 * IN / OUT for every team: `known` are the results decided (real games, and the simulator's picks), `open` the group
 * games still to play.
 */
export function decide(groups: ReadonlyMap<CupGroup, readonly number[]>, known: readonly GroupResult[], open: readonly OpenGame[], lastSeason: Readonly<Record<string, number>>): Decided {
  const fate = new Map<number, 'in' | 'out'>();
  const skipped: Conference[] = [];
  for (const conference of ['West', 'East'] as const) {
    const confGroups = new Map([...groups].filter(([g]) => conferenceOf(g) === conference));
    const ids = new Set([...confGroups.values()].flat());
    const confOpen = open.filter((g) => ids.has(g.home));
    const confKnown = known.filter((r) => ids.has(r.home));
    if (confOpen.length > MAX_OPEN) {
      skipped.push(conference);
      continue;
    }
    const seen = new Map<number, Set<Fate>>([...ids].map((id) => [id, new Set<Fate>()]));
    // a team seen two ways can't be certain any more: stop following it; stop altogether once none is left
    let live = ids.size;
    for (const c of completions(confOpen)) {
      const res = computeCup(confGroups, [...confKnown, ...c], lastSeason);
      for (const id of ids) {
        const s = seen.get(id)!;
        if (s.size > 1 || s.has('unknown')) continue;
        s.add(fateOf(res, id));
        if (s.size > 1 || s.has('unknown')) {
          s.add('unknown');
          live--;
        }
      }
      if (!live) break;
    }
    for (const [id, s] of seen) {
      if (s.size === 1 && s.has('in')) fate.set(id, 'in');
      if (s.size === 1 && s.has('out')) fate.set(id, 'out');
    }
  }
  return { fate, skipped };
}

// ---------------------------------------------------------------------------------------------------- per data set


const fatesCache = new WeakMap<object, Decided>();

/** The real Cup's IN / OUT (real results, the group games still to play), once per data set; undefined until worked out. */
export const cupFatesNow = (data: object): Decided | undefined => fatesCache.get(data);

/** Works them out (cached): up to a few hundred ms late in group play, so callers run it off the first render (useCupFates). */
export function cupFatesOf(data: { games: readonly ScheduleGame[]; regulation?: RegulationTotals }): Decided {
  let d = fatesCache.get(data);
  if (!d) {
    const counted = data.games.filter(isCountedCupGame);
    const done = new Set(counted.map((g) => g.gameId));
    const open = data.games.filter((g) => g.isCupGroupGame && !done.has(g.gameId) && g.dateEt <= CUP_GROUP_END && g.homeTeam.teamId && g.awayTeam.teamId).map((g) => ({ gameId: g.gameId, home: g.homeTeam.teamId, away: g.awayTeam.teamId }));
    d = decide(cupGroupsOf(data.games), realResults(counted, data.regulation), open, LAST_SEASON_WINS);
    fatesCache.set(data, d);
  }
  return d;
}
