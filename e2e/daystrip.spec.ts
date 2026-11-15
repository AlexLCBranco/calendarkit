// The tooltip day strip in a real browser: hover a road-trip label → the strip with the matchups; move onto a game
// square (the tip stays) and click it → the game's hoopsjunkie page in a new tab; the tip never covers the top bar.
// Logic: tests/daystrip.test.tsx.
import { expect, test } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

test('hover a strip, move onto a game square, click: its hoopsjunkie page; never over the top bar', async ({ page, context }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=team&layout=list&team=BOS');
  const label = page.locator('[data-testid="run-label"][data-tip-games]').first();
  await label.scrollIntoViewIfNeeded();
  await label.hover();
  const tip = page.getByTestId('tooltip');
  await expect(tip.getByTestId('tip-days')).toBeVisible();
  const squares = tip.locator('a[data-testid="tip-game"]');
  expect(await squares.count()).toBeGreaterThanOrEqual(3);
  await expect(squares.first()).toHaveText(/^(vs|@) [A-Z]{3}$/);
  const bar = (await page.getByTestId('top-bar').boundingBox())!;
  expect((await tip.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  // move onto the square (the tip stays), click it
  await squares.first().hover();
  await page.waitForTimeout(300);
  await expect(tip).toBeVisible();
  await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  const [tab] = await Promise.all([context.waitForEvent('page'), squares.first().click()]);
  expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\/2026-\d\d-\d\d\/[a-z]{3}-vs-[a-z]{3}$/);
  await tab.close();
  // away: it closes
  await page.mouse.move(5, page.viewportSize()!.height - 5);
  await expect(tip).toHaveCount(0);
});
