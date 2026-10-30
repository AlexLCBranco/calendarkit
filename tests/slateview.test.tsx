// @vitest-environment jsdom
// League → Slate (round 7): desktop only, its own layout next to List | Calendar; the day changes with ← / → only; Team
// views show their List while the layout is Slate; the URL carries layout=slate.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { readUrlState } from '../src/App';
import { data, feed } from './feed';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const DESKTOP = { width: 1280, height: 900 };
const open = (size = DESKTOP, initial = {}) => render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout: 'slate', ...initial }} />);
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card')].map((c) => c.dataset.gameId);
const dayGames = (d: string) => feed.games.filter((g) => g.dateEt === d && /^00[2456]/.test(g.gameId)).map((g) => g.gameId).sort();

describe('Slate view', () => {
  it('desktop only: the Layout control offers Slate from 960 px, not on tablets or phones (they show the List)', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Slate' }).getAttribute('aria-selected')).toBe('true');
    expect(cards().sort()).toEqual(dayGames('2026-11-15'));
    cleanup();
    for (const size of [{ width: 736, height: 900 }, { width: 390, height: 800 }]) {
      open(size);
      expect(screen.queryByRole('tab', { name: 'Slate' })).toBeNull();
      expect(document.querySelector('[data-testid="slate"]')).toBeNull();
      expect(document.querySelector('[data-testid="league-list"]')).toBeTruthy();
      cleanup();
    }
  });

  it('← / → change the day (keyboard and top bar), skipping days without games; Today comes back', () => {
    open();
    const title = () => screen.getByTestId('day-title').textContent;
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(title()).toBe('Monday, November 16, 2026');
    expect(cards().sort()).toEqual(dayGames('2026-11-16'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(title()).toBe('Saturday, November 14, 2026');
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(title()).toBe('Sunday, November 15, 2026');
    // modifiers and fields keep their own arrow keys
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('TV games only'), { key: 'ArrowRight' });
    expect(title()).toBe('Sunday, November 15, 2026');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(title()).toBe('Sunday, November 15, 2026');
  });

  it('no week toggle, no countdown; Team shows its List and League comes back to the Slate', () => {
    open();
    expect(screen.queryByRole('tab', { name: '2 weeks' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.queryByRole('tab', { name: 'Slate' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'List' }).getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-testid="team-list"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'League' }));
    expect(document.querySelector('[data-testid="slate"]')).toBeTruthy();
  });

  it('the URL\'s layout=slate opens it', () => {
    expect(readUrlState('?view=league&layout=slate').layout).toBe('slate');
  });
});
