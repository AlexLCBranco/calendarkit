// teamCalendarUrl: the Slate part's team-link address for a host outside calendarkit (the gauntlet's Slate widget) —
// the same address calendarkit's own team links get (App.tsx teamLinkUrl) with the default options.
import { describe, expect, it } from 'vitest';
import { teamLinkUrl } from '../src/App';
import type { CalendarState } from '../src/components/CalendarView';
import { TEAMS } from '../src/data/teams';
import { teamCalendarUrl } from '../src/slate';

const DEFAULTS: CalendarState = { mode: 'league', layout: 'slate', teamId: 0, date: '2026-11-13', tvOnly: false, showRest: true, weeks: 1, teamSpan: 'month' };

describe('teamCalendarUrl', () => {
  it("is calendarkit's own team link (Team Calendar on that date) for every team", () => {
    for (const t of TEAMS) expect(teamCalendarUrl(t.id, '2026-11-13')).toBe(teamLinkUrl({ teamId: t.id, layout: 'calendar', date: '2026-11-13', state: DEFAULTS }, '/calendar/'));
  });
  it('reads back as that team on that date', () => {
    const u = new URL(teamCalendarUrl(TEAMS[0]!.id, '2026-12-25'), 'https://x.test');
    expect(u.pathname).toBe('/calendar/');
    expect(Object.fromEntries(u.searchParams)).toEqual({ view: 'team', layout: 'calendar', team: TEAMS[0]!.tricode, on: '2026-12-25' });
  });
});
