// @vitest-environment jsdom
// Team List "Show rest days": one quiet row per day without a game of the team, between its first and last game.
// Expected rest days are worked out here from the feed's own game dates with Date arithmetic (not model.ts helpers).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { hasNationalTv, teamGames, teamRestDays } from '../src/data/model';
import { data } from './feed';
import { TEAM } from './synthetic';

afterEach(cleanup);

const WIDE = { width: 1000, height: 800 };
const PHONE = { width: 360, height: 700 };
const NOW = Date.parse('2026-10-23T15:00:00Z');
const TEAMS = [TEAM.LAL, TEAM.BOS, TEAM.NYK, TEAM.DEN, TEAM.MIA];

/** Every calendar day from the team's first to last game (ET dates) with no game of the team, independently. */
function expectedRest(teamId: number): string[] {
  const dates = new Set(data.games.filter((g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId).map((g) => g.dateEt));
  const sorted = [...dates].sort();
  const out: string[] = [];
  const end = new Date(`${sorted.at(-1)}T00:00:00Z`);
  for (const d = new Date(`${sorted[0]}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!dates.has(iso)) out.push(iso);
  }
  return out;
}

/** Rows in order: a game id or "rest:<date>". */
const rows = () =>
  [...screen.getByTestId('team-list').querySelectorAll('[data-game-id], [data-rest]')].map((e) => (e.hasAttribute('data-rest') ? `rest:${e.getAttribute('data-rest')}` : e.getAttribute('data-game-id')!));
const restRows = () => rows().filter((r) => r.startsWith('rest:')).map((r) => r.slice(5));

describe('teamRestDays', () => {
  it('matches the independently worked-out gap days for 5 teams; none on a game day, none outside the season', () => {
    for (const teamId of TEAMS) {
      const rest = teamRestDays(data, teamId);
      const games = teamGames(data, teamId);
      expect(rest).toEqual(expectedRest(teamId));
      expect(rest.length).toBeGreaterThan(60); // ~170 days, 82+ games
      const gameDays = new Set(games.map((g) => g.dateEt));
      for (const d of rest) expect(gameDays.has(d)).toBe(false);
      expect(rest[0]! > games[0]!.dateEt).toBe(true);
      expect(rest.at(-1)! < games.at(-1)!.dateEt).toBe(true);
    }
  });
});

describe('Team List rest rows', () => {
  it('on by default (round 7, 2.2): toggle checked, rest rows shown', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    expect((screen.getByLabelText('Show rest days') as HTMLInputElement).checked).toBe(true);
    expect(restRows()).toEqual(expectedRest(TEAM.BOS));
  });

  it('on: one row per gap day in date order among the game rows ("Wed 21/10" + "Rest"), for 5 teams', () => {
    for (const teamId of TEAMS) {
      render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId, showRest: true }} />);
      const games = teamGames(data, teamId);
      const expected = [...games.map((g) => ({ key: g.gameId, date: g.dateEt })), ...expectedRest(teamId).map((d) => ({ key: `rest:${d}`, date: d }))]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((x) => x.key);
      expect(rows()).toEqual(expected);
      const first = document.querySelector<HTMLElement>('[data-rest]')!;
      const d = first.getAttribute('data-rest')!;
      const wd = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      expect(first.querySelector('.ck-date')!.textContent).toBe(`${wd} ${d.slice(8)}/${d.slice(5, 7)}`);
      expect(first.textContent).toBe(`${wd} ${d.slice(8)}/${d.slice(5, 7)}Rest`);
      // nothing else in a rest row: no logos, tags, season line, copy button
      expect(first.querySelectorAll('img, .ck-tag, .ck-season, button')).toHaveLength(0);
      cleanup();
    }
  });

  it('TV filter: the same rest rows (no fake rest days); a day with a non-TV game shows nothing', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.LAL, showRest: true, tvOnly: true }} />);
    const games = teamGames(data, TEAM.LAL);
    expect(restRows()).toEqual(expectedRest(TEAM.LAL));
    const nonTv = games.filter((g) => !hasNationalTv(g));
    expect(nonTv.length).toBeGreaterThan(10);
    const shown = new Set(rows());
    for (const g of nonTv) {
      expect(shown.has(g.gameId)).toBe(false);
      expect(shown.has(`rest:${g.dateEt}`)).toBe(false);
    }
    for (const g of games.filter(hasNationalTv)) expect(shown.has(g.gameId)).toBe(true);
  });

  it('the toggle turns the rows on and off; kept across team changes; only in Team List and not on phones', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS, showRest: false }} />);
    fireEvent.click(screen.getByLabelText('Show rest days'));
    expect(restRows()).toEqual(expectedRest(TEAM.BOS));
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(restRows()).toEqual(expectedRest(TEAM.MIA));
    fireEvent.click(screen.getByLabelText('Show rest days'));
    expect(restRows()).toEqual([]);
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(screen.queryByLabelText('Show rest days')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'League' }));
    expect(screen.queryByLabelText('Show rest days')).toBeNull();
    cleanup();
    render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS, showRest: true }} />);
    expect(screen.queryByLabelText('Show rest days')).toBeNull();
    expect(restRows()).toEqual([]);
  });

  it('next game, B2B brackets and game numbers unchanged with rest rows on', () => {
    const off = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.DEN, showRest: false }} />);
    const snap = () =>
      [...document.querySelectorAll('[data-game-id]')].map((e) => [e.getAttribute('data-game-id'), e.getAttribute('data-next'), e.getAttribute('data-b2b'), e.querySelector('.ck-season')?.textContent ?? ''].join('|'));
    const before = snap();
    off.unmount();
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.DEN, showRest: true }} />);
    expect(snap()).toEqual(before);
    expect(restRows().length).toBeGreaterThan(0);
  });

  it('whole-view copy renders the rest rows too', async () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS, showRest: true }} />);
    // the capture stage mounts while copying; jsdom can't rasterize, so check what it renders and stop the copy
    // there: jsdom has no img.decode, so the stub never resolves and the copy waits (it outlives the test; this jsdom
    // is this file's alone)
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: () => new Promise(() => {}), configurable: true });
    fireEvent.click(screen.getByTestId('copy-view'));
    const stage = await waitFor(() => document.querySelector<HTMLElement>('.ck-capture')!);
    expect([...stage.querySelectorAll('[data-rest]')].map((e) => e.getAttribute('data-rest'))).toEqual(expectedRest(TEAM.BOS));
  });
});
