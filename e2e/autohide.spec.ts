// The one-row top bar (44 px) hides while the person scrolls a list down and comes back on a scroll up,
// at the top, or with the pointer at the top edge. The rows on screen never jump when it goes or comes back (the scroller
// is moved by the bar's height in the same frame). A jump to a row, a restore or a script's scroll never hides it.
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const NOW = new Date('2026-11-15T15:00:00Z');
test.use({ autoHide: true });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl' && info.project.name !== 'desktop', 'desktop only'));

async function open(page: Page, search: string, ready: string, now = NOW) {
  await page.clock.setFixedTime(now);
  await page.goto(`${APP}${search}`);
  await page.waitForSelector(ready);
  await page.waitForTimeout(400);
}
const hidden = (page: Page) => page.locator('.ck-root').evaluate((r) => r.classList.contains('ck-bar-hidden'));

/**
 * Watches the bar toggles: for each, how far a row visible on screen moved between the last scroll event before it
 * and the frame after it (0 = no jump).
 */
const watchJumps = (page: Page, rowSel: string) =>
  page.evaluate((rowSel) => {
    const w = window as unknown as { __jumps: number[] };
    w.__jumps = [];
    let before: { el: Element; top: number } | undefined;
    document.addEventListener(
      'scroll',
      () => {
        const el = [...document.querySelectorAll(rowSel)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.top > 200 && r.bottom < innerHeight - 50;
        });
        before = el && { el, top: el.getBoundingClientRect().top };
      },
      true,
    );
    new MutationObserver(() => {
      if (!before) return;
      const b = before;
      w.__jumps.push(Math.abs(b.el.getBoundingClientRect().top - b.top));
    }).observe(document.querySelector('.ck-root')!, { attributes: true, attributeFilter: ['class'] });
  }, rowSel);

const VIEWS = [
  { name: 'Team List', search: '?view=team&layout=list&team=BOS', ready: '[data-testid="team-list"] article', rows: '[data-testid="team-list"] article', scroller: '[data-testid="team-list"][data-select-scroller]', now: NOW },
  { name: 'Slate', search: '?view=league&layout=slate', ready: '.ck-slate-card', rows: '.ck-slate-card', scroller: '.ck-slate-scroll', now: new Date('2026-11-02T15:00:00Z') }, // a 15-game night
];

for (const v of VIEWS)
  test(`${v.name}: wheel down hides the 44 px bar without moving the rows; wheel up, the top and the top edge bring it back`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 520 }); // short, so even the Slate scrolls
    await open(page, v.search, v.ready, v.now);
    const bar = page.getByTestId('top-bar');
    expect((await bar.boundingBox())!.height).toBe(44);
    await watchJumps(page, v.rows);
    const box = (await page.locator(v.scroller).first().boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + box.height / 2); // over the list
    await page.mouse.wheel(0, 160);
    await expect.poll(() => hidden(page)).toBe(true);
    await expect(bar).toBeHidden();
    // back with a scroll up
    await page.mouse.wheel(0, -120);
    await expect.poll(() => hidden(page)).toBe(false);
    await expect(bar).toBeVisible();
    // to the top (still shown), down again, then the pointer at the top edge
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(300);
    expect(await hidden(page)).toBe(false);
    await page.mouse.wheel(0, 160);
    await expect.poll(() => hidden(page)).toBe(true);
    await page.mouse.move(box.x + 40, 4);
    await expect.poll(() => hidden(page)).toBe(false);
    // no jump at any toggle
    const jumps = await page.evaluate(() => (window as unknown as { __jumps: number[] }).__jumps);
    expect(jumps.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...jumps), 'rows moved when the bar went or came back').toBeLessThan(1);
    // a script's scroll (a restore, a jump to a row) never hides it (once the last wheel is long past)
    await page.waitForTimeout(600);
    await page.locator(v.scroller).first().evaluate((el) => (el.scrollTop += 400));
    await page.waitForTimeout(500);
    expect(await hidden(page)).toBe(false);
  });

test('views that do not scroll (calendars, Cup, Standings) keep the bar', async ({ page }) => {
  for (const search of ['?view=league&layout=calendar&weeks=1', '?view=cup', '?view=standings']) {
    await open(page, search, '[data-testid="top-bar"]');
    await page.mouse.move(600, 500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    expect(await hidden(page), search).toBe(false);
  }
});

test('one row of 44 px in every desktop view (1280 and 1920)', async ({ page }, info) => {
  const views = ['?view=league&layout=list', '?view=league&layout=slate', '?view=league&layout=calendar&weeks=1', '?view=league&layout=calendar&weeks=2', '?view=team&layout=list&team=BOS', '?view=team&layout=calendar&team=BOS', '?view=cup', '?view=cup&cup=schedule', '?view=cup&cup=schedule&cl=team', '?view=cup&cup=simulator', '?view=cup&cup=history', '?view=standings'];
  for (const search of views) {
    await open(page, search, '[data-testid="top-bar"]');
    const h = (await page.getByTestId('top-bar').boundingBox())!.height;
    expect(h, `${info.project.name} ${search}`).toBe(44);
  }
});
