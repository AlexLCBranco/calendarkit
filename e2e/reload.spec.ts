// Reloading the same tab keeps the day (and the month or week) on show; a fresh visit — a new tab, a typed address, a
// bookmark — opens on today. Uses Playwright's plain `test`, not ./fixtures (whose init script hands a URL's date to the
// app), so these pages see exactly what a person's browser does. The kept page lives in the tab's history entry
// (history.state), never in the address's `date=`.

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z'); // Sunday, November 15 (São Paulo: noon)
const title = (page: Page) => page.getByTestId('day-title');
const period = (page: Page) => page.getByTestId('period-title');
async function ready(page: Page) {
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

test('League List: a reload keeps the day; a new tab, a typed address or a bookmark opens on today', async ({ page, context }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=league&layout=list');
  await ready(page);
  await expect(title(page)).toHaveText(/Nov(ember)? 15, 2026/);
  await page.getByLabel('Next day').click();
  await page.getByLabel('Next day').click();
  await expect(title(page)).toHaveText(/Nov(ember)? 17, 2026/);
  await page.reload();
  await ready(page);
  await expect(title(page)).toHaveText(/Nov(ember)? 17, 2026/);
  // still the same page after a second reload, and Today still goes to today
  await page.reload();
  await ready(page);
  await expect(title(page)).toHaveText(/Nov(ember)? 17, 2026/);
  await page.getByTestId('today').click();
  await expect(title(page)).toHaveText(/Nov(ember)? 15, 2026/);
  await page.getByLabel('Next day').click();
  await expect(title(page)).toHaveText(/Nov(ember)? 16, 2026/);
  const address = page.url(); // names Nov 16 in its date=
  expect(new URL(address).searchParams.get('date')).toBe('2026-11-16');

  // a new tab with the same address (a bookmark, a pasted link): today
  const fresh = await context.newPage();
  await fresh.clock.setFixedTime(NOW);
  await fresh.goto(address);
  await ready(fresh);
  await expect(title(fresh)).toHaveText(/Nov(ember)? 15, 2026/);
  await fresh.close();

  // the same tab, an address typed in: today (another address than the one on show — the browser may treat the same
  // address typed again as a reload)
  await page.goto('/calendar/?view=league&date=2026-11-16&layout=list');
  await ready(page);
  await expect(title(page)).toHaveText(/Nov(ember)? 15, 2026/);
});

test('League Calendar, Team Calendar and Team List: a reload keeps the week, the month and the row at the top', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=league&layout=calendar');
  await ready(page);
  await expect(period(page)).toHaveText(/^Nov 15 – 21, 2026/);
  await page.getByLabel('Next week').click();
  await expect(period(page)).toHaveText(/^Nov 22 – 28, 2026/);
  await page.reload();
  await ready(page);
  await expect(period(page)).toHaveText(/^Nov 22 – 28, 2026/);

  await page.goto('/calendar/?view=team&layout=calendar&team=BOS');
  await ready(page);
  await expect(period(page)).toHaveText('November 2026');
  await page.getByLabel('Next month').click();
  await expect(period(page)).toHaveText('December 2026');
  await page.reload();
  await ready(page);
  await expect(period(page)).toHaveText('December 2026');

  // Team List: a day picked further on (another month) is the row at the top again after a reload
  await page.goto('/calendar/?view=team&layout=list&team=BOS');
  await ready(page);
  const top = page.getByTestId('team-day-title');
  const opened = await top.textContent();
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(top).not.toHaveText(opened!);
  const moved = await top.textContent();
  // the row at the top reaches the tab's history entry a moment after the scrolling stops (a person doesn't reload
  // within a quarter of a second)
  await expect.poll(() => page.evaluate(() => (history.state as { snap?: { top?: string } } | null)?.snap?.top)).toBeTruthy();
  await page.waitForTimeout(400);
  await page.reload();
  await ready(page);
  await expect(top).toHaveText(moved!);
});
