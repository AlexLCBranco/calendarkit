// The two-row top bar on a real layout — the date block sits on the same pixels in every Schedule
// view (the date label is fixed-width, so "November 2026" and "Wednesday, September 30, 2026" take the same room), row 1
// keeps its pieces in place across Schedule, Cup and Standings, and Slate opened from a team on a day it doesn't play
// says so. Desktop widths.

import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { destination, pickScope } from './nav';
import { titleFor } from './nav';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
const tab = (page: Page, list: string, name: string) => page.getByRole('tablist', { name: list }).getByRole('tab', { name, exact: true });
const box = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(',');
};

test('the date block and the views never move between Schedule views', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=list`);
  await expect(page.getByTestId('date-block')).toBeVisible();
  const steps: [string, () => Promise<unknown>][] = [
    ['League List', async () => {}],
    ['Slate', () => tab(page, 'Layout', 'Slate').click()],
    ['League Calendar', () => tab(page, 'Layout', 'Calendar').click()],
    ['League Calendar 2 weeks', () => tab(page, 'Weeks', '2 weeks').click()],
    ['Team Calendar', () => pickScope(page, 'Minnesota Timberwolves')],
    ['Team Calendar 1 week', () => tab(page, 'Span', '1 week').click()],
    ['Team List', () => tab(page, 'Layout', 'List').click()],
    ['Team List, a long date', async () => page.getByTestId('team-day-title').evaluate((e) => (e.textContent = 'Wednesday, September 30, 2026'))],
  ];
  const seen: Record<string, string> = {};
  for (const [name, go] of steps) {
    await go();
    await page.waitForTimeout(150);
    seen[name] = `${await box(page, '[data-testid="date-block"]')} | ${await box(page, '[role=tablist][aria-label="Layout"]')} | ${await box(page, '[data-testid="date-block"] .ck-nav-title')}`;
  }
  const first = Object.values(seen)[0];
  for (const [name, at] of Object.entries(seen)) expect(at, name).toBe(first);
  // and nothing in the bar is wider than the page
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('row 1 is the same in Schedule, Cup and Standings', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=list`);
  const row = async () => [await box(page, '[role=tablist][aria-label="Destination"]'), await box(page, '[data-testid="standings-button"]'), await box(page, '[data-testid="copy-view"]'), await box(page, '[data-testid="tz-note"]')].join(' | ');
  const schedule = await row();
  await destination(page, 'Cup').click();
  await expect(page.getByTestId('cup')).toBeVisible();
  expect(await row()).toBe(schedule);
  await destination(page, 'Standings').click();
  await expect(page.getByTestId('standings-table').first()).toBeVisible();
  expect(await row()).toBe(schedule);
  await destination(page, 'Schedule').click();
  await pickScope(page, 'Boston Celtics');
  expect(await row()).toBe(schedule);
});

test('Slate from a team on a day it doesn’t play: the day’s Slate with "XXX doesn’t play today"', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(APP);
  // a team without a game today (Nov 15), from the served snapshot
  const idle = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    type G = { gameDateEst: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => g.gameDateEst.startsWith('2026-11-15'));
    const busy = new Set(games.flatMap((g: { homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } }) => [g.homeTeam.teamTricode, g.awayTeam.teamTricode]));
    return ['BOS', 'MIA', 'DEN', 'LAL', 'NYK', 'ATL', 'CHI', 'DAL', 'PHX', 'UTA'].find((t) => !busy.has(t))!;
  });
  // the team's list opened on today (a team link's `on=`): with rest rows, its top row is today
  await page.goto(`${APP}?view=team&layout=list&team=${idle}&on=2026-11-15`);
  await expect(page.getByTestId('team-day-title')).toHaveText(titleFor(page, 'Sunday, November 15, 2026'));
  await tab(page, 'Layout', 'Slate').click();
  await expect(page.getByTestId('day-title')).toHaveText(titleFor(page, 'Sunday, November 15, 2026'));
  await expect(page.getByTestId('slate-no-team')).toHaveText(`${idle} doesn’t play today`);
  await expect(page.getByTestId('bar-local').getByTestId('team-picker')).toContainText('All teams');
});
