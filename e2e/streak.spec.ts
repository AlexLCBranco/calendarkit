// Round 21 (item 8): the streak popup on a real browser — hovering a Slate card's streak opens it with that streak's
// games, it stays open while the pointer moves into it, a game opens its hoopsjunkie page in a new tab; the Standings'
// streaks have it too; no request is made on hover. Desktop widths.

import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-06T15:00:00Z'); // the snapshot's results go to Nov 5: Nov 6's cards have streaks

test('Slate: hover a streak → its games; move into the popup; a game opens hoopsjunkie in a new tab; no request', async ({ page, context }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=slate`);
  const streak = page.locator('[data-testid="slate"] [data-streak]').first();
  await expect(streak).toBeVisible();
  const label = (await streak.textContent())!;
  const n = Number(label.slice(1));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await streak.hover();
  const pop = page.getByTestId('streak-popup');
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId('streak-row')).toHaveCount(n);
  await expect(pop).toContainText(`${n}-game ${label[0] === 'W' ? 'winning' : 'losing'} streak`);
  // every row the streak's result, newest first
  const dates = await pop.getByTestId('streak-row').evaluateAll((rs) => rs.map((r) => r.querySelector('.ck-streak-res')!.textContent!.slice(0, 1)));
  expect(new Set(dates)).toEqual(new Set([label[0]]));
  // into the popup: still open
  const link = pop.locator('a.ck-streak-game').first();
  await link.hover();
  await page.waitForTimeout(400);
  await expect(pop).toBeVisible();
  expect(requests.filter((u) => !u.startsWith('data:'))).toEqual([]);
  await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
  expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\/2026-\d\d-\d\d\/[a-z]{3}-vs-[a-z]{3}$/);
  await tab.close();
  // leaving closes it
  await page.mouse.move(5, 5);
  await expect(pop).toHaveCount(0);
});

test('Standings: the Strk column opens the current streak', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=standings`);
  const cell = page.locator('[data-testid="standings-table"] [data-streak]').first();
  await expect(cell).toBeVisible();
  const n = Number((await cell.textContent())!.slice(1));
  await cell.hover();
  await expect(page.getByTestId('streak-popup').getByTestId('streak-row')).toHaveCount(n);
});
