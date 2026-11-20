// Days that get extra attention in the US: the national holidays (worked out by rule, no network) and the NBA's big
// dates. This file is the one list: add a date by hand to EXTRA_DAYS (a season's dates the schedule feed can't give),
// or a rule to HOLIDAYS. What the feed does give (opening night, Christmas and MLK Day games, the Cup's knockout
// nights, the All-Star break, the last day of the regular season, and the play-in / playoffs / Finals once their games
// are in it) is read from the schedule, so it follows a changed schedule by itself.

import { addDays, cupRound, playoffRound, weekday, type CalendarData } from './model';

export interface BigDay {
  date: string;
  /** The small label on the day: "Christmas", "Trade deadline". */
  label: string;
  /** One plain sentence on why the day matters. */
  why: string;
  kind: 'holiday' | 'nba';
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** The n-th `dow` (0 = Sunday) of a month; n = -1: the last one. */
export function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n > 0) {
    const first = weekday(iso(year, month, 1));
    return iso(year, month, 1 + ((dow - first + 7) % 7) + 7 * (n - 1));
  }
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(iso(year, month, days));
  return iso(year, month, days - ((last - dow + 7) % 7));
}

/** The US national (federal) holidays, on their real day (not the day off when one falls on a weekend). */
const HOLIDAYS: { label: string; why: string; date: (year: number) => string }[] = [
  { label: "New Year's Day", why: 'the first day of the year, and almost everybody is at home', date: (y) => iso(y, 1, 1) },
  { label: 'MLK Day', why: 'a holiday for Martin Luther King Jr., with NBA games from lunch until night', date: (y) => nthWeekday(y, 1, 1, 3) },
  { label: "Presidents' Day", why: 'a holiday, so lots of people have the day off', date: (y) => nthWeekday(y, 2, 1, 3) },
  { label: 'Memorial Day', why: 'a holiday at the start of summer, in the middle of the playoffs', date: (y) => nthWeekday(y, 5, 1, -1) },
  { label: 'Juneteenth', why: 'a holiday in June, when the NBA Finals are played', date: (y) => iso(y, 6, 19) },
  { label: 'Independence Day', why: "the country's birthday, with fireworks at night", date: (y) => iso(y, 7, 4) },
  { label: 'Labor Day', why: 'a holiday at the end of summer, a few weeks before the teams come back', date: (y) => nthWeekday(y, 9, 1, 1) },
  { label: 'Columbus Day', why: 'a holiday for some people, just before the season starts', date: (y) => nthWeekday(y, 10, 1, 2) },
  { label: 'Veterans Day', why: 'a holiday to thank the people who were soldiers', date: (y) => iso(y, 11, 11) },
  { label: 'Thanksgiving', why: 'families eat a big dinner together and the NBA takes the day off', date: (y) => nthWeekday(y, 11, 4, 4) },
  { label: 'Christmas', why: 'the whole country watches these games', date: (y) => iso(y, 12, 25) },
];

/** A year's holidays, in date order. */
export function usHolidays(year: number): BigDay[] {
  return HOLIDAYS.map((h) => ({ date: h.date(year), label: h.label, why: `${h.label}: ${h.why}`, kind: 'holiday' as const })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * NBA dates the schedule feed doesn't carry, added by hand, by season. 2026-27 from NBA.com's key dates (read
 * 2026-11-20): trade deadline Feb 11, play-in Apr 13–16, playoffs from Apr 17. The 2027 Finals had no dates yet.
 * A date the feed gives later (play-in, playoffs, Finals games) wins over the one written here.
 */
export const EXTRA_DAYS: Record<string, { date: string; label: string; why: string; key?: 'play-in' | 'playoffs' | 'finals' }[]> = {
  '2026-27': [
    { date: '2027-02-11', label: 'Trade deadline', why: 'Trade deadline: the last day teams can swap players this season' },
    { date: '2027-04-13', label: 'Play-in', why: 'Play-in: the teams in 7th to 10th place fight for the last playoff spots', key: 'play-in' },
    { date: '2027-04-14', label: 'Play-in', why: 'Play-in: the teams in 7th to 10th place fight for the last playoff spots', key: 'play-in' },
    { date: '2027-04-15', label: 'Play-in', why: 'Play-in: the teams in 7th to 10th place fight for the last playoff spots', key: 'play-in' },
    { date: '2027-04-16', label: 'Play-in', why: 'Play-in: the teams in 7th to 10th place fight for the last playoff spots', key: 'play-in' },
    { date: '2027-04-17', label: 'Playoffs start', why: 'Playoffs start: from today a team that loses four times to the same team goes home', key: 'playoffs' },
  ],
};

const WHY = {
  opening: 'Opening night: the first games of the new season',
  xmasGames: 'Christmas Day: the whole country watches these games',
  mlkGames: 'MLK Day: a holiday for Martin Luther King Jr., with NBA games from lunch until night',
  qf: 'NBA Cup quarterfinals: win and stay in the Cup, lose and you are out',
  sf: 'NBA Cup semifinals: the last four teams play for a place in the final',
  cupFinal: 'NBA Cup final: the winner takes the Cup home',
  allStar: 'All-Star break: no games for a few days while the best players play each other for fun',
  lastDay: 'Last day of the regular season: every team plays its last game on the same day',
  playIn: 'Play-in: the teams in 7th to 10th place fight for the last playoff spots',
  playoffs: 'Playoffs start: from today a team that loses four times to the same team goes home',
  finals: 'NBA Finals: the last two teams play for the title',
};

const cache = new WeakMap<object, Map<string, BigDay[]>>();

/** Every marked day of the season on show (its two calendar years' holidays and the NBA's dates), by date. */
export function bigDays(data: CalendarData): Map<string, BigDay[]> {
  let out = cache.get(data);
  if (out) return out;
  out = new Map();
  const add = (d: BigDay) => {
    const list = out!.get(d.date) ?? [];
    // one line per label a day (Christmas the holiday and Christmas the games are one mark, the games' sentence kept)
    const same = list.findIndex((x) => x.label === d.label);
    if (same >= 0) list[same] = d.kind === 'nba' ? d : list[same]!;
    else list.push(d);
    out!.set(d.date, list);
  };
  const nba = (date: string, label: string, why: string) => add({ date, label, why, kind: 'nba' });
  const start = Number(data.seasonYear.slice(0, 4)) || Number((data.dates[0] ?? '').slice(0, 4));
  if (start) for (const y of [start, start + 1]) usHolidays(y).forEach(add);

  const first = data.dates[0];
  if (first) nba(first, 'Opening night', WHY.opening);
  const xmas = `${start}-12-25`;
  if (data.byDate.get(xmas)?.length) nba(xmas, 'Christmas', WHY.xmasGames);
  const mlk = nthWeekday(start + 1, 1, 1, 3);
  if (data.byDate.get(mlk)?.length) nba(mlk, 'MLK Day', WHY.mlkGames);

  const seen = { playIn: false, playoffs: false, finals: false };
  let lastRegular = '';
  for (const g of data.games) {
    const r = cupRound(g);
    if (r === 'qf') nba(g.dateEt, 'Cup quarterfinals', WHY.qf);
    else if (r === 'sf') nba(g.dateEt, 'Cup semifinals', WHY.sf);
    else if (r === 'final') nba(g.dateEt, 'Cup final', WHY.cupFinal);
    if (g.gameType === 'regular' && g.dateEt > lastRegular) lastRegular = g.dateEt;
    if (g.gameType === 'play-in') {
      seen.playIn = true;
      nba(g.dateEt, 'Play-in', WHY.playIn);
    }
    if (g.gameType === 'playoffs' && playoffRound(g)?.round === 4) {
      seen.finals = true;
      nba(g.dateEt, 'NBA Finals', WHY.finals);
    }
  }
  const playoffStart = data.games.filter((g) => g.gameType === 'playoffs').reduce<string>((m, g) => (!m || g.dateEt < m ? g.dateEt : m), '');
  if (playoffStart) {
    seen.playoffs = true;
    nba(playoffStart, 'Playoffs start', WHY.playoffs);
  }
  if (lastRegular) nba(lastRegular, 'Last day', WHY.lastDay);

  // the All-Star break: the longest run of days without a game in February (4 or more)
  const feb = data.dates.filter((d) => d.startsWith(`${start + 1}-02`) || d.startsWith(`${start + 1}-03-0`));
  let gap: [string, string] | undefined;
  for (let i = 1; i < feb.length; i++) {
    const from = addDays(feb[i - 1]!, 1);
    const to = addDays(feb[i]!, -1);
    const len = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (len >= 4 && (!gap || len > (Date.parse(gap[1]) - Date.parse(gap[0])) / 86_400_000 + 1)) gap = [from, to];
  }
  if (gap) for (let d = gap[0]; d <= gap[1]; d = addDays(d, 1)) nba(d, 'All-Star break', WHY.allStar);

  for (const x of EXTRA_DAYS[data.seasonYear] ?? []) {
    if ((x.key === 'play-in' && seen.playIn) || (x.key === 'playoffs' && seen.playoffs) || (x.key === 'finals' && seen.finals)) continue;
    nba(x.date, x.label, x.why);
  }
  cache.set(data, out);
  return out;
}

/** A day's label ("Christmas", "MLK Day · Trade deadline") and its tooltip (a sentence per mark), or undefined. */
export function bigDayOf(data: CalendarData, date: string): { label: string; tip: string } | undefined {
  const list = bigDays(data).get(date);
  return list?.length ? { label: list.map((d) => d.label).join(' · '), tip: list.map((d) => d.why).join('\n') } : undefined;
}
