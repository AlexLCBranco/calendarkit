// Round 21 (item 7): the top bar's scope picker replaces the League | Team tabs. Helpers for tests that switched scope.
import { fireEvent, screen, within } from '@testing-library/react';

/** The scope picker's team (undefined = All teams, the league views). */
export const scopeTeam = () => {
  const btn = screen.getByTestId('bar-local').querySelector<HTMLElement>('[data-testid="team-picker"]');
  const id = btn?.getAttribute('data-team-id');
  return id ? Number(id) : undefined;
};

/** Picks a team ("Miami Heat") or "All teams" in the scope picker. */
export function pickScope(name: string) {
  const bar = screen.getByTestId('bar-local');
  fireEvent.click(within(bar).getByTestId('team-picker'));
  fireEvent.click(screen.getByRole('option', { name }));
}

/** Back to All teams with the "×". */
export const clearScope = () => fireEvent.click(screen.getByTestId('scope-clear'));

/** A top-bar destination: Schedule, Cup or Standings. */
export const goTo = (name: 'Schedule' | 'Cup' | 'Standings') => fireEvent.click(within(screen.getByRole('tablist', { name: 'Destination' })).getByRole('tab', { name }));
