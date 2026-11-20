// CK-23: the floating live scores window, from a mocked live answer (through /calendar/api/odds). Document
// Picture-in-Picture can't open a real window in a test browser, so requestWindow hands back a same-origin iframe's
// window: the app renders into it exactly as into the floating one. Real Chrome checks only what that can't: the
// window staying on top of other apps.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

type RawGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; gameStatus: number; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } };
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
const DATE = '2026-11-25';
const night = raw.leagueSchedule.gameDates.flatMap((d) => d.games).filter((x) => x.gameDateEst.startsWith(DATE) && /^00[2456]/.test(x.gameId)).sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC) || a.gameId.localeCompare(b.gameId));
const first = night[0]!;
const FIRST = Date.parse(first.gameDateTimeUTC);
const KEY = `${first.awayTeam.teamTricode}@${first.homeTeam.teamTricode}`;
const live = { date: DATE, games: {}, live: true, inPlay: { [KEY]: { away: 58, home: 61, period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' } } };

async function open(page: Page, at: number) {
  await page.route('**/api/odds**', (r) => r.fulfill({ json: live }));
  await page.addInitScript(() => {
    // Chrome has its own (a getter a plain assignment doesn't replace)
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow: async () => {
        const f = document.createElement('iframe');
        f.dataset.testid = 'pip';
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:320px;height:520px;border:0;z-index:999';
        // its own empty page, loaded before the app renders into it (else the load replaces what was rendered)
        const loaded = new Promise((r) => f.addEventListener('load', r, { once: true }));
        f.srcdoc = '<!doctype html><html><head></head><body></body></html>';
        document.body.append(f);
        await loaded;
        return f.contentWindow;
      },
    } });
  });
  await page.clock.install({ time: at });
  await page.goto(`${APP}?view=league&layout=slate&date=${DATE}`);
  await expect(page.getByTestId('slate')).toBeVisible();
}
const pipRows = (page: Page) =>
  page.frameLocator('[data-testid="pip"]').locator('[data-testid="popout-list"] li').evaluateAll((els) => els.map((e) => [e.getAttribute('data-game-id'), e.getAttribute('data-state'), (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()]));

test('during the night: every game of the Slate’s day in tip-off order, the live one with a red LIVE Q3 4:12 and its score', async ({ page }) => {
  await open(page, FIRST + 60 * 60_000);
  await page.getByTestId('live-popout').click();
  const frame = page.frameLocator('[data-testid="pip"]');
  await expect(frame.locator(`li[data-game-id="${first.gameId}"]`)).toHaveAttribute('data-state', 'live');
  const rows = await pipRows(page);
  expect(rows.map((r) => r[0])).toEqual(night.map((g) => g.gameId));
  expect(rows[0]![2]).toBe(`LIVE Q3 4:12 ${first.awayTeam.teamTricode} 58 @ 61 ${first.homeTeam.teamTricode}`);
  expect(await frame.locator('.ck-live-tag').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(224, 40, 46)');
  // the rest are still to come here (their tip-off time), or live / final as the answer says
  for (const r of rows.slice(1)) expect(r[1]).toMatch(/upcoming|live|final/);
  // a normal night fits without a scrollbar
  expect(await frame.locator('html').evaluate((h) => h.scrollHeight <= 520)).toBe(true);
  await expect(page.getByTestId('live-popout')).toHaveText('Close live scores window');
});

test('before the first game: a countdown to it in the window', async ({ page }) => {
  await open(page, FIRST - (60 * 60_000 + 30_000));
  await page.getByTestId('live-popout').click();
  const frame = page.frameLocator('[data-testid="pip"]');
  await expect(frame.getByTestId('popout-countdown')).toContainText(`First game · ${first.awayTeam.teamTricode} @ ${first.homeTeam.teamTricode}`);
  await expect(frame.getByTestId('popout-clock')).toHaveText('1:00:30');
  // at tip-off it turns into the list by itself
  await page.clock.runFor(61 * 60_000);
  await expect(frame.getByTestId('popout-countdown')).toHaveCount(0);
  await expect(frame.getByTestId('popout-list').locator('li')).toHaveCount(night.length);
});
