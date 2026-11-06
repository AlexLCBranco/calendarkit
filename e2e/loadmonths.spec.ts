// Round 21 (item 3): on a real layout, "Load earlier games" adds the month above without moving the row on screen,
// "Load more games" adds the month below without moving it either, and only the months asked for are rendered; the map
// keeps following the hovered row. Desktop widths.

import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
/** The first row on screen in the list, and where it is. */
const firstRow = (page: Page) =>
  page.getByTestId('team-list').evaluate((l) => {
    const top = l.getBoundingClientRect().top;
    // the first row still (partly) on screen
    const r = [...l.querySelectorAll<HTMLElement>('.ck-daylist > [data-row-date]')].find((e) => e.getBoundingClientRect().bottom > top + 1)!;
    return { date: r.dataset.rowDate!, y: r.getBoundingClientRect().top };
  });
/** Where a given row is on screen. */
const yOf = (page: Page, date: string) => page.locator(`.ck-daylist > [data-row-date="${date}"]`).evaluate((e) => e.getBoundingClientRect().top);
const months = (page: Page) => page.locator('[data-testid="team-list"] [data-row-date]').evaluateAll((rs) => [...new Set(rs.map((r) => r.getAttribute('data-row-date')!.slice(0, 7)))]);

test('load earlier / more: the row on screen stays where it was; one month per click; the map still follows', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=team&layout=list&team=BOS`);
  await expect(page.getByTestId('team-list')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await months(page)).toEqual(['2026-11']);
  // the button sits above the month's first row: scrolled up to it, as a person does
  await page.getByTestId('team-list').evaluate((l) => (l.scrollTop = 0));
  await page.waitForTimeout(200);
  const before = await firstRow(page);
  expect(before.date).toBe('2026-11-01');
  await page.getByTestId('load-earlier').click();
  await expect(page.getByTestId('season-start')).toBeVisible();
  expect(await months(page)).toEqual(['2026-10', '2026-11']);
  // the row that was under the button is where it was (October's rows came above it)
  expect(Math.abs((await yOf(page, before.date)) - before.y)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('team-month')).toHaveText('October – November 2026');
  await page.getByTestId('team-list').evaluate((l) => (l.scrollTop = l.scrollHeight));
  await page.waitForTimeout(200);
  const low = await firstRow(page);
  // scrolled to the bottom: the last row reaches the top, "Load more games" under it (the spacer counts the button)
  const lastDate = await page.locator('[data-testid="team-list"] .ck-daylist > [data-row-date]').last().getAttribute('data-row-date');
  expect(low.date).toBe(lastDate);
  await expect(page.getByTestId('load-more')).toBeInViewport();
  await page.getByTestId('load-more').click();
  expect(await months(page)).toEqual(['2026-10', '2026-11', '2026-12']);
  expect(Math.abs((await yOf(page, low.date)) - low.y)).toBeLessThanOrEqual(1);
  // the map (desktop-xl: beside the list) still follows the hovered row, an October one too
  if (await page.locator('.ck-map-slot .ck-map-svg').count()) {
    const row = page.locator('[data-testid="team-list"] .ck-card[data-game-id]').filter({ hasText: ' @ ' }).first();
    await row.scrollIntoViewIfNeeded();
    await row.locator('.ck-time').hover();
    await expect(page.getByTestId('map-info')).toContainText('Game ');
  }
});
