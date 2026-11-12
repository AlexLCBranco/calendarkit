// The Cup stakes chips — only when tonight's result can settle something for a team (clinch the
// group or the wild card, or end its chances). From the shared engine only, like the IN / OUT tags (cupDecide.ts): every
// win/loss completion of the conference's remaining games (margins unknown) is run once; a team's chips come from the
// completions grouped by its own game tonight (and the other games tonight, for "help").
//  - "Win = clinch": every completion where it wins puts it through.   - "Loss = out": every one where it loses ends it.
//  - "Win + help": a win puts it through only with another result tonight (the tooltip names it: "and DAL loses").
//  - "+8 to pass ORL": with a win, only its own margin is open, and a win by 8 or more passes the team it is tied with on
//    point differential for the spot (the tooltip: the differentials and the spot). "depends on DEN–PHX": the margin
//    that decides it also depends on another game tonight.
// Nothing is shown when nothing is settled tonight, or when more than MAX_OPEN games are left in the conference.

import { computeCup, conferenceOf, type CupGroup, type EngineResult, type GroupResult } from './cupEngine';
import { fateOf, MAX_OPEN, type OpenGame } from './cupDecide';
import { TEAM_BY_ID } from './teams';
import { CUP_GROUP_END, cupGroupsOf, isCountedCupGame, LAST_SEASON_WINS, realResults } from './cup';
import type { RegulationTotals } from './regulation';
import type { ScheduleGame } from '../shared/nba-schedule/parse';

export interface StakeChip {
  kind: 'clinch' | 'out' | 'help' | 'margin' | 'depends';
  text: string;
  tip: string;
}

const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? '?';

/** What a margin would decide for `teamId` in one completion: its rivals on point differential, and the unknown games. */
interface MarginInfo {
  games: string[];
  rivals: { id: number; diff: number }[];
  diff: number;
  spot: string;
}

function marginInfo(res: EngineResult, teamId: number): MarginInfo | undefined {
  const g = res.groups.find((x) => x.teams.some((t) => t.teamId === teamId))!;
  const t = g.teams.find((x) => x.teamId === teamId)!;
  if (t.undecided?.rule === 'diff') {
    const bucket = g.teams.filter((y) => y.undecided?.games === t.undecided!.games && y.teamId !== teamId);
    const lo = Math.min(t.rank, ...bucket.map((y) => y.rank));
    return { games: t.undecided.games, rivals: bucket.map((y) => ({ id: y.teamId, diff: y.diff })), diff: t.diff, spot: lo === 1 ? `1st in ${g.group.replace(' Group ', ' ')}` : `2nd in ${g.group.replace(' Group ', ' ')}` };
  }
  const wc = res.wildCards.find((w) => w.conference === g.conference)!;
  const me = wc.teams.find((x) => x.teamId === teamId);
  if (me?.wcUndecided?.rule === 'diff') {
    const bucket = wc.teams.filter((y) => y.wcUndecided?.games === me.wcUndecided!.games && y.teamId !== teamId);
    return { games: me.wcUndecided.games, rivals: bucket.map((y) => ({ id: y.teamId, diff: y.diff })), diff: me.diff, spot: `the ${g.conference} wild card` };
  }
  return undefined;
}

/**
 * Chips for the teams playing `tonight` (game ids, among `open`): `known` = the results decided, `open` = every group
 * game still to play (tonight's included).
 */
export function stakes(groups: ReadonlyMap<CupGroup, readonly number[]>, known: readonly GroupResult[], open: readonly OpenGame[], tonight: ReadonlySet<string>, lastSeason: Readonly<Record<string, number>>): Map<number, StakeChip[]> {
  const out = new Map<number, StakeChip[]>();
  for (const conference of ['West', 'East'] as const) {
    const confGroups = new Map([...groups].filter(([g]) => conferenceOf(g) === conference));
    const ids = new Set([...confGroups.values()].flat());
    const confOpen = open.filter((g) => ids.has(g.home));
    const tonightGames = confOpen.filter((g) => tonight.has(g.gameId));
    if (!tonightGames.length || confOpen.length > MAX_OPEN) continue;
    const confKnown = known.filter((r) => ids.has(r.home));
    const bit = new Map(confOpen.map((g, k) => [g.gameId, k]));
    const players = tonightGames.flatMap((g) => [g.home, g.away]);
    // per team: every completion's fate and (when unknown) what a margin would decide
    const recs = new Map<number, { mask: number; fate: ReturnType<typeof fateOf>; info?: MarginInfo }[]>(players.map((p) => [p, []]));
    for (let mask = 0; mask < 1 << confOpen.length; mask++) {
      const picks: GroupResult[] = confOpen.map((g, k) => ({ gameId: g.gameId, home: g.home, away: g.away, winner: mask & (1 << k) ? g.home : g.away, picked: true }));
      const res = computeCup(confGroups, [...confKnown, ...picks], lastSeason);
      for (const p of players) {
        const fate = fateOf(res, p);
        recs.get(p)!.push({ mask, fate, info: fate === 'unknown' ? marginInfo(res, p) : undefined });
      }
    }
    for (const g of tonightGames)
      for (const [me, opp] of [[g.home, g.away], [g.away, g.home]] as const) {
        const k = bit.get(g.gameId)!;
        const wins = (m: number) => (me === g.home ? (m >> k) & 1 : !((m >> k) & 1));
        const all = recs.get(me)!;
        if (all.every((r) => r.fate === 'in') || all.every((r) => r.fate === 'out')) continue; // already settled
        const win = all.filter((r) => wins(r.mask));
        const loss = all.filter((r) => !wins(r.mask));
        const chips: StakeChip[] = [];
        if (win.every((r) => r.fate === 'in')) chips.push({ kind: 'clinch', text: 'Win = clinch', tip: `A win puts ${tri(me)} through whatever else happens` });
        if (loss.every((r) => r.fate === 'out')) chips.push({ kind: 'out', text: 'Loss = out', tip: `A loss ends ${tri(me)}'s Cup chances` });
        if (!chips.some((c) => c.kind === 'clinch') && win.some((r) => r.fate === 'in')) {
          // a single other result tonight that, with a win, settles it
          const helps: string[] = [];
          for (const h of tonightGames) {
            if (h === g) continue;
            const hb = bit.get(h.gameId)!;
            for (const homeWins of [1, 0]) {
              const sub = win.filter((r) => ((r.mask >> hb) & 1) === homeWins);
              if (sub.length && sub.every((r) => r.fate === 'in')) helps.push(`${tri(homeWins ? h.away : h.home)} loses`);
            }
          }
          if (helps.length) chips.push({ kind: 'help', text: 'Win + help', tip: `A win and ${helps.join(', or ')}` });
        }
        // the margin: with a win, only margins open (no 'out' among the wins)
        const unknownWins = win.filter((r) => r.fate === 'unknown');
        if (!chips.some((c) => c.kind === 'clinch') && unknownWins.length && win.every((r) => r.fate !== 'out') && unknownWins.every((r) => r.info)) {
          const others = new Set(unknownWins.flatMap((r) => r.info!.games.filter((id) => id !== g.gameId)));
          const tonightOther = [...others].map((id) => tonightGames.find((x) => x.gameId === id)).filter((x): x is OpenGame => !!x);
          if (others.size) {
            if (tonightOther.length === others.size) chips.push({ kind: 'depends', text: `depends on ${tonightOther.map((x) => `${tri(x.away)}–${tri(x.home)}`).join(', ')}`, tip: `How much ${tri(me)} must win by depends on the margin of ${tonightOther.map((x) => `${tri(x.away)} @ ${tri(x.home)}`).join(' and ')} tonight` });
          } else {
            // only its own margin: the smallest win margin that passes every rival on point differential, in every case
            let need = 1;
            let worst: { rival: number; mine: number; theirs: number; spot: string } | undefined;
            for (const r of unknownWins) {
              for (const rv of r.info!.rivals) {
                const gap = rv.id === opp ? Math.floor((rv.diff - r.info!.diff) / 2) + 1 : rv.diff - r.info!.diff + 1;
                if (gap >= need) {
                  need = Math.max(need, gap);
                  worst = { rival: rv.id, mine: r.info!.diff, theirs: rv.diff, spot: r.info!.spot };
                }
              }
            }
            if (worst) chips.push({ kind: 'margin', text: `+${need} to pass ${tri(worst.rival)}`, tip: `Point differential: ${tri(me)} ${worst.mine > 0 ? '+' : ''}${worst.mine}, ${tri(worst.rival)} ${worst.theirs > 0 ? '+' : ''}${worst.theirs} — a win by ${need} or more takes ${worst.spot}` });
          }
        }
        if (chips.length) out.set(me, chips);
      }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- per data set

const stakesCache = new WeakMap<object, Map<string, Map<number, StakeChip[]>>>();

/** Tonight's chips (`date`'s Cup group games) for the real Cup, once per data set and date; undefined until worked out. */
export const cupStakesNow = (data: object, date: string) => stakesCache.get(data)?.get(date);

export function cupStakesOf(data: { games: readonly ScheduleGame[]; regulation?: RegulationTotals }, date: string): Map<number, StakeChip[]> {
  let byDate = stakesCache.get(data);
  if (!byDate) stakesCache.set(data, (byDate = new Map()));
  let s = byDate.get(date);
  if (!s) {
    const counted = data.games.filter(isCountedCupGame);
    const done = new Set(counted.map((g) => g.gameId));
    const openGames = data.games.filter((g) => g.isCupGroupGame && !done.has(g.gameId) && g.dateEt <= CUP_GROUP_END && g.homeTeam.teamId && g.awayTeam.teamId);
    const tonight = new Set(openGames.filter((g) => g.dateEt === date).map((g) => g.gameId));
    s = tonight.size ? stakes(cupGroupsOf(data.games), realResults(counted, data.regulation), openGames.map((g) => ({ gameId: g.gameId, home: g.homeTeam.teamId, away: g.awayTeam.teamId })), tonight, LAST_SEASON_WINS) : new Map();
    byDate.set(date, s);
  }
  return s;
}
