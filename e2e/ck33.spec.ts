// CK-33 against the built app, on the owner's window (1912 × 913): no team chips; a team box with the list of teams by
// division and an "All teams" button beside it; every page's controls in the header's second row, so nothing with
// controls sits under the header's line and the header is 92 px on every page; the Team Calendar's day boxes tall again.
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const DAY = '2026-11-21';
const LAKERS = '?view=team&layout=calendar&team=LAL';

/** The owner's window; the other desktop project keeps its own (1280 × 900) for the every-page check. */
const XL = 'desktop-xl';
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === XL) await page.setViewportSize({ width: 1912, height: 913 });
  await page.clock.setFixedTime(new Date(`${DAY}T15:00:00Z`));
});

const open = async (page: Page, search: string) => {
  await page.goto(`${APP}${search}${search.includes('date=') ? '' : `${search ? '&' : '?'}date=${DAY}`}`);
  await expect(page.getByTestId('head-controls')).toBeVisible();
};

const owner = () => test.skip(test.info().project.name !== XL, "the owner's window only");

/** The header and its controls row, measured. */
const header = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const head = box(document.querySelector('[data-testid="top-bar"]')!);
    const row = document.querySelector<HTMLElement>('[data-testid="head-controls"]')!;
    const seen = [...row.querySelectorAll<HTMLElement>('button, a, h2, [data-testid="team-month"], [data-testid="team-pos"]')].filter((e) => e.offsetParent !== null && !e.closest('[data-testid="season-strip"]'));
    const tops = new Set(seen.map((e) => Math.round(box(e).top + box(e).height / 2)));
    return {
      height: head.height,
      bottom: head.bottom,
      // every control inside the row, on one line (their centres within a few px of each other)
      right: Math.max(...seen.map((e) => box(e).right)),
      rowRight: box(row).right,
      rowTop: box(row).top,
      rowBottom: box(row).bottom,
      lines: Math.max(...tops) - Math.min(...tops),
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

test('the Lakers\' month: a 92 px header, no chips, nothing with controls under its line, tall day boxes, no page scroll', async ({ page }) => {
  owner();
  await open(page, LAKERS);
  await expect(page.locator('.ck-team-grid [data-game-id]').first()).toBeVisible();
  await page.waitForTimeout(300);
  const h = await header(page);
  expect(h.height).toBe(92);
  await expect(page.locator('[data-testid="team-chip"], [data-testid="team-chips"], [data-testid="team-chip-all"]')).toHaveCount(0);
  // the big team title row is gone
  await expect(page.getByTestId('team-header')).toHaveCount(0);
  const m = await page.evaluate(() => {
    const head = document.querySelector('[data-testid="top-bar"]')!.getBoundingClientRect();
    const weekdays = document.querySelector('.ck-team-month .ck-grid-head')!.getBoundingClientRect();
    // anything a person can press whose box lies between the header's line and the weekday names
    const between = [...document.querySelectorAll<HTMLElement>('button, a, input, select, [role="tab"], [role="radio"]')]
      .filter((e) => e.offsetParent !== null && !e.closest('[data-testid="top-bar"]'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.bottom > head.bottom && r.bottom <= weekdays.top + 1).length;
    const cells = [...document.querySelectorAll('.ck-team-grid .ck-day-cell')].map((c) => c.getBoundingClientRect().height);
    return { between, gap: document.querySelector('.ck-team-month')!.getBoundingClientRect().top - head.bottom, cell: Math.min(...cells), doc: document.documentElement.scrollHeight, win: window.innerHeight };
  });
  console.log(`[ck33] header ${h.height}px, calendar starts ${Math.round(h.bottom + m.gap)}px, day box ${Math.round(m.cell)}px`); // the design log's three numbers
  expect(m.between).toBe(0);
  expect(m.gap).toBeLessThanOrEqual(12); // the weekday names start right under the line
  expect(m.cell).toBeGreaterThanOrEqual(145);
  expect(m.doc).toBeLessThanOrEqual(m.win);
  expect(h.wide).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-output/ck33/lakers-month.png' });
});

test('"All teams" opens the league view and is lit there', async ({ page }) => {
  owner();
  await open(page, LAKERS);
  const all = page.getByTestId('all-teams');
  await expect(all).toBeVisible();
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('view')).not.toBe('team');
  // the box has no team: a placeholder, and the button stays on screen beside it
  await expect(page.getByTestId('team-picker')).toHaveText(/Pick a team/);
  const lit = await all.evaluate((el) => getComputedStyle(el).backgroundColor);
  const quiet = await page.getByTestId('today').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(lit).not.toBe(quiet);
  expect((await header(page)).height).toBe(92);
});

test('the team box opens the six divisions in three columns; choosing a team opens it in Calendar', async ({ page }) => {
  owner();
  await open(page, LAKERS);
  const box = page.getByTestId('team-picker');
  await expect(box).toContainText('Los Angeles Lakers');
  await box.click();
  const list = page.getByTestId('team-picker-list');
  await expect(list).toBeVisible();
  expect(await list.locator('.ck-picker-head').allTextContents()).toEqual(['East · Atlantic', 'East · Central', 'East · Southeast', 'West · Northwest', 'West · Pacific', 'West · Southwest']);
  await expect(list.getByRole('option')).toHaveCount(30);
  await expect(list.getByText('All teams')).toHaveCount(0); // the button replaces the panel's entry
  await expect(list.getByRole('option', { name: 'Los Angeles Lakers' })).toHaveAttribute('aria-selected', 'true');
  // three columns: East's three divisions side by side, West's under them
  const heads = await list.locator('.ck-picker-head').evaluateAll((els) => els.map((e) => ({ x: Math.round(e.getBoundingClientRect().left), y: Math.round(e.getBoundingClientRect().top) })));
  expect(new Set(heads.map((p) => p.x)).size).toBe(3);
  expect(new Set(heads.map((p) => p.y)).size).toBe(2);
  await expect.poll(() => list.locator('img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length)).toBe(30);
  await page.screenshot({ path: 'test-output/ck33/picker-open.png' });
  await list.getByRole('option', { name: 'Miami Heat' }).click();
  await expect(list).toHaveCount(0);
  await expect(box).toContainText('Miami Heat');
  await expect(page.locator('.ck-team-month')).toBeVisible();
  const url = new URL(page.url());
  expect([url.searchParams.get('view'), url.searchParams.get('team'), url.searchParams.get('layout')]).toEqual(['team', 'MIA', 'calendar']);
  // from the league view too: a team opens in Calendar when the league's calendar is on show
  await page.getByTestId('all-teams').click();
  await box.click();
  await page.getByTestId('team-picker-list').getByRole('option', { name: 'Boston Celtics' }).click();
  await expect(page.locator('.ck-team-month')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('team')).toBe('BOS');
});

test('the month\'s name keeps its width, so the arrows don\'t jump between months', async ({ page }) => {
  owner();
  await open(page, LAKERS);
  const next = page.getByRole('button', { name: 'Next month' });
  const at = async () => (await next.boundingBox())!.x;
  const x = await at();
  for (let i = 0; i < 4; i++) {
    await next.click();
    expect(await at()).toBe(x);
  }
});

// Every page: its controls in the header's second row, on one line, inside the window; the header 92 px; no page rows
// under it.
const PAGES: [string, string][] = [
  ['League List', '?view=league&layout=list'],
  ['League Calendar, 1 week', '?view=league&layout=calendar'],
  ['League Calendar, 2 weeks', '?view=league&layout=calendar&weeks=2'],
  ['Slate', '?view=league&layout=slate'],
  ['Team List', '?view=team&layout=list&team=LAL'],
  ['Team Calendar, month', LAKERS],
  ['Team Calendar, 2 weeks', `${LAKERS}&span=2w`],
  ['Cup Groups', '?view=cup'],
  ['Cup Schedule, by group', '?view=cup&cup=schedule'],
  ['Cup Schedule, by date', '?view=cup&cup=schedule&by=date'],
  ['Cup Schedule, a team', '?view=cup&cup=schedule&cl=team&ct=LAL'],
  ['Cup Simulator', '?view=cup&cup=simulator'],
  ['Cup History', '?view=cup&cup=history'],
  ['Standings', '?view=standings'],
  ['Standings, Schedule & B2B', '?view=standings&set=sched'],
  ['Standings, a past season', '?view=standings&season=2016'],
];
for (const [name, search] of PAGES) {
  test(`${name}: the controls are in the header's second row, on one line`, async ({ page }) => {
    await open(page, search);
    await page.waitForTimeout(400);
    const h = await header(page);
    expect(h.height).toBe(92);
    expect(h.right).toBeLessThanOrEqual(h.rowRight + 0.5);
    expect(h.lines).toBeLessThanOrEqual(6);
    expect(h.rowBottom).toBeLessThanOrEqual(h.bottom);
    expect(h.wide).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('page-rows')).toHaveCount(0);
    await expect(page.locator('[data-testid="team-chip"]')).toHaveCount(0);
    // the picker never comes without its All teams button
    expect(await page.getByTestId('all-teams').count()).toBe(await page.getByTestId('team-picker').count());
    await page.screenshot({ path: `test-output/ck33/${test.info().project.name}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
  });
}
