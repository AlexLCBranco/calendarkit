// Calendar model: everything the views derive from the parsed schedule. Pure functions, no React, no globals.
// Parsing itself is the shared module's job (src/shared/nba-schedule/parse.ts); this file never re-reads raw fields
// the module already derives (gameType, dateEt, startTimeUtc, timeTbd, teamsTbd, Cup flags).

import type { GameType, Schedule, ScheduleGame } from '../shared/nba-schedule/parse';
import { metroOf } from './metro';

/** Game types shown in v1. Preseason, All-Star and unknown types are dropped. */
export const SHOWN_GAME_TYPES: ReadonlySet<GameType> = new Set<GameType>(['regular', 'cup-final', 'play-in', 'playoffs']);

/** A game counts as over this long after tip-off (for the default day and the rotationkit link). */
export const GAME_LENGTH_MS = 3 * 60 * 60 * 1000;

export interface CalendarData {
  seasonYear: string;
  /** Shown games, sorted by game date, then tip-off (TBD last), then gameId. Full game objects. */
  games: ScheduleGame[];
  /** Game dates (ET, "YYYY-MM-DD") that have at least one shown game, ascending. */
  dates: string[];
  byDate: Map<string, ScheduleGame[]>;
  /** teamId → game dates the team plays on. */
  teamDates: Map<number, Set<string>>;
}

export function isShown(g: ScheduleGame): boolean {
  return SHOWN_GAME_TYPES.has(g.gameType);
}

const tipSortKey = (g: ScheduleGame) => (g.startTimeUtc ? Date.parse(g.startTimeUtc) : Number.MAX_SAFE_INTEGER);

export function buildCalendarData(schedule: Schedule): CalendarData {
  const games = schedule.games
    .filter(isShown)
    .sort((a, b) => a.dateEt.localeCompare(b.dateEt) || tipSortKey(a) - tipSortKey(b) || a.gameId.localeCompare(b.gameId));
  const byDate = new Map<string, ScheduleGame[]>();
  const teamDates = new Map<number, Set<string>>();
  for (const g of games) {
    const list = byDate.get(g.dateEt) ?? [];
    list.push(g);
    byDate.set(g.dateEt, list);
    for (const id of [g.homeTeam.teamId, g.awayTeam.teamId]) {
      if (!id) continue;
      const set = teamDates.get(id) ?? new Set<string>();
      set.add(g.dateEt);
      teamDates.set(id, set);
    }
  }
  return { seasonYear: schedule.seasonYear, games, dates: [...byDate.keys()], byDate, teamDates };
}

export const teamGames = (data: CalendarData, teamId: number) =>
  data.games.filter((g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId);

// ---------------------------------------------------------------- calendar-date helpers (no time zone involved)

/** "YYYY-MM-DD" + n days. Pure calendar arithmetic in UTC, so the local time zone can't shift it. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** "YYYY-MM" of a date. */
export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Months from the first to the last game date, inclusive. */
export function seasonMonths(data: CalendarData): string[] {
  const first = data.dates[0];
  const last = data.dates.at(-1);
  if (!first || !last) return [];
  const out: string[] = [];
  for (let m = monthOf(first); m <= monthOf(last); m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Calendar cells for a month grid: leading/trailing nulls so weeks start on Sunday. */
export function monthCells(month: string): (string | null)[] {
  const first = `${month}-01`;
  const days = daysBetween(first, `${addMonths(month, 1)}-01`);
  const cells: (string | null)[] = Array.from({ length: weekday(first) }, () => null);
  for (let i = 0; i < days; i++) cells.push(addDays(first, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** The 7 dates (Sunday–Saturday) of the week containing `date`. */
export const weekOf = (date: string) => Array.from({ length: 7 }, (_, i) => addDays(date, i - weekday(date)));

// ---------------------------------------------------------------- times (local time zone of the browser)

/** Calendar date of an instant in a time zone (undefined = the runtime's local zone). */
export function localDate(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

export interface Tipoff {
  tbd: boolean;
  /** "19:30", or "TBD". */
  time: string;
  /** Local calendar day of tip-off minus the game's NBA (ET) date: usually 0, +1 for late games east of ET. */
  dayOffset: number;
  /** What the card shows: "19:30", "00:30 (+1)" or "TBD". */
  label: string;
}

/** Tip-off in the local time zone, from the real UTC start (never the ET strings). */
export function tipoff(g: ScheduleGame, timeZone?: string): Tipoff {
  if (!g.startTimeUtc) return { tbd: true, time: 'TBD', dayOffset: 0, label: 'TBD' };
  const ms = Date.parse(g.startTimeUtc);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  const dayOffset = daysBetween(g.dateEt, localDate(ms, timeZone));
  const label = dayOffset ? `${time} (${dayOffset > 0 ? '+' : ''}${dayOffset})` : time;
  return { tbd: false, time, dayOffset, label };
}

/**
 * When a game is assumed over: tip-off + 3 h. A game whose time is still TBD has no tip-off; it counts as over
 * at 12:00 UTC the day after its game date (the morning after, US time).
 */
export function gameOverAt(g: ScheduleGame): number {
  if (g.startTimeUtc) return Date.parse(g.startTimeUtc) + GAME_LENGTH_MS;
  return Date.parse(`${addDays(g.dateEt, 1)}T12:00:00Z`);
}

export const isOver = (g: ScheduleGame, now: number) => gameOverAt(g) < now;

/**
 * Default day for the league view: the earliest game date that still has a game not over yet (so at 1 am the
 * previous night's games stay up until they finish). After the season's last game: the last game date.
 */
export function defaultDay(data: CalendarData, now: number): string | undefined {
  for (const date of data.dates) {
    if (data.byDate.get(date)!.some((g) => !isOver(g, now))) return date;
  }
  return data.dates.at(-1);
}

// ---------------------------------------------------------------- per-game facts for the card

/** The team also plays on the previous calendar day (game dates are ET). */
export function isBackToBack(data: CalendarData, teamId: number, date: string): boolean {
  return !!teamId && !!data.teamDates.get(teamId)?.has(addDays(date, -1));
}

/** US national TV broadcaster names (feed field broadcasters.nationalBroadcasters), de-duplicated, feed order. */
export function nationalTv(g: ScheduleGame): string[] {
  const names = (g.broadcasters?.nationalBroadcasters ?? []).map((b) => String(b.broadcasterDisplay ?? '').trim()).filter(Boolean);
  return [...new Set(names)];
}

export const hasNationalTv = (g: ScheduleGame) => nationalTv(g).length > 0;

const PLAYOFF_ROUNDS: Record<string, { short: string; long: string }> = {
  '1': { short: 'R1', long: 'First Round' },
  '2': { short: 'R2', long: 'Conf. Semifinals' },
  '3': { short: 'CF', long: 'Conf. Finals' },
  '4': { short: 'Finals', long: 'NBA Finals' },
};

/**
 * Playoff round from the gameId (004 YY 00 R S G: R = round). The shared module doesn't expose this yet;
 * requested in PROJECT.md. Undefined for non-playoff games or an unexpected ID.
 */
export function playoffRound(g: ScheduleGame): { round: number; short: string; long: string } | undefined {
  if (g.gameType !== 'playoffs') return undefined;
  const r = g.gameId.charAt(7);
  const names = PLAYOFF_ROUNDS[r];
  return names && { round: Number(r), ...names };
}

export type Marker = { kind: 'cup' | 'cup-final' | 'play-in' | 'playoffs'; short: string; long: string };

/** Competition markers for a game: NBA Cup (group/knockout/final), Play-In, Playoffs with round. */
export function markers(g: ScheduleGame): Marker[] {
  const out: Marker[] = [];
  if (g.gameType === 'cup-final') out.push({ kind: 'cup-final', short: 'Cup Final', long: 'NBA Cup Final' });
  else if (g.isCupKnockout) {
    const sub = g.gameSubLabel?.trim();
    const short = /quarter/i.test(sub) ? 'Cup QF' : /semi/i.test(sub) ? 'Cup SF' : 'Cup';
    out.push({ kind: 'cup', short, long: sub ? `NBA Cup ${sub}` : 'NBA Cup' });
  } else if (g.isCupGroupGame) out.push({ kind: 'cup', short: 'Cup', long: g.gameSubLabel ? `NBA Cup · ${g.gameSubLabel}` : 'NBA Cup' });
  if (g.gameType === 'play-in') out.push({ kind: 'play-in', short: 'Play-In', long: 'Play-In Tournament' });
  if (g.gameType === 'playoffs') {
    const r = playoffRound(g);
    out.push({ kind: 'playoffs', short: r?.short ?? 'Playoffs', long: r ? `Playoffs · ${r.long}` : 'Playoffs' });
  }
  return out;
}

/** Team label for display: tricode, or "TBD" while the team isn't decided. */
export const teamLabel = (t: ScheduleGame['homeTeam']) => (t.teamId && t.teamTricode ? t.teamTricode : 'TBD');

/** From one team's point of view: the team itself, opponent and home/away. Undefined if the team isn't in the game. */
export function perspective(g: ScheduleGame, teamId: number): { home: boolean; team: ScheduleGame['homeTeam']; opponent: ScheduleGame['homeTeam'] } | undefined {
  if (g.homeTeam.teamId === teamId) return { home: true, team: g.homeTeam, opponent: g.awayTeam };
  if (g.awayTeam.teamId === teamId) return { home: false, team: g.awayTeam, opponent: g.homeTeam };
  return undefined;
}

/** "vs BKN" / "@ LAL" from the team's side. */
const sideLabel = (g: ScheduleGame, teamId: number) => {
  const p = perspective(g, teamId)!;
  return `${p.home ? 'vs' : '@'} ${teamLabel(p.opponent)}`;
};

// ---------------------------------------------------------------- back-to-back pairs (team views)

export type B2BCode = 'HH' | 'HA' | 'AH' | 'AA';

/** One team's back-to-back: night 1 and night 2 on consecutive calendar days (ET game dates). */
export interface B2BPair {
  teamId: number;
  first: ScheduleGame;
  second: ScheduleGame;
  /** Home/away of night 1, then night 2. */
  code: B2BCode;
  /** Arena cities from the feed (`arenaCity`); empty when the feed has none. */
  fromCity: string;
  toCity: string;
  /** The team changes metro area between the nights (arena cities via metroOf); false if either city is missing. */
  travels: boolean;
  /** "Back-to-back: vs BKN (home) → @ LAL (away) · travels Boston → Los Angeles" */
  tip: string;
}

/** Every back-to-back of a team, in date order (from all its games, regardless of any filter). */
export function teamB2BPairs(data: CalendarData, teamId: number): B2BPair[] {
  const games = teamGames(data, teamId);
  const out: B2BPair[] = [];
  for (let i = 1; i < games.length; i++) {
    const first = games[i - 1]!;
    const second = games[i]!;
    if (daysBetween(first.dateEt, second.dateEt) !== 1) continue;
    const h1 = first.homeTeam.teamId === teamId;
    const h2 = second.homeTeam.teamId === teamId;
    const fromCity = String(first.arenaCity ?? '').trim();
    const toCity = String(second.arenaCity ?? '').trim();
    const travels = !!fromCity && !!toCity && metroOf(fromCity) !== metroOf(toCity);
    const where = (home: boolean) => (home ? 'home' : 'away');
    const tip = `Back-to-back: ${sideLabel(first, teamId)} (${where(h1)}) → ${sideLabel(second, teamId)} (${where(h2)})${travels ? ` · travels ${fromCity} → ${toCity}` : ''}`;
    out.push({ teamId, first, second, code: `${h1 ? 'H' : 'A'}${h2 ? 'H' : 'A'}` as B2BCode, fromCity, toCity, travels, tip });
  }
  return out;
}

/**
 * The opponent's side when it plays the 2nd night of a back-to-back in this game: tooltip
 * "CHI on 2nd night of a back-to-back · played @ MIA yesterday". Undefined otherwise (incl. its 1st night).
 */
export function opponentSecondNight(data: CalendarData, g: ScheduleGame, teamId: number): string | undefined {
  const opp = perspective(g, teamId)?.opponent;
  if (!opp?.teamId || !isBackToBack(data, opp.teamId, g.dateEt)) return undefined;
  const yesterday = addDays(g.dateEt, -1);
  const prev = data.byDate.get(yesterday)?.find((x) => x.homeTeam.teamId === opp.teamId || x.awayTeam.teamId === opp.teamId);
  return `${teamLabel(opp)} on 2nd night of a back-to-back${prev ? ` · played ${sideLabel(prev, opp.teamId)} yesterday` : ''}`;
}

/** Number of shown games per date (for the month navigator), optionally TV games only. */
export function countsByDate(data: CalendarData, tvOnly = false): Map<string, number> {
  const out = new Map<string, number>();
  for (const [date, games] of data.byDate) {
    const n = tvOnly ? games.filter(hasNationalTv).length : games.length;
    if (n) out.set(date, n);
  }
  return out;
}

// ---------------------------------------------------------------- season line (team list): game number, record, score

/** Final score from one team's side; undefined until the game is final. */
export function finalScore(g: ScheduleGame, teamId: number): { score: number; oppScore: number; win: boolean } | undefined {
  const p = perspective(g, teamId);
  if (!p || g.status !== 'final') return undefined;
  const score = Number(p.team.score);
  const oppScore = Number(p.opponent.score);
  return { score, oppScore, win: score > oppScore };
}

export interface SeasonLine {
  /** Regular-season game number (1–82); undefined for the Cup Final, play-in and playoff games. */
  game?: number;
  /** Regular-season record going into the game; undefined while an earlier regular-season game isn't final. */
  record?: { wins: number; losses: number };
}

/**
 * A team's regular-season game numbers and the record it takes into each game, counted from the final scores (the
 * Cup Final doesn't count, as in the standings). A record is known up to the first game not yet final, inclusive.
 */
export function teamSeason(data: CalendarData, teamId: number): Map<string, SeasonLine> {
  const out = new Map<string, SeasonLine>();
  let n = 0;
  let rec: SeasonLine['record'] = { wins: 0, losses: 0 };
  for (const g of teamGames(data, teamId)) {
    if (g.gameType !== 'regular') {
      out.set(g.gameId, {});
      continue;
    }
    out.set(g.gameId, { game: ++n, record: rec && { ...rec } });
    const r = finalScore(g, teamId);
    rec = rec && r ? { wins: rec.wins + (r.win ? 1 : 0), losses: rec.losses + (r.win ? 0 : 1) } : undefined;
  }
  return out;
}
