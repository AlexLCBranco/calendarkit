// CK-21: live scores. With a mocked ESPN answer (through /calendar/api/odds), a game being played shows its score so
// far and a red LIVE label in the League List, the Team Calendar and the Slate, then turns into the final score without
// a reload. The page's clock is faked so the minute refresh can be stepped.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

type RawGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; gameStatus: number; awayTeam: { teamId: number; teamTricode: string }; homeTeam: { teamId: number; teamTricode: string } };
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
const DATE = '2026-11-25';
const g = raw.leagueSchedule.gameDates.flatMap((d) => d.games).find((x) => x.gameDateEst.startsWith(DATE) && x.gameStatus === 1 && /^002/.test(x.gameId))!;
const KEY = `${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode}`;
const TIP = Date.parse(g.gameDateTimeUTC);

const live = { date: DATE, games: {}, live: true, inPlay: { [KEY]: { away: 58, home: 61, period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' } } };
const done = { date: DATE, games: {}, live: false, finals: { [KEY]: { away: 101, home: 99, statusText: 'Final/OT' } } };

async function open(page: Page, url: string, first: object = live) {
  let answer: object = first;
  const dates: (string | null)[] = [];
  await page.route('**/api/odds**', (r) => (dates.push(new URL(r.request().url()).searchParams.get('date')), r.fulfill({ json: answer })));
  await page.clock.install({ time: TIP + 60 * 60_000 });
  await page.goto(url);
  return { finish: () => void (answer = done), asked: () => dates.length, dates: () => dates };
}

const RED = 'rgb(224, 40, 46)';

test('League List: the score so far and a red LIVE Q3 4:12, then the final with OT, no reload', async ({ page }) => {
  const m = await open(page, `${APP}?view=league&layout=list&date=${DATE}`);
  const row = page.locator(`.ck-card[data-game-id="${g.gameId}"]`);
  await expect(row.getByTestId('live')).toHaveText('LIVE Q3 4:12');
  await expect(row.locator('.ck-score')).toHaveText(['58', '61']);
  expect(await row.locator('.ck-live-tag').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(RED);
  // only the games in play or near tip-off are asked about: one date
  expect(new Set(m.dates())).toEqual(new Set([DATE]));
  m.finish();
  await page.clock.runFor(61_000);
  await expect(row.getByTestId('live')).toHaveCount(0);
  await expect(row.locator('.ck-score')).toHaveText(['101', '99']);
  await expect(row.locator('.ck-ot')).toHaveText('OT');
  // over: nothing more is asked
  const n = m.asked();
  await page.clock.runFor(5 * 61_000);
  expect(m.asked()).toBe(n);
});

test('Team Calendar: LIVE and the score in the cell', async ({ page }) => {
  await open(page, `${APP}?view=team&layout=calendar&team=${g.awayTeam.teamTricode}&date=${DATE}`);
  const cell = page.locator(`.ck-day-cell .ck-card[data-game-id="${g.gameId}"]`);
  await expect(cell.getByTestId('live')).toContainText('LIVE');
  await expect(cell).toContainText('58');
  await expect(cell).toContainText('61');
  expect(await cell.locator('.ck-live-tag').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(RED);
});

test('Slate: LIVE Q3 4:12 in the status, the scores by the names; then Final OT', async ({ page }) => {
  const m = await open(page, `${APP}?view=league&layout=slate&date=${DATE}`);
  const card = page.locator(`.ck-slate-card[data-game-id="${g.gameId}"]`);
  await expect(card.getByTestId('slate-status')).toHaveText('LIVE Q3 4:12');
  await expect(card.locator('.ck-slate-score')).toHaveText(['58', '61']);
  m.finish();
  await page.clock.runFor(61_000);
  await expect(card.getByTestId('slate-status')).toHaveText('Final OT');
  await expect(card.locator('.ck-slate-score')).toHaveText(['101', '99']);
});

test('Slate: the live status stays clear of the game button beside it, the widest one too ("2OT 10:59")', async ({ page }) => {
  const widest = { ...live, inPlay: { [KEY]: { ...live.inPlay[KEY]!, period: 6, clock: '10:59' } } };
  await open(page, `${APP}?view=league&layout=slate&date=${DATE}`, widest);
  const card = page.locator(`.ck-slate-card[data-game-id="${g.gameId}"]`);
  await expect(card.getByTestId('slate-status')).toHaveText('LIVE 2OT');
  await expect(card.getByTestId('live')).toHaveAttribute('data-tip', 'Live: 2OT 10:59');
  const label = await card.locator('[data-testid="live"]').boundingBox();
  const menu = await card.locator('.ck-slate-at').first().boundingBox();
  expect(label!.x + label!.width).toBeLessThanOrEqual(menu!.x + 1);
  // and the card keeps the night's card height
  const heights = await page.locator('[data-testid="slate"] .ck-slate-card').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().height)));
  expect(new Set(heights).size, String(heights)).toBe(1);
});
