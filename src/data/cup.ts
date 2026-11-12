// NBA Cup group standings, worked out from the schedule feed's finished Cup group games — no hand-entered
// results. Pure: no UI, no clock; the Cup view calls it only when it is opened.
//
// What the feed gives (checked 2026-10-31 against the live feed): group games have gameSubtype "in-season" and
// gameSubLabel "West Group A" … "East Group C"; knockout games "in-season-knockout". Final scores only — no period
// scores. The Cup rules leave overtime out of point differential and points scored. Differential: an OT game was tied
// at the end of regulation, so it counts 0 (NBA.com "Cup 101"; the owner's call).
// Points scored: an OT game ("Final/OT", "Final/2OT") counts its regulation points, which the daily snapshot
// job takes from the game's boxscore (src/data/regulation.ts); until a game's totals are stored it counts its final score.

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { TEAMS, type Conference } from './teams';
import type { RegulationTotals } from './regulation';

/** Group play runs Oct 30 – Nov 27 (2026-27); only finished group games inside it count. */
export const CUP_GROUP_START = '2026-10-30';
export const CUP_GROUP_END = '2026-11-27';

/** The feed's group labels, in the view's order: West A/B/C on top, East A/B/C below (the engine's). */
export { CUP_GROUPS, rank, type CupGroup, type Tiebreak } from './cupEngine';
import { computeCup, CUP_GROUPS, diffRule, lastSeasonRule, pointsRule, rank, type CupGroup, type EngineResult, type GroupResult, type Tiebreak } from './cupEngine';

/**
 * 2025-26 regular-season wins (82 games each, so wins alone order the records), tiebreaker 4. Source: stats.nba.com
 * leaguestandingsv3, Season=2025-26, fetched 2026-10-31; the 30 totals add up to 1230.
 */
export const LAST_SEASON_WINS: Readonly<Record<string, number>> = {
  OKC: 64, SAS: 62, DET: 60, BOS: 56, DEN: 54, NYK: 53, LAL: 53, CLE: 52, HOU: 52, MIN: 49,
  TOR: 46, ATL: 46, PHI: 45, PHX: 45, ORL: 45, CHA: 44, MIA: 43, POR: 42, LAC: 42, GSW: 37,
  MIL: 32, CHI: 31, NOP: 26, DAL: 26, MEM: 25, SAC: 22, UTA: 22, BKN: 20, IND: 19, WAS: 17,
};


export interface CupTeamLine {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  /** Point differential in finished group games (an OT game counts 0 — see above). */
  diff: number;
  /** Points scored in finished group games (regulation points of an OT game, once stored). */
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
  /** The team's group games (4 once the feed has them all), in date and tip-off order: played or still to come. */
  slots: CupSlot[];
}

/** One of a team's group games, from that team's side. */
export interface CupSlot {
  gameId: string;
  opponent: string;
  /** The team is the home team. */
  home: boolean;
  /** Counted in the standings (finished, inside group play): only then are the result and scores known. */
  played: boolean;
  win?: boolean;
  /** What the game adds to the differential: this team's points minus the opponent's; 0 after overtime (as in the standings). */
  diff?: number;
  score?: number;
  oppScore?: number;
  /** The full final score, away team first: "HOU 105 @ DEN 112 · Final/OT". */
  final?: string;
  /** The game's real margin from this team's side (an OT game's too; `diff` counts it 0). */
  margin?: number;
  /** The game itself (its hoopsjunkie link). */
  game: ScheduleGame;
}

const tipOrder = (g: ScheduleGame) => (g.startTimeUtc ? Date.parse(g.startTimeUtc) : Number.MAX_SAFE_INTEGER);

/** Every team's group games (finished or not) as slots, in date and tip-off order. */
export function cupSlots(games: readonly ScheduleGame[]): Map<number, CupSlot[]> {
  const group = games
    .filter((g) => g.isCupGroupGame && g.homeTeam.teamId && g.awayTeam.teamId)
    .sort((a, b) => a.dateEt.localeCompare(b.dateEt) || tipOrder(a) - tipOrder(b));
  const out = new Map<number, CupSlot[]>();
  for (const g of group) {
    const played = isCountedCupGame(g);
    const final = played ? `${g.awayTeam.teamTricode} ${g.awayTeam.score} @ ${g.homeTeam.teamTricode} ${g.homeTeam.score} · ${g.statusText || 'Final'}` : undefined;
    for (const [me, opp, home] of [
      [g.homeTeam, g.awayTeam, true],
      [g.awayTeam, g.homeTeam, false],
    ] as const) {
      const slot: CupSlot = { gameId: g.gameId, opponent: opp.teamTricode, home, played, game: g };
      if (played) Object.assign(slot, { win: me.score > opp.score, diff: isOt(g) ? 0 : me.score - opp.score, margin: me.score - opp.score, score: me.score, oppScore: opp.score, final });
      let list = out.get(me.teamId);
      if (!list) out.set(me.teamId, (list = []));
      list.push(slot);
    }
  }
  return out;
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
  /** Any of them went to overtime (0 in the differential; regulation points in points scored). */
  hasOt: boolean;
  /** OT games whose regulation totals aren't stored yet: their final score is in points scored. */
  otWithoutRegulation: number;
}

/** The wild-card race lists the three 2nd-place teams and then this many of the rest (5 per conference in all). */
export const CUP_CHASERS = 2;

/** A finished Cup group-play game inside the group-play dates (knockout games never are). */
export const isCountedCupGame = (g: ScheduleGame) =>
  g.isCupGroupGame && g.status === 'final' && g.dateEt >= CUP_GROUP_START && g.dateEt <= CUP_GROUP_END && !!g.homeTeam.teamId && !!g.awayTeam.teamId;

const isOt = (g: ScheduleGame) => /^Final\/\d*OT$/i.test(g.statusText);

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

/** The real finished group games as the engine's results (OT: 0 margin; regulation points once stored, else the final score). */
export function realResults(counted: readonly ScheduleGame[], regulation: RegulationTotals = {}): GroupResult[] {
  return counted.map((g) => {
    const hs = g.homeTeam.score;
    const as = g.awayTeam.score;
    const ot = isOt(g);
    const reg = ot ? regulation[g.gameId] : undefined;
    return { gameId: g.gameId, home: g.homeTeam.teamId, away: g.awayTeam.teamId, winner: hs > as ? g.homeTeam.teamId : g.awayTeam.teamId, margin: ot ? 0 : Math.abs(hs - as), points: reg ? [reg[0], reg[1]] : [as, hs], ot };
  });
}

/**
 * `regulation`: the snapshot's regulation totals (gameId → [away, home]) for rule 3; OT games without one count their
 * final score. The rules are the shared engine's (cupEngine.ts); this adds the slots, the OT counts and the
 * chasers, and keeps the engine's result (`engine`: seeds and quarterfinals) for the views that need it.
 */
export function cupStandings(games: readonly ScheduleGame[], regulation: RegulationTotals = {}): CupStandings & { engine: EngineResult } {
  const counted = games.filter(isCountedCupGame);
  const otWithoutRegulation = counted.filter((g) => isOt(g) && !regulation[g.gameId]).length;
  const otGames = new Map<number, number>();
  for (const g of counted.filter(isOt)) for (const id of [g.homeTeam.teamId, g.awayTeam.teamId]) otGames.set(id, (otGames.get(id) ?? 0) + 1);
  const engine = computeCup(cupGroupsOf(games), realResults(counted, regulation), LAST_SEASON_WINS);
  const slots = cupSlots(games);
  const groups: CupGroupTable[] = engine.groups.map((g) => ({
    group: g.group,
    conference: g.conference,
    short: g.group.replace(' Group ', ' ').toUpperCase(),
    teams: g.teams.map((t, i) => ({ teamId: t.teamId, tricode: t.tricode, w: t.w, l: t.l, diff: t.diff, points: t.points, otGames: otGames.get(t.teamId) ?? 0, rank: t.rank, tiebreak: t.tiebreak, tied: t.tied, status: i === 0 ? ('leader' as const) : undefined, slots: slots.get(t.teamId) ?? [] })),
  }));
  const lineOf = (id: number) => groups.flatMap((g) => g.teams).find((t) => t.teamId === id)!;
  const wildCards: WildCardRace[] = engine.wildCards.map((wc) => {
    const rest = groups.filter((g) => g.conference === wc.conference).flatMap((g) => g.teams.slice(2).map((t) => ({ ...t, group: g.group, unknownDiff: [], unknownPoints: [] })));
    const chasing = rank(rest, [diffRule, pointsRule, lastSeasonRule(LAST_SEASON_WINS)]).slice(0, CUP_CHASERS).map((r) => r.team);
    return { conference: wc.conference, teams: wc.teams.map((t) => ({ ...lineOf(t.teamId), group: t.group, wcTiebreak: t.wcTiebreak, wcTied: t.wcTied })), chasing };
  });
  for (const wc of wildCards) {
    const holder = wc.teams[0];
    if (!holder) continue;
    groups.find((g) => g.group === holder.group)!.teams[1]!.status = 'wild-card';
    holder.status = 'wild-card';
  }
  return {
    groups,
    wildCards,
    through: counted.reduce<string | undefined>((m, g) => (!m || g.dateEt > m ? g.dateEt : m), undefined),
    games: counted.length,
    hasOt: counted.some(isOt),
    otWithoutRegulation,
    engine,
  };
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

const standingsCache = new WeakMap<object, { standings: ReturnType<typeof cupStandings>; byTeam: Map<number, CupTeamLine> }>();

/** The standings of a data set (its games and regulation totals), worked out once; and each team's line. */
export function cupStandingsOf(data: { games: readonly ScheduleGame[]; regulation?: RegulationTotals }) {
  let out = standingsCache.get(data);
  if (!out) {
    const standings = cupStandings(data.games, data.regulation);
    out = { standings, byTeam: new Map(standings.groups.flatMap((g) => g.teams.map((t) => [t.teamId, t] as const))) };
    standingsCache.set(data, out);
  }
  return out;
}
