// @vitest-environment jsdom
// v1.40.0: opening or closing the Team List's date picker no longer re-renders the whole Team List (TeamListView is
// memo'd; the picker's open state lives in CalendarView). Before, each open and each close redrew every row of the
// month (~140 ms / ~90 ms in jsdom, 85 % of a season walk in the tests), which is what pushed the month-walking unit
// tests past Vitest's 5 s under load. Counted through leagueFatigue, which TeamListView calls on every render.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/data/fatigue', async (orig) => {
  const m = await orig<typeof import('../src/data/fatigue')>();
  return { ...m, leagueFatigue: (...a: Parameters<typeof m.leagueFatigue>) => (calls.n++, m.leagueFatigue(...a)) };
});

const { CalendarView } = await import('../src/components/CalendarView');
const { data } = await import('./feed');
const { TEAM } = await import('./synthetic');
const { showTeamMonth } = await import('./teamMonths');

afterEach(cleanup);

describe('Team List date picker', () => {
  it('opening and closing it leaves the list alone; picking another month redraws it', () => {
    render(<CalendarView data={data} size={{ width: 1200, height: 800 }} now={Date.parse('2026-10-23T15:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    const pick = document.querySelector<HTMLButtonElement>('button[aria-label="Pick a date"]')!;
    calls.n = 0;
    fireEvent.click(pick);
    expect(document.querySelector('[role="dialog"][aria-label="Pick a date"]')).toBeTruthy();
    fireEvent.click(pick);
    expect(document.querySelector('[role="dialog"][aria-label="Pick a date"]')).toBeNull();
    expect(calls.n).toBe(0);
    showTeamMonth('2026-12');
    expect(calls.n).toBeGreaterThan(0);
  });
});
