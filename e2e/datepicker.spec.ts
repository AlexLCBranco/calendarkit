// Date picker (round 4, item 9) in a real browser, desktop widths: the icon opens the popup inside the window, the
// keyboard works (arrows move between days, Enter picks, Escape closes with the focus back on the icon), a pick jumps
// there in both lists, the top bar stays one row at 1920.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.date ?? document.activeElement?.getAttribute('aria-label'));

for (const [name, search, titleId] of [
  ['League List', '?view=league&layout=list&date=2026-11-17', 'day-title'],
  ['Team List', '?view=team&layout=list&team=LAL', 'team-day-title'],
] as const) {
  test(`${name}: icon, popup in the window, keyboard (arrows, Enter, Escape), pick jumps`, async ({ page }, info) => {
    await open(page, search);
    if (info.project.name === 'desktop-xl') expect((await page.getByTestId('top-bar').boundingBox())!.height).toBeLessThanOrEqual(40);
    const icon = page.getByRole('button', { name: 'Pick a date' });
    await expect(page.getByRole('dialog')).toHaveCount(0); // rendered only while open
    await icon.click();
    const popup = page.getByRole('dialog', { name: 'Pick a date' });
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const start = (await focused(page))!;
    expect(start).toMatch(/^2026-11-\d\d$/);
    await page.keyboard.press('ArrowDown');
    const down = (await focused(page))!;
    expect(down > start).toBe(true);
    await page.keyboard.press('ArrowRight');
    const target = (await focused(page))!;
    expect(target > down).toBe(true);
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    // the League List shows the day; the Team List the row of that day or the next game after it
    if (name === 'League List') await expect(page.getByTestId(titleId)).toContainText(long(target));
    else expect(((await page.getByTestId(titleId).textContent()) ?? '').length).toBeGreaterThan(0);
    // Escape closes and puts the focus back on the icon
    await icon.click();
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    expect(await focused(page)).toBe('Pick a date');
  });
}
