// CK-17: the season-series popup's ◀ season ▶ — an earlier season's meetings from the served past-seasons file.
import { expect, test } from './fixtures';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once'));

test('◀ switches the popup to last season: its meetings and count; ▶ back', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-16T15:00:00Z'));
  await page.goto('?view=league&layout=slate&date=2026-11-16');
  const chip = page.locator('[data-testid="slate"] [data-testid="series-chip"]').first();
  await chip.hover();
  const pop = page.getByTestId('series-popup');
  await expect(pop).toBeVisible();
  const now = { season: await pop.getByTestId('series-season').textContent(), count: await pop.getByTestId('series-count').textContent(), squares: await pop.getByTestId('series-square').count() };
  const [a, b] = (await pop.locator('.ck-series-title a').allTextContents()).map((t) => t.trim());
  const file = await page.evaluate(async () => (await (await fetch('/calendar/data/past-seasons.json')).json()) as { seasons: Record<string, [string, string, string][]> });
  await pop.getByTestId('series-prev-season').click();
  await expect(pop.getByTestId('series-season')).toHaveText('2025-26');
  const want = file.seasons['2025-26']!.filter((g) => (g[1] === a && g[2] === b) || (g[1] === b && g[2] === a));
  await expect(pop.getByTestId('series-square')).toHaveCount(want.length);
  await expect(pop.getByTestId('series-count')).toHaveText(` · ${want.length} meeting${want.length === 1 ? '' : 's'}`);
  await expect(pop.getByTestId('series-square').first()).toHaveAttribute('data-date', want[0]![0]);
  await pop.getByTestId('series-next-season').click();
  await expect(pop.getByTestId('series-season')).toHaveText(now.season!);
  await expect(pop.getByTestId('series-count')).toHaveText(now.count!);
  await expect(pop.getByTestId('series-square')).toHaveCount(now.squares);
});
