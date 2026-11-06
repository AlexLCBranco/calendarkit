// Round 21 (item 9): Cup → History on a real layout — the summary and a season's tables and bracket on one screen at
// 1920 × 950 and 1600 × 1000, every season, nothing clipped; the season in the address; no request for the data
// (it ships with its own chunk).

import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project'));

for (const size of [{ width: 1920, height: 950 }, { width: 1600, height: 1000 }])
  test(`${size.width}×${size.height}: every season on one screen, nothing cut off; the season is in the address`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`${APP}?view=cup&cup=history`);
    await expect(page.getByTestId('cup-history')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    for (const year of ['2023', '2024', '2025']) {
      await page.getByRole('tablist', { name: 'History season' }).getByRole('tab', { name: year }).click();
      await expect(page.getByTestId('hist-season')).toHaveAttribute('data-year', year);
      await expect.poll(() => new URL(page.url()).searchParams.get('hs')).toBe(year);
      const r = await page.evaluate(() => {
        const out: string[] = [];
        for (const e of document.querySelectorAll<HTMLElement>('[data-testid="cup-history"] .ck-cup-slot, [data-testid="cup-history"] .ck-sim-bgame, [data-testid="cup-history"] td')) {
          if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`cut off: ${e.className} "${e.textContent}"`);
          if (e.getBoundingClientRect().bottom > innerHeight + 0.5) out.push(`below the window: ${e.className}`);
        }
        return { out, scroll: document.documentElement.scrollHeight, win: innerHeight };
      });
      expect(r.out, year).toEqual([]);
      expect(r.scroll, year).toBeLessThanOrEqual(r.win);
    }
    expect(requests.filter((u) => /\.json/.test(u))).toEqual([]);
  });
