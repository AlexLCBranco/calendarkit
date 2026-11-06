// Round 21 (item 7): the top bar's scope picker and destinations (League | Team tabs are gone).
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
