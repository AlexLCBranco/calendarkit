// The Quick standings popup can be moved (drag its header) and resized (drag an edge or a corner), stays inside the
// window, never below its minimum size, keeps its place and size after a reload (localStorage), and "↺" puts the
// default back. A plain click on the header changes nothing.

import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const KEY = 'ck:stpop:v1';
const MIN = { w: 360, h: 200 };
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const pop = (page: Page) => page.getByTestId('standings-popup');
const box = async (page: Page) => (await pop(page).boundingBox())!;

async function openPop(page: Page) {
  await page.getByTestId('standings-button').click();
  await expect(pop(page)).toBeVisible();
  await expect(pop(page).locator('tbody tr')).toHaveCount(30);
}

/** A mouse drag from (x, y) by (dx, dy), in a few steps. */
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + (dx * i) / 5, y + (dy * i) / 5);
  await page.mouse.up();
}

test('drag, resize, stay inside, minimum size, kept after a reload, reset', async ({ page }) => {
  await page.goto(`${APP}?view=league&layout=list`);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  await openPop(page);
  const start = await box(page);
  await expect(page.getByTestId('standings-popup-reset')).toHaveCount(0);

  // a click on the header: nothing moves, nothing saved
  await page.getByTestId('standings-popup-head').locator('.ck-st-title').click();
  expect(await box(page)).toEqual(start);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

  // move: by the header (its title, not a button)
  const title = (await page.getByTestId('standings-popup-head').locator('.ck-st-title').boundingBox())!;
  await drag(page, title.x + 10, title.y + 10, -150, 120);
  const moved = await box(page);
  expect(moved.x).toBeCloseTo(start.x - 150, 0);
  expect(moved.y).toBeCloseTo(start.y + 120, 0);
  expect([moved.width, moved.height]).toEqual([start.width, start.height]);
  await expect(page.getByTestId('standings-popup-reset')).toBeVisible();

  // resize: the bottom-right corner, smaller — the tables scroll / wrap inside
  const se = (await pop(page).locator('[data-grip="se"]').boundingBox())!;
  await drag(page, se.x + se.width / 2, se.y + se.height / 2, -300, -150);
  const small = await box(page);
  expect(small.width).toBeCloseTo(moved.width - 300, 0);
  expect(small.height).toBeCloseTo(moved.height - 150, 0);
  expect([small.x, small.y]).toEqual([moved.x, moved.y]);
  const scroller = pop(page).getByTestId('standings-popup-scroll');
  expect(await scroller.evaluate((e) => e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)).toBe(true);
  // the left edge: the right side stays
  const w = (await pop(page).locator('[data-grip="w"]').boundingBox())!;
  await drag(page, w.x + w.width / 2, w.y + w.height / 2, -40, 0);
  const wider = await box(page);
  expect(wider.x + wider.width).toBeCloseTo(small.x + small.width, 0);
  expect(wider.width).toBeCloseTo(small.width + 40, 0);

  // never below the minimum size
  const se2 = (await pop(page).locator('[data-grip="se"]').boundingBox())!;
  await drag(page, se2.x + 5, se2.y + 5, -2000, -2000);
  const tiny = await box(page);
  expect([Math.round(tiny.width), Math.round(tiny.height)]).toEqual([MIN.w, MIN.h]);

  // never outside the window: dragged far past the bottom-right corner
  const vp = page.viewportSize()!;
  const t2 = (await page.getByTestId('standings-popup-head').locator('.ck-st-title').boundingBox())!;
  await drag(page, t2.x + 10, t2.y + 10, 5000, 5000);
  const edge = await box(page);
  expect(edge.x + edge.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(edge.y + edge.height).toBeLessThanOrEqual(vp.height + 0.5);
  expect(edge.x).toBeGreaterThanOrEqual(0);
  const t3 = (await page.getByTestId('standings-popup-head').locator('.ck-st-title').boundingBox())!;
  await drag(page, t3.x + 10, t3.y + 10, -5000, -5000);
  const corner = await box(page);
  expect([Math.round(corner.x), Math.round(corner.y)]).toEqual([0, 0]);

  // a resize back up, then reload: the same place and size
  const se3 = (await pop(page).locator('[data-grip="se"]').boundingBox())!;
  await drag(page, se3.x + 5, se3.y + 5, 300, 200);
  await drag(page, corner.x + 40, corner.y + 20, 200, 100);
  const kept = await box(page);
  await page.reload();
  await openPop(page);
  const after = await box(page);
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(after[k], k).toBeCloseTo(kept[k], 0);

  // reset: back to the default place and size, nothing saved
  await page.getByTestId('standings-popup-reset').click();
  const back = await box(page);
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(back[k], k).toBeCloseTo(start[k], 0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await expect(page.getByTestId('standings-popup-reset')).toHaveCount(0);
  await page.reload();
  await openPop(page);
  const fresh = await box(page);
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(fresh[k], k).toBeCloseTo(start[k], 0);
});

test('a saved box larger than the window comes back inside it', async ({ page }) => {
  await page.goto(`${APP}?view=league&layout=list`);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ x: 3000, y: 2000, w: 5000, h: 4000 })), KEY);
  await page.reload();
  await openPop(page);
  const vp = page.viewportSize()!;
  const b = await box(page);
  expect([Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]).toEqual([0, 0, vp.width, vp.height]);
});
