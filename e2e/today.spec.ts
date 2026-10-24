// "Today" button, in a real browser at the desktop widths (1280, 1920): every view returns to today's games with
// one click, at once (no smooth scrolling), and the button is disabled once there. Clock: Nov 15, 2026 15:00 UTC.

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
const today = (page: Page) => page.getByTestId('today');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}
/** Click Today; ms until the frame after the click. */
const clickTime = (page: Page) =>
  page.getByTestId('today').evaluate(
    (b) =>
      new Promise<number>((res) => {
        const t0 = performance.now();
        (b as HTMLButtonElement).click();
        requestAnimationFrame(() => setTimeout(() => res(performance.now() - t0), 0));
      }),
  );
/** Distance (px) between the top of the list and the top of the element. */
const offsetInList = (page: Page, list: string, sel: string) =>
  page.evaluate(([list, sel]) => document.querySelector(sel!)!.getBoundingClientRect().top - document.querySelector(list!)!.getBoundingClientRect().top, [list, sel]);

test('League List: scrolls back to the default day, disabled there', async ({ page }) => {
  await open(page, '?view=league&layout=list');
  await expect(page.getByTestId('day-title')).toHaveText('Sunday, November 15, 2026');
  await expect(today(page)).toBeDisabled();
  const box = (await page.getByTestId('league-list').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 200);
  await expect(page.getByTestId('day-title')).not.toHaveText('Sunday, November 15, 2026');
  await expect(today(page)).toBeEnabled();
  const ms = await clickTime(page);
  await expect(page.getByTestId('day-title')).toHaveText('Sunday, November 15, 2026');
  expect(Math.abs(await offsetInList(page, '[data-testid="league-list"]', '[data-day="2026-11-15"]'))).toBeLessThan(1);
  await expect(today(page)).toBeDisabled();
  console.log(`[today] league list: click → next frame ${Math.round(ms)} ms`);
  expect(ms).toBeLessThan(250);
});

test('League Calendar: the week of the default day (1 and 2 weeks)', async ({ page }) => {
  await open(page, '?view=league&layout=calendar');
  await expect(page.getByTestId('period-title')).toContainText('Nov 15 – 21, 2026');
  await expect(today(page)).toBeDisabled();
  await page.getByLabel('Next week').click();
  await page.getByLabel('Next week').click();
  await expect(today(page)).toBeEnabled();
  await today(page).click();
  await expect(page.getByTestId('period-title')).toContainText('Nov 15 – 21, 2026');
  await expect(page.locator('[data-date="2026-11-15"].ck-cell-today')).toBeVisible();
  await page.getByRole('tab', { name: '2 weeks' }).click();
  await page.getByLabel('Previous 2 weeks').click();
  await today(page).click();
  await expect(page.getByTestId('period-title')).toContainText('Nov 15 – 28, 2026');
  await expect(today(page)).toBeDisabled();
});

test('Team Calendar: the current month', async ({ page }) => {
  await open(page, '?view=team&layout=calendar&team=BOS');
  await expect(page.getByTestId('period-title')).toHaveText('November 2026');
  await expect(today(page)).toBeDisabled();
  await page.getByLabel('Next month').click();
  await expect(today(page)).toBeEnabled();
  await today(page).click();
  await expect(page.getByTestId('period-title')).toHaveText('November 2026');
  await expect(today(page)).toBeDisabled();
});

test('Team List: scrolls back to the next game not over, disabled there', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=BOS');
  const list = '[data-testid="team-list"]';
  expect(Math.abs(await offsetInList(page, list, '[data-next]'))).toBeLessThan(1);
  await expect(today(page)).toBeDisabled();
  const box = (await page.getByTestId('team-list').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -150);
  await expect(today(page)).toBeEnabled();
  await today(page).click();
  expect(Math.abs(await offsetInList(page, list, '[data-next]'))).toBeLessThan(1);
  await expect(today(page)).toBeDisabled();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 150);
  await expect(today(page)).toBeEnabled();
});

test('the top bar keeps its height when Today changes state; one row at 1920 px', async ({ page }, info) => {
  await open(page, '?view=league&layout=list');
  const bar = page.getByTestId('top-bar');
  const h0 = (await bar.boundingBox())!.height;
  await page.getByLabel('Next day').click();
  await expect(today(page)).toBeEnabled();
  expect((await bar.boundingBox())!.height).toBe(h0);
  if (info.project.name === 'desktop-xl') expect(h0).toBeLessThanOrEqual(40);
});
