// Countdown on today's games (round 4, item 11) in a real browser, desktop widths, Playwright's clock (Nov 15, 2026,
// 15:00 UTC = 12:00 in Sao Paulo): League List and Team List show "in 2h 35m" in place of the time for today's games not
// started, the row keeps its width and one line, the minute timer moves it (and only the countdown texts change), the
// time comes back after tip-off, and a copied image is taken with the plain time.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.install({ time: NOW });
  await page.goto(`/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

/** Every countdown on the page: its text, the plain time it hides, the row's game, and how wide its column is. */
const countdowns = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ck-countdown')].map((c) => {
      const time = c.closest('[data-testid="tipoff"]') as HTMLElement;
      const card = c.closest<HTMLElement>('.ck-card')!;
      const kids = [...card.children].filter((k) => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width > 0);
      return {
        id: card.dataset.gameId!,
        text: c.textContent!,
        plain: time.querySelector('.ck-time-plain')!.textContent!,
        fits: c.getBoundingClientRect().width <= time.getBoundingClientRect().width + 0.5,
        oneLine: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2))).size === 1,
      };
    }),
  );

for (const [name, search] of [
  ['League List', '?view=league&layout=list&date=2026-11-15'],
  ['Team List', '?view=team&layout=list&team=LAL'],
] as const) {
  test(`${name}: countdown in place of the time, fits, ticks on the minute, time back after tip-off`, async ({ page }) => {
    await open(page, search);
    const before = await countdowns(page);
    expect(before.length).toBeGreaterThan(0);
    for (const c of before) {
      expect(c.text).toMatch(/^in (\d+h( \d+m)?|\d+m)$/);
      expect(c.fits, c.id).toBe(true);
      expect(c.oneLine, c.id).toBe(true);
    }
    // the minute timer: one minute later every countdown is a minute shorter; rows untouched apart from those texts
    await page.evaluate(() => {
      const w = window as unknown as { __other: number };
      w.__other = 0;
      new MutationObserver((m) => (w.__other += m.filter((r) => !(r.target as Element).closest?.('.ck-countdown, [data-testid="tipoff"]') && !(r.target.parentElement?.closest('[data-testid="tipoff"]'))).length)).observe(document.querySelector('.ck-llist')!, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-game-id', 'aria-label'] });
    });
    await page.clock.runFor(60_000);
    const after = await countdowns(page);
    const mins = (t: string) => {
      const m = /^in (?:(\d+)h)? ?(?:(\d+)m)?$/.exec(t)!;
      return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
    };
    for (const a of after) {
      const b = before.find((x) => x.id === a.id)!;
      expect(mins(a.text), a.id).toBe(mins(b.text) - 1);
    }
    expect(await page.evaluate(() => (window as unknown as { __other: number }).__other)).toBe(0);
    // after tip-off of the first one: its time again
    const first = before.sort((a, b) => mins(a.text) - mins(b.text))[0]!;
    await page.clock.runFor((mins(first.text) - 1) * 60_000 + 1000);
    const row = page.locator(`.ck-card[data-game-id="${first.id}"] [data-testid="tipoff"]`);
    await expect(row.locator('.ck-countdown')).toHaveCount(0);
    await expect(row.locator('.ck-time-plain')).toBeVisible();
    await expect(row.locator('.ck-time-plain')).toHaveText(first.plain);
  });
}

test('a copy is taken with the plain time: the countdown is hidden while the image is made', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-15');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const day = page.locator('.ck-lday[data-day="2026-11-15"]');
  await expect(day.locator('.ck-countdown').first()).toBeVisible();
  // record what the copied element shows at the moment it is marked for capture
  await day.evaluate((el) => {
    const w = window as unknown as { __seen?: { countdown: string; plain: string } };
    new MutationObserver(() => {
      if (!el.classList.contains('ck-capturing') || w.__seen) return;
      w.__seen = { countdown: getComputedStyle(el.querySelector('.ck-countdown')!).display, plain: getComputedStyle(el.querySelector('.ck-countdown ~ .ck-time-plain')!).display };
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await day.hover();
  const button = day.locator('> [data-testid="copy-day"]');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __seen?: unknown }).__seen)).toEqual({ countdown: 'none', plain: 'inline' });
  // and on screen the countdown is back
  await expect(day.locator('.ck-countdown').first()).toBeVisible();
});
