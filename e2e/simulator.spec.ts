// Round 21 (item 4): the simulator on a real layout — one screen with no page scroll at 1920 × 950 and 1600 × 1000,
// nothing cut off, also with every remaining game picked (quick: the "depends on margin" tags are on show); picks are
// instant (no request per click).

import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project'));

const NOW = new Date('2026-11-06T15:00:00Z');
for (const size of [{ width: 1920, height: 950 }, { width: 1600, height: 1000 }])
  test(`${size.width}×${size.height}: one screen, nothing cut off — before and after picking every game; no request per pick`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.clock.setFixedTime(NOW);
    await page.goto(`${APP}?view=cup&cup=simulator`);
    await expect(page.getByTestId('cup-sim')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const check = () =>
      page.evaluate(() => {
        const sim = document.querySelector<HTMLElement>('[data-testid="cup-sim"]')!;
        const out: string[] = [];
        for (const e of sim.querySelectorAll<HTMLElement>('*')) {
          const b = e.getBoundingClientRect();
          if (!b.width && !b.height) continue;
          if (b.bottom > innerHeight + 0.5) out.push(`below the window: ${e.className}`);
          if (e.matches('.ck-sim-depends, .ck-sim-tri, .ck-sim-pick, .ck-sim-rec') && (e.scrollWidth > e.clientWidth + 1 || b.right > (e.closest('.ck-sim-table, .ck-sim-panel, .ck-sim-game')?.getBoundingClientRect().right ?? Infinity) + 0.5)) out.push(`cut off: ${e.className} "${e.textContent}"`);
        }
        return { out, scroll: document.documentElement.scrollHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, win: innerHeight };
      });
    let r = await check();
    expect(r.out).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.win);
    const requests: string[] = [];
    page.on('request', (q) => requests.push(q.url()));
    const games = page.locator('[data-testid="sim-game"]:not(.ck-sim-real)');
    const n = await games.count();
    expect(n).toBeGreaterThan(30);
    for (let i = 0; i < n; i++) await games.nth(i).locator('.ck-sim-pick').nth(1).click();
    expect(requests).toEqual([]);
    await expect(page.getByTestId('sim-depends').first()).toBeVisible();
    await page.screenshot({ path: `test-output/simulator-${size.width}x${size.height}.png` });
    r = await check();
    expect(r.out).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.win);
    expect(r.sideways).toBeLessThanOrEqual(0);
  });
