// Team List "Show rest days" (desktop widths): on at every load, never saved (round 7, 2.2), row order and dates against the served snapshot,
// rest rows about half a game row tall, nothing clipped, no sideways scroll, opens / Today at the next game.

import { expect, test, type Page } from './fixtures';
import { eachTeamMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');
const BOS = 1610612738;

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'desktop-xl', 'desktop widths only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await expect(page.getByTestId('team-list').locator('article').first()).toBeAttached();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

/** Expected rows from the served snapshot alone: game ids and "rest:<date>" for each gap day, in date order. */
async function expectedRows(page: Page, teamId: number) {
  return page.evaluate(async (teamId) => {
    type G = { gameId: string; gameDateEst: string; homeTeam: { teamId: number }; awayTeam: { teamId: number } };
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId))
      .map((g) => ({ key: g.gameId, date: g.gameDateEst.slice(0, 10) }));
    const dates = new Set(games.map((g) => g.date));
    const sorted = [...dates].sort();
    const rest: { key: string; date: string }[] = [];
    for (let t = Date.parse(`${sorted[0]}T00:00:00Z`); t <= Date.parse(`${sorted.at(-1)}T00:00:00Z`); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (!dates.has(d)) rest.push({ key: `rest:${d}`, date: d });
    }
    return [...games, ...rest].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)).map((x) => ({ ...x }));
  }, teamId);
}

const rowsOnPage = (page: Page) =>
  page.getByTestId('team-list').evaluate((el) => {
    const root = document.querySelector('.ck-root')!.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>('.ck-team-rows > *')].map((r) => {
      const b = r.getBoundingClientRect();
      return {
        key: r.dataset.rest ? `rest:${r.dataset.rest}` : r.dataset.gameId!,
        date: r.querySelector('.ck-date')!.textContent!,
        text: r.textContent,
        h: b.height,
        clipped: b.left < root.left - 0.5 || b.right > root.right + 0.5 || r.scrollWidth > r.clientWidth + 0.5,
        lines: new Set([...r.querySelectorAll('.ck-date, .ck-rest')].map((e) => Math.round(e.getBoundingClientRect().top))).size,
      };
    });
  });

const nextOffset = (page: Page) =>
  page.getByTestId('team-list').evaluate((el) => el.querySelector('[data-next]')!.getBoundingClientRect().top - el.getBoundingClientRect().top);

test('show rest days: on by default, order and dates vs snapshot, half-height rows, nothing clipped, next game', async ({ page }, info) => {
  await open(page, '?view=team&layout=list&team=BOS');
  const toggle = page.getByLabel('Show rest days');
  await expect(toggle).toBeChecked();
  await expect(page).not.toHaveURL(/rest=/);
  const expected = await expectedRows(page, BOS);
  // opened at the next game, at the top (with the rest rows above it in its month)
  expect(Math.abs(await nextOffset(page))).toBeLessThan(1.5);
  // round 9: the rows month by month
  const rows = (await eachTeamMonth(page, 'BOS', () => rowsOnPage(page))).flat();
  expect(rows.map((r) => r.key)).toEqual(expected.map((e) => e.key));
  const fmt = (d: string) => `${new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${d.slice(8)}/${d.slice(5, 7)}`;
  expect(rows.map((r) => r.date)).toEqual(expected.map((e) => fmt(e.date)));
  const rest = rows.filter((r) => r.key.startsWith('rest:'));
  const games = rows.filter((r) => !r.key.startsWith('rest:'));
  expect(rest.length).toBeGreaterThan(60);
  for (const r of rest) expect(r.text).toBe(`${r.date}Rest`);
  const gameH = Math.min(...games.map((g) => g.h));
  const restH = Math.max(...rest.map((r) => r.h));
  console.log(`[rest] ${info.project.name}: rest row ${restH} px, smallest game row ${gameH} px, ${rest.length} rest rows`);
  expect(restH).toBeLessThanOrEqual(gameH * 0.55);
  expect(restH).toBeGreaterThanOrEqual(14);
  expect(rest.filter((r) => r.lines !== 1)).toEqual([]);
  expect(rows.filter((r) => r.clipped).map((r) => r.key)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Today: back to the next game's month and row; then again after scrolling away
  await page.getByRole('button', { name: 'Today' }).click();
  await expect.poll(() => nextOffset(page).then(Math.abs)).toBeLessThan(1.5);
  await page.getByTestId('team-list').hover();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -500);
  await expect.poll(() => nextOffset(page)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect.poll(() => nextOffset(page).then(Math.abs)).toBeLessThan(1.5);
  // off: lasts until a reload, and nothing is stored (URL, localStorage, sessionStorage, cookies, IndexedDB)
  await page.getByLabel('Show rest days').uncheck();
  await expect(page.locator('.ck-rest-row')).toHaveCount(0);
  await expect(page).not.toHaveURL(/rest=/);
  const stored = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, idb: (await indexedDB.databases()).length }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: '', idb: 0 });
  await page.reload();
  await expect(page.getByTestId('team-list').locator('.ck-rest-row').first()).toBeAttached();
  await expect(page.getByLabel('Show rest days')).toBeChecked();
  expect(Math.abs(await nextOffset(page))).toBeLessThan(1.5);
  // an old link with rest=1 (or a made-up rest=0) changes nothing
  await open(page, '?view=team&layout=list&team=BOS&rest=0');
  await expect(page.getByLabel('Show rest days')).toBeChecked();
});
