// Active day (round 4, item 10) in a real browser: the League List highlights the strip's selected day (header in the
// accent, a band with a left bar over its rows) and moves it with the wheel; the Team List highlights the row at the
// top. 150 ms fade (opacity only).

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
const ACCENT = 'rgb(78, 161, 255)';
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

test('League List: the selected day highlighted, follows the wheel, fades, sections kept', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-17');
  const list = page.getByTestId('league-list');
  const look = () =>
    page.evaluate(() => {
      const s = [...document.querySelectorAll<HTMLElement>('.ck-active-day')];
      const head = s[0]?.querySelector('.ck-lday-head');
      const rows = s[0]?.querySelector('.ck-daylist')?.getBoundingClientRect();
      const on = [...document.querySelectorAll<HTMLElement>('.ck-hl.ck-hl-on')];
      const band = on[0]?.getBoundingClientRect();
      const after = head && getComputedStyle(head, '::after');
      return {
        days: s.map((e) => e.dataset.day),
        selected: document.querySelector<HTMLElement>('[aria-label="Week"] [aria-selected="true"]')!.dataset.date,
        head: after && after.opacity === '1' ? after.color : 'none',
        // one band, over the active day's rows (same box within a pixel), with the accent bar on its left
        band: on.length === 1 && !!rows && !!band && Math.abs(band.top - rows.top) < 1 && Math.abs(band.height - rows.height) < 1 && Math.abs(band.left - rows.left) < 1 ? getComputedStyle(on[0]!).borderLeftColor : 'none',
        fade: getComputedStyle(document.querySelector('.ck-hl')!).transitionDuration,
      };
    });
  await page.waitForTimeout(200);
  let l = await look();
  expect(l.days).toEqual(['2026-11-17']);
  await expect.poll(async () => ((l = await look()), [l.head, l.band])).toEqual([ACCENT, ACCENT]);
  expect(l.fade).toContain('0.15s');
  await list.hover();
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 500);
    await settle(page);
    // polled: the wheel may still be moving and the 150 ms fade still running (CI's runners are slower; a fixed
    // 250 ms wait failed there on 2026-10-29)
    await expect
      .poll(async () => {
        l = await look();
        return l.days.length === 1 && l.days[0] === l.selected && l.head === ACCENT && l.band === ACCENT;
      })
      .toBe(true);
  }
  expect(l.selected).not.toBe('2026-11-17');
});

test('Team List: the row at the top highlighted, follows the wheel', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  await list.hover();
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400); // the strip and title catch up every 120 ms and when the list stops
    const r = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.ck-active-day');
      const band = document.querySelector('.ck-hl.ck-hl-on')?.getBoundingClientRect();
      const b = row?.getBoundingClientRect();
      return {
        rows: [...document.querySelectorAll<HTMLElement>('.ck-active-day')].map((e) => e.dataset.rowDate),
        selected: document.querySelector<HTMLElement>('[data-testid="week-strip"] [aria-selected="true"]')!.dataset.date,
        over: !!b && !!band && Math.abs(b.top - band.top) < 1 && Math.abs(b.height - band.height) < 1,
      };
    });
    expect(r.rows).toEqual([r.selected]);
    expect(r.over).toBe(true);
  }
});
