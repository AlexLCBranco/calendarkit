// Compact week strip (round 4, item 8) in a real browser. League List: strip ≤ 46 px tall (was 61 + 12), fixed week on
// a click, ‹ › weeks. Team List (desktop widths): wheel scrolling moves the title and the strip to the row at the top and
// changes no row (MutationObserver on the rows), a day click puts its row at the top, ‹ › weeks with a game, the top bar
// stays one row at 1920.

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
  expect(h).toBeLessThanOrEqual(46 * (info.project.name === 'desktop-xl' ? 1.3 : 1)); // round 8: the desktop list's zoom
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

test('Team List: title and strip follow the wheel, rows untouched; day click; ‹ ›; top bar one row at 1920', async ({ page }, info) => {
  test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths');
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  const title = page.getByTestId('team-day-title');
  if (info.project.name === 'desktop-xl') expect((await page.getByTestId('top-bar').boundingBox())!.height).toBeLessThanOrEqual(40);
  /** Date of the row whose top is at (or just above) the list's top edge. */
  const topRow = () =>
    list.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const rows = [...el.querySelectorAll<HTMLElement>('[data-row-date]')];
      return (rows.filter((r) => r.getBoundingClientRect().top <= top + 1).at(-1)?.dataset.rowDate ?? rows[0]!.dataset.rowDate)!;
    });
  const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  await expect(title).toHaveText(long(await topRow()));
  // watch the rows: a scroll must not replace or change any of them
  await list.evaluate((el) => {
    const w = window as unknown as { __rowMutations: number };
    w.__rowMutations = 0;
    // every change counts, except the active-day class moving from row to row (item 10: that's its whole job) and the
    // map's hover class following the pointer as rows pass under it (a class on the row, no re-render)
    const onlyActiveDay = (r: MutationRecord) => {
      if (r.type !== 'attributes' || r.attributeName !== 'class') return false;
      const was = new Set((r.oldValue ?? '').split(' ').filter(Boolean));
      const now = new Set((r.target as Element).className.split(' ').filter(Boolean));
      for (const c of ['ck-active-day', 'ck-map-hot']) {
        was.delete(c);
        now.delete(c);
      }
      return was.size === now.size && [...was].every((c) => now.has(c));
    };
    new MutationObserver((m) => (w.__rowMutations += m.filter((r) => !onlyActiveDay(r)).length)).observe(el.querySelector('.ck-team-rows')!, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  });
  await list.hover();
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 300);
    await still(page, 'team-list');
    const row = await topRow();
    await expect(title).toHaveText(long(row));
    expect(await page.getByTestId('week-strip').locator('[aria-selected="true"]').getAttribute('data-date')).toBe(row);
  }
  expect(await page.evaluate(() => (window as unknown as { __rowMutations: number }).__rowMutations)).toBe(0);
  // a day click: that row at the top
  const strip = page.getByTestId('week-strip');
  const target = strip.locator('[role="tab"]:not([disabled]):not([aria-selected="true"])').first();
  const date = (await target.getAttribute('data-date'))!;
  await target.click();
  await settle(page);
  expect(await topRow()).toBe(date);
  await expect(title).toHaveText(long(date));
  // ›: the next week with a game
  await strip.getByLabel('Next week').click();
  await settle(page);
  const after = await topRow();
  const sunday = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - new Date(`${d}T12:00:00Z`).getUTCDay() * 86_400_000).toISOString().slice(0, 10);
  expect(sunday(after) > sunday(date)).toBe(true);
  // Today still goes back to the next game
  await page.getByTestId('today').click();
  await settle(page);
  expect(await list.evaluate((el) => el.querySelector<HTMLElement>('[data-next]')!.getBoundingClientRect().top - el.getBoundingClientRect().top)).toBeLessThan(2);
});
