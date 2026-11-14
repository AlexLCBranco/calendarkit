// Active day in a real browser: the Team List highlights the row at the top (the League List did the
// which shows one day at a time). 150 ms fade (opacity only).

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

// The League List shows one day, so the strip-day highlight (header, band) is gone.
test('League List: no active-day highlight (one day on screen), also after the wheel and a strip click', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-17');
  const lit = () => page.evaluate(() => document.querySelectorAll('.ck-active-day, .ck-hl.ck-hl-on').length);
  expect(await lit()).toBe(0);
  await page.getByTestId('league-list').hover();
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 500);
  await page.getByRole('tablist', { name: 'Week' }).getByRole('tab', { name: /^Thursday, November 19/ }).click();
  await settle(page);
  expect(await lit()).toBe(0);
});

// The Team List has no day strip (its rows show their dates), so nothing marks an "active" row; the title follows.
test('Team List: no day strip and no highlighted row, also after the wheel; the title follows', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  await expect(page.getByTestId('week-strip')).toHaveCount(0);
  const title = await page.getByTestId('team-day-title').textContent();
  await list.hover();
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400); // the title catches up every 120 ms and when the list stops
  expect(await page.evaluate(() => document.querySelectorAll('.ck-active-day, .ck-hl').length)).toBe(0);
  await expect(page.getByTestId('week-strip')).toHaveCount(0);
  expect(await page.getByTestId('team-day-title').textContent()).not.toBe(title);
});
