// The shared layout (backlogkit's NAV_PATTERN.md §6): the pinned header on every main page (same height, still there
// after scrolling), every Where tab, What chip, How option and breadcrumb part navigates and the address round-trips
// (reload and back / forward), no layout shift (a click updating the screen in under 100 ms is timed alone, in
// perf.spec.ts), no <select> for a What,
// every icon-only control named, and 390 px still fits. It also saves a screenshot of every main page for the build
// report (test-output/nav-shots/).

import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
const DAY = '2026-11-02';

/** Console errors and failed loads, except the weather the fixtures answer with 404 (NO_WEATHER). */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && !r.url().startsWith('https://api.open-meteo.com/') && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}
async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}${search}`);
  await expect(page.getByTestId('top-bar')).toBeVisible();
}

/** Every main page: its address and something only it shows. */
const PAGES: [string, string, string][] = [
  ['league-list', `?view=league&layout=list&date=${DAY}`, '[data-testid="league-list"]'],
  ['league-calendar', `?view=league&layout=calendar&date=${DAY}`, '.ck-week-view, .ck-month'],
  ['slate', `?view=league&layout=slate&date=${DAY}`, '[data-testid="slate"]'],
  ['team-list', '?view=team&layout=list&team=BOS', '[data-testid="team-list"]'],
  ['team-calendar', '?view=team&layout=calendar&team=BOS', '.ck-team-grid'],
  ['cup-groups', '?view=cup&cup=standings', '[data-testid="cup-grid"]'],
  ['cup-schedule', '?view=cup&cup=schedule&cl=league&by=group', '[data-testid="cup-league"]'],
  ['cup-simulator', '?view=cup&cup=simulator', '[data-testid="cup-sim"]'],
  ['cup-history', '?view=cup&cup=history', '[data-testid="cup-history"]'],
  ['standings', '?view=standings', '[data-testid="standings-table"]'],
  ['standings-2015-16', '?view=standings&season=2016', '[data-testid="nba-history"]'],
];

test('every main page: the header is there, the same height, and still at the top after scrolling; screenshot for the report', async ({ page }, info) => {
  const errors = collectErrors(page);
  const heights: number[] = [];
  for (const [name, search, sel] of PAGES) {
    await open(page, search);
    await expect(page.locator(sel).first(), name).toBeVisible();
    const h = (await page.getByTestId('top-bar').boundingBox())!.height;
    heights.push(h);
    await page.screenshot({ path: `test-output/nav-shots/${info.project.name}-${name}.png` });
    // scroll the page (or the view's own scroller) as far as it goes: the header stays at the top of the window
    await page.mouse.move(info.project.name === 'desktop' ? 640 : 960, 700);
    await page.mouse.wheel(0, 1500);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = (await page.getByTestId('top-bar').boundingBox())!;
    expect(box.y, name).toBeGreaterThanOrEqual(-0.5);
    expect(box.y, name).toBeLessThanOrEqual(16.5); // at most the page's top padding (nothing scrolled)
    expect(box.height, name).toBe(h);
    expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, 30)?.closest('[data-testid="top-bar"]') !== null), name).toBe(true);
  }
  expect(new Set(heights).size).toBe(1);
  expect(errors).toEqual([]);
});

/** The page as the address and the screen say: the place, the breadcrumb, the checked chip, the selected How tabs. */
const screenState = (page: Page) =>
  page.evaluate(() => ({
    url: location.search.replace(/&?date=[^&]*/, ''),
    place: document.querySelector('[data-testid="where-tabs"] [aria-current="page"]')?.textContent,
    crumbs: [...document.querySelectorAll('[data-testid="crumb-btn"]')].map((b) => b.textContent),
    chip: document.querySelector('[data-testid="what-row"] [role="radio"][aria-checked="true"]')?.textContent ?? null,
    how: [...document.querySelectorAll('[data-testid="page-rows"] [role="tab"][aria-selected="true"]')].map((t) => t.textContent),
  }));

/** Reload, then back and forward: the same screen each time. */
async function roundTrip(page: Page, what: string) {
  const want = await screenState(page);
  await page.reload();
  await expect(page.getByTestId('top-bar')).toBeVisible();
  await expect.poll(() => screenState(page), `${what}: reload`).toEqual(want);
  await page.goBack();
  await page.goForward();
  await expect.poll(() => screenState(page), `${what}: back, forward`).toEqual(want);
}

test('every Where tab, What chip, How option and breadcrumb part navigates; the address round-trips (reload, back / forward)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await open(page, `?view=league&layout=list&date=${DAY}`);
  const where = (name: string) => page.getByTestId('where-tabs').getByRole('button', { name, exact: true });
  const how = (list: string, name: string) => page.getByTestId('page-rows').getByRole('tablist', { name: list }).getByRole('tab', { name, exact: true });
  // Where
  for (const [name, view] of [['Cup', 'cup'], ['Standings', 'standings'], ['Schedule', 'league']] as const) {
    await where(name).click();
    await expect(where(name)).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await roundTrip(page, `Where ${name}`);
  }
  // What: every team chip, then All teams
  const chips = page.getByTestId('what-row').getByTestId('team-chip');
  await expect(chips).toHaveCount(30);
  for (let i = 0; i < 30; i++) {
    const c = chips.nth(i);
    const tri = (await c.textContent())!;
    await c.click();
    await expect(c).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(new RegExp(`team=${tri}`));
    if (i % 10 === 0) await roundTrip(page, `What ${tri}`);
  }
  await page.getByTestId('team-chip-all').click();
  await expect(page).toHaveURL(/view=league/);
  await roundTrip(page, 'What All teams');
  // How: Schedule's views, the Cup's views, the standings' column sets
  for (const [name, layout] of [['Calendar', 'calendar'], ['Slate', 'slate'], ['List', 'list']] as const) {
    await how('Layout', name).click();
    await expect(page).toHaveURL(new RegExp(`layout=${layout}`));
    await roundTrip(page, `How ${name}`);
  }
  await where('Cup').click();
  for (const [name, tab] of [['Schedule', 'schedule'], ['Simulator', 'simulator'], ['History', 'history'], ['Groups', 'standings']] as const) {
    await how('Cup view', name).click();
    await expect(page).toHaveURL(new RegExp(`cup=${tab}`));
    await roundTrip(page, `How Cup ${name}`);
  }
  await where('Standings').click();
  for (const name of ['Splits', 'Extended', 'Form & scoring', 'Schedule & B2B', 'Ratings', 'Main']) {
    await how('Standings columns', name).click();
    await expect(how('Standings columns', name)).toHaveAttribute('aria-selected', 'true');
    await roundTrip(page, `How Standings ${name}`);
  }
  await expect(page).toHaveURL(/view=standings$/); // Main: no set= in the address
  // Breadcrumb: every part's every sibling, on a Team page and in the Cup
  const crumbParts = async () => page.getByTestId('crumb').count();
  const jumpAll = async () => {
    for (let p = 0; p < (await crumbParts()); p++) {
      const part = page.getByTestId('crumb').nth(p);
      const btn = part.getByTestId('crumb-btn');
      if (await btn.isDisabled()) continue;
      await btn.click();
      const items = part.getByRole('menuitem');
      const n = await items.count();
      // the other siblings: the first two and the last (a team's list has 30)
      const picks = [...new Set([0, 1, n - 1])].filter((i) => i < n);
      await page.keyboard.press('Escape');
      for (const i of picks) {
        const part2 = page.getByTestId('crumb').nth(p);
        await part2.getByTestId('crumb-btn').click();
        const item = part2.getByRole('menuitem').nth(i);
        const label = (await item.textContent())!;
        const on = (await item.getAttribute('aria-current')) === 'true';
        await item.click();
        if (!on) await expect(page.getByTestId('crumb').nth(p).getByTestId('crumb-btn'), `crumb ${p} → ${label}`).toHaveText(label);
      }
    }
  };
  await open(page, '?view=team&layout=calendar&team=BOS');
  await jumpAll();
  await roundTrip(page, 'breadcrumb, Schedule');
  await open(page, '?view=cup&cup=history');
  await jumpAll();
  await roundTrip(page, 'breadcrumb, Cup');
  expect(errors).toEqual([]);
});

test('no layout shift on load and after navigating', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const cls = () => page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  for (const [name, search, sel] of PAGES) {
    await open(page, search);
    await expect(page.locator(sel).first()).toBeVisible();
    await page.waitForTimeout(400);
    expect(await cls(), `${name}: load`).toBeLessThan(0.02);
  }
  await open(page, `?view=league&layout=list&date=${DAY}`);
  await page.waitForTimeout(400);
  const before = await cls();
  for (const sel of ['[data-testid="team-chip"][aria-label="Boston Celtics"]', '[data-testid="where-cup"]', '[data-testid="where-standings"]', '[data-testid="where-schedule"]']) {
    await page.locator(sel).click();
    await page.waitForTimeout(700); // past the 500 ms a click excuses
  }
  expect((await cls()) - before, 'after navigating').toBeLessThan(0.02);
});

test('no <select> picks a What; every icon-only control has a name and a tooltip', async ({ page }) => {
  for (const [name, search, sel] of PAGES) {
    await open(page, search);
    await expect(page.locator(sel).first()).toBeVisible();
    expect(await page.locator('select').count(), name).toBe(0);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] button, [data-testid="page-rows"] button')]
        .filter((b) => b.offsetParent !== null && !b.textContent!.replace(/[←→‹›×]/g, '').trim())
        .filter((b) => !b.getAttribute('aria-label') || !(b.getAttribute('title') ?? b.getAttribute('data-tip')))
        .map((b) => b.outerHTML.slice(0, 100)),
    );
    expect(unnamed, name).toEqual([]);
  }
});

test('390 px wide: the header fits, every place visible (no hamburger), no sideways page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `?view=league&layout=list&date=${DAY}`);
  const m = await page.evaluate(() => {
    const h = document.querySelector<HTMLElement>('[data-testid="top-bar"]')!;
    const r = h.getBoundingClientRect();
    const tabs = [...h.querySelectorAll<HTMLElement>('[data-testid="where-tabs"] button')].map((b) => b.getBoundingClientRect());
    return { right: r.right, height: r.height, overflow: h.scrollWidth - h.clientWidth, tabs: tabs.map((t) => t.right <= innerWidth && t.width > 0), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(m.overflow).toBeLessThanOrEqual(0);
  expect(m.tabs.every(Boolean)).toBe(true);
  expect(m.sideways).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('go-anywhere')).toBeVisible();
});
