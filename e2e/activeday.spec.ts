// Active day (round 4, item 10) in a real browser: the Team List highlights the row at the top (the League List did the
// same for its top day until round 8, which shows one day at a time). 150 ms fade (opacity only).

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

// Round 8 (1.3): the League List shows one day, so the strip-day highlight (header, band) is gone.
test('League List: no active-day highlight (one day on screen), also after the wheel and a strip click', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-17');
  const lit = () => page.evaluate(() => document.querySelectorAll('.ck-active-day, .ck-hl.ck-hl-on').length);
  expect(await lit()).toBe(0);
  await page.getByTestId('league-list').hover();
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 500);
  await page.getByRole('tablist', { name: 'Week' }).getByRole('tab', { name: /^Thursday, November 19/ }).click();
  await settle(page);
  expect(await lit()).toBe(0);
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
