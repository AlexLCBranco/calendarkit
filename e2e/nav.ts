// The top bar's scope picker and destinations (League | Team tabs are gone).
import type { Page } from '@playwright/test';

/** Picks a team ("Miami Heat") or "All teams" in the Schedule's scope picker. */
export async function pickScope(page: Page, name: string) {
  await page.getByTestId('bar-local').getByTestId('team-picker').click();
  await page.getByRole('option', { name, exact: true }).click();
}

/** Back to All teams with the scope picker's ×. */
export const clearScope = (page: Page) => page.getByTestId('scope-clear').click();

/** A destination tab: Schedule, Cup or Standings. */
export const destination = (page: Page, name: 'Schedule' | 'Cup' | 'Standings') => page.getByRole('tablist', { name: 'Destination' }).getByRole('tab', { name, exact: true });

/** The scope picker's team tricode, or null for All teams. */
export const scopeTeamId = (page: Page) => page.getByTestId('bar-local').getByTestId('team-picker').getAttribute('data-team-id');

const SHORT: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun', January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun', July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec' };
/** The date title as the bar shows it — "Sunday, November 15, 2026", or under 1560 px "Sun, Nov 15, 2026". */
export const titleFor = (page: Page, long: string) => (page.viewportSize()!.width < 1560 ? long.replace(/[A-Z][a-z]+/g, (w) => SHORT[w] ?? w) : long);

/** Sets one of the Schedule's options ("TV games only", "Show rest days") in the Options popover, then closes it. */
export async function setOption(page: Page, label: 'TV games only' | 'Show rest days', on: boolean) {
  await page.getByTestId('options-button').click();
  const box = page.getByTestId('options-button-pop').getByLabel(label);
  if (on) await box.check();
  else await box.uncheck();
  await page.keyboard.press('Escape');
}

/**
 * The Slate's notes shown or hidden, whatever the build opens with ("Hide all notes" is on at every load since v1.62.0;
 * the reference builds open with notes shown).
 */
export async function setNotes(page: Page, shown: boolean) {
  const btn = page.getByTestId('notes-hide');
  if (((await btn.getAttribute('aria-pressed')) === 'true') === shown) await btn.click();
  await btn.page().waitForFunction((want) => document.querySelector('[data-testid="notes-hide"]')?.getAttribute('aria-pressed') === String(!want), shown);
}
