// @vitest-environment jsdom
// A team link (name, logo, tricode — anywhere) opens that team's Calendar, also from the Team List; switching to List
// by hand still works. The calendar views' side arrows step like the bar's ‹ ›.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { teamLinkUrl } from '../src/App';
import { CalendarView } from '../src/components/CalendarView';
import { data } from './feed';
import { goTo, pickScope } from './nav';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const tabs = (name: string) => within(screen.getByRole('tablist', { name }));
const selected = (list: string) => tabs(list).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
const open = (initial = {}) => render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" teamHref={(t) => teamLinkUrl(t, '/calendar/')} initial={{ date: '2026-11-13', ...initial }} />);
const teamLinks = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-team-link]')];

describe('team links open the Calendar', () => {
  it('from the League List; the link’s address says Calendar too', () => {
    open();
    const a = teamLinks()[0]!;
    fireEvent.pointerDown(a);
    expect(a.getAttribute('href')).toMatch(/layout=calendar/);
    fireEvent.click(a);
    expect(screen.getByTestId('team-header')).toBeTruthy();
    expect(selected('Layout')).toBe('Calendar');
  });

  it('from the Team List (the opponent), from Standings', async () => {
    open({ mode: 'team', layout: 'list' });
    expect(selected('Layout')).toBe('List');
    const opp = teamLinks().find((a) => a.closest('.ck-opp'))!;
    fireEvent.click(opp);
    expect(selected('Layout')).toBe('Calendar');
    // List by hand still works, and stays until the next team link
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'List' }));
    expect(selected('Layout')).toBe('List');
    goTo('Standings');
    const table = await screen.findByTestId('standings');
    fireEvent.click(table.querySelector<HTMLAnchorElement>('[data-team-link]')!);
    expect(screen.getByTestId('team-header')).toBeTruthy();
    expect(selected('Layout')).toBe('Calendar');
  });
});

describe('side arrows beside the calendar', () => {
  it('Team Calendar: a month, then a week; League Calendar: 1 or 2 weeks; none on the lists or the Slate', () => {
    open();
    expect(screen.queryByTestId('side-prev')).toBeNull();
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Slate' }));
    expect(screen.queryByTestId('side-prev')).toBeNull();
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }));
    expect(screen.getByTestId('side-next').getAttribute('aria-label')).toBe('Forward one week');
    const week = () => within(screen.getByTestId('date-block')).getByTestId('period-title').textContent;
    const w0 = week();
    fireEvent.click(screen.getByTestId('side-next'));
    expect(week()).toBe('Nov 15 – 21, 2026');
    fireEvent.click(screen.getByTestId('side-prev'));
    expect(week()).toBe(w0);
    fireEvent.click(tabs('Weeks').getByRole('tab', { name: '2 weeks' }));
    expect(screen.getByTestId('side-next').getAttribute('aria-label')).toBe('Forward 2 weeks');
    pickScope('Boston Celtics');
    const title = () => within(screen.getByTestId('date-block')).getByTestId('period-title').textContent;
    expect(title()).toBe('November 2026');
    fireEvent.click(screen.getByTestId('side-next'));
    expect(title()).toBe('December 2026');
    fireEvent.click(screen.getByTestId('side-prev'));
    fireEvent.click(screen.getByTestId('side-prev'));
    expect(title()).toBe('October 2026');
    expect(screen.getByTestId('side-prev').getAttribute('aria-label')).toBe('Back one month');
    fireEvent.click(tabs('Span').getByRole('tab', { name: '2 weeks' }));
    const before = title();
    fireEvent.click(screen.getByTestId('side-next'));
    expect(title()).not.toBe(before);
    expect(screen.getByTestId('side-next').getAttribute('aria-label')).toBe('Forward 2 weeks');
    fireEvent.click(tabs('Layout').getByRole('tab', { name: 'List' }));
    expect(screen.queryByTestId('side-next')).toBeNull();
  });

  it('never in the copy: the arrows are outside the view the copy renders', () => {
    open({ mode: 'team', layout: 'calendar' });
    expect(screen.getByTestId('side-prev').dataset.captureExclude).toBe('true');
    expect(screen.getByTestId('side-prev').closest('section')).toBeNull();
  });
});
