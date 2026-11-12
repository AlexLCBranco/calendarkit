// League standings, worked out from the schedule already loaded — finished regular-season games only, no
// other fetch. Pure: no UI, no clock. `leagueStandings(data)` computes once per data set (WeakMap), so the Standings view
// and the header popup share one result and nothing is recomputed per render.
//
// What counts: gameType "regular" (gameId 002…) with status final. Every NBA Cup game but the Championship counts —
// group games and the quarterfinals / semifinals are 002 games; the Championship is 006 ("cup-final") and is left out.
//
// Seeding: the NBA's tie-break procedures, Paragraph L.2 ("Play-In and Playoff Tie-Break Procedures", published on
// nba.com/standings, checked 2026-11-05):
//   L.2.a, two teams: (1) head-to-head win %, (2) division winner (whether or not they share a division), (3) division
//     win % (same division only), (4) conference win %, (5) win % vs postseason-eligible teams in own conference,
//     (6) win % vs postseason-eligible teams in the other conference, (7) point differential, all games.
//   L.2.b, more than two: (1) division winner, (2) win % in games among the tied teams, (3) division win % (all in one
//     division only), (4) conference win %, (5) win % vs postseason-eligible teams in own conference, (6) point
//     differential, all games.
//   L.2.c: division-winner ties are broken first and that result is used only for the division title; a criterion that
//     separates only some of 3+ teams ranks them, and each group still level starts again from the beginning (L.2.a if
//     two remain, L.2.b if more); a tie nothing breaks is settled by a drawing (here: tricode order, marked).
// "Postseason-eligible" = the 10 best records in the conference, teams tied for 10th included (L.2's own definition),
// taken from today's records. A team with no games under a win-% criterion (0-0, e.g. head-to-head before it has met
// the others) ranks below every team with a record, 0-2 included: L.2 doesn't say, and this is what NBA.com's own
// standings do (2026-11-05: WAS 0-2 above NYK 0-0 among CLE/NYK/TOR/WAS, SAS 0-1 above MEM 0-0 among MEM/OKC/SAS).
// Two teams that are both 0-0 stay level and the next criterion applies.
//
// "vs .500+": record against opponents at .500 or better going into the game (0-0 counts): NBA.com's "vs. over .500"
// column, which matches this rule for all 30 teams on 2026-11-05 (opponents over .500 today matched 4 of 30).

import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { CalendarData } from './model';
import { TEAMS, TEAM_BY_ID, type Conference, type Division } from './teams';

/** Regular-season games per team. */
export const SEASON_GAMES = 82;
/** Seeds 1–6 go to the playoffs, 7–10 to the play-in. */
export const PLAYOFF_SEEDS = 6;
export const PLAY_IN_SEEDS = 10;
/** "Close game": decided by this many points or fewer. */
export const CLOSE_MARGIN = 5;

export interface Rec {
  w: number;
  l: number;
}

export type Criterion = 'h2h' | 'division-winner' | 'division' | 'conference' | 'eligible-own' | 'eligible-other' | 'point-diff';

export const CRITERION_TEXT: Record<Criterion, string> = {
  h2h: 'Head-to-head',
  'division-winner': 'Division leader',
  division: 'Division record',
  conference: 'Conference record',
  'eligible-own': 'Record vs top-10 teams, own conference',
  'eligible-other': 'Record vs top-10 teams, other conference',
  'point-diff': 'Point differential',
};

/** One step of a tie-break, from one team's side. */
export interface TieStep {
  criterion: Criterion;
  /** The teams this step was applied to (tricodes, this team included). */
  among: string[];
  /** This team's value under it: "3-1", "leads division", "+42". */
  value: string;
}

export interface TieInfo {
  /** Every team level with this one on win % (tricodes, this one included). */
  tiedWith: string[];
  steps: TieStep[];
  /** Still level after every criterion: the NBA would hold a drawing; shown in tricode order. */
  drawing: boolean;
}

/** NBA.com's clinch codes: w/e conference, a/c/se/nw/p/sw division, x playoffs, pi play-in, o eliminated. */
export type Clinch = 'w' | 'e' | 'a' | 'c' | 'se' | 'nw' | 'p' | 'sw' | 'x' | 'pi' | 'o';
export const CLINCH_TEXT: Record<Clinch, string> = {
  w: 'Clinched the West',
  e: 'Clinched the East',
  a: 'Clinched the Atlantic',
  c: 'Clinched the Central',
  se: 'Clinched the Southeast',
  nw: 'Clinched the Northwest',
  p: 'Clinched the Pacific',
  sw: 'Clinched the Southwest',
  x: 'Clinched a playoff spot',
  pi: 'Clinched at least the play-in',
  o: 'Eliminated',
};
const DIVISION_CODE: Record<Division, Clinch> = { Atlantic: 'a', Central: 'c', Southeast: 'se', Northwest: 'nw', Pacific: 'p', Southwest: 'sw' };

export interface TeamStanding {
  teamId: number;
  tricode: string;
  conference: Conference;
  division: Division;
  w: number;
  l: number;
  /** Win %, 0 with no games. */
  pct: number;
  home: Rec;
  road: Rec;
  /** Neutral-site games (Global Games): neither home nor road, as on NBA.com. */
  neutral: Rec;
  conf: Rec;
  div: Rec;
  /** vs opponents at .500 or better going into the game (NBA.com's "OppOver500"). */
  over500: Rec;
  /** Decided by CLOSE_MARGIN points or fewer (overtime included). */
  close: Rec;
  /** Decided by 3 or fewer (NBA.com's column; used to check the margin logic). */
  close3: Rec;
  ot: Rec;
  last10: Rec;
  /** "W3", "L1"; "" before the first game. */
  streak: string;
  /** Points for / against, totals. */
  pf: number;
  pa: number;
  /** Per game (0 with no games). */
  ppg: number;
  oppg: number;
  diffPg: number;
  /** Regular-season games still on the schedule (Cup knockout games with teams to be decided aren't anyone's yet). */
  left: { total: number; home: number; road: number; neutral: number; b2b: number };
  /** Record on the 1st and 2nd nights of back-to-backs (finished regular-season games). */
  b2bFirst: Rec;
  b2bSecond: Rec;
}

export interface SeededTeam extends TeamStanding {
  /** 1–15 in the conference (1–30 in the league list). */
  seed: number;
  /** Games behind the 1st seed (league list: the league's 1st). */
  gb: number;
  divisionLeader: boolean;
  tie?: TieInfo;
  clinch?: Clinch;
}

export interface Standings {
  West: SeededTeam[];
  East: SeededTeam[];
  /** ET date of the last finished game counted. */
  through?: string;
  games: number;
}

const pctOf = (r: Rec) => (r.w + r.l ? r.w / (r.w + r.l) : undefined);
const rec = (): Rec => ({ w: 0, l: 0 });
const add = (r: Rec, win: boolean) => (win ? r.w++ : r.l++);
export const fmtRec = (r: Rec) => `${r.w}-${r.l}`;
export const fmtPct = (p: number) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Only finished regular-season games count (the Cup Championship is a 006 game, so never). */
export const countsInStandings = (g: ScheduleGame) => g.gameType === 'regular' && g.status === 'final' && !!g.homeTeam.teamId && !!g.awayTeam.teamId;
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const isOt = (g: ScheduleGame) => /^Final\/\d*OT$/i.test(g.statusText);

interface Ctx {
  lines: Map<number, TeamStanding>;
  /** teamId → opponentId → record */
  vs: Map<number, Map<number, Rec>>;
  /** teamId → point differential, all games */
  diff: Map<number, number>;
  divisionLeaders: Set<number>;
  /** Conference → its postseason-eligible teams (top 10 by win %, ties at 10th included). */
  eligible: Map<Conference, Set<number>>;
}

const cache = new WeakMap<CalendarData, Standings>();

/** The standings for a data set, worked out once (shared by the view and the popup). */
export function leagueStandings(data: CalendarData): Standings {
  let s = cache.get(data);
  if (!s) cache.set(data, (s = computeStandings(data.games)));
  return s;
}

/** `games`: every game the app shows (regular season, Cup Championship, play-in, playoffs), any order. */
export function computeStandings(games: readonly ScheduleGame[]): Standings {
  const sorted = [...games].sort((a, b) => a.dateEt.localeCompare(b.dateEt) || (a.startTimeUtc ?? '').localeCompare(b.startTimeUtc ?? '') || a.gameId.localeCompare(b.gameId));
  const lines = new Map<number, TeamStanding>();
  for (const t of TEAMS)
    lines.set(t.id, {
      teamId: t.id, tricode: t.tricode, conference: t.conference, division: t.division, w: 0, l: 0, pct: 0,
      home: rec(), road: rec(), neutral: rec(), conf: rec(), div: rec(), over500: rec(), close: rec(), close3: rec(), ot: rec(), last10: rec(),
      streak: '', pf: 0, pa: 0, ppg: 0, oppg: 0, diffPg: 0, left: { total: 0, home: 0, road: 0, neutral: 0, b2b: 0 }, b2bFirst: rec(), b2bSecond: rec(),
    });
  const vs = new Map<number, Map<number, Rec>>(TEAMS.map((t) => [t.id, new Map()]));
  const results = new Map<number, boolean[]>(TEAMS.map((t) => [t.id, []]));
  // running records, for "vs .500+" (the opponent's record going into the game)
  const running = new Map<number, Rec>(TEAMS.map((t) => [t.id, rec()]));
  const counted = sorted.filter(countsInStandings);
  let through: string | undefined;

  for (const g of counted) {
    through = g.dateEt;
    const homeWon = g.homeTeam.score > g.awayTeam.score;
    const margin = Math.abs(g.homeTeam.score - g.awayTeam.score);
    const before = new Map([g.homeTeam.teamId, g.awayTeam.teamId].map((id) => [id, { ...(running.get(id) ?? rec()) }]));
    for (const [me, opp, home] of [[g.homeTeam, g.awayTeam, true], [g.awayTeam, g.homeTeam, false]] as const) {
      const t = lines.get(me.teamId);
      const o = TEAM_BY_ID.get(opp.teamId);
      if (!t || !o) continue;
      const win = home === homeWon;
      add(t, win);
      add(g.isNeutral ? t.neutral : home ? t.home : t.road, win);
      if (o.conference === t.conference) add(t.conf, win);
      if (o.division === t.division) add(t.div, win);
      const ob = before.get(o.id)!;
      if (ob.w >= ob.l) add(t.over500, win);
      if (margin <= CLOSE_MARGIN) add(t.close, win);
      if (margin <= 3) add(t.close3, win);
      if (isOt(g)) add(t.ot, win);
      t.pf += me.score;
      t.pa += opp.score;
      const m = vs.get(t.teamId)!;
      if (!m.has(o.id)) m.set(o.id, rec());
      add(m.get(o.id)!, win);
      results.get(t.teamId)!.push(win);
      add(running.get(t.teamId)!, win);
    }
  }

  for (const t of lines.values()) {
    const gp = t.w + t.l;
    t.pct = gp ? t.w / gp : 0;
    t.ppg = gp ? t.pf / gp : 0;
    t.oppg = gp ? t.pa / gp : 0;
    t.diffPg = gp ? (t.pf - t.pa) / gp : 0;
    const r = results.get(t.teamId)!;
    for (const win of r.slice(-10)) add(t.last10, win);
    if (r.length) {
      const last = r[r.length - 1]!;
      let n = 0;
      for (let i = r.length - 1; i >= 0 && r[i] === last; i--) n++;
      t.streak = `${last ? 'W' : 'L'}${n}`;
    }
  }

  // games left, and back-to-backs (consecutive ET dates, any game the app shows, as the app's B2B tags)
  const byTeam = new Map<number, ScheduleGame[]>(TEAMS.map((t) => [t.id, []]));
  for (const g of sorted) for (const id of [g.homeTeam.teamId, g.awayTeam.teamId]) byTeam.get(id)?.push(g);
  for (const [id, list] of byTeam) {
    const t = lines.get(id)!;
    list.forEach((g, i) => {
      if (g.gameType === 'regular' && g.status !== 'final' && !g.teamsTbd) {
        t.left.total++;
        if (g.isNeutral) t.left.neutral++;
        else if (g.homeTeam.teamId === id) t.left.home++;
        else t.left.road++;
      }
      const prev = list[i - 1];
      if (!prev || daysApart(prev.dateEt, g.dateEt) !== 1) return;
      if (g.status !== 'final') t.left.b2b++; // a back-to-back whose 2nd night is still to come
      const result = (x: ScheduleGame) => (x.homeTeam.teamId === id) === x.homeTeam.score > x.awayTeam.score;
      if (countsInStandings(prev)) add(t.b2bFirst, result(prev));
      if (countsInStandings(g)) add(t.b2bSecond, result(g));
    });
  }

  const ctx: Ctx = {
    lines,
    vs,
    diff: new Map([...lines.values()].map((t) => [t.teamId, t.pf - t.pa])),
    divisionLeaders: new Set(),
    eligible: new Map(),
  };
  // L.2.c(1): division winners first, from ties among the division's teams only
  const divisions = new Map<Division, TeamStanding[]>();
  for (const t of lines.values()) divisions.set(t.division, [...(divisions.get(t.division) ?? []), t]);
  for (const conf of ['West', 'East'] as const) {
    const teams = [...lines.values()].filter((t) => t.conference === conf).sort((a, b) => b.pct - a.pct);
    const cut = teams[PLAY_IN_SEEDS - 1]!.pct;
    ctx.eligible.set(conf, new Set(teams.filter((t) => t.pct >= cut).map((t) => t.teamId)));
  }
  for (const teams of divisions.values()) ctx.divisionLeaders.add(order(teams, ctx, true)[0]!.team.teamId);

  const seed = (teams: TeamStanding[]): SeededTeam[] => {
    const ranked = order(teams, ctx, false);
    const top = ranked[0]!.team;
    return ranked.map(({ team, tie }, i) => ({
      ...team,
      seed: i + 1,
      gb: (top.w - team.w + (team.l - top.l)) / 2,
      divisionLeader: ctx.divisionLeaders.has(team.teamId),
      tie,
    }));
  };
  const West = seed([...lines.values()].filter((t) => t.conference === 'West'));
  const East = seed([...lines.values()].filter((t) => t.conference === 'East'));
  for (const conf of [West, East]) markClinches(conf);
  return { West, East, through, games: counted.length };
}

/**
 * Clinch / elimination with every team finishing SEASON_GAMES games (so final wins order the teams; the schedule may not
 * list the two Cup-week games of the teams out of the knockout yet). A tie on final wins could go either way, so a
 * clinch needs the others' best case to stay below, and an elimination needs the others' current wins to pass the
 * team's best case.
 */
export function markClinches(conf: SeededTeam[]) {
  const max = (t: SeededTeam) => t.w + Math.max(0, SEASON_GAMES - t.w - t.l);
  for (const t of conf) {
    const others = conf.filter((o) => o !== t);
    const canReach = others.filter((o) => max(o) >= t.w).length; // could finish level or ahead
    const ahead = others.filter((o) => o.w > max(t)).length; // already out of reach
    const divRivals = others.filter((o) => o.division === t.division);
    if (canReach === 0) t.clinch = t.conference === 'West' ? 'w' : 'e';
    else if (divRivals.every((o) => max(o) < t.w)) t.clinch = DIVISION_CODE[t.division];
    else if (canReach <= PLAYOFF_SEEDS - 1) t.clinch = 'x';
    else if (canReach <= PLAY_IN_SEEDS - 1) t.clinch = 'pi';
    else if (ahead >= PLAY_IN_SEEDS) t.clinch = 'o';
  }
}

interface Ordered {
  team: TeamStanding;
  tie?: TieInfo;
}

/** Win % first; each group level on win % goes through the tie-break procedure. */
function order(teams: readonly TeamStanding[], ctx: Ctx, divisionRace: boolean): Ordered[] {
  const sorted = [...teams].sort((a, b) => b.pct - a.pct || a.tricode.localeCompare(b.tricode));
  const out: Ordered[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.pct === sorted[i]!.pct) j++;
    const group = sorted.slice(i, j);
    if (group.length === 1) out.push({ team: group[0]! });
    else {
      const tiedWith = group.map((t) => t.tricode);
      for (const r of breakTie(group, ctx, divisionRace)) out.push({ team: r.team, tie: { tiedWith, steps: r.steps, drawing: r.drawing } });
    }
    i = j;
  }
  return out;
}

interface Broken {
  team: TeamStanding;
  steps: TieStep[];
  drawing: boolean;
}

type Value = { n: number; text: string };

function recordAmong(ctx: Ctx, t: TeamStanding, ids: Iterable<number>): Rec {
  const r = rec();
  const m = ctx.vs.get(t.teamId)!;
  for (const id of ids) {
    if (id === t.teamId) continue;
    const x = m.get(id);
    if (x) (r.w += x.w), (r.l += x.l);
  }
  return r;
}
/** Win % for a criterion; no games ranks below every record (see the top of the file). */
const pctValue = (r: Rec): Value => ({ n: pctOf(r) ?? -1, text: fmtRec(r) });

function value(c: Criterion, t: TeamStanding, tied: readonly TeamStanding[], ctx: Ctx): Value {
  switch (c) {
    case 'h2h':
      return pctValue(recordAmong(ctx, t, tied.map((x) => x.teamId)));
    case 'division-winner': {
      const lead = ctx.divisionLeaders.has(t.teamId);
      return { n: lead ? 1 : 0, text: lead ? `leads the ${t.division}` : `doesn't lead the ${t.division}` };
    }
    case 'division':
      return pctValue(t.div);
    case 'conference':
      return pctValue(t.conf);
    case 'eligible-own':
      return pctValue(recordAmong(ctx, t, ctx.eligible.get(t.conference)!));
    case 'eligible-other':
      return pctValue(recordAmong(ctx, t, ctx.eligible.get(t.conference === 'West' ? 'East' : 'West')!));
    case 'point-diff': {
      const d = ctx.diff.get(t.teamId)!;
      return { n: d, text: signed(d) };
    }
  }
}

/** L.2.a / L.2.b with L.2.c's restart. `divisionRace`: breaking a tie for a division title (no division-winner criterion). */
function breakTie(tied: readonly TeamStanding[], ctx: Ctx, divisionRace: boolean): Broken[] {
  if (tied.length === 1) return [{ team: tied[0]!, steps: [], drawing: false }];
  const sameDivision = tied.every((t) => t.division === tied[0]!.division);
  const criteria: Criterion[] = (
    tied.length === 2
      ? (['h2h', 'division-winner', 'division', 'conference', 'eligible-own', 'eligible-other', 'point-diff'] as const)
      : (['division-winner', 'h2h', 'division', 'conference', 'eligible-own', 'point-diff'] as const)
  ).filter((c) => (c !== 'division-winner' || !divisionRace) && (c !== 'division' || sameDivision));
  const among = tied.map((t) => t.tricode);
  for (const c of criteria) {
    const values = tied.map((t) => value(c, t, tied, ctx));
    const ns = values.map((v) => v.n);
    if (ns.every((n) => n === ns[0])) continue;
    const distinct = [...new Set(ns)].sort((a, b) => b - a);
    return distinct.flatMap((n) => {
      const bucket = tied.filter((_, k) => ns[k] === n);
      const step = (t: TeamStanding): TieStep => ({ criterion: c, among, value: values[tied.indexOf(t)]!.text });
      return breakTie(bucket, ctx, divisionRace).map((r) => ({ ...r, steps: [step(r.team), ...r.steps] }));
    });
  }
  return [...tied].sort((a, b) => a.tricode.localeCompare(b.tricode)).map((team) => ({ team, steps: [], drawing: true }));
}

/** Tooltip text for a tied seed: who it was level with and each step that placed it. */
export function tieText(t: SeededTeam): string | undefined {
  if (!t.tie) return undefined;
  const others = t.tie.tiedWith.filter((x) => x !== t.tricode);
  const lines = [`Tied at ${fmtPct(t.pct)} with ${others.join(', ')}`];
  for (const s of t.tie.steps) {
    const vsWhom = s.among.filter((x) => x !== t.tricode);
    lines.push(`${CRITERION_TEXT[s.criterion]}${s.among.length < t.tie.tiedWith.length || s.among.length > 2 ? ` (with ${vsWhom.join(', ')})` : ''}: ${s.value}`);
  }
  if (t.tie.drawing) lines.push('Still level after every tiebreaker: the NBA would hold a drawing (shown A–Z)');
  return lines.join('\n');
}
