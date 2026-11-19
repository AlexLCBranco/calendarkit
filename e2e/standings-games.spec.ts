// CK-18: Standings cells open their games — W-L the last 5 results, Remaining (Left, Home, Road, B2B) and the B2B legs
// their games — each row the game's page; a click pins the pop-up; the team name still opens the Team view.
import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once'));

test('hover a cell: the right games, links to the games; click pins; the team name still opens the Team view', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-18T15:00:00Z'));
  await page.goto(`${APP}?view=standings`);
  await page.getByRole('tablist', { name: 'Standings columns' }).getByRole('tab', { name: 'Schedule & B2B' }).click();
  const row = page.locator('[data-testid="standings-table"] tr[data-team="BOS"]');
  // W-L: the last 5 results
  await row.locator('td[data-col="wl"] .ck-st-games').hover();
  const pop = page.getByTestId('st-games-popup');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('BOS · 5 last 5 results');
  await expect(pop.getByTestId('st-game-link')).toHaveCount(5);
  await expect(pop.getByTestId('st-game-link').first()).toHaveAttribute('href', /hoopsjunkie/);
  await expect(pop.getByTestId('st-game-link').first()).toHaveText(/(vs|@) [A-Z]{3}[WL] \d+–\d+/);
  // Left: as many games as the number, unplayed
  const left = Number(await row.locator('td[data-col="left"]').textContent());
  await row.locator('td[data-col="left"] .ck-st-games').hover();
  await expect(pop).toContainText(`BOS · ${left} games left`);
  await expect(pop.locator('li')).toHaveCount(left);
  // B2B 2nd leg: the record's games
  const [w, l] = (await row.locator('td[data-col="b2b2"]').textContent())!.split('-').map(Number);
  await row.locator('td[data-col="b2b2"] .ck-st-games').hover();
  await expect(pop.locator('li')).toHaveCount(w! + l!);
  // a click pins it: the pointer can leave
  await row.locator('td[data-col="leftHome"] .ck-st-games').click();
  await expect(pop).toHaveAttribute('data-pinned', 'true');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  // the team name is still the Team view
  await row.locator('.ck-st-name').click();
  await expect(page.getByTestId('team-header')).toBeVisible();
});
