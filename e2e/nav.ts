// The header's team box and "All teams" button (What) and its Where tabs.
import type { Page } from '@playwright/test';
import { FEED_TEAMS } from './feedTeams';

/** The team box (its text is the team's full name, or "Pick a team"). */
export const teamBox = (page: Page) => page.getByTestId('team-picker');

/** Back to All teams. */
export const clearScope = (page: Page) => page.getByTestId('all-teams').click();

/** Picks a team in the team box's list — by full name ("Miami Heat") or tricode ("MIA") — or "All teams" (its button). */
export async function pickScope(page: Page, name: string) {
  if (name === 'All teams') return clearScope(page);
  await teamBox(page).click();
  const list = page.getByTestId('team-picker-list');
  const id = Object.values(FEED_TEAMS).find((t) => t.tri === name)?.id;
  await (id ? list.locator(`[data-team-id="${id}"]`) : list.getByRole('option', { name, exact: true })).click();
}

/** A Where tab: Schedule, Cup or Standings. */
export const destination = (page: Page, name: 'Schedule' | 'Cup' | 'Standings') => page.getByTestId('where-tabs').getByRole('button', { name, exact: true });

/** The team in the team box (its team id), or null for All teams / no team. */
export const scopeTeamId = (page: Page) => teamBox(page).getAttribute('data-team-id', { timeout: 1000 }).catch(() => null);

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
