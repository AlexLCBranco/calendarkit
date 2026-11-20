// The page rows' team chips (What) and the header's Where tabs: helpers for tests that switch team or place.
import { fireEvent, screen, within } from '@testing-library/react';

/** The team chip picked in the What row (undefined = All teams, the league views, or no team picked). */
export const scopeTeam = () => {
  const on = screen.getByTestId('what-row').querySelector<HTMLElement>('[data-testid="team-chip"][aria-checked="true"]');
  const id = on?.getAttribute('data-team-id');
  return id ? Number(id) : undefined;
};

/** Picks a team ("Miami Heat") or "All teams" among the What row's chips. */
export function pickScope(name: string) {
  fireEvent.click(within(screen.getByTestId('what-row')).getByRole('radio', { name }));
}

/** Back to All teams. */
export const clearScope = () => fireEvent.click(screen.getByTestId('team-chip-all'));

/** A Where tab: Schedule, Cup or Standings. */
export const goTo = (name: 'Schedule' | 'Cup' | 'Standings') => fireEvent.click(within(screen.getByTestId('where-tabs')).getByRole('button', { name }));
