// Round 21 (item 6): page history on a real browser — the browser's back / forward and the in-app ← → walk the pages;
// back puts the page back as it was, scroll position included (Slate, Team List's top row); a day step is not a page.
// Alt+← / → and the mouse's side buttons are the browser window's own back / forward, which headless Chromium doesn't
// have (tests/history.test.tsx checks the app never takes Alt+arrows for itself).

import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { destination, pickScope } from './nav';
import { titleFor } from './nav';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
const tab = (page: Page, list: string, name: string) => page.getByRole('tablist', { name: list }).getByRole('tab', { name, exact: true });
const scrollOf = (page: Page, id: string) => page.getByTestId(id).evaluate((e) => Math.round(e.scrollTop));

test('back / forward / in-app arrows walk the pages; a page comes back as it was, scroll included', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 }); // the Slate's 15 cards scroll
  await page.clock.setFixedTime(NOW);
  // Dec 22, then a day step to Dec 23 (15 games: the Slate scrolls) — a day step is not a page
  await page.goto(`${APP}?view=league&layout=slate&date=2026-12-22`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await page.getByLabel('Next day').click();
  await expect(page.getByTestId('day-title')).toHaveText(titleFor(page, 'Wednesday, December 23, 2026'));
  await expect(page.getByTestId('page-back')).toBeDisabled();
  // scroll the Slate down (a busy night), then go to a team's list and scroll it
  const slate = page.getByTestId('slate');
  await slate.evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForTimeout(100);
  const slateTop = await scrollOf(page, 'slate');
  expect(slateTop).toBeGreaterThan(50);
  const day = await page.getByTestId('day-title').textContent();
  await pickScope(page, 'Boston Celtics');
  await expect(page.getByTestId('team-list')).toBeVisible();
  await page.getByTestId('team-list').evaluate((e) => (e.scrollTop = 400));
  await page.waitForTimeout(300); // the title follows the scrolling
  const teamTitle = await page.getByTestId('team-day-title').textContent();
  await destination(page, 'Cup').click();
  await expect(page.getByTestId('cup')).toBeVisible();
  await expect(page.getByTestId('page-back')).toHaveAttribute('title', /^Back to Boston Celtics, /);

  // browser back: the team list at the row it was scrolled to
  await page.goBack();
  await expect(page.getByTestId('team-list')).toBeVisible();
  await expect(page.getByTestId('team-day-title')).toHaveText(teamTitle!);
  // back again: the Slate on its day, scrolled where it was
  await page.goBack();
  await expect(page.getByTestId('slate')).toBeVisible();
  await expect(page.getByTestId('day-title')).toHaveText(day!);
  await expect.poll(() => scrollOf(page, 'slate')).toBe(slateTop);
  await expect(page.getByTestId('page-back')).toBeDisabled();
  await expect(page.getByTestId('page-forward')).toHaveAttribute('title', /^Forward to Boston Celtics, /);
  // forward and the in-app →
  await page.goForward();
  await expect(page.getByTestId('team-list')).toBeVisible();
  await page.getByTestId('page-forward').click();
  await expect(page.getByTestId('cup')).toBeVisible();
  await expect(page.getByTestId('page-forward')).toBeDisabled();
  // the in-app ← twice
  await page.getByTestId('page-back').click();
  await expect(page.getByTestId('team-list')).toBeVisible();
  await page.getByTestId('page-back').click();
  await expect(page.getByTestId('slate')).toBeVisible();
  // the address names each page
  expect(new URL(page.url()).searchParams.get('layout')).toBe('slate');
});

test('the Cup’s sub-views are pages too; a reload keeps the view (and opens on today)', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=cup`);
  await expect(page.getByTestId('cup')).toBeVisible();
  await tab(page, 'Cup view', 'Schedule').click();
  await tab(page, 'Cup layout', 'By date').click();
  await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
  await page.goBack();
  await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'group');
  await page.goBack();
  await expect(page.getByTestId('cup')).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
  expect(page.url()).toMatch(/view=cup&cup=schedule&cl=league&by=date/);
  await page.reload();
  await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
  // after a reload, back still knows the page before
  await expect(page.getByTestId('page-back')).toBeEnabled();
});
