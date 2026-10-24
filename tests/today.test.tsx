// @vitest-environment jsdom
// "Today" button next to the period arrows: where it goes in each view, disabled once there, desktop only.
// Real scrolling (League List, Team List) is covered by e2e/today.spec.ts.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { defaultDay } from '../src/data/model';
import { data } from './feed';

afterEach(cleanup);

const DESKTOP = { width: 1840, height: 1000 };
const PHONE = { width: 360, height: 700 };
const NOW = Date.parse('2026-11-15T15:00:00Z'); // default day Nov 15 (evening games not over)
const today = () => screen.getByTestId('today') as HTMLButtonElement;
const BOS = 1610612738;

describe('Today button', () => {
  it('League List: disabled on the default day; elsewhere it jumps back to the default day', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" />);
    expect(screen.getByTestId('day-title').textContent).toBe('Sunday, November 15, 2026');
    expect(today().disabled).toBe(true);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText('Next day'));
    expect(screen.getByTestId('day-title').textContent).not.toBe('Sunday, November 15, 2026');
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(screen.getByTestId('day-title').textContent).toBe('Sunday, November 15, 2026');
    expect(today().disabled).toBe(true);
  });

  it('League List opened on another date: Today goes to the default day (same rule as on load)', () => {
    render(<CalendarView data={data} size={DESKTOP} now={Date.parse('2026-11-16T05:00:00Z')} timeZone="UTC" initial={{ date: '2027-01-10' }} />);
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    const want = defaultDay(data, Date.parse('2026-11-16T05:00:00Z'))!; // the rule used on load (tested in model.test.ts)
    expect(screen.getByTestId('day-title').textContent).toBe(new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${want}T12:00:00Z`)));
  });

  it('League Calendar (week view, 1 and 2 weeks): jumps to the week of the default day', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2027-01-12' }} />);
    expect(screen.getByTestId('period-title').textContent).toContain('Jan 10 – 16, 2027');
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(screen.getByTestId('period-title').textContent).toContain('Nov 15 – 21, 2026');
    expect(today().disabled).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: '2 weeks' }));
    expect(today().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Next 2 weeks'));
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(screen.getByTestId('period-title').textContent).toContain('Nov 15 – 28, 2026');
  });

  it('Team Calendar: jumps to the current month (clamped into the season)', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: BOS }} />);
    expect(screen.getByTestId('period-title').textContent).toBe('November 2026');
    expect(today().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Next month'));
    fireEvent.click(screen.getByLabelText('Next month'));
    expect(today().disabled).toBe(false);
    fireEvent.click(today());
    expect(screen.getByTestId('period-title').textContent).toBe('November 2026');
    expect(today().disabled).toBe(true);
    cleanup();
    // after the season: the last month of the season
    render(<CalendarView data={data} size={DESKTOP} now={Date.parse('2027-08-01T12:00:00Z')} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: BOS }} />);
    fireEvent.click(screen.getByLabelText('Previous month'));
    fireEvent.click(today());
    const last = data.dates.at(-1)!.slice(0, 7);
    expect(screen.getByTestId('period-title').textContent).toBe(new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${last}-15T12:00:00Z`)));
  });

  it('Team List has a Today button too (no arrows there)', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: BOS }} />);
    expect(today().textContent).toBe('Today');
  });

  it('sits right after the next arrow, and is left out on phones', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" />);
    expect(screen.getByLabelText('Next day').nextElementSibling).toBe(today());
    cleanup();
    render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" />);
    expect(screen.queryByTestId('today')).toBeNull();
  });
});
