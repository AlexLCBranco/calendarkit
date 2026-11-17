// CK-6: hover popups close as soon as the pointer leaves — the tooltip (plain and with a day strip), the streak popup
// and the series popup, in a real browser. Leaving an element closes its popup within 100 ms; element → element swaps
// popups with never two open; element → popup → its link still works (the short grace for that trip); a fast sweep
// across every card of a night leaves none open. Times are measured in the page (the pointer's mouseleave → the
// popup's removal, by a MutationObserver), not by Playwright round trips. Logic: src/slate/popupGate.ts.
import { expect, test, type Locator, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const POPUPS = '[data-testid="tooltip"], [data-testid="streak-popup"], [data-testid="series-popup"]';
type Watch = { max: number; gone: number; left: number };

/** Counts the popups open after every DOM change: the most at once since the last reset, when the last one went. */
async function watch(page: Page) {
  await page.evaluate((sel) => {
    const w = window as unknown as { __pop: Watch };
    w.__pop = { max: 0, gone: 0, left: 0 };
    new MutationObserver(() => {
      const n = document.querySelectorAll(sel).length;
      w.__pop.max = Math.max(w.__pop.max, n);
      if (!n && !w.__pop.gone) w.__pop.gone = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  }, POPUPS);
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __pop: Watch }).__pop);
const reset = (page: Page) => page.evaluate((sel) => Object.assign((window as unknown as { __pop: Watch }).__pop, { max: document.querySelectorAll(sel).length, gone: 0, left: 0 }), POPUPS);

async function center(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Hover `el`, see `popup`, move the pointer straight off it to an empty corner: ms from leaving to the popup gone. */
async function leaveMs(page: Page, el: Locator, popup: Locator) {
  const c = await center(el);
  await page.mouse.move(c.x, c.y);
  await expect(popup).toBeVisible();
  await reset(page);
  await el.evaluate((e) => e.addEventListener('mouseleave', () => ((window as unknown as { __pop: Watch }).__pop.left = performance.now()), { once: true }));
  await page.mouse.move(5, page.viewportSize()!.height - 5);
  await expect.poll(async () => (await state(page)).gone, { timeout: 2000 }).toBeGreaterThan(0);
  const s = await state(page);
  return s.gone - s.left;
}

const SLATE_NOW = new Date('2026-11-06T15:00:00Z'); // Nov 6's cards have streaks and series chips
async function slate(page: Page) {
  await page.clock.setFixedTime(SLATE_NOW);
  await page.goto(`${APP}?view=league&layout=slate`);
  await expect(page.locator('[data-testid="slate"] [data-streak]').first()).toBeVisible();
  await watch(page);
}

test('leave → gone within 100 ms: streak popup, series popup, plain tooltip', async ({ page }) => {
  await slate(page);
  const s = page.locator('[data-testid="slate"]');
  for (const [el, popup] of [
    [s.locator('[data-streak]').first(), page.getByTestId('streak-popup')],
    [s.locator('[data-testid="series-chip"]').first(), page.getByTestId('series-popup')],
    [s.locator('.ck-slate-rec[data-tip]').first(), page.getByTestId('tooltip')],
  ] as const) {
    const ms = await leaveMs(page, el, popup);
    expect(ms, await el.evaluate((e) => e.outerHTML.slice(0, 80))).toBeLessThanOrEqual(100);
  }
});

test('leave → gone within 100 ms: a tooltip with a day strip', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00Z'));
  await page.goto(`${APP}?view=team&layout=list&team=BOS`);
  const label = page.locator('[data-testid="run-label"][data-tip-games]').first();
  await expect(label).toBeAttached();
  await watch(page);
  expect(await leaveMs(page, label, page.getByTestId('tooltip').filter({ has: page.getByTestId('tip-days') }))).toBeLessThanOrEqual(100);
});

test('element → element: the popup swaps, never two open', async ({ page }) => {
  await slate(page);
  const s = page.locator('[data-testid="slate"]');
  const card = s.locator('.ck-slate-card:has([data-testid="series-chip"]):has([data-streak])').first();
  const streak = card.locator('[data-streak]').first();
  const chip = card.locator('[data-testid="series-chip"]');
  const rec = card.locator('.ck-slate-rec[data-tip]').first();
  const next = s.locator('[data-streak]').nth(3);
  let at = await center(streak);
  await page.mouse.move(at.x, at.y);
  await expect(page.getByTestId('streak-popup')).toBeVisible();
  for (const [el, id] of [
    [chip, 'series-popup'],
    [rec, 'tooltip'],
    [streak, 'streak-popup'],
    [next, 'streak-popup'],
    [chip, 'series-popup'],
  ] as const) {
    await reset(page);
    const to = await center(el);
    // through whatever lies between, a step every few px
    await page.mouse.move(to.x, to.y, { steps: Math.max(4, Math.round(Math.hypot(to.x - at.x, to.y - at.y) / 6)) });
    at = to;
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.locator(POPUPS)).toHaveCount(1);
    expect((await state(page)).max, `moving to ${id}`).toBeLessThanOrEqual(1);
  }
});

test('element → its popup → click its link (the grace for the trip), for each popup', async ({ page, context }) => {
  await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await slate(page);
  const s = page.locator('[data-testid="slate"]');
  for (const [el, id, link] of [
    [s.locator('[data-streak]').first(), 'streak-popup', 'a.ck-streak-game'],
    [s.locator('[data-testid="series-chip"]').first(), 'series-popup', 'a[data-testid="series-link"]'],
  ] as const) {
    const c = await center(el);
    await page.mouse.move(c.x, c.y);
    const pop = page.getByTestId(id);
    const a = pop.locator(link).first();
    await expect(a).toBeVisible();
    const to = await center(a);
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.waitForTimeout(300);
    await expect(pop).toBeVisible();
    const [tab] = await Promise.all([context.waitForEvent('page'), page.mouse.click(to.x, to.y)]);
    expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\//);
    await tab.close();
    await page.mouse.move(5, page.viewportSize()!.height - 5);
    await expect(page.locator(POPUPS)).toHaveCount(0);
  }
  // the day strip's squares too
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00Z'));
  await page.goto(`${APP}?view=team&layout=list&team=BOS`);
  const label = page.locator('[data-testid="run-label"][data-tip-games]').first();
  const c = await center(label);
  await page.mouse.move(c.x, c.y);
  const sq = page.getByTestId('tooltip').locator('a[data-testid="tip-game"]').first();
  await expect(sq).toBeVisible();
  const to = await center(sq);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.waitForTimeout(300);
  const [tab] = await Promise.all([context.waitForEvent('page'), page.mouse.click(to.x, to.y)]);
  expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\//);
});

test('a fast sweep across every card of the night leaves no popup open, never two at once', async ({ page }) => {
  await slate(page);
  const s = page.locator('[data-testid="slate"]');
  await s.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  // every popup trigger on screen, in reading order
  const points = await s.locator('[data-streak], [data-testid="series-chip"], [data-tip]').evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width && r.top >= 0 && r.bottom <= innerHeight)
      .map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })),
  );
  expect(points.length).toBeGreaterThan(10);
  await reset(page);
  for (let round = 0; round < 3; round++) {
    for (const p of round % 2 ? [...points].reverse() : points) await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await page.mouse.move(5, page.viewportSize()!.height - 5, { steps: 2 });
  await page.waitForTimeout(150);
  await expect(page.locator(POPUPS)).toHaveCount(0);
  expect((await state(page)).max).toBeLessThanOrEqual(1);
});
