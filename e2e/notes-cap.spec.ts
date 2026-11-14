// The Slate note box's height cap with real scrollbars (Playwright's headless Chrome hides them by default, so this
// file launches its own browser without that): the box grows line by line up to 5 lines, then scrolls inside with its
// own vertical scrollbar. The rest of the notes' behaviour: notes.spec.ts.

import { expect, test, type Page } from './fixtures';
import { setNotes } from './nav';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only: the Slate'));

async function openSlate(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00Z'));
  await page.goto('/calendar/?view=league&layout=slate&date=2026-11-15');
  await expect(page.getByTestId('slate')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await setNotes(page, true);
}
const card = (page: Page, i: number) => page.locator('[data-testid="slate"] .ck-slate-card').nth(i);

test('a long note: the box stops at 5 lines and gets its own scrollbar; short notes grow line by line; the font stays', async ({ page }) => {
  await openSlate(page);
  const c = card(page, 0);
  const t = c.getByTestId('note-text');
  const measure = () =>
    c.evaluate((e) => {
      const t = e.querySelector<HTMLTextAreaElement>('.ck-gnote-text')!;
      const cs = getComputedStyle(t);
      return { card: e.getBoundingClientRect().height, box: t.getBoundingClientRect().height, line: parseFloat(cs.lineHeight), font: cs.fontSize, overflowY: cs.overflowY, inner: t.scrollHeight - t.clientHeight, bar: t.offsetWidth - t.clientWidth };
    });
  const empty = await measure();
  await t.fill('one\ntwo\nthree');
  const three = await measure();
  expect(Math.abs(three.box - empty.box - 2 * empty.line)).toBeLessThan(1.5);
  expect(three.inner).toBeLessThanOrEqual(0);
  await t.fill('one\ntwo\nthree\nfour\nfive');
  const five = await measure();
  expect(Math.abs(five.box - empty.box - 4 * empty.line)).toBeLessThan(1.5);
  expect(five.inner).toBeLessThanOrEqual(0);
  expect(five.bar).toBe(0); // 5 lines: no scrollbar yet
  await t.fill(Array.from({ length: 14 }, (_, i) => `Line ${i + 1}: something to say about this game.`).join('\n') + '\n' + 'A long paragraph. '.repeat(60));
  const long = await measure();
  expect(Math.abs(long.box - five.box)).toBeLessThan(1); // capped at 5 lines
  expect(long.font).toBe(empty.font);
  expect(long.overflowY).toBe('auto');
  expect(long.inner).toBeGreaterThan(10 * long.line); // the rest is inside, scrolled to
  expect(long.bar).toBeGreaterThan(0); // its own vertical scrollbar
  expect((await t.inputValue()).split('\n')[13]).toBe('Line 14: something to say about this game.');
  // the neighbour in its row (two columns) stays in line
  if ((await page.locator('.ck-slate-grid').getAttribute('data-cols')) === '2') expect(Math.abs((await card(page, 1).boundingBox())!.height - long.card)).toBeLessThan(1);
});
