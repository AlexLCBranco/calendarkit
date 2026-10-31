// Team Calendar cells (round 4, item 4): one green "TV" pill with the names in the floating tooltip (hover and focus);
// round 7 (1.3): the merged 3-in-4 chip "4in6 · 2nd" as everywhere else (was the short "3in4·2nd"), its tooltip the
// stretch in words + the day strip. The Team List keeps the names. Desktop widths.

import { expect, test } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

test('Team Calendar: merged "4in6 · 2nd" chip and "TV" pill with full-text tooltips; Team List unchanged', async ({ page }, info) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=team&layout=calendar&team=LAL');
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
  await expect(chip).toHaveText(/^\d+in\d+ · \d+(st|nd|rd|th)$/);
  await chip.focus();
  await expect(tip).toContainText(/^\d+in\d+ · \d+(st|nd|rd|th): \d+ games in \d+ days \(/);
  await expect(page.getByTestId('tip-days')).toBeVisible();
  await page.goto('/calendar/?view=team&layout=list&team=LAL');
  await expect(page.locator('[data-testid="team-list"] .ck-fx-chip').first()).toHaveText(/^\d+in\d+ · \d+(st|nd|rd|th)$/); // the Fatigue component's chip (round 6: the merged stretch)
  await expect(page.locator('[data-testid="team-list"] .ck-tv-name').first()).toBeAttached();
});
