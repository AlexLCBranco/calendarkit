// Smoke tests for the views that are "in flux" (PROJECT.md, Test tiers): the top bar / menu and the League List's
// rows. One test each: it loads, shows the right games for a fixed date, and logs no console errors. On purpose no
// layout or position assertions: these views are still being reshaped, and a test that pins pixels would only be
// rewritten with every change.

import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { destination, setOption } from './nav';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
const DAY = '2026-11-02'; // a 15-game night, all played

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The day's game ids from the served snapshot (independent of the app's code), in any order. */
const feedDay = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    type G = { gameId: string; gameDateEst: string };
    return (raw.leagueSchedule.gameDates as { games: G[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId) && g.gameDateEst.startsWith(date))
      .map((g) => g.gameId)
      .sort();
  }, date);
const shownIds = (page: Page) => page.getByTestId('league-list').locator('[data-game-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-game-id')!).sort());

// Both menus while Alex tries them (Menu.tsx; the one not picked gets deleted): the same smoke for each
for (const menu of ['packed', 'rail'] as const)
  test(`smoke: top bar, ${menu} menu — every destination opens from it, the day controls show the right games, no console errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript((m) => localStorage.setItem('ck:menu:v1', m), menu);
    await page.clock.setFixedTime(NOW);
    await page.goto(`${APP}?view=league&layout=list&date=${DAY}`);
    await expect(page.getByTestId('top-bar')).toHaveAttribute('data-menu', menu);
    await expect(page.getByTestId('rail')).toHaveCount(menu === 'rail' ? 1 : 0);
    await expect(page.getByTestId('day-title')).toContainText('2, 2026');
    expect(await shownIds(page)).toEqual(await feedDay(page, DAY));
    // the day controls: next day, then back
    await page.getByLabel('Next day').click();
    await expect.poll(() => shownIds(page)).toEqual(await feedDay(page, '2026-11-03'));
    await page.getByLabel('Previous day').click();
    await expect.poll(() => shownIds(page)).toEqual(await feedDay(page, DAY));
    // the options: TV games only from the Options popover
    await setOption(page, 'TV games only', true);
    await expect(page).toHaveURL(/tv=1/);
    await setOption(page, 'TV games only', false);
    // every destination
    await destination(page, 'Cup').click();
    await expect(page.getByTestId('cup')).toBeVisible();
    await destination(page, 'Standings').click();
    await expect(page.getByTestId('standings-table').first()).toBeVisible();
    await destination(page, 'Schedule').click();
    await expect.poll(() => shownIds(page)).toEqual(await feedDay(page, DAY));
    // page history from wherever the menu has it
    await page.getByTestId('page-back').click();
    await expect(page.getByTestId('standings-table').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

test('smoke: the menu switch in ⓘ — Rail and Packed bar, remembered across a new visit', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=list&date=${DAY}`);
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-menu', 'packed');
  await page.getByTestId('bar-info').click();
  await page.getByRole('tablist', { name: 'Menu layout' }).getByRole('tab', { name: 'Rail' }).click();
  await expect(page.getByTestId('rail')).toBeVisible();
  await page.goto(`${APP}?view=standings`);
  await expect(page.getByTestId('rail')).toBeVisible();
  await page.getByTestId('bar-info').click();
  await page.getByRole('tablist', { name: 'Menu layout' }).getByRole('tab', { name: 'Packed bar' }).click();
  await expect(page.getByTestId('rail')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ck:menu:v1'))).toBe('packed');
  expect(errors).toEqual([]);
});

test('smoke: League List — the fixed day\'s games with teams, scores and records, no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=list&date=${DAY}`);
  await expect(page.getByTestId('league-list').locator('[data-game-id]').first()).toBeVisible();
  const want = await feedDay(page, DAY);
  expect(want.length).toBe(15);
  expect(await shownIds(page)).toEqual(want);
  // every row: "AWAY a @ h HOME" and both records (data, not layout)
  const rows = await page.getByTestId('league-list').locator('.ck-card').evaluateAll((cards) =>
    cards.map((c) => ({
      teams: [...c.querySelectorAll('.ck-team')].map((t) => t.textContent!.trim()),
      scores: c.querySelectorAll('.ck-score').length,
      recs: [...c.querySelectorAll('.ck-rec')].map((r) => r.textContent),
    })),
  );
  for (const r of rows) {
    expect(r.teams).toHaveLength(2);
    expect(r.scores).toBe(2);
    expect(r.recs.every((x) => /^\d+-\d+$/.test(x ?? ''))).toBe(true);
  }
  // the legend: in the ⓘ popover, not under the list
  await expect(page.getByTestId('league-list').locator('xpath=..').getByTestId('fatigue-legend')).toHaveCount(0);
  await page.getByTestId('bar-info').click();
  await expect(page.getByTestId('bar-info-pop').getByTestId('fatigue-legend')).toContainText('back-to-back, 1st night');
  expect(errors).toEqual([]);
});
