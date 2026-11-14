// Compact week strip in a real browser. League List: strip ≤ 46 px tall (was 61 + 12), fixed week on
// a click, ‹ › weeks. Team List (desktop widths): no strip; wheel scrolling moves the title to the row at the top and
// changes no row (MutationObserver on the rows); the date picker and Today still move the list.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** Waits until the list stops moving (a wheel scroll animates for a while after the event). */
const still = (page: Page, testId: string) =>
  page.evaluate(
    (testId) =>
      new Promise<void>((res) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)!;
        let last = -1;
        let same = 0;
        const tick = () => {
          same = el.scrollTop === last ? same + 1 : 0;
          last = el.scrollTop;
          if (same >= 5) res();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    testId,
  );

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-game-id]'));
}

test('League List: compact strip, fixed week on a click, ‹ › weeks', async ({ page }, info) => {
  await open(page, '?view=league&layout=list&date=2026-11-17');
  const strip = page.getByTestId('week-strip');
  const h = (await strip.boundingBox())!.height;
  console.log(`[strip] ${info.project.name} League List strip ${h} px`);
  expect(h).toBeLessThanOrEqual(46 * (info.project.name === 'desktop-xl' ? 1.3 : 1)); // The desktop list's zoom
  const dates = () => strip.getByRole('tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.date));
  const week = await dates();
  await strip.locator('[data-date="2026-11-20"]').click();
  await settle(page);
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 20, 2026/);
  expect(await dates()).toEqual(week);
  await page.getByTestId('week-strip').getByLabel('Next week').click();
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 22, 2026/);
  expect(await dates()).not.toEqual(week);
});

test('Team List: no day strip; the title follows the wheel, rows untouched; picker and Today still move it', async ({ page }, info) => {
  test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths');
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  const title = page.getByTestId('team-day-title');
  await expect(page.getByTestId('week-strip')).toHaveCount(0);
  /** Date of the row whose top is at (or just above) the list's top edge. */
  const topRow = () =>
    list.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const rows = [...el.querySelectorAll<HTMLElement>('[data-row-date]')];
      return (rows.filter((r) => r.getBoundingClientRect().top <= top + 1).at(-1)?.dataset.rowDate ?? rows[0]!.dataset.rowDate)!;
    });
  // The bar's short date under 1560 px
  const w = page.viewportSize()!.width < 1560 ? 'short' : 'long';
  const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: w, month: w, day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  await expect(title).toHaveText(long(await topRow()));
  // watch the rows: a scroll must not replace or change any of them
  await list.evaluate((el) => {
    const w = window as unknown as { __rowMutations: number };
    w.__rowMutations = 0;
    // every change counts, except the map's hover class following the pointer as rows pass under it (a class on the
    // row, no re-render)
    const onlyHover = (r: MutationRecord) => {
      if (r.type !== 'attributes' || r.attributeName !== 'class') return false;
      const was = new Set((r.oldValue ?? '').split(' ').filter(Boolean));
      const now = new Set((r.target as Element).className.split(' ').filter(Boolean));
      for (const c of ['ck-map-hot']) {
        was.delete(c);
        now.delete(c);
      }
      return was.size === now.size && [...was].every((c) => now.has(c));
    };
    new MutationObserver((m) => (w.__rowMutations += m.filter((r) => !onlyHover(r)).length)).observe(el.querySelector('.ck-team-rows')!, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  });
  await list.hover();
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 300);
    await still(page, 'team-list');
    const row = await topRow();
    await expect(title).toHaveText(long(row));
    expect(await page.locator('.ck-active-day').count()).toBe(0);
  }
  expect(await page.evaluate(() => (window as unknown as { __rowMutations: number }).__rowMutations)).toBe(0);
  // the date picker: a game day's row at the top (one of the month's first games, so its row can reach the top)
  const date = await list.evaluate((el) => [...el.querySelectorAll<HTMLElement>('.ck-team-rows > [data-row-date]')][2]!.dataset.rowDate!);
  await page.getByTestId('date-pick').click();
  await page.getByTestId('date-picker').locator(`[data-date="${date}"]`).click();
  await settle(page);
  await still(page, 'team-list');
  expect(await topRow()).toBe(date);
  await expect(title).toHaveText(long(date));
  // Today still goes back to the next game
  await page.getByTestId('today').click();
  await settle(page);
  expect(await list.evaluate((el) => el.querySelector<HTMLElement>('[data-next]')!.getBoundingClientRect().top - el.getBoundingClientRect().top)).toBeLessThan(2);
});
