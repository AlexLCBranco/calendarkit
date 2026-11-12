// Nov 3, 2026 (no NBA game) in the real browser — reached by the top bar's →, the arrow key, the day
// strip and the date picker, in the League List and the Slate; "No games on …" shown, nothing else; the week view shows
// it as an empty day; the season's first and last days stop the arrows. The served snapshot decides which days are
// game-less (read here from the raw feed).

import { expect, test, type Page } from './fixtures';
import { titleFor } from './nav';

const NOW = new Date('2026-11-15T15:00:00Z');
const NOV3 = '2026-11-03';
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop'));

const gameDays = (page: Page) =>
  page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return [...new Set((raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId)).map((g) => g.gameDateEst.slice(0, 10)))].sort();
  });
const title = (page: Page) => page.getByTestId('day-title');

for (const layout of ['list', 'slate'] as const) {
  test(`${layout}: Nov 3 by →, by the key, by the strip and by the picker — "No games on Tuesday, November 3"`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.goto(`?view=league&layout=${layout}&date=2026-11-02`);
    await expect(title(page)).toHaveText(titleFor(page, 'Monday, November 2, 2026'));
    expect(await gameDays(page)).not.toContain(NOV3);
    const empty = page.getByTestId('no-games');
    const check = async () => {
      await expect(title(page)).toHaveText(titleFor(page, 'Tuesday, November 3, 2026'));
      await expect(empty).toHaveText('No games on Tuesday, November 3');
      await expect(page.locator('[data-testid="league-list"] article, [data-testid="slate"] .ck-slate-card')).toHaveCount(0);
    };
    await page.getByRole('button', { name: 'Next day' }).click();
    await check();
    await page.keyboard.press('ArrowRight');
    await expect(title(page)).toHaveText(titleFor(page, 'Wednesday, November 4, 2026'));
    await page.keyboard.press('ArrowLeft');
    await check();
    await page.keyboard.press('ArrowLeft');
    await expect(title(page)).toHaveText(titleFor(page, 'Monday, November 2, 2026'));
    // the strip (League List only: the Slate has none)
    if (layout === 'list') {
      await page.locator(`.ck-week-strip [data-date="${NOV3}"], [data-testid="week-strip"] [data-date="${NOV3}"]`).first().click();
      await check();
    }
    // the date picker
    await page.goto(`?view=league&layout=${layout}&date=2026-11-02`);
    await page.getByTestId('date-pick').click();
    const cell = page.getByTestId('date-picker').locator(`[data-date="${NOV3}"]`);
    await expect(cell).toBeEnabled();
    await cell.click();
    await check();
  });
}

test('the season\'s edges: ← disabled on opening night, → on the last game day; every day between reachable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(NOW);
  await page.goto('?view=league&layout=list&date=2026-11-02');
  const days = await gameDays(page);
  await page.goto(`?view=league&layout=list&date=${days[0]}`);
  await expect(page.getByRole('button', { name: 'Previous day' })).toBeDisabled();
  // walk to the end in the page (one key per day): every calendar day once, game-less ones with "No games"
  const walked = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out: { title: string; empty: boolean; rows: number }[] = [];
    for (let prev = '', i = 0; i < 400; i++) {
      const t = document.querySelector('[data-testid="day-title"]')!.textContent!;
      if (t === prev) break;
      prev = t;
      out.push({ title: t, empty: !!document.querySelector('[data-testid="no-games"]'), rows: document.querySelectorAll('[data-testid="league-list"] article').length });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await frame();
    }
    return out;
  });
  const span = (Date.parse(days.at(-1)!) - Date.parse(days[0]!)) / 86_400_000 + 1;
  expect(walked).toHaveLength(span);
  expect(walked.filter((d) => d.empty)).toHaveLength(span - days.length);
  expect(walked.every((d) => d.empty === (d.rows === 0))).toBe(true);
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
});

test('week view: the week of Nov 1 shows Nov 3 as a visible, empty day', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('?view=league&layout=calendar&date=2026-11-02');
  const cell = page.locator(`.ck-month-cell[data-date="${NOV3}"]`);
  await expect(cell).toBeVisible();
  expect(await cell.locator('.ck-month-game').count()).toBe(0);
  const box = (await cell.boundingBox())!;
  expect(box.height).toBeGreaterThan(100);
});
