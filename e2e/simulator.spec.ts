// The simulator on a real layout — one screen with no page scroll at 1920 × 950 and 1600 × 1000,
// nothing cut off, also with every remaining game picked (quick: the "depends on margin" tags are on show) and the
// knockout bracket played to a champion with margins (detailed); the tables and the bracket on screen together; picks
// are instant (no request per click).

import { expect, test } from './fixtures';
import { APP, scrollAway } from './app';

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
        window.scrollTo(0, document.documentElement.scrollHeight); // the page rows scrolled away (NAV_PATTERN.md)
        const sim = document.querySelector<HTMLElement>('[data-testid="cup-sim"]')!;
        const out: string[] = [];
        for (const e of sim.querySelectorAll<HTMLElement>('*')) {
          const b = e.getBoundingClientRect();
          if (!b.width && !b.height) continue;
          if (b.bottom > innerHeight + 0.5) out.push(`below the window: ${e.className}`);
          if (e.matches('.ck-sim-depends, .ck-sim-tri, .ck-sim-pick, .ck-sim-rec, .ck-kb-tri, .ck-kb-champ-name') && (e.scrollWidth > e.clientWidth + 1 || b.right > (e.closest('.ck-kb-team, .ck-kb-champ, .ck-sim-table, .ck-sim-panel, .ck-sim-game')?.getBoundingClientRect().right ?? Infinity) + 0.5)) out.push(`cut off: ${e.className} "${e.textContent}"`);
        }
        return { out, scroll: document.documentElement.scrollHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, win: innerHeight };
      });
    // on a Cup night the "Tonight in the Cup" line is the page's first line (it can't fit the header's row): the page
    // may scroll by it, as it did when the line sat in the page rows
    const tonight = () => page.evaluate(() => { const t = document.querySelector('[data-testid="cup-tonight"]'); return t ? Math.ceil(t.getBoundingClientRect().height + parseFloat(getComputedStyle(t).marginBottom)) : 0; });
    let r = await check();
    expect(r.out).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.win + (await scrollAway(page)) + (await tonight()));
    const requests: string[] = [];
    page.on('request', (q) => requests.push(q.url()));
    const games = page.locator('[data-testid="sim-game"]:not(.ck-sim-real)');
    const n = await games.count();
    // the group games not played yet in the snapshot: fewer every Cup night, none once the groups are over
    for (let i = 0; i < n; i++) await games.nth(i).locator('.ck-sim-pick').nth(1).click();
    expect(requests).toEqual([]);
    if (n) await expect(page.getByTestId('sim-depends').first()).toBeVisible();
    await page.screenshot({ path: `test-output/simulator-${size.width}x${size.height}.png` });
    r = await check();
    expect(r.out).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.win + (await scrollAway(page)) + (await tonight()));
    expect(r.sideways).toBeLessThanOrEqual(0);

    // the bracket played through, with margins: QF → SF → Final → champion, every team big and whole
    await page.getByRole('tab', { name: 'Detailed' }).click();
    for (const key of ['QF-West-1', 'QF-West-2', 'QF-East-1', 'QF-East-2', 'SF-West', 'SF-East', 'F']) {
      const m = page.locator(`[data-key="${key}"]`);
      await m.locator('button[data-testid="kb-team"]').nth(1).click();
      await m.locator('input.ck-sim-margin').fill('12');
      await expect(m).toHaveAttribute('data-winner', /^[A-Z]{3}$/);
    }
    const champ = await page.locator('[data-key="F"]').getAttribute('data-winner');
    await expect(page.getByTestId('kb-champion')).toHaveAttribute('data-team', champ!);
    expect(requests).toEqual([]);
    // both on screen at once: the six tables and the whole bracket inside the window (the page rows scrolled away)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const el of [...(await page.getByTestId('sim-group').all()), page.getByTestId('sim-bracket')]) {
      const b = (await el.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(size.height);
    }
    const logo = (await page.locator('[data-key="QF-West-1"] .ck-kb-logo img').first().boundingBox())!;
    const tableLogo = (await page.locator('[data-testid="sim-group"] .ck-logo-backing img').first().boundingBox())!;
    expect(logo.height).toBeGreaterThanOrEqual(tableLogo.height * 1.3); // bigger than the tables' logos
    await page.screenshot({ path: `test-output/simulator-bracket-${size.width}x${size.height}.png` });
    r = await check();
    expect(r.out).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.win + (await scrollAway(page)) + (await tonight()));
    expect(r.sideways).toBeLessThanOrEqual(0);
  });
