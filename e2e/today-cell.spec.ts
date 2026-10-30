// Today in the Team Calendar (round 7, 2.1), desktop widths: in Month, 1 week and 2 weeks today's cell has the league
// week view's highlight (accent border + accent day number) and no other cell has it; it moves at local midnight with
// the page open (the clock's midnight timer) and after the tab comes back. The league week view had it already.

import { expect, test, type Page } from './fixtures';

const ACCENT = 'rgb(78, 161, 255)'; // --ck-accent

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

const highlighted = (page: Page) =>
  page.locator('.ck-team-grid .ck-day-cell').evaluateAll((cells) =>
    cells
      .filter((c) => getComputedStyle(c).borderTopColor === 'rgb(78, 161, 255)' && getComputedStyle(c.querySelector('.ck-daynum')!).color === 'rgb(78, 161, 255)')
      .map((c) => (c as HTMLElement).dataset.date),
  );

test('Month, 1 week, 2 weeks: only today\'s cell, in the accent', async ({ page }) => {
  // 15:00 UTC = 12:00 in São Paulo (the projects' zone)
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00Z'));
  await page.goto('/?view=team&layout=calendar&team=LAL');
  await expect(page.locator('.ck-team-grid[data-scale]')).toBeVisible();
  expect(await highlighted(page)).toEqual(['2026-11-15']);
  expect(await page.locator('.ck-cell-today').evaluate((c) => getComputedStyle(c).boxShadow)).toContain(ACCENT);
  for (const span of ['1 week', '2 weeks']) {
    await page.getByRole('tab', { name: span }).click();
    await expect(page.locator('.ck-team-grid')).toHaveAttribute('data-weeks', span === '1 week' ? '1' : '2');
    expect(await highlighted(page), span).toEqual(['2026-11-15']);
  }
  // another week: none
  await page.getByLabel('Next 2 weeks').click();
  expect(await highlighted(page)).toEqual([]);
});

test('moves at midnight with the page open, in Month and 1 week', async ({ page }) => {
  // 23:58 in São Paulo on Saturday Nov 14 (02:58 UTC Nov 15)
  await page.clock.install({ time: new Date('2026-11-15T02:58:00Z') });
  await page.goto('/?view=team&layout=calendar&team=LAL');
  await expect(page.locator('.ck-team-grid[data-scale]')).toBeVisible();
  expect(await highlighted(page)).toEqual(['2026-11-14']);
  await page.clock.runFor('03:00'); // the midnight timer fires at 00:00
  await expect.poll(() => highlighted(page)).toEqual(['2026-11-15']);
  await page.getByRole('tab', { name: '1 week' }).click();
  expect(await highlighted(page)).toEqual(['2026-11-15']);
});
