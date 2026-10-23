// Smoke test: the app loads, league and team views render, no console errors. Screenshots for review go to
// e2e/screenshots/ (git-ignored).

import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e/screenshots/${project}-${name}.png`, fullPage: true });

test('league view and team view render without console errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');

  // League view (default): a day with games, week strip, TV filter.
  await expect(page.getByTestId('day-title')).toBeVisible();
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  const all = await page.locator('[data-game-id]').count();
  await shot(page, 'league-day', info.project.name);

  await page.getByLabel('TV games only').check();
  const tv = await page.locator('[data-game-id]').count();
  expect(tv).toBeLessThanOrEqual(all);
  await expect(page.locator('[data-game-id]:not(:has([data-testid="tv-badge"]))')).toHaveCount(0);
  await page.getByLabel('TV games only').uncheck();

  // Month navigator → click a day → back on the day view for that date.
  await page.getByRole('button', { name: 'Month' }).click();
  await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
  await shot(page, 'league-month', info.project.name);
  const day = page.locator('.ck-count-cell:not([disabled])').last();
  const date = await day.getAttribute('data-date');
  await day.click();
  await expect(page).toHaveURL(new RegExp(`date=${date}`));
  await expect(page.locator('[data-game-id]').first()).toBeVisible();

  // Team view.
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByLabel('Team').selectOption({ label: 'Los Angeles Lakers' });
  await expect(page).toHaveURL(/team=LAL/);
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  await shot(page, 'team-month', info.project.name);

  expect(errors).toEqual([]);
});

test('deep link opens the team view for a team', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=team&team=BOS');
  await expect(page.getByLabel('Team')).toHaveValue('1610612738');
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  expect(errors).toEqual([]);
});
