// @vitest-environment jsdom
// Round 21 (item 3): the Team List opens on one month; "Load earlier games" adds the month before (rest days too),
// "Load more games" the month after, one month per click; "Season start" / "End of schedule" at the team's ends; a
// divider row between months; the header names the range; back restores the loaded months. That the row on screen
// stays put is checked on a real layout (e2e/loadmonths.spec.ts).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView, fmtMonthSpan, type CalendarHandle, type ViewSnapshot } from '../src/components/CalendarView';
import { monthOf, teamGames } from '../src/data/model';
import { data } from './feed';
import { TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const months = () => [...new Set([...document.querySelectorAll<HTMLElement>('[data-testid="team-list"] [data-row-date]')].map((r) => r.dataset.rowDate!.slice(0, 7)))];
const open = (onNavigate?: (s: ViewSnapshot, how: 'push' | 'replace') => void, handle?: ReturnType<typeof createRef<CalendarHandle>>) =>
  render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} onNavigate={onNavigate} handle={handle} />);

describe('Team List: load earlier / more', () => {
  const games = teamGames(data, TEAM.BOS);
  const first = monthOf(games[0]!.dateEt);
  const last = monthOf(games.at(-1)!.dateEt);

  it('opens on one month; each click adds one month above or below, rest days included; dividers between months; header range', () => {
    open();
    expect(months()).toEqual(['2026-11']);
    expect(screen.getByTestId('team-month').textContent).toBe('November 2026');
    expect(document.querySelectorAll('.ck-month-divider')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('load-earlier'));
    expect(months()).toEqual(['2026-10', '2026-11']);
    expect(document.querySelectorAll('[data-testid="team-list"] [data-rest^="2026-10"]').length).toBeGreaterThan(0);
    expect([...document.querySelectorAll('.ck-month-divider')].map((d) => d.textContent)).toEqual(['November 2026']);
    expect(screen.getByTestId('team-month').textContent).toBe('October – November 2026');
    fireEvent.click(screen.getByTestId('load-more'));
    fireEvent.click(screen.getByTestId('load-more'));
    expect(months()).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(screen.getByTestId('team-month').textContent).toBe('October 2026 – January 2027');
  });

  it('the season’s ends: "Season start" instead of the button at the first month, "End of schedule" after the last', () => {
    open();
    expect(first).toBe('2026-10');
    fireEvent.click(screen.getByTestId('load-earlier'));
    expect(screen.queryByTestId('load-earlier')).toBeNull();
    expect(screen.getByTestId('season-start').textContent).toBe('Season start');
    let n = 0;
    while (screen.queryByTestId('load-more') && n++ < 12) fireEvent.click(screen.getByTestId('load-more'));
    expect(months().at(-1)).toBe(last);
    expect(screen.getByTestId('schedule-end').textContent).toBe('End of schedule');
  });

  it('loading months is the same page (its history entry updated); back to it brings the months back', () => {
    const calls: { snap: ViewSnapshot; how: string }[] = [];
    const handle = createRef<CalendarHandle>();
    open((snap, how) => calls.push({ snap, how }), handle);
    fireEvent.click(screen.getByTestId('load-earlier'));
    expect(calls.at(-1)!.how).toBe('replace');
    const loaded = calls.at(-1)!.snap;
    expect([loaded.teamListMonth, loaded.teamListTo]).toEqual(['2026-10', '2026-11']);
    fireEvent.click(screen.getByTestId('load-more'));
    expect(months()).toHaveLength(3);
    act(() => handle.current!.restore(loaded));
    expect(months()).toEqual(['2026-10', '2026-11']);
  });

  it('fmtMonthSpan', () => {
    expect(fmtMonthSpan('2026-11', '2026-11')).toBe('November 2026');
    expect(fmtMonthSpan('2026-10', '2026-11')).toBe('October – November 2026');
    expect(fmtMonthSpan('2026-12', '2027-01')).toBe('December 2026 – January 2027');
  });
});
