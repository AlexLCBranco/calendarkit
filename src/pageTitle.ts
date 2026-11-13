// The browser tab's title for a page: the most specific part first, so it still reads in a narrow tab
// ("BOS schedule · Nov 2026 — calendarkit", "Slate · Nov 13 — calendarkit", "Cup standings — calendarkit").

import type { ViewSnapshot } from './components/calendarState';
import { addDays, weekOf } from './data/model';
import { TEAM_BY_ID } from './data/teams';

export const SITE_NAME = 'calendarkit';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1]!;
/** "Nov 13" */
const md = (d: string) => `${mon(d)} ${Number(d.slice(8, 10))}`;
/** "Nov 2026" */
const my = (month: string) => `${mon(`${month}-01`)} ${month.slice(0, 4)}`;
/** "Nov 8 – 14", "Nov 29 – Dec 5" */
const range = (from: string, to: string) => (from.slice(0, 7) === to.slice(0, 7) ? `${md(from)} – ${Number(to.slice(8, 10))}` : `${md(from)} – ${md(to)}`);
/** "Nov 2026", "Oct – Nov 2026", "Dec 2026 – Jan 2027" */
const months = (from: string, to: string) => (from === to ? my(from) : from.slice(0, 4) === to.slice(0, 4) ? `${mon(`${from}-01`)} – ${my(to)}` : `${my(from)} – ${my(to)}`);

const CUP_TAB = { standings: 'Cup standings', schedule: 'Cup schedule', simulator: 'Cup simulator', history: 'Cup history' } as const;

/** The page's own part of the title (without the site name). */
export function pagePart(snap: ViewSnapshot): string {
  const s = snap.state;
  if (s.mode === 'standings') return 'Standings';
  if (s.mode === 'cup') return snap.cup.tab === 'history' && snap.cup.hs ? `Cup history · ${snap.cup.hs}` : CUP_TAB[snap.cup.tab] ?? 'Cup';
  if (s.mode === 'team') {
    const tri = TEAM_BY_ID.get(s.teamId)?.tricode ?? 'Team';
    if (s.layout !== 'calendar') return `${tri} schedule · ${months(snap.teamListMonth, snap.teamListTo ?? snap.teamListMonth)}`;
    if (s.teamSpan === 'month') return `${tri} schedule · ${my(snap.teamMonth)}`;
    return `${tri} schedule · ${range(snap.teamWeek, addDays(snap.teamWeek, 7 * s.teamSpan - 1))}`;
  }
  if (s.layout === 'slate') return `Slate · ${md(snap.at)}`;
  if (s.layout === 'calendar') {
    const start = weekOf(s.date)[0]!;
    return `League · ${range(start, addDays(start, 7 * s.weeks - 1))}`;
  }
  return `League · ${md(snap.at)}`;
}

/** "BOS schedule · Nov 2026 — calendarkit" */
export const pageTitle = (snap: ViewSnapshot) => `${pagePart(snap)} — ${SITE_NAME}`;
