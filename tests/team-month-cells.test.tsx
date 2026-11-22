// @vitest-environment jsdom
// Team Calendar, Month range (CK-38 … CK-40, CK-42): the line above the grid (team, record, standing, month — each a
// button), the four-line game cells (time + Cup / TV chips; the matchup with no record; a line per team that starts with
// its logo and carries its streak and chips), the TV cells, and the "Fatigue info" switch. The week ranges keep the
// classic cell. Sizes, wrapping and the no-scroll rule need a real layout: e2e/team-month.spec.ts.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { setFatigueInfo } from '../src/components/fatigueInfo';
import { teamStanding } from '../src/components/TeamMonthHead';
import { opponentSituation, teamStreak } from '../src/data/opponent';
import { conferencePositions, leagueStandings } from '../src/data/standings';
import { TEAMS } from '../src/data/teams';
import { dataOf, game as mk } from './synthetic';

afterEach(() => {
  cleanup();
  setFatigueInfo(true);
  localStorage.clear();
});

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const game = (s: Omit<Parameters<typeof mk>[0], 'utc'>) => mk({ ...s, utc: `${s.date}T23:00:00Z` } as Parameters<typeof mk>[0]);
// final = [away, home]. BOS: lost at NYK, then won three (a back-to-back on Nov 4 / 5), then three games to come.
const G = [
  game({ date: '2026-11-03', home: ID.NYK!, away: ID.BOS!, final: [99, 111] }),
  game({ date: '2026-11-04', home: ID.BOS!, away: ID.DEN!, final: [104, 118], natl: ['ESPN'] }),
  game({ date: '2026-11-05', home: ID.LAL!, away: ID.BOS!, final: [120, 108] }),
  game({ date: '2026-11-07', home: ID.BOS!, away: ID.ATL!, final: [97, 101] }),
  game({ date: '2026-11-09', home: ID.MIA!, away: ID.BOS! }),
  game({ date: '2026-11-12', home: ID.BOS!, away: ID.NYK!, natl: ['NBC'] }),
  game({ date: '2026-11-20', home: ID.DEN!, away: ID.BOS! }),
  // other teams' games, so opponents have records and streaks of their own
  game({ date: '2026-11-02', home: ID.MIA!, away: ID.ATL!, final: [90, 100] }),
  game({ date: '2026-11-06', home: ID.NYK!, away: ID.MIA!, final: [95, 105] }),
  game({ date: '2026-12-02', home: ID.BOS!, away: ID.MIA! }),
];
const data = dataOf(G);
const SIZE = { width: 1920, height: 855 };
const NOW = Date.parse('2026-11-08T15:00:00Z');
const open = (initial: object = {}) => render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: ID.BOS, date: '2026-11-08', ...initial }} />).container;
const card = (c: ParentNode, i: number) => c.querySelector<HTMLElement>(`.ck-team-grid [data-game-id="${G[i]!.gameId}"]`)!;
const texts = (el: Element | null, sel: string) => [...(el?.querySelectorAll(sel) ?? [])].map((e) => e.textContent);
const logo = (el: Element | null) => el?.querySelector('img')?.getAttribute('src');

describe('the line above the month (CK-38)', () => {
  it('team name, record and place from the Standings table, the month; no place before a first game', () => {
    const c = open();
    const head = within(c.querySelector<HTMLElement>('[data-testid="team-month-head"]')!);
    const row = leagueStandings(data).East.find((t) => t.teamId === ID.BOS)!;
    expect(head.getByTestId('tmh-team').textContent).toBe('Boston Celtics');
    expect(head.getByTestId('tmh-record').textContent).toBe(`${row.w}-${row.l}`);
    expect(head.getByTestId('tmh-record').textContent).toBe('3-1');
    const pos = conferencePositions(data).get(ID.BOS!)!;
    expect(head.getByTestId('tmh-place').textContent).toBe(`${pos.ordinal} East`);
    expect(head.getByTestId('tmh-month').textContent).toBe('November 2026');
    // every piece says what it opens
    for (const id of ['tmh-team', 'tmh-record', 'tmh-place', 'tmh-month']) expect(head.getByTestId(id).title).not.toBe('');
    // a team without a finished game: a record, no place (as everywhere else)
    expect(teamStanding(data, ID.CHI!)).toEqual({ record: '0-0', place: undefined, placeTip: undefined });
  });

  it('follows the month and the team', () => {
    const c = open();
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByTestId('tmh-month').textContent).toBe('December 2026');
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(within(screen.getByTestId('team-picker-list')).getByRole('option', { name: 'New York Knicks' }));
    expect(c.querySelector('[data-testid="tmh-team"]')!.textContent).toBe('New York Knicks');
    expect(c.querySelector('[data-testid="tmh-record"]')!.textContent).toBe('2-0');
  });

  it('team name opens the team picker, record and place open Standings, the month opens the date picker', async () => {
    open();
    fireEvent.click(screen.getByTestId('tmh-team'));
    expect(screen.getByTestId('team-picker-list')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('team-picker-list'), { key: 'Escape' });
    fireEvent.click(screen.getByTestId('tmh-month'));
    expect(screen.getByTestId('date-picker')).toBeTruthy();
    // a press on the month itself doesn't count as "outside" (it would close and reopen the picker)
    fireEvent.mouseDown(screen.getByTestId('tmh-month'));
    expect(screen.queryByTestId('date-picker')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tmh-month'));
    expect(screen.queryByTestId('date-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('tmh-record'));
    expect(await screen.findByTestId('standings')).toBeTruthy();
    expect(screen.queryByTestId('team-month-head')).toBeNull();
  });

  it('place opens Standings too; the week ranges and the List have no such line', async () => {
    open();
    fireEvent.click(screen.getByTestId('tmh-place'));
    expect(await screen.findByTestId('standings')).toBeTruthy();
    cleanup();
    open({ teamSpan: 1 });
    expect(screen.queryByTestId('team-month-head')).toBeNull();
    cleanup();
    open({ layout: 'list' });
    expect(screen.queryByTestId('team-month-head')).toBeNull();
  });
});

describe('the game cell (CK-39)', () => {
  it('line 1: the time, then the game’s TV chip; line 2: the matchup with scores and no record', () => {
    const c = open();
    const tv = card(c, 1);
    const top = tv.querySelector('.ck-mc-top')!;
    expect(top.querySelector('[data-testid="tipoff"]')!.textContent).toBe('23:00');
    expect(texts(top, '[data-testid="tv-badge"]')).toEqual(['TV']);
    expect([...tv.children].map((e) => e.className.split(' ')[0])).toEqual(['ck-mc-top', 'ck-matchup', 'ck-mc-line', 'ck-mc-line']);
    expect(tv.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('BOS 118 vs 104 DEN');
    expect(card(c, 4).querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('BOS @ MIA');
    // no printed record, no repeated tricode on the opponent's line
    expect(c.querySelector('.ck-team-grid [data-testid="opp-rec"], .ck-team-grid .ck-oppline-team, .ck-team-grid .ck-oppline')).toBeNull();
  });

  it('the opponent’s record is the hover text of the matchup and of its tricode', () => {
    const c = open();
    for (const i of [0, 1, 2, 3, 4, 5]) {
      const o = opponentSituation(data, G[i]!, ID.BOS!)!;
      const want = `${o.tricode} record: ${o.record!.wins}-${o.record!.losses}`;
      expect(card(c, i).querySelector('.ck-teams')!.getAttribute('title'), `game ${i}`).toBe(want);
      expect(card(c, i).querySelector('.ck-opp')!.getAttribute('title'), `game ${i}`).toBe(want);
    }
    expect(card(c, 0).querySelector('.ck-opp')!.getAttribute('title')).toBe('NYK record: 1-0');
  });

  it('a line per team: its logo first, then its streak — after a finished game, the current one on every game to come', () => {
    const c = open();
    const line = (i: number, id: string) => card(c, i).querySelector(`[data-testid="${id}"]`);
    // finished: after that game
    expect(texts(line(0, 'team-line'), '[data-testid="cell-streak"]')).toEqual(['L1']);
    expect(texts(line(3, 'team-line'), '[data-testid="cell-streak"]')).toEqual(['W3']);
    // to come: BOS's current streak on all three, not only the next one
    for (const i of [4, 5, 6]) {
      expect(texts(line(i, 'team-line'), '[data-testid="cell-streak"]'), `game ${i}`).toEqual(['W3']);
      expect(teamStreak(data, G[i]!, ID.BOS!)).toEqual({ kind: 'W', n: 3 });
    }
    // the opponent's line: its own logo and streak (MIA won, then lost; NYK won both)
    expect(texts(line(4, 'opp-line'), '[data-testid="opp-streak"]')).toEqual(['L1']);
    expect(texts(line(5, 'opp-line'), '[data-testid="opp-streak"]')).toEqual(['W2']);
    for (const i of [0, 3, 4, 5]) {
      expect(logo(line(i, 'team-line')), `game ${i}`).toBe('/calendar/logos/BOS.svg');
      expect(line(i, 'team-line')!.firstElementChild!.classList.contains('ck-logo-backing')).toBe(true);
      const opp = G[i]!.homeTeam.teamId === ID.BOS ? G[i]!.awayTeam : G[i]!.homeTeam;
      expect(logo(line(i, 'opp-line')), `game ${i}`).toBe(`/calendar/logos/${opp.teamTricode}.svg`);
      expect(line(i, 'opp-line')!.getAttribute('data-team')).toBe(opp.teamTricode);
    }
  });

  it('the team’s chips stay on its line (back-to-back), the opponent’s on its own, with their own marks', () => {
    const c = open();
    expect(texts(card(c, 0).querySelector('[data-testid="team-line"]'), '.ck-b2b-label')).toEqual(['1/2 · AH']);
    // three days in a row: the middle night is night 2 of one pair and night 1 of the next
    expect(texts(card(c, 1).querySelector('[data-testid="team-line"]'), '.ck-b2b-label')).toEqual(['2/2 · AH', '1/2 · HA']);
    expect(texts(card(c, 2).querySelector('[data-testid="team-line"]'), '.ck-b2b-label')).toEqual(['2/2 · HA']);
    expect(card(c, 2).querySelector('[data-testid="opp-line"] .ck-b2b-label')).toBeNull();
    // DEN came off a long break into Nov 20: its rest chip on its line
    expect(card(c, 6).querySelector('[data-testid="opp-line"] [data-testid="opp-rest"]')!.textContent).toBe('16d');
  });

  it('a team with nothing to show has no line', () => {
    // the season's first game: no streak yet, no chips
    const first = dataOf([game({ date: '2026-11-03', home: ID.NYK!, away: ID.BOS! })]);
    const c = render(<CalendarView data={first} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: ID.BOS, date: '2026-11-03' }} />).container;
    expect(c.querySelectorAll('.ck-mcell')).toHaveLength(1);
    expect(c.querySelector('[data-testid="team-line"], [data-testid="opp-line"]')).toBeNull();
  });

  it('the week ranges keep the classic cell', () => {
    const c = open({ teamSpan: 2 });
    expect(c.querySelectorAll('.ck-team-grid [data-game-id]').length).toBeGreaterThan(0);
    expect(c.querySelector('.ck-mcell, .ck-mc-line, .ck-cell-tv')).toBeNull();
    expect(c.querySelector('.ck-team-grid .ck-oppline .ck-oppline-team')).not.toBeNull();
    expect(c.querySelector('.ck-team-grid [data-testid="opp-rec"]')).not.toBeNull();
  });
});

describe('TV cells (CK-40)', () => {
  it('a national TV game’s day cell is marked, finished or not; the others aren’t', () => {
    const c = open();
    const marked = [...c.querySelectorAll<HTMLElement>('.ck-team-grid .ck-cell-tv')].map((e) => e.dataset.date);
    expect(marked).toEqual(['2026-11-04', '2026-11-12']);
    // the TV chip stays
    expect(texts(card(c, 5), '[data-testid="tv-badge"]')).toEqual(['TV']);
  });
});

describe('"Fatigue info" (CK-42)', () => {
  const box = () => {
    fireEvent.click(screen.getByTestId('options-button'));
    return screen.getByRole('checkbox', { name: 'Fatigue info' }) as HTMLInputElement;
  };

  it('on by default; off hides both team lines in every cell and keeps the time, chips, matchup and TV cells', () => {
    const c = open();
    const sw = box();
    expect(sw.checked).toBe(true);
    expect(c.querySelectorAll('.ck-mc-line').length).toBeGreaterThan(0);
    fireEvent.click(sw);
    expect(c.querySelector('.ck-mc-line, [data-testid="cell-streak"], [data-testid="opp-streak"], .ck-b2b-label')).toBeNull();
    expect(c.querySelectorAll('.ck-mcell')).toHaveLength(7);
    expect(c.querySelectorAll('.ck-mcell[data-fatigue="off"]')).toHaveLength(7);
    expect([...card(c, 1).children].map((e) => e.className.split(' ')[0])).toEqual(['ck-mc-top', 'ck-matchup']);
    expect(texts(card(c, 1), '[data-testid="tv-badge"]')).toEqual(['TV']);
    expect(c.querySelectorAll('.ck-cell-tv')).toHaveLength(2);
    // the record hover stays
    expect(card(c, 0).querySelector('.ck-opp')!.getAttribute('title')).toBe('NYK record: 1-0');
    fireEvent.click(sw);
    expect(c.querySelectorAll('[data-testid="team-line"]').length).toBeGreaterThan(0);
  });

  it('remembered between visits', () => {
    open();
    fireEvent.click(box());
    expect(localStorage.getItem('ck:fatigue:v1')).toBe('off');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fatigue info' }));
    expect(localStorage.getItem('ck:fatigue:v1')).toBeNull();
  });

  it('one switch, in Options, only where it does something (the team’s month)', () => {
    open();
    box();
    expect(document.querySelectorAll('input[aria-label="Fatigue info"]')).toHaveLength(1);
    cleanup();
    open({ teamSpan: 1 });
    fireEvent.click(screen.getByTestId('options-button'));
    expect(screen.queryByRole('checkbox', { name: 'Fatigue info' })).toBeNull();
  });
});
