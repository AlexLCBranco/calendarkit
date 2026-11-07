// Data freshness in a real browser (desktop widths): "Data updated …" from the served snapshot's meta.time in the
// viewer's zone (America/Sao_Paulo in this config), orange with a tooltip past 36 h (mocked clock), the top bar still
// one row at 1920 px; "Try again" reloads after a failed first request.

import { expect, test, type Page } from './fixtures';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const H = 3_600_000;
const metaTime = async (page: Page) => {
  await page.goto('/calendar/data/schedule.json');
  return (JSON.parse(await page.locator('body').innerText()) as { meta: { time: string } }).meta.time;
};
/** Expected text, worked out here (not with the app's code). */
const expected = (iso: string) =>
  `Data updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(Date.parse(iso))}, ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(Date.parse(iso))}`;

test('stamp in the viewer\'s zone (ⓘ\'s tooltip), muted while fresh; orange with a tooltip after 36 h', async ({ page }, { project: { name: infoName } }) => {
  const info2 = (n: string) => n === 'desktop-xl' || n === 'desktop';
  const time = await metaTime(page);
  await page.clock.setFixedTime(Date.parse(time) + 2 * H);
  await page.goto('/calendar/');
  // round 22 (item 9): no text line in the bar — the stamp is in ⓘ's tooltip (and its screen-reader text), ⓘ muted
  const stamp = page.getByTestId('data-updated');
  await expect(stamp).toHaveText(expected(time));
  const info = page.getByTestId('bar-info');
  await expect(info).toBeVisible();
  await expect(info).toHaveCSS('color', 'rgb(139, 147, 163)'); // --ck-muted
  const bar = (await page.getByTestId('top-bar').boundingBox())!;
  const i = (await info.boundingBox())!;
  expect(i.y >= bar.y && i.y + i.height <= bar.y + bar.height + 0.5, 'ⓘ inside the bar').toBe(true);
  if (info2(infoName)) expect(bar.height).toBe(44);
  await info.hover();
  await expect(page.getByTestId('tooltip')).toContainText(`Data updated ${expected(time).replace(/^Data updated /, '')}`);

  await page.clock.setFixedTime(Date.parse(time) + 37 * H);
  await page.goto('/calendar/');
  await expect(info).toHaveCSS('color', 'rgb(224, 138, 60)'); // --ck-stale orange (B2B is yellow since round 4)
  await info.hover();
  await expect(page.getByTestId('tooltip')).toContainText('daily update may have failed');
});

test('Try again: the first request fails, the retry loads the schedule', async ({ page }) => {
  let n = 0;
  await page.route('**/data/schedule.json', (route) => (++n === 1 ? route.fulfill({ status: 503, body: 'down' }) : route.continue()));
  await page.goto('/calendar/');
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('top-bar')).toBeVisible();
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(n).toBe(2);
});
