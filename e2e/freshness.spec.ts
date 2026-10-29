// Data freshness in a real browser (desktop widths): "Data updated …" from the served snapshot's meta.time in the
// viewer's zone (America/Sao_Paulo in this config), orange with a tooltip past 36 h (mocked clock), the top bar still
// one row at 1920 px; "Try again" reloads after a failed first request.

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const H = 3_600_000;
const metaTime = async (page: Page) => {
  await page.goto('/data/schedule.json');
  return (JSON.parse(await page.locator('body').innerText()) as { meta: { time: string } }).meta.time;
};
/** Expected text, worked out here (not with the app's code). */
const expected = (iso: string) =>
  `Data updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(Date.parse(iso))}, ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(Date.parse(iso))}`;

test('stamp in the viewer\'s zone, muted while fresh; orange with a tooltip after 36 h', async ({ page }, info) => {
  const time = await metaTime(page);
  await page.clock.setFixedTime(Date.parse(time) + 2 * H);
  await page.goto('/');
  const stamp = page.getByTestId('data-updated');
  await expect(stamp).toHaveText(expected(time));
  await expect(stamp).toHaveCSS('color', 'rgb(139, 147, 163)'); // --ck-muted
  await expect(stamp).toHaveCSS('font-size', '11px');
  // under the time-zone note, right-aligned with it
  const [n, s] = [await page.getByTestId('tz-note').boundingBox(), await stamp.boundingBox()];
  expect(s!.y).toBeGreaterThan(n!.y);
  expect(Math.abs(s!.x + s!.width - (n!.x + n!.width))).toBeLessThan(1);
  const bar = (await page.getByTestId('top-bar').boundingBox())!;
  if (info.project.name === 'desktop-xl') expect(bar.height).toBeLessThanOrEqual(40);
  expect(s!.y + s!.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);

  await page.clock.setFixedTime(Date.parse(time) + 37 * H);
  await page.goto('/');
  await expect(stamp).toHaveCSS('color', 'rgb(224, 138, 60)'); // --ck-stale orange (B2B is yellow since round 4)
  await stamp.hover();
  await expect(page.getByTestId('tooltip')).toContainText('daily update may have failed');
});

test('Try again: the first request fails, the retry loads the schedule', async ({ page }) => {
  let n = 0;
  await page.route('**/data/schedule.json', (route) => (++n === 1 ? route.fulfill({ status: 503, body: 'down' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('top-bar')).toBeVisible();
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(n).toBe(2);
});
