// The header's team box and "All teams" button (What) and its Where tabs: helpers for tests that switch team or place.
import { fireEvent, screen, within } from '@testing-library/react';

/** The team in the team box (undefined = All teams, the league views, or no team picked). */
export const scopeTeam = () => {
  const id = screen.getByTestId('team-picker').getAttribute('data-team-id');
  return id ? Number(id) : undefined;
};

/** Back to All teams. */
export const clearScope = () => fireEvent.click(screen.getByTestId('all-teams'));

/** Picks a team ("Miami Heat") in the team box's list, or "All teams" (its button). */
export function pickScope(name: string) {
  if (name === 'All teams') return clearScope();
  fireEvent.click(screen.getByTestId('team-picker'));
  fireEvent.click(within(screen.getByTestId('team-picker-list')).getByRole('option', { name }));
}

/** A Where tab: Schedule, Cup or Standings. */
export const goTo = (name: 'Schedule' | 'Cup' | 'Standings') => fireEvent.click(within(screen.getByTestId('where-tabs')).getByRole('button', { name }));
