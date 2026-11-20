// CK-24: a past NBA season from the Standings' season strip — its standings, play-in and bracket render, a series'
// hover lists its games with links, the address keeps the season, and the history loads only when opened.

import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

test('pick 2015-16: standings and bracket render, a series hover shows its games; the address keeps it', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('/data/history/') && asked.push(new URL(r.url()).pathname.split('/').pop()!));
  await page.goto(`${APP}?view=standings`);
  await expect(page.getByTestId('standings-table')).toHaveCount(2);
  expect(asked, 'nothing of the history loads with this season').toEqual([]);
  await page.getByTestId('season-strip').getByRole('radio', { name: '2015-16' }).click();
  const h = page.getByTestId('nba-history');
  await expect(h).toHaveAttribute('data-year', '2016');
  await expect(page).toHaveURL(/season=2016/);
  await expect(page.getByTestId('hist-champion')).toHaveText('Champions: Cleveland Cavaliers (4–3 over Golden State Warriors)');
  await expect(h.locator('[data-conference="West"] tbody tr').first()).toContainText('Golden State Warriors');
  await expect(h.locator('[data-conference="West"] tbody tr').first()).toContainText('73');
  await expect(page.getByTestId('hist-series')).toHaveCount(15);
  await expect(page.getByTestId('hist-playin')).toHaveCount(0); // before 2020-21
  // the Finals' hover: its seven games, each a link
  await page.locator('[data-testid="hist-series"][data-round="4"]').hover();
  const pop = page.getByTestId('hist-series-popup');
  await expect(pop).toContainText('NBA Finals: Cleveland Cavaliers 4–3');
  await expect(pop.getByTestId('hist-game')).toHaveCount(7);
  await expect(pop.getByTestId('hist-game').last()).toHaveAttribute('href', 'https://www.nba.com/games?date=2016-06-19');
  // the champions table opens another season; a reload keeps it
  await page.getByTestId('hist-summary').getByRole('button', { name: '2022-23' }).click();
  await expect(h).toHaveAttribute('data-year', '2023');
  await expect(page.getByTestId('hist-playin').getByTestId('hist-game')).toHaveCount(6);
  await page.reload();
  await expect(page.getByTestId('nba-history')).toHaveAttribute('data-year', '2023');
  // back to this season
  await page.getByTestId('season-strip').getByRole('radio', { name: 'This season' }).click();
  await expect(page.getByTestId('standings-table')).toHaveCount(2);
  await expect(page).not.toHaveURL(/season=/);
});
