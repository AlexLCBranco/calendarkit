// Two-week view fit (round 5, item 4): at Alex's window (1920 × 911) and the narrow case (1280 × 900) the whole two-week
// view — both week rows and the legend under them — fits the window: no page scroll on any two-week stretch of the
// season, nothing outside its day cell, and game text at its normal size (tricodes 11 px, 16 px lines and logos). The
// busiest stretches (weeks of Mar 28 / Apr 4, 2027: Apr 4 has 13 games in 10 time groups) used to scroll the page by
// 164 px at 1280 × 900 and 115 px at 1920 × 911. Walks every stretch, prints the tightest cell. Runs once (desktop-xl).

import { expect, test } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'sizes the window itself'));

for (const size of [
  { width: 1920, height: 911 },
  { width: 1280, height: 900 },
]) {
  test(`two weeks at ${size.width}×${size.height}: no page scroll on any stretch of the season, text at full size`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.clock.setFixedTime(NOW);
    let tightest = { spare: Infinity, date: '' };
    let stretches = 0;
    // "Next 2 weeks" steps by two weeks, so start once on each week parity: every pair of consecutive weeks is shown
    for (const first of ['2026-10-18', '2026-10-25'])
    for (let guard = 0, opened = false; guard < 20; guard++) {
      if (!opened) {
        await page.goto(`/?view=league&layout=calendar&weeks=2&date=${first}`);
        await page.waitForSelector('.ck-month-game');
        await page.evaluate(() => document.fonts.ready);
        opened = true;
      }
      const r = await page.evaluate(() => {
        const se = document.scrollingElement!;
        const cells = [...document.querySelectorAll<HTMLElement>('.ck-week-view .ck-month-cell')];
        let spare = { px: Infinity, date: '' };
        let outside = 0;
        for (const c of cells) {
          const b = c.getBoundingClientRect();
          const bottoms = [...c.querySelectorAll('li, .ck-tlabel')].map((e) => e.getBoundingClientRect().bottom);
          if (bottoms.length && b.bottom - Math.max(...bottoms) < spare.px) spare = { px: b.bottom - Math.max(...bottoms), date: c.dataset.date! };
          outside += bottoms.filter((y) => y > b.bottom + 0.5).length;
        }
        const tri = document.querySelector('.ck-mtri-text')!;
        const line = document.querySelector('.ck-mline')!.getBoundingClientRect();
        const legend = document.querySelector('[data-testid="fatigue-legend"]')!.getBoundingClientRect();
        return { start: cells[0]!.dataset.date!, scroll: se.scrollHeight - se.clientHeight, outside, spare, font: getComputedStyle(tri).fontSize, lineH: line.height, legendIn: legend.bottom <= innerHeight };
      });
      stretches++;
      expect(r.scroll, `page scroll, two weeks from ${r.start}`).toBeLessThanOrEqual(0);
      expect(r.outside, `lines outside their cell, from ${r.start}`).toBe(0);
      expect(r.legendIn, `legend in the window, from ${r.start}`).toBe(true);
      expect([r.font, r.lineH]).toEqual(['11px', 16]);
      if (r.spare.px < tightest.spare) tightest = { spare: r.spare.px, date: r.spare.date };
      const next = page.getByLabel('Next 2 weeks');
      if (await next.isDisabled()) break;
      await next.click();
      await expect(page.locator('.ck-week-view .ck-month-cell').first()).not.toHaveAttribute('data-date', r.start);
    }
    console.log(`[two-week fit] ${size.width}×${size.height}: ${stretches} stretches, tightest cell ${tightest.date} with ${tightest.spare.toFixed(1)} px spare`);
    expect(stretches).toBeGreaterThan(24);
  });
}
