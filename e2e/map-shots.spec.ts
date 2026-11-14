// Screenshots of the maps' travel view for review (test-output/map-shots/, 1920 × 1080): a busy League List day
// with nothing focused, a pinned game with long cross-country legs, a TOR home game on the Team map, and a short trip
// (TOR @ DET). They only fail when a view can't be reached; the pictures are for a person to look at.

import { expect, test, type Page } from './fixtures';
import { showMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');
const DIR = 'test-output/map-shots';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', '1920 only'));

const settle = (page: Page) => page.waitForTimeout(450); // the zoom's transition

test('league: a busy day, then the pinned game with the longest leg', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=league&layout=list&date=2026-11-02');
  const map = page.getByTestId('league-map');
  await expect(map.locator('.ck-map-svg')).toBeVisible();
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${DIR}/1-league-busy-day.png` });
  // the game whose legs run furthest
  let best = { id: '', miles: 0 };
  for (const id of await page.getByTestId('league-list').locator('.ck-card[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!))) {
    await page.locator(`[data-testid="league-list"] .ck-card[data-game-id="${id}"] .ck-time`).hover();
    await expect(map).toHaveAttribute('data-focus', id);
    const m = await map.locator('path[data-leg]').evaluateAll((els) => Math.max(0, ...els.map((e) => Number((e as SVGElement).dataset.miles ?? 0))));
    if (m > best.miles) best = { id, miles: m };
  }
  expect(best.miles).toBeGreaterThan(1500);
  await page.locator(`[data-testid="league-list"] .ck-card[data-game-id="${best.id}"] .ck-time`).click();
  await page.mouse.move(2, 2);
  await expect(map).toHaveAttribute('data-pinned', '');
  await settle(page);
  await page.screenshot({ path: `${DIR}/2-league-pinned-long-legs.png` });
});

/** Pins the TOR game picked from the snapshot on the Team map. */
async function pinTor(page: Page, pick: (g: { id: string; date: string; home: boolean; opp: string }) => boolean) {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=team&layout=list&team=TOR');
  await page.waitForFunction(() => !!document.querySelector('[data-testid="team-list"] [data-game-id]'));
  const games = await page.evaluate(async () => {
    type G = { gameId: string; gameDateEst: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamTricode === 'TOR' || g.awayTeam.teamTricode === 'TOR')).map((g) => ({ id: g.gameId, date: g.gameDateEst.slice(0, 10), home: g.homeTeam.teamTricode === 'TOR', opp: g.homeTeam.teamTricode === 'TOR' ? g.awayTeam.teamTricode : g.homeTeam.teamTricode }));
  });
  const g = games.filter((x) => x.date >= '2026-11-15').find(pick) ?? games.find(pick);
  expect(g).toBeTruthy();
  await showMonth(page, g!.date.slice(0, 7));
  const row = page.locator(`[data-testid="team-list"] .ck-card[data-game-id="${g!.id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator('.ck-time').click();
  await page.mouse.move(2, 2);
  await expect(page.getByTestId('team-map')).toHaveAttribute('data-focus', g!.id);
  await settle(page);
}

test('team map: a TOR home game', async ({ page }) => {
  await pinTor(page, (g) => g.home);
  await page.screenshot({ path: `${DIR}/3-team-tor-home.png` });
});

test('team map: a short trip, TOR @ DET', async ({ page }) => {
  await pinTor(page, (g) => !g.home && g.opp === 'DET');
  await page.screenshot({ path: `${DIR}/4-team-tor-at-det.png` });
});
