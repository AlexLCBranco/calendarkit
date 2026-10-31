// Round 9: the Team List shows one calendar month. Tests that check every row of a season walk its months through the
// real UI — desktop/tablet: the date picker (its ‹ › months, then the month's first day); phones: the top bar's ‹ ›.

import { fireEvent, screen, within } from '@testing-library/react';
import { addMonths, hasNationalTv, monthOf, teamGames, type CalendarData } from '../src/data/model';
import { fmtMonth } from '../src/components/widget';

/** The months from a team's first to its last game (TV filter applied). */
export function teamMonths(data: CalendarData, teamId: number, tvOnly = false): string[] {
  const games = teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g));
  const out: string[] = [];
  for (let m = monthOf(games[0]!.dateEt); m <= monthOf(games.at(-1)!.dateEt); m = addMonths(m, 1)) out.push(m);
  return out;
}

/** "November 2026" → "2026-11". */
function monthFromTitle(text: string): string {
  for (let m = '2026-09'; m <= '2027-07'; m = addMonths(m, 1)) if (fmtMonth(m) === text) return m;
  throw new Error(`no month "${text}"`);
}

/** The month the Team List shows ("YYYY-MM"), from its title. */
export const shownMonth = () => monthFromTitle(screen.getByTestId('team-month').textContent!);

/** Shows `month` in the Team List through the UI. */
export function showTeamMonth(month: string): void {
  const pick = screen.queryByRole('button', { name: 'Pick a date' });
  if (!pick) {
    // phone: the month title's own arrows
    for (let i = 0; i < 24 && shownMonth() !== month; i++) fireEvent.click(screen.getByRole('button', { name: shownMonth() < month ? 'Next month' : 'Previous month' }));
  } else {
    if (shownMonth() === month) return;
    fireEvent.click(pick);
    const popup = screen.getByRole('dialog', { name: 'Pick a date' });
    for (let i = 0; i < 24; i++) {
      const at = monthFromTitle(within(popup).getByTestId('period-title').textContent!);
      if (at === month) break;
      fireEvent.click(within(popup).getByRole('button', { name: at < month ? 'Next month' : 'Previous month' }));
    }
    const day = [...popup.querySelectorAll<HTMLButtonElement>('[data-date]')].find((c) => c.dataset.date!.startsWith(month) && !c.disabled);
    fireEvent.click(day!);
  }
  if (shownMonth() !== month) throw new Error(`asked for ${month}, showing ${shownMonth()}`);
}

/** Calls `fn` with each of the team's months shown in turn (the rows are those of that month only). */
export function eachTeamMonth(data: CalendarData, teamId: number, fn: (month: string) => void, tvOnly = false): void {
  for (const m of teamMonths(data, teamId, tvOnly)) {
    showTeamMonth(m);
    fn(m);
  }
}

/** Collects `get(root)` for every month of the team, in order. */
export function acrossMonths<T>(data: CalendarData, teamId: number, get: () => T[], tvOnly = false): T[] {
  const out: T[] = [];
  eachTeamMonth(data, teamId, () => out.push(...get()), tvOnly);
  return out;
}
