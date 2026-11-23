// Cup → History on a real layout (CK-43). The summary, then every season in both views — Groups (laid out like
// Cup › Groups, the small bracket where "Who advances" sits) and Bracket (the full-screen bracket) — at the owner's
// window (1920 × 900) and the other desktop sizes: no scroll bar on the page, nothing cut off in any panel. The switch,
// the click-through from the small bracket and back / forward between the two views; the season and view in the
// address; no request for the data (it ships with its own chunk).

import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project'));

/** Every overflow on the history page: the page scrolling, anything cut off (a panel, a box, a line) or below the window. */
const overflows = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('[data-testid="cup-history"], [data-testid="cup-history"] *')) {
      const cs = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') out.push(`cut off: ${e.className} "${e.textContent?.slice(0, 60)}"`);
      if (e.scrollHeight > e.clientHeight + 1 && cs.overflowY !== 'visible') out.push(`cut off (height): ${e.className}`);
      if (e.getBoundingClientRect().bottom > innerHeight + 0.5) out.push(`below the window: ${e.className}`);
    }
    const d = document.documentElement;
    if (d.scrollHeight > innerHeight) out.push(`page scrolls: ${d.scrollHeight} > ${innerHeight}`);
    if (d.scrollWidth > innerWidth) out.push(`page scrolls sideways: ${d.scrollWidth} > ${innerWidth}`);
    return out;
  });

for (const size of [{ width: 1920, height: 900 }, { width: 1920, height: 950 }, { width: 1600, height: 1000 }])
  test(`${size.width}×${size.height}: the summary and every season, Groups and Bracket, fit with no scroll bar`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`${APP}?view=cup&cup=history`);
    await expect(page.getByTestId('hist-summary')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await overflows(page), 'summary').toEqual([]);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    for (const year of ['2023', '2024', '2025']) {
      await page.getByRole('tablist', { name: 'History season' }).getByRole('tab', { name: year }).click();
      const season = page.getByTestId('hist-season');
      await expect(season).toHaveAttribute('data-year', year);
      await expect(season).toHaveAttribute('data-view', 'groups');
      await expect.poll(() => new URL(page.url()).searchParams.get('hs')).toBe(year);
      await expect(page.getByTestId('cup-group')).toHaveCount(6);
      await expect(page.getByTestId('hist-bracket').locator('.ck-hb-mgame')).toHaveCount(7);
      expect(await overflows(page), `${year} Groups`).toEqual([]);
      await page.getByRole('tablist', { name: 'History view' }).getByRole('tab', { name: 'Bracket' }).click();
      await expect(season).toHaveAttribute('data-view', 'bracket');
      await expect(page.locator('.ck-hb-game')).toHaveCount(7);
      // items 1–9 on every game box (the data exists for every stored season)
      for (const id of ['hb-date', 'hb-venue', 'hb-game-link']) await expect(page.getByTestId(id)).toHaveCount(7);
      for (const id of ['hb-team', 'hb-seed', 'hb-record', 'hb-qualified']) await expect(page.locator(`.ck-hb-game [data-testid="${id}"]`)).toHaveCount(14);
      await expect(page.locator('.ck-hb-game [data-testid="ko-prep"]')).toHaveCount(14);
      expect(await overflows(page), `${year} Bracket`).toEqual([]);
      await page.getByRole('tablist', { name: 'History view' }).getByRole('tab', { name: 'Groups' }).click();
    }
    expect(requests.filter((u) => /\.json/.test(u))).toEqual([]);
  });

test('the small bracket opens the full one; back / forward between them; the tab title and the address follow', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`${APP}?view=cup&cup=history&hs=2024`);
  const season = page.getByTestId('hist-season');
  await expect(season).toHaveAttribute('data-view', 'groups');
  await expect(page).toHaveTitle(/^Cup history · 2024 —/);
  // a game's link opens its page, not the bracket
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('hist-game-link').first().click()]);
  await popup.close();
  await expect(season).toHaveAttribute('data-view', 'groups');
  // the panel's empty area opens the bracket
  const mini = page.getByTestId('hist-bracket');
  const box = (await mini.boundingBox())!;
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 8);
  await expect(season).toHaveAttribute('data-view', 'bracket');
  await expect.poll(() => new URL(page.url()).searchParams.get('hv')).toBe('bracket');
  await expect(page).toHaveTitle(/^Cup history · 2024 bracket —/);
  await page.goBack();
  await expect(season).toHaveAttribute('data-view', 'groups');
  await page.goForward();
  await expect(season).toHaveAttribute('data-view', 'bracket');
  await page.goBack();
  // and its title does too
  await page.getByTestId('hist-bracket-open').click();
  await expect(season).toHaveAttribute('data-view', 'bracket');
  await expect(page.getByTestId('hist-champion')).toHaveAttribute('data-team', 'MIL');
  // a reload keeps the view
  await page.reload();
  await expect(page.getByTestId('hist-season')).toHaveAttribute('data-view', 'bracket');
});
