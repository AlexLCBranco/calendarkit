// Team Calendar cells (round 4, item 4): the short 3-in-4 chip "3in4·2nd" and one green "TV" pill, both with the full
// text in the floating tooltip (hover and focus); the Team List keeps "3-in-4 · 2nd" and the names. Desktop widths.

import { expect, test } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

test('Team Calendar: "3in4·…" chip and "TV" pill with full-text tooltips; Team List unchanged', async ({ page }, info) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/?view=team&layout=calendar&team=LAL');
  await expect(page.locator('.ck-team-grid[data-scale]')).toBeVisible();
  console.log(`[cells] ${info.project.name} team calendar scale ${await page.locator('.ck-team-grid').getAttribute('data-scale')}`);
  const tip = page.getByTestId('tooltip');
  const pill = page.locator('.ck-day-cell [data-testid="tv-badge"]').first();
  await expect(pill).toHaveText('TV');
  await pill.hover();
  await expect(tip).toHaveText((await pill.getAttribute('data-tip'))!);
  expect(await pill.getAttribute('data-tip')).toMatch(/^[A-Z][\w ]+( · [A-Z][\w ]+)*$/);
  await page.mouse.move(2, 2);
  const chip = page.locator('.ck-day-cell [data-testid="tif"]').first();
  await expect(chip).toHaveText(/^3in4·(1st|2nd|3rd)$/);
  await chip.focus();
  await expect(tip).toHaveText(/^3 games in 4 days — (set|\d sets):/);
  await page.goto('/?view=team&layout=list&team=LAL');
  await expect(page.locator('[data-testid="team-list"] [data-testid="tif"]').first()).toHaveText(/^3-in-4 · (1st|2nd|3rd)$/);
  await expect(page.locator('[data-testid="team-list"] .ck-tv-name').first()).toBeAttached();
});
