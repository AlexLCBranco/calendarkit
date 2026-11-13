// Road trips and homestands in the Team views (List and Calendar), the calendar's side arrows, the tab title, and
// team links opening the Calendar — in a real browser. Detection itself: tests/runs.test.ts.
import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop, 1920 px'));

async function open(page: Page, search: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
}

/** Copies the whole view and returns what the off-screen copy held: bands, labels and side arrows. */
async function copyHolds(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ckCopy?: unknown };
    w.__ckCopy = undefined;
    const obs = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>('.ck-capture');
      if (!root) return;
      w.__ckCopy = { bands: root.querySelectorAll('.ck-run-band').length, labels: [...root.querySelectorAll('[data-testid="run-label"]')].map((l) => l.textContent), arrows: root.querySelectorAll('.ck-side-arrow').length };
      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  const button = page.getByTestId('copy-view');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __ckCopy?: { bands: number; labels: string[]; arrows: number } }).__ckCopy);
}

test('Team Calendar: road trips and homestands as labelled bands, with their tooltip, in the copy; side arrows not in it', async ({ page }) => {
  await open(page, '?view=team&layout=calendar&team=BOS');
  const bands = page.locator('.ck-run-band');
  await expect(bands.first()).toBeVisible();
  // every game of a run carries its label (its place in the run), no hover needed: one per run game cell
  const tagged = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.ck-run-tag')].map((t) => t.textContent));
  expect(tagged.length).toBeGreaterThan(2);
  for (const t of tagged) expect(t).toMatch(/^(Road trip|Homestand) · \d+\/\d+$/);
  const label = page.locator('.ck-run-tag').first().getByTestId('run-label');
  // road and home bands are different colours, neither the B2B yellow
  const colors = await page.evaluate(() => {
    const c = (k: string) => getComputedStyle(document.querySelector('.ck-root')!).getPropertyValue(k).trim();
    return { road: c('--ck-road'), home: c('--ck-home'), b2b: c('--ck-b2b'), rest: c('--ck-rest') };
  });
  expect(new Set(Object.values(colors)).size).toBe(4);
  // hover: game k of N, the dates and (road) the cities
  await label.hover();
  await expect(page.getByTestId('tooltip')).toContainText(/(Road trip|Homestand) · game \d+ of \d+/);
  await expect(page.getByTestId('tip-days')).toBeVisible();
  // the copy has the bands and labels, not the side arrows
  const held = (await copyHolds(page))!;
  expect(held.bands).toBe(await bands.count());
  expect(held.labels.length).toBeGreaterThan(0);
  expect(held.arrows).toBe(0);
  await expect(page.getByTestId('side-prev')).toBeVisible();
});

test('Team List: the band runs down the rows, every game of the run labelled with its place; in the copy', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=BOS');
  const first = page.locator('.ck-team-rows [data-run-pos="first"]').first();
  await expect(first).toBeVisible();
  // every row between the first and the last of the run carries the band (rest rows too); each game row its own k/N
  const rows = await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('.ck-team-rows > [data-row-date]')];
    const i = all.findIndex((r) => r.dataset.runPos === 'first');
    const j = all.findIndex((r, k) => k >= i && (r.dataset.runPos === 'last' || r.dataset.runPos === 'only'));
    return all.slice(i, j + 1).map((r) => ({ run: r.dataset.run, rest: r.hasAttribute('data-rest'), label: r.querySelector('[data-testid="run-label"]')?.textContent ?? null }));
  });
  expect(new Set(rows.map((r) => r.run)).size).toBe(1);
  expect(rows[0]!.run).toMatch(/^(road|home)$/);
  const labels = rows.filter((r) => !r.rest).map((r) => r.label);
  expect(labels.length).toBeGreaterThanOrEqual(3);
  labels.forEach((l, n) => expect(l).toMatch(new RegExp(`^(Road trip|Homestand) · ${n + 1}/\\d+$`)));
  expect(rows.filter((r) => r.rest).every((r) => r.label === null)).toBe(true);
  const held = (await copyHolds(page))!;
  expect(held.labels.length).toBeGreaterThan(0);
});

test('side arrows step the shown range; the tab title follows; a team link opens the Calendar', async ({ page }) => {
  await open(page, '?view=team&layout=calendar&team=BOS');
  await expect(page).toHaveTitle('BOS schedule · Nov 2026 — calendarkit');
  await page.getByTestId('side-next').click();
  await expect(page).toHaveTitle('BOS schedule · Dec 2026 — calendarkit');
  await page.getByRole('tablist', { name: 'Span' }).getByRole('tab', { name: '1 week' }).click();
  const title = page.getByTestId('date-block').getByTestId('period-title');
  const before = await title.textContent();
  await page.getByTestId('side-next').click();
  await expect(title).not.toHaveText(before!);
  await page.getByTestId('side-prev').click();
  await expect(title).toHaveText(before!);
  // the arrows sit beside the grid, covering no cell
  const grid = await page.locator('.ck-team-grid').boundingBox();
  const prev = await page.getByTestId('side-prev').boundingBox();
  const next = await page.getByTestId('side-next').boundingBox();
  expect(prev!.x + prev!.width).toBeLessThanOrEqual(grid!.x + 1);
  expect(next!.x).toBeGreaterThanOrEqual(grid!.x + grid!.width - 1);
  // back: the title goes back with the page
  await page.goBack();
  await expect(page).toHaveTitle(/^BOS schedule · Dec/);
  // a team link (the opponent in a cell) opens that team's Calendar
  const opp = page.locator('.ck-team-grid .ck-opp a[data-team-link], .ck-team-grid a[data-team-link].ck-opp').first();
  await opp.click();
  await expect(page.getByRole('tablist', { name: 'Layout' }).getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveTitle(/^[A-Z]{3} schedule · /);
});
