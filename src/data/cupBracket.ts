// The simulator's knockout bracket as a game: from the seeds (the engine's, after the group picks) to a champion.
// Pure. Per conference the quarterfinals 1 v 4 and 2 v 3 (hosted by seeds 1 and 2), the semifinal between their
// winners (hosted by the higher seed), the Final neutral. A pick advances a team; a pick whose team is no longer in its
// game (the group picks moved the seeds, or an earlier pick changed) is dropped — only those. A knockout game the feed
// has already played is its real result, not a pick.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { semifinal, type EngineResult, type Seed } from './cupEngine';
import type { Conference } from './teams';

export type BracketRound = 'QF' | 'SF' | 'F';
export type BracketKey = 'QF-West-1' | 'QF-West-2' | 'QF-East-1' | 'QF-East-2' | 'SF-West' | 'SF-East' | 'F';
export const BRACKET_KEYS: readonly BracketKey[] = ['QF-West-1', 'QF-West-2', 'QF-East-1', 'QF-East-2', 'SF-West', 'SF-East', 'F'];

/** A bracket pick: the winner, and in the detailed mode the margin (as the group picks). */
export interface BracketPick {
  winner: number;
  margin?: number;
}
export type BracketPicks = ReadonlyMap<BracketKey, BracketPick>;

export interface BracketSide {
  teamId: number;
  seed?: Seed;
}

export interface BracketMatch {
  key: BracketKey;
  round: BracketRound;
  /** Undefined for the Final. */
  conference?: Conference;
  /** Top and bottom (QF: the higher seed first; SF: QF 1's winner, QF 2's; Final: West, East); undefined until known. */
  a?: BracketSide;
  b?: BracketSide;
  /** The home team; undefined: a neutral site (the Final) or not known yet. */
  host?: number;
  winner?: number;
  margin?: number;
  /** The winner is the feed's real result (not pickable). */
  real?: { game: ScheduleGame; score: [number, number] };
}

export interface Bracket {
  matches: Record<BracketKey, BracketMatch>;
  champion?: number;
  /** The picks still in their games (the input minus the ones that no longer make sense). */
  picks: BracketPicks;
}

/** The feed's final knockout game between two teams, if it has one. */
function realGame(knockout: readonly ScheduleGame[], a: number, b: number): BracketMatch['real'] {
  const g = knockout.find((x) => x.status === 'final' && ((x.homeTeam.teamId === a && x.awayTeam.teamId === b) || (x.homeTeam.teamId === b && x.awayTeam.teamId === a)));
  if (!g) return undefined;
  const s = (id: number) => (g.homeTeam.teamId === id ? g.homeTeam.score : g.awayTeam.score);
  return { game: g, score: [s(a), s(b)] };
}

/**
 * The bracket for these seeds and picks. `knockout`: the feed's knockout games (quarterfinals, semifinals, the Final)
 * — a final one between the same two teams decides its game.
 */
export function bracketOf(engine: Pick<EngineResult, 'seeds' | 'quarterfinals'>, picks: BracketPicks, knockout: readonly ScheduleGame[] = []): Bracket {
  const kept = new Map<BracketKey, BracketPick>();
  const matches = {} as Record<BracketKey, BracketMatch>;
  const decide = (m: BracketMatch) => {
    if (m.a && m.b) {
      const real = realGame(knockout, m.a.teamId, m.b.teamId);
      if (real) {
        m.real = real;
        m.winner = real.score[0] > real.score[1] ? m.a.teamId : m.b.teamId;
        m.margin = Math.abs(real.score[0] - real.score[1]);
      } else {
        const p = picks.get(m.key);
        if (p && (p.winner === m.a.teamId || p.winner === m.b.teamId)) {
          kept.set(m.key, p);
          m.winner = p.winner;
          m.margin = p.margin;
        }
      }
    }
    matches[m.key] = m;
    return m;
  };
  const sideOf = (seeds: readonly Seed[], id?: number): BracketSide | undefined => (id === undefined ? undefined : { teamId: id, seed: seeds.find((s) => s.teamId === id) });
  const finalists: (BracketSide | undefined)[] = [];
  for (const c of ['West', 'East'] as const) {
    const seeds = engine.seeds[c] ?? [];
    const qfs = engine.quarterfinals.filter((q) => q.conference === c);
    const qf = ([1, 2] as const).map((n) => {
      const q = qfs.find((x) => x.high.seed === n);
      return decide({ key: `QF-${c}-${n}`, round: 'QF', conference: c, a: q && { teamId: q.high.teamId, seed: q.high }, b: q && { teamId: q.low.teamId, seed: q.low }, host: q?.host });
    });
    const [w1, w2] = qf.map((m) => m.winner);
    // slots by bracket position (QF 1's winner on top, QF 2's below), so the lines stay straight; the host is the higher seed
    const host = w1 !== undefined && w2 !== undefined ? semifinal(seeds, w1, w2).host : undefined;
    const m = decide({ key: `SF-${c}`, round: 'SF', conference: c, a: sideOf(seeds, w1), b: sideOf(seeds, w2), host });
    finalists.push(m.winner !== undefined ? sideOf(seeds, m.winner) : undefined);
  }
  const f = decide({ key: 'F', round: 'F', a: finalists[0], b: finalists[1] });
  return { matches, champion: f.winner, picks: kept };
}

/** Same picks (winner and margin) in both maps. */
export const samePicks = (a: BracketPicks, b: BracketPicks) =>
  a.size === b.size && [...a].every(([k, p]) => b.get(k)?.winner === p.winner && b.get(k)?.margin === p.margin);
