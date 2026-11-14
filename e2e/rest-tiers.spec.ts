// Rest marks in a real browser: 2 days between games is marked (the quiet tier), 3+ keeps the strong mark, in the views
// that show the Fatigue component (League List, Team List, Slate). The 2-day badge is clearly fainter than the 3+ one;
// its tooltip gives the exact count. The rule itself (dates, edges): tests/restflag.test.tsx.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

/** Every rest badge on the page: its tier, days, side and how strong it looks. */
const badges = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ck-fx-rest:not(.ck-fx-rest-tick)')].map((b) => {
      const cs = getComputedStyle(b);
      const alpha = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        const p = m ? m[1]!.split(/[ ,/]+/).filter(Boolean) : [];
        return p.length > 3 ? Number(p[3]) : 1;
      };
      return { tier: b.dataset.tier, days: Number(b.dataset.days), side: b.dataset.break, text: b.textContent, border: alpha(cs.borderTopColor), color: alpha(cs.color), bg: alpha(cs.backgroundColor), tip: b.dataset.tip ?? '' };
    }),
  );

test('Team List: 2-day badges (quiet) beside the 3+ ones (strong); the tooltip gives the exact count', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=BOS');
  const all = await badges(page);
  const short = all.filter((b) => b.tier === 'short');
  const long = all.filter((b) => b.tier === 'long');
  expect(short.length).toBeGreaterThan(0);
  for (const b of short) {
    expect(b.days).toBe(2);
    expect(b.text).toBe('2d');
    expect(b.tip).toMatch(/^2 days off/m);
  }
  for (const b of long) expect(b.days).toBeGreaterThanOrEqual(3);
  // fainter: its outline and its text are see-through, the 3+ badge's are solid
  const s = short[0]!;
  expect(s.border).toBeLessThan(0.5);
  expect(s.color).toBeLessThan(0.9);
  if (long.length) {
    const l = long[0]!;
    expect([l.border, l.color]).toEqual([1, 1]);
  }
  // the hover pop-up says it in words
  await page.locator('.ck-fx-rest[data-tier="short"]').first().hover();
  await expect(page.getByTestId('tooltip')).toContainText(/2 days off/);
});

test('League List and Slate show the 2-day badge too', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-17');
  expect((await badges(page)).some((b) => b.tier === 'short')).toBe(true);
  await open(page, '?view=league&layout=slate&date=2026-11-17');
  await page.waitForFunction(() => !!document.querySelector('.ck-slate-card'));
  expect((await badges(page)).some((b) => b.tier === 'short')).toBe(true);
});
