// Round 6, part B: the page always opens on today, and follows midnight while you're on today. Uses Playwright's plain
// `test` — not ./fixtures, whose init script hands a URL's date to the app — so these pages see exactly what a person's
// browser does. In both zones the app is used from (America/New_York, America/Sao_Paulo), at 1920 px.
//  - B2: an old date in the URL (a bookmark like "?view=league&layout=list&date=2026-10-22") and a reload after moving
//    to another day both open on today, in the League List and the week view.
//  - B3: Playwright's clock crosses local midnight (the app's midnight timer fires; round 7: it has no minute tick): on today the view moves to the new
//    day (the week view to the new week); on another day it stays. After a sleep (no timer ran), coming back to the tab
//    (visibilitychange) moves it too.

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once, at 1920 px'));

/** Local wall time in `zone` → epoch ms (the zones' UTC offsets on these November dates: EST −5, BRT −3). */
const OFFSET = { 'America/New_York': 5, 'America/Sao_Paulo': 3 } as const;
type Zone = keyof typeof OFFSET;
const local = (zone: Zone, wall: string) => Date.parse(`${wall}Z`) + OFFSET[zone] * 3_600_000;

const title = (page: Page) => page.getByTestId('day-title');
const period = (page: Page) => page.getByTestId('period-title');
async function ready(page: Page) {
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

for (const zone of Object.keys(OFFSET) as Zone[]) {
  test.describe(zone, () => {
    test.use({ timezoneId: zone });

    test('an old date in the URL, or a reload after moving, opens on today (List and week view)', async ({ page }) => {
      await page.clock.setFixedTime(local(zone, '2026-11-15T10:00:00'));
      await page.goto('/?view=league&layout=list&date=2026-10-22'); // Alex's bookmark, as saved
      await ready(page);
      await expect(title(page)).toHaveText('Sunday, November 15, 2026');
      await expect(page.getByTestId('today')).toBeDisabled();
      // move to another day: the URL carries no date (round 8); a reload still opens on today
      await page.getByLabel('Next day').click();
      await expect(title(page)).toHaveText('Monday, November 16, 2026');
      expect(page.url()).not.toMatch(/date=/);
      await page.reload();
      await ready(page);
      await expect(title(page)).toHaveText('Sunday, November 15, 2026');
      // the week view: the week of today, whatever the URL says
      await page.goto('/?view=league&layout=calendar&date=2026-10-22');
      await ready(page);
      await expect(period(page)).toHaveText(/^Nov 15 – 21, 2026/);
      await page.goto('/?view=league&layout=calendar&weeks=2&date=2027-02-01');
      await ready(page);
      await expect(period(page)).toHaveText(/^Nov 15 – 28, 2026/);
    });

    test('midnight while on today: the List moves to the new day, the week view to the new week', async ({ page }) => {
      await page.clock.install({ time: local(zone, '2026-11-21T23:58:00') }); // Saturday
      await page.goto('/?view=league&layout=list');
      await ready(page);
      await expect(title(page)).toHaveText('Saturday, November 21, 2026');
      await expect(page.locator('.ck-strip-selected.ck-strip-today')).toHaveCount(1);
      await page.clock.runFor('03:00'); // the midnight timer fires at 00:00
      await expect(title(page)).toHaveText('Sunday, November 22, 2026');
      await expect(page.locator('.ck-strip-selected.ck-strip-today')).toHaveCount(1); // the strip's today followed
      await expect(page.getByTestId('today')).toBeDisabled();

      await page.clock.setSystemTime(local(zone, '2026-11-21T23:58:00'));
      await page.goto('/?view=league&layout=calendar');
      await ready(page);
      await expect(period(page)).toHaveText(/^Nov 15 – 21, 2026/);
      await page.clock.runFor('03:00');
      await expect(period(page)).toHaveText(/^Nov 22 – 28, 2026/);
      await expect(page.locator('.ck-cell-today')).toHaveAttribute('data-date', '2026-11-22');
    });

    test('midnight while on another day: it stays', async ({ page }) => {
      await page.clock.install({ time: local(zone, '2026-11-21T23:58:00') });
      await page.goto('/?view=league&layout=list');
      await ready(page);
      await page.getByLabel('Previous day').click();
      await expect(title(page)).toHaveText('Friday, November 20, 2026');
      await page.clock.runFor('03:00');
      await expect(page.locator('.ck-strip-today')).toHaveCount(0); // Sat Nov 21 is no longer today (Nov 22 is next week)
      await expect(title(page)).toHaveText('Friday, November 20, 2026');
      await page.getByTestId('today').click(); // and Today knows the new day
      await expect(title(page)).toHaveText('Sunday, November 22, 2026');

      // the week view moved to another week stays there too
      await page.clock.setSystemTime(local(zone, '2026-11-21T23:58:00'));
      await page.goto('/?view=league&layout=calendar');
      await ready(page);
      await page.getByLabel('Previous week').click();
      await expect(period(page)).toHaveText(/^Nov 8 – 14, 2026/);
      await page.clock.runFor('03:00');
      await expect(period(page)).toHaveText(/^Nov 8 – 14, 2026/);
      await page.getByTestId('today').click();
      await expect(period(page)).toHaveText(/^Nov 22 – 28, 2026/);
    });

    test('asleep past midnight (no timer ran), then back to the tab: on today it moves', async ({ page }) => {
      await page.clock.install({ time: local(zone, '2026-11-21T23:58:00') });
      await page.goto('/?view=league&layout=list');
      await ready(page);
      await expect(title(page)).toHaveText('Saturday, November 21, 2026');
      await page.clock.pauseAt(local(zone, '2026-11-21T23:58:30')); // time stops; no timer is due yet
      await page.clock.setSystemTime(local(zone, '2026-11-22T08:00:00')); // the machine wakes next morning: no timer fires
      await expect(title(page)).toHaveText('Saturday, November 21, 2026');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // the tab is shown again
      await expect(title(page)).toHaveText('Sunday, November 22, 2026');
    });
  });
}
