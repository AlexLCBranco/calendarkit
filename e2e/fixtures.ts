// The e2e `test` (round 6): Playwright's, with one addition. Since round 6 the app always opens on today and ignores a
// `date=` in the URL (B2: a bookmark must not pin a day). Most specs still open a given day by URL, so every page here
// gets an init script that reads `date=` from the URL it is loading and hands it to the app's test hook
// (`window.__ckOpenDate`, App.tsx) — as if the person had picked that day. The tests of the open-on-today rule itself
// (today.spec.ts "page load") use Playwright's plain `test`, so nothing helps them.

import { test as base } from '@playwright/test';

export { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const date = new URLSearchParams(location.search).get('date');
      if (date) (window as unknown as { __ckOpenDate?: string }).__ckOpenDate = date;
    });
    await use(page);
  },
});
