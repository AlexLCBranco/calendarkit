// The e2e `test`: Playwright's, with one addition. The app always opens on today and ignores a
// `date=` in the URL (B2: a bookmark must not pin a day). Most specs still open a given day by URL, so every page here
// gets an init script that reads `date=` from the URL it is loading and hands it to the app's test hook
// (`window.__ckOpenDate`, App.tsx) — as if the person had picked that day. The tests of the open-on-today rule itself
// (today.spec.ts "page load") use Playwright's plain `test`, so nothing helps them.
// The top bar hides while a list is wheel-scrolled down. Specs of other features scroll and then use the
// bar, or measure positions under it, so here it stays (`window.__ckNoAutoHide`, CalendarView); e2e/autohide.spec.ts
// tested the hiding itself; the top bar is in flux now (PROJECT.md, Test tiers), so nothing does.

import { test as base } from '@playwright/test';

export { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

/** Open-Meteo (the Slate's cold-weather flags) answers nothing here: real weather would change cards from run to run.
    A spec testing the flags routes it itself (its route wins). */
export const NO_WEATHER = 'https://api.open-meteo.com/**';

export const test = base.extend<{ autoHide: boolean }>({
  autoHide: [false, { option: true }],
  context: async ({ context }, use) => {
    await context.route(NO_WEATHER, (r) => r.fulfill({ status: 404, body: '' }));
    await use(context);
  },
  page: async ({ page, autoHide }, use) => {
    await page.addInitScript((autoHide) => {
      const date = new URLSearchParams(location.search).get('date');
      if (date) (window as unknown as { __ckOpenDate?: string }).__ckOpenDate = date;
      if (!autoHide) (window as unknown as { __ckNoAutoHide?: boolean }).__ckNoAutoHide = true;
    }, autoHide);
    await use(page);
  },
});
