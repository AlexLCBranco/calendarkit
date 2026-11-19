// Back-to-back meetings (the same opponent in consecutive games) mark the season-series chip by its look only:
// the marked chip is drawn differently from an unmarked one, and taking the mark away changes no card's or chip's box.
// Nov 4: CLE @ OKC follows OKC @ CLE (Nov 2) for both teams in the served snapshot.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'one desktop size'));

const boxes = (page: Page, cards: string) =>
  page.locator(cards).evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      const c = e.querySelector('[data-testid="series-chip"]')?.getBoundingClientRect();
      return [r.width, r.height, c?.width ?? 0, c?.height ?? 0].map((n) => Math.round(n * 10) / 10);
    }),
  );

for (const v of [
  { name: 'Slate', url: '?view=league&layout=slate&date=2026-11-04', cards: '.ck-slate-card' },
  { name: 'League List', url: '?view=league&layout=list&date=2026-11-04', cards: '[data-testid="league-list"] article' },
]) {
  test(`${v.name}: the CLE @ OKC chip is marked, looks different, and the mark changes no size`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.goto(v.url);
    const marked = page.locator(`${v.cards} [data-testid="series-chip"].ck-series-rematch`);
    await expect(marked.first()).toBeVisible();
    const card = page.locator(v.cards).filter({ has: page.locator('.ck-series-rematch') }).filter({ hasText: /Cavaliers|CLE/ });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.ck-series-rematch')).toHaveAttribute('data-rematch', 'CLE OKC');
    const plain = page.locator(`${v.cards} [data-testid="series-chip"]:not(.ck-series-rematch)`).first();
    const bg = (l: typeof plain) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg(marked.first())).not.toBe(await bg(plain));
    const before = await boxes(page, v.cards);
    await page.evaluate(() => document.querySelectorAll('.ck-series-rematch').forEach((e) => e.classList.remove('ck-series-rematch')));
    expect(await boxes(page, v.cards)).toEqual(before);
  });
}

test('the popup of a marked chip names the team', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('?view=league&layout=slate&date=2026-11-04');
  await page.locator('.ck-slate-card').filter({ hasText: 'Cavaliers' }).locator('.ck-series-rematch').hover();
  await expect(page.getByTestId('rematch-line')).toHaveText(['CLE: back-to-back meeting, also played Mon, Nov 2', 'OKC: back-to-back meeting, also played Mon, Nov 2']);
});
