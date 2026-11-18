// The Slate note box's fixed height with real scrollbars (Playwright's headless Chrome hides them by default, so this
// file launches its own browser without that): every box is exactly 3 lines tall, empty or not (gauntlet GT-11), so
// every card of a Slate is the same height; a longer note scrolls inside with its own vertical scrollbar and is saved
// whole. The rest of the notes' behaviour: notes.spec.ts.

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

test('every note box is 3 lines, empty or not: a short and a long note give the same card height; a long note scrolls inside and is saved whole', async ({ page }) => {
  await openSlate(page);
  const c = card(page, 0);
  const t = c.getByTestId('note-text');
  const measure = () =>
    c.evaluate((e) => {
      const t = e.querySelector<HTMLTextAreaElement>('.ck-gnote-text')!;
      const cs = getComputedStyle(t);
      return { card: e.getBoundingClientRect().height, box: t.getBoundingClientRect().height, line: parseFloat(cs.lineHeight), pad: parseFloat(cs.paddingTop), font: cs.fontSize, overflowY: cs.overflowY, inner: t.scrollHeight - t.clientHeight, bar: t.offsetWidth - t.clientWidth };
    });
  const empty = await measure();
  // 3 lines and its padding
  expect(Math.abs(empty.box - (3 * empty.line + 2 * empty.pad))).toBeLessThan(1.5);
  await t.fill('one line');
  const short = await measure();
  await t.fill('one\ntwo\nthree');
  const three = await measure();
  expect(three.inner).toBeLessThanOrEqual(0);
  expect(three.bar).toBe(0); // 3 lines: no scrollbar yet
  const text = Array.from({ length: 14 }, (_, i) => `Line ${i + 1}: something to say about this game.`).join('\n') + '\n' + 'A long paragraph. '.repeat(60);
  await t.fill(text);
  const long = await measure();
  for (const m of [short, three, long]) {
    expect(Math.abs(m.box - empty.box)).toBeLessThan(1);
    expect(Math.abs(m.card - empty.card)).toBeLessThan(1);
  }
  expect(long.font).toBe(empty.font);
  expect(long.overflowY).toBe('auto');
  expect(long.inner).toBeGreaterThan(10 * long.line); // the rest is inside
  expect(long.bar).toBeGreaterThan(0); // its own vertical scrollbar
  // it scrolls inside the box
  await t.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await t.evaluate((el) => el.scrollTop)).toBeGreaterThan(5 * long.line);
  // saved whole once the field is left
  await t.blur();
  const id = (await c.getAttribute('data-game-id'))!;
  await expect.poll(() => page.evaluate((id) => (JSON.parse(localStorage.getItem('ck:notes:v1') ?? '{}') as Record<string, { pre?: string }>)[id]?.pre, id)).toBe(text);
  // every card of the night is the same height (notes empty or long)
  const heights = await page.locator('[data-testid="slate"] .ck-slate-card').evaluateAll((cs) => cs.map((x) => Math.round(x.getBoundingClientRect().height)));
  expect(new Set(heights).size, heights.join(', ')).toBe(1);
});
