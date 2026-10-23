// Smoke test: the app loads, league and team views render, no console errors. Screenshots for review go to
// e2e/screenshots/ (git-ignored).

import { expect, test, type Page } from '@playwright/test';
import { isRotationkitConfigured } from '../src/config';

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

  // League → Month (full month on desktop/tablet, count navigator on phone) → click a day → day view.
  await page.getByRole('button', { name: 'Month' }).click();
  const full = info.project.name !== 'phone';
  await expect(page.getByRole('region', { name: full ? 'League month' : 'Month navigator' })).toBeVisible();
  await shot(page, 'league-month', info.project.name);
  const day = page.locator(full ? '.ck-month-cell.ck-cell-game' : '.ck-count-cell:not([disabled])').last();
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

test('league month: every game listed with local logos, no broken images, no sideways scroll', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn: string[] = [];
  page.on('request', (r) => r.url().includes('cdn.nba.com') && cdn.push(r.url()));
  await page.goto('/?view=league&date=2026-11-02'); // Nov 2: 15 games
  await page.getByRole('button', { name: 'Month' }).click();

  if (info.project.name === 'phone') {
    await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
    await expect(page.getByLabel('November 2: 15 games')).toBeVisible();
    await expect(page.locator('.ck-month-game')).toHaveCount(0);
  } else {
    await expect(page.getByRole('region', { name: 'League month' })).toBeVisible();
    await expect(page.locator('[data-date="2026-11-02"] .ck-month-game')).toHaveCount(15);
    // All logos loaded (none broken), and every line fits its cell (nothing clipped).
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const report = await page.evaluate(() => ({
      images: document.images.length,
      broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src),
      clipped: [...document.querySelectorAll('.ck-month-game')].filter((l) => l.scrollWidth > l.clientWidth + 1 || l.getBoundingClientRect().right > l.closest('.ck-cell')!.getBoundingClientRect().right + 0.5).length,
    }));
    expect(report.images).toBeGreaterThan(300);
    expect(report.broken).toEqual([]);
    expect(report.clipped).toBe(0);
    await shot(page, 'league-month-nov', info.project.name);
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(cdn).toEqual([]);
  expect(errors).toEqual([]);
});

test('Rotations action on a finished day only when ROTATIONKIT_BASE_URL is set', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=league&date=2026-10-21'); // opening night week: long over
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  const games = await page.locator('[data-game-id]').count();
  await expect(page.getByTestId('open-game')).toHaveCount(isRotationkitConfigured() ? games : 0);
  expect(errors).toEqual([]);
});

test('deep link opens the team view for a team', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=team&team=BOS');
  await expect(page.getByLabel('Team')).toHaveValue('1610612738');
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  expect(errors).toEqual([]);
});
