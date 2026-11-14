// @vitest-environment jsdom
// The Team List shows one calendar month. Rows = that month's games (+ rest days); the month title;
// the date picker and Today switch months and put the row at the top; numbers, records,
// streaks and B2B nights still come from the whole season; a B2B split across the month edge keeps its marks but draws
// no bracket toward the missing row. Real scrolling and the served snapshot: e2e/teammonth.spec.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView, TeamListView } from '../src/components/CalendarView';
import { addDays, hasNationalTv, isOver, monthOf, teamGames, teamRestDays } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';
import { TEAM } from './synthetic';
import { eachTeamMonth, shownMonth, showTeamMonth, teamMonths } from './teamMonths';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const WIDE = { width: 1000, height: 800 };
const PHONE = { width: 390, height: 800 };
const LAL = TEAM.LAL;
const list = () => screen.getByTestId('team-list');
const rowDates = () => [...list().querySelectorAll<HTMLElement>('.ck-team-rows > [data-row-date]')].map((r) => r.dataset.rowDate!);

/** Rows 40 px apart (jsdom has no layout), so "the row at the top" = scrollTop / 40. */
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.rowDate ? [...this.parentElement!.children].indexOf(this) * 40 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => 100_000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
}
const topRow = () => rowDates()[Math.round(list().scrollTop / 40)];

/** The rows a month should hold: the team's games (TV filter) and, with rest days on, its rest days in that month. */
function expectedRows(teamId: number, month: string, rest: boolean, tvOnly = false): string[] {
  const games = teamGames(data, teamId).filter((g) => !tvOnly || hasNationalTv(g)).map((g) => g.dateEt);
  return [...games, ...(rest ? teamRestDays(data, teamId) : [])].filter((d) => monthOf(d) === month).sort();
}

describe('one month at a time', () => {
  // (the list itself, month by month; walking the months through the UI is covered below, and for every team in e2e)
  it('every team × every month: the rows are exactly that month’s games + rest days (and without rest days)', () => {
    for (const t of TEAMS) {
      for (const rest of [true, false]) {
        for (const m of teamMonths(data, t.id)) {
          render(<TeamListView data={data} teamId={t.id} tvOnly={false} showRest={rest} month={m} size={WIDE} now={NOW} timeZone="UTC" />);
          expect(rowDates(), `${t.tricode} ${m} rest ${rest}`).toEqual(expectedRows(t.id, m, rest));
          cleanup();
        }
      }
    }
  }, 60_000);

  it('opens on the month of the next game not over, that game at the top; the title says the month', () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL }} />);
    const next = teamGames(data, LAL).find((g) => !isOver(g, NOW))!;
    expect(screen.getByTestId('team-month').textContent).toBe('November 2026');
    expect(shownMonth()).toBe(monthOf(next.dateEt));
    expect(topRow()).toBe(next.dateEt);
    // plain text in the header, not a control
    expect(screen.getByTestId('team-month').closest('button, a, [role="button"]')).toBeNull();
    expect(screen.getByTestId('team-header').contains(screen.getByTestId('team-month'))).toBe(true);
  });

  it('TV filter and another team: back to the month of the (TV) next game', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL }} />);
    showTeamMonth('2027-02');
    fireEvent.click(screen.getByLabelText('TV games only'));
    const tvNext = teamGames(data, LAL).filter(hasNationalTv).find((g) => !isOver(g, NOW))!;
    expect(shownMonth()).toBe(monthOf(tvNext.dateEt));
    expect(rowDates()).toEqual(expectedRows(LAL, shownMonth(), true, true));
    showTeamMonth('2027-03');
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Boston Celtics' }));
    expect(shownMonth()).toBe(monthOf(teamGames(data, TEAM.BOS).filter(hasNationalTv).find((g) => !isOver(g, NOW))!.dateEt));
  });
});

describe('date picker and Today across the month edge', () => {
  it('no day strip (no week tabs, no week ‹ ›): the month moves by the date picker, Today and "Load more"', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: true }} />);
    expect(screen.queryByTestId('week-strip')).toBeNull();
    expect(screen.queryByLabelText('Previous week')).toBeNull();
    expect(screen.queryByLabelText('Next week')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeTruthy();
    expect(screen.getByTestId('today')).toBeTruthy();
  });

  it('the date picker: a day in another month → that month, the row (or the next one) at the top; Today → back', () => {
    fakeLayout();
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    const games = teamGames(data, LAL);
    const today = screen.getByTestId('today') as HTMLButtonElement;
    expect(today.disabled).toBe(true);
    for (const [month, day] of [['2027-01', '2027-01-14'], ['2027-03', '2027-03-02'], ['2026-10', '2026-10-25']] as const) {
      showTeamMonth(month); // through the picker (tests/teamMonths.ts)
      fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
      const popup = screen.getByRole('dialog', { name: 'Pick a date' });
      fireEvent.click(popup.querySelector(`[data-date="${day}"]`)!);
      const want = games.find((g) => g.dateEt >= day)!;
      expect(shownMonth()).toBe(monthOf(want.dateEt));
      expect(topRow()).toBe(want.dateEt);
      expect(today.disabled).toBe(false);
    }
    fireEvent.click(today);
    const next = games.find((g) => !isOver(g, NOW))!;
    expect(shownMonth()).toBe(monthOf(next.dateEt));
    expect(topRow()).toBe(next.dateEt);
    expect(today.disabled).toBe(true);
  });

  it('phones (no strip, no picker): the month title carries ‹ ›, disabled at the season’s ends', () => {
    render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL }} />);
    expect(screen.queryByTestId('week-strip')).toBeNull();
    const months = teamMonths(data, LAL);
    expect(shownMonth()).toBe('2026-11');
    showTeamMonth(months[0]!);
    expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true);
    for (const m of months) {
      showTeamMonth(m);
      expect(rowDates()).toEqual(expectedRows(LAL, m, false)); // no rest rows on phones
    }
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the whole season behind each month', () => {
  it('game numbers, records and streaks on every row (the first rows of a month too) = the whole-season list’s', () => {
    for (const teamId of [LAL, TEAM.BOS, TEAM.NYK]) {
      const full = render(<TeamListView data={data} teamId={teamId} tvOnly={false} size={XL} now={NOW} timeZone="UTC" />);
      const want = new Map([...full.container.querySelectorAll<HTMLElement>('[data-game-id]')].map((r) => [r.dataset.gameId!, r.querySelector('.ck-season')?.textContent ?? '']));
      cleanup();
      render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId }} />);
      let firsts = 0;
      eachTeamMonth(data, teamId, () => {
        const rows = [...list().querySelectorAll<HTMLElement>('[data-game-id]')];
        rows.forEach((r) => expect(r.querySelector('.ck-season')?.textContent ?? '', r.dataset.gameId).toBe(want.get(r.dataset.gameId!)));
        if (/G([2-9]|\d\d)/.test(rows[0]?.querySelector('.ck-season')?.textContent ?? '')) firsts++; // not restarted at G1
      });
      expect(firsts).toBeGreaterThan(0);
      cleanup();
    }
  }, 30_000);

  it('a B2B split across the month edge: both nights keep their label, leg dot and chips; no bracket toward the other month', () => {
    // every real split pair of every team
    let split = 0;
    for (const t of TEAMS) {
      const dates = new Set(teamGames(data, t.id).map((g) => g.dateEt));
      const pairs = [...dates].filter((d) => dates.has(addDays(d, 1)) && monthOf(d) !== monthOf(addDays(d, 1)));
      if (!pairs.length) continue;
      for (const size of [XL, WIDE]) {
        render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: t.id }} />);
        for (const first of pairs) {
          for (const [date, night] of [[first, '1'], [addDays(first, 1), '2']] as const) {
            showTeamMonth(monthOf(date));
            const row = list().querySelector<HTMLElement>(`[data-row-date="${date}"]`)!;
            const label = `${t.tricode} ${date}`;
            if (size === XL) {
              // desktop: the Fatigue component — badge with its leg dot on this night
              expect(row.querySelector(`[data-testid="fatigue-team"] [data-night="${night}"]`), label).toBeTruthy();
            } else expect(row.querySelector(`.ck-b2b-n${night}`), label).toBeTruthy();
            // the bracket: never this night's half (the other row isn't here); a 3-day run keeps its in-month half
            expect((row.dataset.b2b ?? '').split(' '), label).not.toContain(night);
          }
          split++;
        }
        cleanup();
      }
    }
    expect(split).toBeGreaterThan(4);
  }, 60_000);
});
