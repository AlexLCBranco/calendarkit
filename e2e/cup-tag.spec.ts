// A Cup group game's tag outside the Cup section is just "NBA Cup" (League List, Slate); the Cup schedule keeps the
// group ("West A"). Fri Nov 6 is a Cup night in the snapshot.

import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

test('"NBA Cup" without the group in the League List and the Slate; the group in the Cup schedule', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T15:00:00Z'));
  await page.goto(`${APP}?view=league&layout=list&date=2026-11-06`);
  const listTags = page.locator('.ck-tag.ck-cup');
  await expect(listTags.first()).toBeVisible();
  for (const t of await listTags.allTextContents()) expect(t).toBe('NBA Cup');
  // the label is a link to the Cup page (CK-26): its name says both
  for (const t of await listTags.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) expect(t).toBe('NBA Cup. Open the NBA Cup page');

  await page.goto(`${APP}?view=league&layout=slate&date=2026-11-06`);
  const slateTags = page.locator('[data-testid="slate"] .ck-tag.ck-cup');
  await expect(slateTags.first()).toBeVisible();
  for (const t of await slateTags.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) expect(t).toBe('NBA Cup. Open the NBA Cup page');
  await expect(page.getByTestId('slate')).not.toContainText(/Group [ABC]|(West|East) [ABC]/);

  await page.goto(`${APP}?view=cup`);
  await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
  await page.getByRole('tablist', { name: 'Cup layout' }).getByRole('tab', { name: 'By date' }).click();
  await expect(page.getByTestId('cup-league')).toContainText(/(West|East) [ABC]/);
});
