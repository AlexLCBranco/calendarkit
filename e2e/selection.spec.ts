// Marquee select (desktop 1280 and 1920), with real mouse drags: in every view with games, a box over a known set of
// games selects exactly the games it touches (worked out in the test from their on-screen rects), Shift-drag adds, a
// click clears, Escape clears, a view change clears; dragging to the bottom edge of the Team List auto-scrolls and
// selects rows beyond the first screen; the bar's Copy and Ctrl+C put a PNG on the clipboard.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'desktop-xl', 'desktop widths only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

type Pt = { x: number; y: number };
/** A real mouse drag in small steps (as a hand would), optionally with Shift held. */
async function drag(page: Page, from: Pt, to: Pt, { shift = false, steps = 12 } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

/** Ids of the games drawn highlighted (accent outline from the selection's style rule). */
const highlighted = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.ck-select-area [data-game-id]')].filter((e) => getComputedStyle(e).outlineStyle === 'solid').map((e) => e.dataset.gameId!));

/** Ids of the visible games whose rect touches the box (client px), worked out here from the rects alone. */
const touching = (page: Page, a: Pt, b: Pt) =>
  page.evaluate(
    ([a, b]) => {
      const box = { l: Math.min(a.x, b.x), r: Math.max(a.x, b.x), t: Math.min(a.y, b.y), b: Math.max(a.y, b.y) };
      return [...document.querySelectorAll<HTMLElement>('.ck-select-area [data-game-id]')]
        .filter((e) => !e.closest('.ck-team-probe'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.left <= box.r && r.right >= box.l && r.top <= box.b && r.bottom >= box.t;
        })
        .map((e) => e.dataset.gameId!);
    },
    [a, b] as const,
  );

/** The i-th element matching `sel` among those fully on screen (inside the viewport and their scrolling list). */
const rectOf = (page: Page, sel: string, i = 0) =>
  page.evaluate(
    ([sel, i]) => {
      const inside = (r: DOMRect, c: { top: number; bottom: number; left: number; right: number }) => r.top >= c.top && r.bottom <= c.bottom && r.left >= c.left && r.right <= c.right;
      const view = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
      const shown = [...document.querySelectorAll(sel)].filter((e) => {
        const r = e.getBoundingClientRect();
        const sc = e.closest('[data-select-scroller]');
        // clear of a list's auto-scroll zones (48 px at its top and bottom)
        const c = sc?.getBoundingClientRect();
        return r.width > 0 && inside(r, view) && (!c || inside(r, { top: c.top + 60, bottom: c.bottom - 60, left: c.left, right: c.right }));
      });
      if (!shown[i]) throw new Error(`only ${shown.length} of ${sel} on screen`);
      return shown[i]!.getBoundingClientRect().toJSON() as DOMRect;
    },
    [sel, i] as const,
  );
const count = (page: Page) => page.getByTestId('selection-count').textContent();

test('team list: box selects the rows it touches; Shift adds; click and Escape clear; rest rows never selected', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=BOS&rest=1');
  // round 9: the list holds one month and opens at Nov 15 (its second half); from the month's top there's room below
  await page.getByTestId('team-list').evaluate((e) => (e.scrollTop = 0));
  await page.waitForTimeout(200);
  const rows = '.ck-team-rows > .ck-card';
  const r1 = await rectOf(page, rows, 1);
  const r4 = await rectOf(page, rows, 4);
  // start on a row (rows aren't controls), between its tags and season line
  const a = { x: r1.left + r1.width * 0.72, y: r1.top + r1.height / 2 };
  const b = { x: a.x + 20, y: r4.top + r4.height / 2 };
  const want = await touching(page, a, b);
  expect(want.length).toBeGreaterThanOrEqual(4); // 4 game rows (rest rows between them are never selected)
  await drag(page, a, b);
  expect(await highlighted(page)).toEqual(want);
  await expect(page.getByTestId('selection-bar')).toBeVisible();
  expect(await count(page)).toBe(`${want.length} games selected`);
  expect(await page.locator('.ck-rest-row').evaluateAll((rs) => rs.filter((r) => getComputedStyle(r).outlineStyle === 'solid').length)).toBe(0);
  // Shift-drag adds two more rows below
  const r6 = await rectOf(page, rows, 6);
  const r7 = await rectOf(page, rows, 7);
  const c = { x: a.x, y: r6.top + r6.height / 2 };
  const d = { x: a.x + 20, y: r7.top + r7.height / 2 };
  const more = await touching(page, c, d);
  await drag(page, c, d, { shift: true });
  expect(new Set(await highlighted(page))).toEqual(new Set([...want, ...more]));
  // a new drag without Shift replaces
  await drag(page, c, d);
  expect(await highlighted(page)).toEqual(more);
  // a plain click clears
  await page.mouse.click(a.x, a.y);
  expect(await highlighted(page)).toEqual([]);
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);
  // Escape clears
  await drag(page, a, b);
  expect((await highlighted(page)).length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  expect(await highlighted(page)).toEqual([]);
  // ✕ clears
  await drag(page, a, b);
  await page.getByRole('button', { name: 'Clear selection' }).click();
  expect(await highlighted(page)).toEqual([]);
  // no text got selected by the drags
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('team list: dragging to the bottom edge auto-scrolls and selects rows beyond the first screen; wheel mid-drag stays right', async ({ page }) => {
  // round 9: a month at a time — a short window, so the month is more than a screen, and from the month's top
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 });
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  await list.evaluate((e) => (e.scrollTop = 0));
  await page.waitForTimeout(200);
  const lb = await list.evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  // the game rows wholly on the first screen
  const onScreen = await list.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return [...e.querySelectorAll('.ck-team-rows > .ck-card')].filter((r) => r.getBoundingClientRect().bottom <= b.bottom).length;
  });
  const first = await rectOf(page, '.ck-team-rows > .ck-card', 0); // first row clear of the top auto-scroll zone
  const startId = await page.evaluate((y) => [...document.querySelectorAll<HTMLElement>('.ck-team-rows > .ck-card')].find((r) => Math.abs(r.getBoundingClientRect().top - y) < 0.5)!.dataset.gameId!, first.top);
  const a = { x: first.left + first.width * 0.72, y: first.top + first.height / 2 };
  const top0 = await list.evaluate((e) => e.scrollTop);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, lb.bottom - 6, { steps: 15 }); // into the bottom edge zone
  await expect.poll(() => list.evaluate((e) => e.scrollTop), { timeout: 10_000 }).toBeGreaterThan(top0 + lb.height);
  await page.mouse.move(a.x + 12, lb.bottom - 200, { steps: 5 }); // out of the zone: scrolling stops
  await page.mouse.wheel(0, 120); // wheel mid-drag: the box follows the content
  await page.waitForTimeout(300);
  const end = { x: a.x + 12, y: lb.bottom - 200 };
  await page.mouse.up();
  // expected: every game row from the start row down to the row under the pointer, in order
  const want = await page.evaluate(
    ([startId, y]) => {
      const rows = [...document.querySelectorAll<HTMLElement>('.ck-team-rows > .ck-card')];
      const i = rows.findIndex((r) => r.dataset.gameId === startId);
      const j = rows.findLastIndex((r) => r.getBoundingClientRect().top <= y); // the last row the box reaches
      return rows.slice(i, j + 1).map((r) => r.dataset.gameId!);
    },
    [startId, end.y] as const,
  );
  const got = await highlighted(page);
  console.log(`[selection] auto-scroll: ${got.length} rows selected (${onScreen} on the first screen)`);
  expect(got).toEqual(want);
  expect(got.length).toBeGreaterThan(onScreen);
});

test('league list, team calendar (month / 1 week / 2 weeks), league week view (1 / 2 weeks): exactly the games the box touches', async ({ page }, info) => {
  const cases: { search: string; sel: string; from: number; to: number }[] = [
    { search: '?view=league&layout=list&date=2026-11-15', sel: '.ck-lday .ck-card', from: 1, to: 4 },
    { search: '?view=team&layout=calendar&team=BOS', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 1, to: 3 },
    { search: '?view=team&layout=calendar&team=BOS&span=1w', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 0, to: 2 },
    { search: '?view=team&layout=calendar&team=BOS&span=2w', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 1, to: 4 },
    { search: '?view=league&layout=calendar&date=2026-11-15', sel: '.ck-week-grid .ck-month-game', from: 2, to: 6 },
    { search: '?view=league&layout=calendar&date=2026-11-15&weeks=2', sel: '.ck-week-grid .ck-month-game', from: 3, to: 9 },
  ];
  for (const k of cases) {
    await open(page, k.search);
    const p = await rectOf(page, k.sel, k.from);
    const q = await rectOf(page, k.sel, k.to);
    // from just inside the first game's top-left to just inside the last game's bottom-right
    const a = { x: Math.min(p.left, q.left) + 3, y: p.top + 2 };
    const b = { x: Math.max(p.right, q.right) - 3, y: q.bottom - 2 };
    const want = await touching(page, a, b);
    expect(want.length, k.search).toBeGreaterThanOrEqual(2);
    await drag(page, a, b);
    const got = await highlighted(page);
    console.log(`[selection] ${info.project.name} ${k.search}: ${got.length} games`);
    expect(new Set(got), k.search).toEqual(new Set(want));
    expect(await count(page)).toBe(`${want.length} games selected`);
    // Shift-drag over one more game adds it
    const extra = await page.evaluate(([sel, have]) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => { const r = e.getBoundingClientRect(); const sc = e.closest('[data-select-scroller]')?.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && (!sc || (r.top >= sc.top + 60 && r.bottom <= sc.bottom - 60)); }).findIndex((e) => !have.includes(e.dataset.gameId!)), [k.sel, got] as const);
    if (extra >= 0) {
      const e = await rectOf(page, k.sel, extra);
      const c = { x: e.left + 2, y: e.top + 2 };
      const d = { x: e.left + 8, y: e.top + 6 };
      const add = await touching(page, c, d);
      await drag(page, c, d, { shift: true });
      expect(new Set(await highlighted(page)), `${k.search} shift`).toEqual(new Set([...got, ...add]));
    }
  }
});

test('changing view, team, period, span or a toggle clears the selection', async ({ page }) => {
  const select = async (sel: string) => {
    const p = await rectOf(page, sel, 0);
    const q = await rectOf(page, sel, 1);
    await drag(page, { x: p.left + 3, y: p.top + 2 }, { x: q.right - 3, y: q.bottom - 2 });
    expect((await highlighted(page)).length).toBeGreaterThan(0);
  };
  await open(page, '?view=team&layout=calendar&team=BOS');
  const cell = '.ck-team-grid .ck-day-cell .ck-card';
  for (const act of [
    () => page.getByRole('button', { name: 'Next month' }).click(),
    () => page.getByRole('tab', { name: '2 weeks' }).click(),
    () => page.getByRole('button', { name: 'Previous 2 weeks' }).click(),
    () => page.getByLabel('TV games only').check(),
    () => page.getByLabel('TV games only').uncheck(),
  ]) {
    await select(cell);
    await act();
    expect(await highlighted(page)).toEqual([]);
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);
  }
  await select(cell);
  await page.getByTestId('team-picker').click();
  await page.getByRole('option', { name: 'Miami Heat', exact: true }).click();
  expect(await highlighted(page)).toEqual([]);
  await select(cell);
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  expect(await highlighted(page)).toEqual([]);
  await select('.ck-team-rows > .ck-card');
  await page.getByRole('tab', { name: 'League', exact: true }).click();
  expect(await highlighted(page)).toEqual([]);
});

test('Copy and Ctrl+C put a PNG on the clipboard; controls and the top bar never start a box', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '?view=team&layout=list&team=BOS');
  const r1 = await rectOf(page, '.ck-team-rows > .ck-card', 0);
  const r3 = await rectOf(page, '.ck-team-rows > .ck-card', 2);
  await drag(page, { x: r1.left + r1.width * 0.72, y: r1.top + 5 }, { x: r1.left + r1.width * 0.75, y: r3.bottom - 5 });
  const types = () => page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const button = page.getByTestId('copy-selection');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 20_000 });
  expect(await types()).toContain('image/png');
  await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.keyboard.press('Control+c');
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 20_000 });
  expect(await types()).toContain('image/png');
  // a drag starting on the top bar or a button selects nothing new
  await page.keyboard.press('Escape');
  const bar = await page.getByTestId('top-bar').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  await drag(page, { x: bar.left + 4, y: bar.bottom - 3 }, { x: bar.left + 300, y: r3.bottom });
  expect(await highlighted(page)).toEqual([]);
});
