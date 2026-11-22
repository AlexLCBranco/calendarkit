// CK-9: the divider lines between Slate cards are clearly visible and never run under the TV pill.
// CK-12: a finished game's score sits right after the team's name; the card keeps its width.

import { expect, test, type Page } from './fixtures';
import { SLATE_CARD_WIDTH } from '../src/slate/layout';
import { APP } from './app';
import { copySlate } from './slatecopy';

const NOW = new Date('2026-11-17T15:00:00Z');
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'one desktop size'));

const lum = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((n) => Number(n) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const open = async (page: Page, date: string) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(`?view=league&layout=slate&date=${date}`);
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
};

test('CK-9: the line between two cards has visible contrast against the cards', async ({ page }) => {
  await open(page, '2026-11-16');
  const c = await page.locator('.ck-slate-card').first().evaluate((e) => {
    const s = getComputedStyle(e);
    return { line: s.borderRightColor, card: s.backgroundColor, w: s.borderRightWidth };
  });
  expect(c.w).toBe('1px');
  const [a, b] = [lum(c.line), lum(c.card)].sort((x, y) => y - x);
  expect((a! + 0.05) / (b! + 0.05)).toBeGreaterThanOrEqual(2.2);
});

for (const notes of [false, true])
  test(`CK-9: the TV pill's box overlaps no divider line or TV outline (notes ${notes ? 'shown' : 'hidden'}), a week of nights`, async ({ page }) => {
    for (const date of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) {
      await open(page, date);
      if (notes) await page.getByTestId('notes-hide').click();
      const bad = await page.locator('.ck-slate-tv-pill').evaluateAll((ps) =>
        ps.flatMap((p) => {
          const c = p.closest('.ck-slate-card')!.getBoundingClientRect();
          const q = p.getBoundingClientRect();
          // inside the card, clear of its 1 px border and the TV card's 2 px inset outline
          return q.left >= c.left + 3 && q.right <= c.right - 3 && q.top >= c.top + 3 && q.bottom <= c.bottom - 3 ? [] : [[c.top, c.bottom, q.top, q.bottom]];
        }),
      );
      expect(bad, date).toEqual([]);
    }
  });

test('CK-12: a final score starts right after the name; cards keep their width', async ({ page }) => {
  await open(page, '2026-11-16');
  const r = await page.locator('.ck-slate-card.ck-slate-final .ck-slate-row').evaluateAll((rows) =>
    rows.map((row) => {
      const n = row.querySelector('.ck-slate-name')!.getBoundingClientRect();
      const s = row.querySelector('.ck-slate-score')!.getBoundingClientRect();
      return { gap: s.left - n.right, score: row.querySelector('.ck-slate-score')!.textContent };
    }),
  );
  expect(r.length).toBeGreaterThan(4);
  for (const x of r) {
    expect(x.score).toMatch(/^\d+$/);
    expect(x.gap).toBeGreaterThanOrEqual(0);
    expect(x.gap).toBeLessThanOrEqual(6);
  }
  const widths = await page.locator('.ck-slate-card').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().width)));
  for (const w of widths) expect(w).toBe(SLATE_CARD_WIDTH);
});

test('CK-10: the header line tops the Slate on /calendar and in the gauntlet-style widget page', async ({ page }) => {
  await open(page, '2026-11-16');
  await expect(page.locator('[data-testid="slate"] [data-testid="slate-header-label"]')).toHaveText('SLATE · 16-11 · NBA');
  const top = await page.evaluate(() => {
    const h = document.querySelector('[data-testid="slate-header"]')!.getBoundingClientRect();
    const c = document.querySelector('.ck-slate-card')!.getBoundingClientRect();
    return h.bottom <= c.top + 1;
  });
  expect(top).toBe(true);
  await page.goto(`${APP}slate.html?date=2026-11-16&notes=0`);
  await expect(page.getByTestId('slate-header-label')).toHaveText('SLATE · 16-11 · NBA');
});

test('CK-14: the first tip-off countdown is on the Slate page, never in the copied image', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/odds**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.clock.setFixedTime(new Date('2026-11-17T21:46:00Z'));
  await page.goto('?view=league&layout=slate&date=2026-11-17');
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  await expect(page.getByTestId('first-tip')).toHaveText(/^First tip-off in (\d+h )?\d+m$/);
  await expect(page.locator('[data-testid="slate"] [data-testid="first-tip"]')).toHaveCount(0);
  const r = await copySlate(page, 'copy-view', 'slate-first-tip');
  expect(r.stage.firstTip).toBe(false);
  expect(r.stage.cards.length).toBeGreaterThan(0);
});

test('CK-14: no countdown once the night has started', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-18T03:00:00Z'));
  await page.goto('?view=league&layout=slate&date=2026-11-17');
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  await expect(page.getByTestId('first-tip')).toHaveCount(0);
});

test('CK-15: the game button opens the pop-up with the 4 links; cards keep their size', async ({ page }) => {
  await open(page, '2026-11-16');
  const sizes = () => page.locator('.ck-slate-card').evaluateAll((cs) => cs.map((c) => [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)]));
  const withButton = await sizes();
  for (const [w] of withButton) expect(w).toBe(SLATE_CARD_WIDTH);
  const card = page.locator('.ck-slate-card').first();
  await card.getByTestId('game-menu').click();
  const pop = page.getByTestId('game-links-popup');
  await expect(pop).toBeVisible();
  await expect(pop.locator('a')).toHaveCount(4);
  await expect(pop.locator('a').nth(0)).toHaveText(/Player props/);
  await expect(pop.locator('a').nth(0)).toHaveAttribute('href', /^https:\/\/sportsbook\.fanduel\.com\//);
  await expect(pop.locator('a').nth(1)).toHaveAttribute('href', /^https:\/\/www\.espn\.com\/nba\/team\/injuries\/_\/name\//);
  await expect(pop.locator('a').nth(3)).toHaveAttribute('href', /^https:\/\/official\.nba\.com\/nba-injury-report/);
  // the button takes no room: without it the cards are the same size
  await page.evaluate(() => document.querySelectorAll('[data-testid="game-menu"]').forEach((b) => b.remove()));
  expect(await sizes()).toEqual(withButton);
});
