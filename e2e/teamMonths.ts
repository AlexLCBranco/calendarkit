// Round 9: the Team List shows one calendar month. e2e checks that cover every row of a season walk its months through
// the UI: the date picker's ‹ › and the month's first enabled day (desktop/tablet), or the month title's ‹ › (phones).

import { expect, type Page } from '@playwright/test';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-11" → "November 2026" */
export const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
/** "November 2026" → "2026-11" */
export const monthOfTitle = (title: string) => {
  const [m, y] = title.trim().split(' ');
  return `${y}-${String(MONTHS.indexOf(m!) + 1).padStart(2, '0')}`;
};

/** The months of a team's games in the served snapshot (regular season, Cup, play-in, playoffs), in order. */
export const teamMonths = (page: Page, tri: string) =>
  page.evaluate(async (tri) => {
    type G = { gameId: string; gameDateEst: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const dates = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri)).map((g) => g.gameDateEst.slice(0, 7));
    const out: string[] = [];
    const last = dates.sort().at(-1)!;
    for (let m = dates[0]!; m <= last; ) {
      out.push(m);
      const [y, mm] = m.split('-').map(Number) as [number, number];
      m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
    }
    return out;
  }, tri);

/** The month the Team List shows ("YYYY-MM"). */
export const shownMonth = async (page: Page) => monthOfTitle((await page.getByTestId('team-month').first().textContent())!);

/** Shows `month` in the Team List through the UI. */
export async function showMonth(page: Page, month: string) {
  if ((await shownMonth(page)) === month) return;
  const pick = page.getByRole('button', { name: 'Pick a date' });
  if (await pick.count()) {
    await pick.click();
    const popup = page.getByRole('dialog', { name: 'Pick a date' });
    for (let i = 0; i < 12; i++) {
      const at = monthOfTitle((await popup.getByTestId('period-title').textContent())!);
      if (at === month) break;
      await popup.getByRole('button', { name: at < month ? 'Next month' : 'Previous month' }).click();
    }
    await popup.locator(`[data-date^="${month}"]:not([disabled])`).first().click();
  } else {
    for (let i = 0; i < 12; i++) {
      const at = await shownMonth(page);
      if (at === month) break;
      await page.getByRole('button', { name: at < month ? 'Next month' : 'Previous month' }).click();
      await expect(page.getByTestId('team-month')).not.toHaveText(monthTitle(at));
    }
  }
  await expect(page.getByTestId('team-month').first()).toHaveText(monthTitle(month));
}

/** Runs `fn` with each of the team's months shown in turn, collecting what it returns. */
export async function eachTeamMonth<T>(page: Page, tri: string, fn: (month: string) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (const m of await teamMonths(page, tri)) {
    await showMonth(page, m);
    out.push(await fn(m));
  }
  return out;
}
