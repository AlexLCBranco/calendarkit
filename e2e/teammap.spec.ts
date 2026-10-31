// The Team List's map (after round 8) in a real browser: the selected team's road trip — the current one, or the
// hovered row's — numbered stops at the feed's arenas, the trip's numbers, hover both ways, every team's labels inside
// the map; beside the list at 1920 (the 1110 px Team List leaves no room at 1280), never in a copy.

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
/** The team's road trips from the served snapshot, worked out here: runs of games outside its home metro. */
const feedTrips = (page: Page, tri: string) =>
  page.evaluate(async (tri) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri));
    games.sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC));
    const metro = (c: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' })[c] ?? c;
    const cities = new Map<string, number>();
    for (const g of games) if (g.homeTeam.teamTricode === tri) cities.set(g.arenaCity, (cities.get(g.arenaCity) ?? 0) + 1);
    const home = [...cities].sort((a, b) => b[1] - a[1])[0]![0];
    const trips: FeedGame[][] = [];
    let run: FeedGame[] = [];
    for (const g of games) {
      if (g.arenaName && metro(g.arenaCity) === metro(home)) {
        if (run.length) trips.push(run);
        run = [];
      } else run.push(g);
    }
    if (run.length) trips.push(run);
    return trips.map((t) => t.map((g) => ({ id: g.gameId, date: g.gameDateEst.slice(0, 10), arena: g.arenaName, end: Date.parse(g.gameDateTimeUTC) + 3 * 3600e3 })));
  }, tri);

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl' && !info.title.startsWith('no team map'), '1920 only: the map needs the room'));

test('beside the Team List at 1920, never over it; the current trip of BOS as numbered stops, with its numbers', async ({ page }) => {
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
  // the current trip: the first with a game not over at NOW (worked out from the snapshot)
  const trips = await feedTrips(page, 'BOS');
  const i = trips.findIndex((t) => t.some((g) => g.end > NOW.getTime()));
  const trip = trips[i]!;
  await expect(map(page)).toHaveAttribute('data-trip', String(i));
  const stops = await map(page).locator('[data-stop]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.stop, (e as HTMLElement).dataset.arena]));
  expect(stops.flatMap(([n]) => n!.split(',').map(Number)).sort((a, b) => a - b)).toEqual(trip.map((_, k) => k + 1));
  for (const [n, arena] of stops) for (const k of n!.split(',')) expect(arena, `stop ${k}`).toBe(trip[+k - 1]!.arena);
  await expect(map(page).locator('[data-trip-home]')).toHaveAttribute('data-trip-home', 'TD Garden');
  // the route: home → each stop → home (legs between two games in one arena are left out)
  const legs = await map(page).locator('[data-leg]').count();
  expect(legs).toBe(trip.length + 1 - trip.filter((g, k) => k > 0 && g.arena === trip[k - 1]!.arena).length);
  // the numbers
  const stats = page.getByTestId('trip-stats');
  await expect(stats).toContainText(`Road trip ${i + 1} of ${trips.length} (current)`);
  await expect(stats).toContainText(`${trip.length} games in`);
  await expect(stats).toContainText(/≈ [\d,]+ mi \(straight lines\)/);
  const b2b = trip.filter((g, k) => k > 0 && (Date.parse(g.date) - Date.parse(trip[k - 1]!.date)) / 864e5 === 1).length;
  await expect(stats).toContainText(`${b2b} back-to-back${b2b === 1 ? '' : 's'}`);
});

test('hover a row: its trip on the map, its stop lit, the game and arena shown; a home game keeps the current trip', async ({ page }) => {
  await open(page, 'BOS');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const trips = await feedTrips(page, 'BOS');
  const list = page.getByTestId('team-list');
  for (const k of [1, 6, trips.length - 1]) {
    const g = trips[k]!.at(-1)!;
    await showMonth(page, g.date.slice(0, 7)); // round 9: the Team List shows one month
    const row = list.locator(`.ck-card[data-game-id="${g.id}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.locator('.ck-time').hover();
    await expect(map(page)).toHaveAttribute('data-trip', String(k));
    await expect(map(page).locator('.ck-map-hot')).toHaveAttribute('data-arena', g.arena);
    await expect(page.getByTestId('map-info')).toContainText(`Game ${trips[k]!.length}:`);
    await expect(page.getByTestId('map-info')).toContainText(g.arena);
    await expect(page.getByTestId('trip-stats')).toContainText(`Road trip ${k + 1} of ${trips.length} ·`);
  }
  // a home game: no trip of its own; the map goes back to the current trip
  const current = trips.findIndex((t) => t.some((x) => x.end > NOW.getTime()));
  const homeRow = list.locator('.ck-card[data-game-id]').filter({ hasText: ' vs ' }).first();
  await homeRow.scrollIntoViewIfNeeded();
  await homeRow.locator('.ck-time').hover();
  await expect(map(page)).toHaveAttribute('data-trip', String(current));
  await expect(page.getByTestId('trip-stats')).toContainText('(current)');
});

test('hover a stop: its row lit and scrolled into view; rows never move', async ({ page }) => {
  await open(page, 'BOS');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const list = page.getByTestId('team-list');
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight)); // the trip's rows off screen
  const boxes = () => list.locator('.ck-card').evaluateAll((els) => els.map((e) => { const h = e as HTMLElement; return [h.offsetTop, h.offsetHeight, h.offsetWidth].join(','); }));
  const before = await boxes();
  const stops = await map(page).locator('[data-stop]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mapGame!));
  for (const id of stops) {
    await map(page).locator(`[data-map-game="${id}"] .ck-map-pin`).hover({ force: true });
    const row = list.locator(`.ck-card[data-game-id="${id}"]`);
    await expect(row).toHaveClass(/ck-map-hot/);
    const [r, l] = [await row.boundingBox(), await list.boundingBox()];
    expect(r!.y).toBeGreaterThanOrEqual(l!.y - 1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(l!.y + l!.height + 1);
  }
  expect(await boxes()).toEqual(before);
});

test('every team: the current trip drawn, one stop per arena, every label inside the map; no console errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const teams = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
  for (const tri of teams) {
    await open(page, tri);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    const r = await map(page).evaluate((m) => {
      const box = m.querySelector('.ck-map-box')!.getBoundingClientRect();
      const labels = [...m.querySelectorAll('.ck-map-code')].map((l) => l.getBoundingClientRect());
      return { out: labels.filter((l) => l.left < box.left - 1 || l.right > box.right + 1 || l.top < box.top - 1 || l.bottom > box.bottom + 1).length, stops: m.querySelectorAll('[data-stop]').length, arenas: new Set([...m.querySelectorAll<HTMLElement>('[data-stop]')].map((e) => e.dataset.arena)).size };
    });
    expect(r.out, `${tri}: labels outside the map`).toBe(0);
    expect(r.stops, tri).toBeGreaterThan(0);
    expect(r.arenas, tri).toBe(r.stops);
  }
  expect(errors).toEqual([]);
});

test('every trip of six teams across the map (hovering one row per trip): every label inside the map', async ({ page }) => {
  test.setTimeout(180_000);
  for (const tri of ['BOS', 'MIA', 'POR', 'LAL', 'NYK', 'TOR']) {
    await open(page, tri);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    const trips = await feedTrips(page, tri);
    const list = page.getByTestId('team-list');
    for (let k = 0; k < trips.length; k++) {
      await showMonth(page, trips[k]![0]!.date.slice(0, 7)); // round 9: the Team List shows one month
      const row = list.locator(`.ck-card[data-game-id="${trips[k]![0]!.id}"]`);
      await row.scrollIntoViewIfNeeded();
      await row.locator('.ck-time').hover();
      await expect(map(page)).toHaveAttribute('data-trip', String(k));
      const out = await map(page).evaluate((m) => {
        const box = m.querySelector('.ck-map-box')!.getBoundingClientRect();
        return [...m.querySelectorAll('.ck-map-code')].filter((l) => { const r = l.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1; }).map((l) => l.textContent);
      });
      expect(out, `${tri} trip ${k + 1}`).toEqual([]);
    }
  }
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
