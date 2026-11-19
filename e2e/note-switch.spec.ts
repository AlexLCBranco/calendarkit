// CK-11: the note's ⇄ switch is always there and never over the odds — in the copy layout shown live (the gauntlet's
// Slate widget: slate.html?copy=1, its 2 columns and card width), at rest and while a note is being typed in, and on the
// Slate itself.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once'));

/** Every card: the switch is visible, entirely right of the odds column, and above the note box. */
async function clearOfOdds(page: Page) {
  const cards = page.locator('.ck-slate-card');
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const sw = card.getByTestId('note-switch');
    await expect(sw).toBeVisible();
    const s = (await sw.boundingBox())!;
    const head = (await card.getByTestId('note-head').boundingBox())!;
    const note = (await card.getByTestId('note').boundingBox())!;
    for (const odds of await card.getByTestId('slate-odds').all()) {
      const o = (await odds.boundingBox())!;
      expect(head.x, `card ${i}: the label and ⇄ start right of the odds`).toBeGreaterThanOrEqual(o.x + o.width);
    }
    expect(s.y + s.height, `card ${i}: ⇄ above the note box`).toBeLessThanOrEqual(note.y);
  }
}

test('live copy: ⇄ on every card at rest and while typing, never over the odds; it switches the space', async ({ page }) => {
  await page.goto(`${APP}slate.html?date=2026-11-16&copy=1`);
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  await clearOfOdds(page);
  // typing in a note: still there, still clear
  await page.getByTestId('note').first().click();
  await expect(page.locator('textarea[data-testid="note-text"]')).toBeFocused();
  await clearOfOdds(page);
  // at rest, a press switches the space without opening the note
  await page.keyboard.press('Escape');
  const card = page.locator('.ck-slate-card').nth(1);
  const before = await card.getByTestId('note-slot').getAttribute('data-slot');
  await card.getByTestId('note-switch').click();
  await expect(card.getByTestId('note-slot')).not.toHaveAttribute('data-slot', before!);
  await expect(page.locator('textarea')).toHaveCount(0);
});

test('the Slate itself: ⇄ never over the odds', async ({ page }) => {
  await page.goto(`${APP}slate.html?date=2026-11-16`);
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  await clearOfOdds(page);
});
