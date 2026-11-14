// The Team List's map in a real browser (1920: the 1110 px Team List leaves no room at 1280): the travel view of
// the selected team's next game by default, or the hovered / pinned row's (home games too) — both teams' last and next
// games, the panel under it, labels inside the map; beside the list, never over it, never in a copy.

import { expect, test, type Page } from './fixtures';
import { showMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');

async function open(page: Page, team: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/?view=team&layout=list&team=${team}`);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="team-list"] [data-game-id]'));
}
const map = (page: Page) => page.getByTestId('team-map');

type FeedGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; arenaName: string; arenaCity: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
/** The team's games from the served snapshot, in order. */
const feedGames = (page: Page, tri: string) =>
  page.evaluate(async (tri) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri));
    return games.sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC)).map((g) => ({ id: g.gameId, date: g.gameDateEst.slice(0, 10), arena: g.arenaName, home: g.homeTeam.teamTricode === tri }));
  }, tri);
/** Today in the browser's zone (America/Sao_Paulo in the config) at NOW. */
const TODAY = '2026-11-15';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl' && !info.title.startsWith('no team map'), '1920 only: the map needs the room'));

test("beside the Team List at 1920, never over it; BOS's next game by default, the panel with BOS first in its colour", async ({ page }) => {
  await open(page, 'BOS');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const r = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="team-map"]')!.getBoundingClientRect();
    const hits = [...document.querySelectorAll('.ck-team-list *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > m.left && b.left < m.right && b.bottom > m.top && b.top < m.bottom; }).length;
    return { left: m.left, list: document.querySelector('.ck-team-list')!.getBoundingClientRect().right, right: m.right, vw: innerWidth, width: m.width, hits };
  });
  expect(r.left).toBeGreaterThanOrEqual(r.list + 20);
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.hits).toBe(0);
  expect(r.width).toBeGreaterThan(600);
  const games = await feedGames(page, 'BOS');
  const next = games.find((g) => g.date >= TODAY)!;
  await expect(map(page)).toHaveAttribute('data-focus', next.id);
  await expect(map(page)).not.toHaveAttribute('data-pinned', /.*/);
  const teams = page.getByTestId('map-panel').locator('[data-team]');
  await expect(teams).toHaveCount(2);
  await expect(teams.first()).toHaveAttribute('data-team', 'BOS');
  // BOS in colour a (pink) whichever side it plays
  expect(await teams.first().evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 122, 184)');
  await expect(teams.first().locator('[data-leg="this"]')).toContainText(next.home ? 'this vs ' : 'this @ ');
  // the focused game's own dot lights its row
  await map(page).locator(`[data-map-game="${next.id}"] .ck-map-pin`).hover({ force: true });
  await expect(page.locator(`[data-testid="team-list"] .ck-card[data-game-id="${next.id}"]`)).toHaveClass(/ck-map-hot/);
});

test('hover any row (home games too): that game; leave: back to the next game; click pins, Esc unpins', async ({ page }) => {
  await open(page, 'BOS');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const games = await feedGames(page, 'BOS');
  const next = games.find((g) => g.date >= TODAY)!;
  const list = page.getByTestId('team-list');
  const month = TODAY.slice(0, 7);
  await showMonth(page, month);
  const inMonth = games.filter((g) => g.date.startsWith(month));
  for (const g of [inMonth.find((x) => x.home)!, inMonth.find((x) => !x.home)!]) {
    const row = list.locator(`.ck-card[data-game-id="${g.id}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.locator('.ck-time').hover();
    await expect(map(page)).toHaveAttribute('data-focus', g.id);
    await expect(page.getByTestId('map-panel')).toContainText(g.arena);
    await expect(page.getByTestId('map-panel').locator('[data-team="BOS"] [data-leg="this"]')).toContainText(g.home ? 'this vs ' : 'this @ ');
  }
  await page.mouse.move(2, 2);
  await expect(map(page)).toHaveAttribute('data-focus', next.id);
  // pin a home game, move onto the map: it stays; Esc: back to the next game
  const home = inMonth.find((x) => x.home && x.id !== next.id)!;
  const row = list.locator(`.ck-card[data-game-id="${home.id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator('.ck-time').click();
  await expect(map(page)).toHaveAttribute('data-pinned', '');
  const b = (await map(page).locator('.ck-map-box').boundingBox())!;
  await page.mouse.move(b.x + 8, b.y + b.height - 8, { steps: 5 });
  await page.waitForTimeout(300);
  await expect(map(page)).toHaveAttribute('data-focus', home.id);
  await page.keyboard.press('Escape');
  await expect(map(page)).toHaveAttribute('data-focus', next.id);
});

test('every team: the default game drawn, every label inside the map; no console errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const teams = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
  let overlapping = 0;
  for (const tri of teams) {
    await open(page, tri);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    await expect(map(page)).toHaveAttribute('data-focus', /./);
    await page.waitForTimeout(350);
    const r = await map(page).evaluate((m) => {
      const box = m.querySelector('.ck-map-box')!.getBoundingClientRect();
      const labels = [...m.querySelectorAll('.ck-map-label')].map((l) => l.getBoundingClientRect());
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { n: labels.length, out: labels.filter((l) => l.left < box.left - 1 || l.right > box.right + 1 || l.top < box.top - 1 || l.bottom > box.bottom + 1).length, pairs: labels.filter((a, i) => labels.some((b, j) => j > i && hit(a, b))).length };
    });
    expect(r.out, `${tri}: labels outside the map`).toBe(0);
    expect(r.n, tri).toBeGreaterThan(1);
    if (r.pairs) overlapping++;
  }
  expect(overlapping, 'teams whose default view has overlapping labels').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the map is in no copy: the view copy is the Team List only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, 'BOS');
  await expect(map(page)).toHaveAttribute('data-capture-exclude', 'true');
  const button = page.getByTestId('copy-view');
  await button.click();
  await expect(button).toHaveAttribute('data-captured', /^\d+x\d+@/, { timeout: 30_000 });
  const w = Number((await button.getAttribute('data-captured'))!.split('x')[0]);
  expect(w).toBeLessThan(1110 + 100);
});

test('no team map at 1280 and below: the Team List keeps its width', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop-xl', 'narrower widths');
  await open(page, 'BOS');
  await page.waitForTimeout(300);
  await expect(map(page)).toHaveCount(0);
});
