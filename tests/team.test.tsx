// @vitest-environment jsdom
// Team views: the team box in the header (no title row on screen; the heading stays in the copies), selected team first on every
// game ("BOS vs CHI" / "BOS @ DET", both logos), the team's back-to-back pairs (1/2 · XY, 2/2 · XY, plane on a metro
// change, bar / bracket, tooltips), and the opponent's 2/2 dot.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView, TeamHeader, TeamMonthGrid, TeamListView } from '../src/components/CalendarView';
import { pickScope, scopeTeam } from './nav';
import { addDays, isBackToBack, monthOf, teamGames, type CalendarData } from '../src/data/model';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { TEAM_BY_ID, TEAMS } from '../src/data/teams';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';
import { eachTeamMonth, showTeamMonth } from './teamMonths';

afterEach(cleanup);

const WIDE = { width: 1000, height: 800 };
const PHONE = { width: 360, height: 700 };
const NOW = Date.parse('2026-10-23T15:00:00Z');
const ORL = 1610612753;
const CHI = 1610612741;
const BKN = 1610612751;

const team = (teamId: number, layout: 'list' | 'calendar', size = WIDE, onStateChange?: (s: unknown) => void) =>
  render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout, teamId }} onStateChange={onStateChange} />);
const imgs = (el: Element) => [...el.querySelectorAll('img')].map((i) => i.getAttribute('src'));

/** Metro of an arena city, written out here independently of src/data/metro.ts (see docs/HISTORY.md). */
const metro = (c: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' } as Record<string, string>)[c] ?? c;

/** Back-to-back pairs worked out here, independently of the app: consecutive calendar days of the team's games. */
function expectedPairs(d: CalendarData, teamId: number) {
  const games = d.games.filter((g) => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId);
  const out: { a: ScheduleGame; b: ScheduleGame; code: string; travels: boolean }[] = [];
  for (let i = 1; i < games.length; i++) {
    const a = games[i - 1]!;
    const b = games[i]!;
    if (addDays(a.dateEt, 1) !== b.dateEt) continue;
    const ha = (g: ScheduleGame) => (g.homeTeam.teamId === teamId ? 'H' : 'A');
    out.push({ a, b, code: ha(a) + ha(b), travels: !!a.arenaCity && !!b.arenaCity && metro(a.arenaCity) !== metro(b.arenaCity) });
  }
  return out;
}

describe('team heading', () => {
  for (const [layout, size] of [['list', WIDE], ['calendar', WIDE], ['list', PHONE], ['calendar', PHONE]] as const) {
    it(`${layout} at ${size.width} px: no title row on screen; the team box names the team, with its logo`, () => {
      team(TEAM.BOS, layout, size);
      expect(screen.queryByTestId('team-header')).toBeNull();
      const box = screen.getByTestId('team-picker');
      expect(box.textContent).toContain(size === PHONE ? 'BOS' : 'Boston Celtics');
      expect(imgs(box)).toEqual(['/calendar/logos/BOS.svg']);
    });
  }

  for (const [px, compact] of [[48, false], [40, true]] as const) {
    it(`the heading itself (copies, the Cup's team schedule): large logo (${px} px) + full name`, () => {
      render(<TeamHeader teamId={TEAM.BOS} compact={compact} />);
      const h = screen.getByTestId('team-header');
      expect(within(h).getByRole('heading').textContent).toBe('Boston Celtics');
      const img = h.querySelector('img')!;
      expect(img.getAttribute('src')).toBe('/calendar/logos/BOS.svg');
      expect(img.getAttribute('width')).toBe(String(px));
      expect(img.parentElement!.classList).toContain('ck-logo-backing');
    });
  }

  it('not shown in league views', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    expect(screen.queryByTestId('team-header')).toBeNull();
  });
});

describe('team box', () => {
  it('no team chips; "All teams" beside the box; its list: all 30 teams (logo + full name) under their six divisions, the team on show selected', () => {
    team(TEAM.BOS, 'list');
    expect(screen.queryAllByTestId('team-chip')).toHaveLength(0);
    expect(screen.getByTestId('all-teams').textContent).toBe('All teams');
    expect(screen.getByTestId('all-teams').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('team-picker'));
    const list = screen.getByTestId('team-picker-list');
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(30);
    for (const o of options) {
      const t = TEAM_BY_ID.get(Number(o.getAttribute('data-team-id')))!;
      expect(o.textContent).toBe(`${t.city} ${t.name}`);
      expect(imgs(o)).toEqual([`/calendar/logos/${t.tricode}.svg`]);
      // under its own division's heading
      expect(o.closest('[role="group"]')!.querySelector('.ck-picker-head')!.textContent).toBe(`${t.conference} · ${t.division}`);
    }
    expect([...list.querySelectorAll('.ck-picker-head')].map((h) => h.textContent)).toEqual(['East · Atlantic', 'East · Central', 'East · Southeast', 'West · Northwest', 'West · Pacific', 'West · Southwest']);
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent)).toEqual(['Boston Celtics']);
    expect(within(list).queryByText('All teams')).toBeNull();
  });

  it('a click on a team changes the views and tells the host', () => {
    const onStateChange = vi.fn();
    team(TEAM.BOS, 'list', WIDE, onStateChange);
    pickScope('Miami Heat');
    expect(screen.getByTestId('team-picker').textContent).toContain('Miami Heat');
    expect(screen.getByRole('region', { name: 'Heat games' })).toBeTruthy();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: TEAM.MIA }));
    expect(scopeTeam()).toBe(TEAM.MIA);
  });

  it('phone: the same box in Team → List and Team → Calendar, team kept', () => {
    team(TEAM.BOS, 'list', PHONE);
    pickScope('Miami Heat');
    expect(screen.getByRole('region', { name: 'Heat games' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(scopeTeam()).toBe(TEAM.MIA);
  });
});

describe('selected team first, both logos', () => {
  for (const teamId of [TEAM.BOS, TEAM.LAL]) {
    const tri = TEAM_BY_ID.get(teamId)!.tricode;
    it(`${tri} list: "${tri} vs OPP" at home, "${tri} @ OPP" away; logos [${tri}, OPP]`, () => {
      const el = team(teamId, 'list');
      eachTeamMonth(data, teamId, (m) => {
      for (const g of teamGames(data, teamId).filter((x) => monthOf(x.dateEt) === m)) {
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        const home = g.homeTeam.teamId === teamId;
        const opp = home ? g.awayTeam : g.homeTeam;
        // final games: "BOS 113 @ 121 DET", the scores next to each other (straight from the feed's scores)
        const self = home ? g.homeTeam : g.awayTeam;
        const [s, o] = g.status === 'final' ? [` ${self.score}`, ` ${opp.score}`] : ['', ''];
        expect(row.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim(), g.gameId).toBe(`${tri}${s} ${home ? 'vs' : '@'}${o} ${opp.teamTricode}`);
        expect(imgs(row), g.gameId).toEqual([`/calendar/logos/${tri}.svg`, `/calendar/logos/${opp.teamTricode}.svg`]);
        expect(row.querySelector('.ck-matchup > :first-child .ck-self')!.textContent).toBe(tri); // always first
      }
      });
    });

    it(`${tri} calendar (desktop): same in every game cell`, () => {
      const el = team(teamId, 'calendar');
      const months = [...new Set(teamGames(data, teamId).map((g) => monthOf(g.dateEt)))];
      let n = 0;
      for (let i = 0; i < months.length; i++) {
        for (const g of teamGames(data, teamId).filter((x) => monthOf(x.dateEt) === months[i])) {
          const cell = el.container.querySelector(`[data-date="${g.dateEt}"]`)!;
          const home = g.homeTeam.teamId === teamId;
          const opp = home ? g.awayTeam : g.homeTeam;
          const self = home ? g.homeTeam : g.awayTeam;
          const [sc, o] = g.status === 'final' ? [` ${self.score}`, ` ${opp.score}`] : ['', '']; // final scores (scores.test.tsx)
          expect(cell.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${tri}${sc} ${home ? 'vs' : '@'}${o} ${opp.teamTricode}`);
          // the matchup's two logos; each team's own line under it starts with its logo again (CK-39)
          expect(imgs(cell.querySelector('.ck-matchup')!)).toEqual([`/calendar/logos/${tri}.svg`, `/calendar/logos/${opp.teamTricode}.svg`]);
          n++;
        }
        if (i < months.length - 1) fireEvent.click(screen.getByLabelText('Next month'));
      }
      expect(n).toBe(teamGames(data, teamId).length);
    });
  }

  it('phone calendar keeps the opponent-only cell (no room for both tricodes); the tapped game shows both', () => {
    const el = team(TEAM.BOS, 'calendar', PHONE);
    const cells = [...el.container.querySelectorAll('.ck-cell-game')];
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) {
      expect(c.querySelector('.ck-self')).toBeNull();
      expect(c.querySelector('.ck-matchup')!.textContent).toMatch(/^(vs|@) [A-Z]{3}$/);
    }
    fireEvent.click(cells[0]!);
    expect(el.container.querySelector('.ck-detail .ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toMatch(/^BOS (vs|@) [A-Z]{3}$/);
  });

  it('league views: AWAY @ HOME in the list (records going in on the outside, round 4)', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    const g = data.byDate.get('2026-10-23')![0]!;
    // (the Fatigue components' "B2B" / "4in6 · 2nd" left out, rounds 5–6)
    // the text without the rest badges ("2d"), which sit right against the records
    const matchup = el.container.querySelector(`[data-game-id="${g.gameId}"] .ck-matchup`)!.cloneNode(true) as Element;
    matchup.querySelectorAll('.ck-fx-rest').forEach((r) => r.remove());
    expect(matchup.textContent!.replace(/B2B|\d+in\d+( · \d+(st|nd|rd|th))?/g, '').replace(/\s+/g, ' ').trim()).toMatch(new RegExp(`^([WL]\\d+ )?(\\d+(st|nd|rd|th) [EW] )?(\\d+-\\d+ )?${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}( \\d+-\\d+)?( \\d+(st|nd|rd|th) [EW])?( [WL]\\d+)?$`));
  });
});

describe('back-to-back pairs (team views)', () => {
  const label = (el: Element) => [...el.querySelectorAll('.ck-b2b-label')].map((l) => ({ text: l.textContent, night: l.getAttribute('data-b2b-night'), plane: !!l.querySelector('[data-testid="plane"]') }));

  it('every code occurs in the real schedule (HH, HA, AH, AA), with and without travel', () => {
    const all = TEAMS.flatMap((t) => expectedPairs(data, t.id));
    expect(new Set(all.map((p) => p.code))).toEqual(new Set(['HH', 'HA', 'AH', 'AA']));
    expect(all.some((p) => p.travels)).toBe(true);
    expect(all.some((p) => !p.travels)).toBe(true);
  });

  for (const teamId of [TEAM.LAL, TEAM.BOS, ORL, TEAM.NYK]) {
    const tri = TEAM_BY_ID.get(teamId)!.tricode;
    it(`${tri} list: both nights labelled (1/2 outlined, 2/2 solid, same code), plane only on a city change, bracket on both rows; no "B2B" badge`, () => {
      const el = team(teamId, 'list');
      const pairs = expectedPairs(data, teamId);
      expect(pairs.length).toBeGreaterThan(5);
      const want = new Map<string, { text: string; night: string; plane: boolean }[]>();
      // The bracket only where the other night is in the shown month (labels stay on both)
      const bracket = new Map<string, string[]>();
      for (const p of pairs) {
        want.set(p.a.gameId, [...(want.get(p.a.gameId) ?? []), { text: `1/2 · ${p.code}`, night: '1', plane: p.travels }]);
        want.set(p.b.gameId, [...(want.get(p.b.gameId) ?? []), { text: `2/2 · ${p.code}`, night: '2', plane: p.travels }]);
        if (monthOf(p.a.dateEt) === monthOf(p.b.dateEt)) {
          bracket.set(p.a.gameId, [...(bracket.get(p.a.gameId) ?? []), '1']);
          bracket.set(p.b.gameId, [...(bracket.get(p.b.gameId) ?? []), '2']);
        }
      }
      const classes = new Set<string>();
      eachTeamMonth(data, teamId, (m) => {
        for (const g of teamGames(data, teamId).filter((x) => monthOf(x.dateEt) === m)) {
          const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
          expect(label(row), `${tri} ${g.dateEt}`).toEqual(want.get(g.gameId) ?? []);
          expect(row.getAttribute('data-b2b') ?? '', g.dateEt).toBe((bracket.get(g.gameId) ?? []).join(' '));
          expect(row.querySelector('.ck-b2b'), g.dateEt).toBeNull();
        }
        for (const n of el.container.querySelectorAll('.ck-b2b-n1, .ck-b2b-n2')) classes.add(n.className);
      });
      const n1 = [...classes].find((c) => c.includes('ck-b2b-n1'))!;
      const n2 = [...classes].find((c) => c.includes('ck-b2b-n2'))!;
      expect(n1).not.toBe(n2); // outlined vs solid (calendar.css)
    });
  }

  it('tooltip (hover + focus): "Back-to-back: vs X (home) → @ Y (away) · travels A → B"; no travel part in the same city', () => {
    const pairs = expectedPairs(data, TEAM.LAL);
    const travel = pairs.find((p) => p.travels)!;
    const same = pairs.find((p) => !p.travels)!;
    const el = team(TEAM.LAL, 'list');
    const side = (g: ScheduleGame) => (g.homeTeam.teamId === TEAM.LAL ? `vs ${g.awayTeam.teamTricode} (home)` : `@ ${g.homeTeam.teamTricode} (away)`);
    const tipOf = (p: (typeof pairs)[number]) => `Back-to-back: ${side(p.a)} → ${side(p.b)}${p.travels ? ` · travels ${p.a.arenaCity} → ${p.b.arenaCity}` : ''}`;
    for (const p of [travel, same]) {
      for (const g of [p.a, p.b]) {
        showTeamMonth(monthOf(g.dateEt));
        const l = el.container.querySelector<HTMLElement>(`[data-game-id="${g.gameId}"] .ck-b2b-label`)!;
        expect(l.getAttribute('data-tip')).toBe(tipOf(p));
        expect(l.getAttribute('aria-label')).toBe(tipOf(p));
        expect(l.tabIndex).toBe(0);
        fireEvent.mouseOver(l);
        expect(screen.getByRole('tooltip').textContent).toBe(tipOf(p));
        fireEvent.blur(l);
        fireEvent.focus(l);
        expect(screen.getByRole('tooltip').textContent).toBe(tipOf(p));
        fireEvent.blur(l);
      }
    }
    expect(tipOf(travel)).toMatch(/ · travels \w/);
    expect(tipOf(same)).not.toMatch(/travels/);
  });

  it('calendar: same labels on both cells, and no line between the cells (the labels say it)', () => {
    const pairs = expectedPairs(data, ORL).filter((p) => monthOf(p.a.dateEt) === '2026-11' && monthOf(p.b.dateEt) === '2026-11');
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    const el = render(<TeamMonthGrid data={data} teamId={ORL} month="2026-11" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" runs />);
    for (const p of pairs) {
      for (const [g, n] of [[p.a, 1], [p.b, 2]] as const) {
        const cell = el.container.querySelector(`[data-date="${g.dateEt}"]`)!;
        expect(label(cell)).toEqual([{ text: `${n}/2 · ${p.code}`, night: String(n), plane: p.travels }]);
      }
    }
    // no connectors: neither B2B bars nor road-trip / homestand bands
    expect(el.container.querySelectorAll('[data-b2b-bar], .ck-b2b-bar, .ck-run-band')).toHaveLength(0);
    // the grid holds only its headers, its cells and the run labels
    const kids = [...el.container.querySelector('.ck-team-grid')!.children];
    expect(kids.every((k) => k.matches('.ck-grid-head, .ck-cell, .ck-run-tag'))).toBe(true);
  });

  it('a pair across months: both halves keep their labels, with no line toward the other month', () => {
    const d = dataOf([
      game({ date: '2026-11-30', utc: '2026-12-01T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
      game({ date: '2026-12-01', utc: '2026-12-02T00:00:00Z', home: TEAM.MIA, away: TEAM.BOS }),
    ]);
    const nov = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-11" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
    expect(label(nov.container.querySelector('[data-date="2026-11-30"]')!).map((l) => l.night)).toEqual(['1']);
    expect(nov.container.querySelectorAll('[data-b2b-bar], .ck-b2b-bar')).toHaveLength(0);
    cleanup();
    const dec = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-12" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
    expect(label(dec.container.querySelector('[data-date="2026-12-01"]')!).map((l) => l.night)).toEqual(['2']);
    expect(dec.container.querySelectorAll('[data-b2b-bar], .ck-b2b-bar')).toHaveLength(0);
  });

  it('synthetic: all four codes, plane only when the arena city changes', () => {
    const at = (date: string, home: number, away: number, city: string) => game({ date, utc: `${date}T23:30:00Z`, home, away, raw: { arenaCity: city } });
    const d = dataOf([
      at('2026-11-02', TEAM.BOS, TEAM.NYK, 'Boston'), at('2026-11-03', TEAM.BOS, TEAM.MIA, 'Boston'), // HH, same city
      at('2026-11-09', TEAM.BOS, TEAM.NYK, 'Boston'), at('2026-11-10', TEAM.LAL, TEAM.BOS, 'Los Angeles'), // HA, travels
      at('2026-11-16', TEAM.DEN, TEAM.BOS, 'Denver'), at('2026-11-17', TEAM.BOS, TEAM.MIA, 'Boston'), // AH, travels
      at('2026-11-23', TEAM.NYK, TEAM.BOS, 'New York'), at('2026-11-24', TEAM.MIA, TEAM.BOS, 'Miami'), // AA, travels
      at('2026-11-26', TEAM.NYK, TEAM.BOS, 'New York'), at('2026-11-27', TEAM.MIA, TEAM.BOS, ''), // AA, city unknown: no plane
    ]);
    const el = render(<TeamListView data={d} teamId={TEAM.BOS} tvOnly={false} size={WIDE} now={NOW} timeZone="UTC" />);
    expect([...el.container.querySelectorAll('.ck-b2b-label')].map((l) => `${l.textContent}${l.querySelector('[data-testid="plane"]') ? ' ✈' : ''}`)).toEqual([
      '1/2 · HH', '2/2 · HH', '1/2 · HA ✈', '2/2 · HA ✈', '1/2 · AH ✈', '2/2 · AH ✈', '1/2 · AA ✈', '2/2 · AA ✈', '1/2 · AA', '2/2 · AA',
    ]);
    expect(el.container.querySelector('[data-game-id] .ck-b2b-n1')!.getAttribute('data-tip')).toBe('Back-to-back: vs NYK (home) → vs MIA (home)');
    expect([...el.container.querySelectorAll('.ck-b2b-label')][2]!.getAttribute('data-tip')).toBe('Back-to-back: vs NYK (home) → @ LAL (away) · travels Boston → Los Angeles');
  });

  it('phone calendar cells: short "1/2" / "2/2" (+ plane); the full label is in the tooltip and the tapped card', () => {
    const el = team(TEAM.LAL, 'calendar', PHONE);
    const p = expectedPairs(data, TEAM.LAL).find((x) => monthOf(x.a.dateEt) === '2026-10')!;
    const l = el.container.querySelector(`[data-date="${p.a.dateEt}"] .ck-b2b-label`)!;
    expect(l.textContent).toBe('1/2');
    expect(l.getAttribute('data-tip')).toMatch(/^Back-to-back: /);
    fireEvent.click(el.container.querySelector(`[data-date="${p.a.dateEt}"]`)!);
    expect(el.container.querySelector('.ck-detail .ck-b2b-label')!.textContent).toBe(`1/2 · ${p.code}`);
  });
});

describe("opponent's 2nd night (team views)", () => {
  it('orange dot on the opponent tricode exactly when the opponent is on its 2/2 (never its 1/2), with tooltip', () => {
    for (const teamId of [TEAM.BOS, ORL]) {
      const el = team(teamId, 'list');
      let n = 0;
      eachTeamMonth(data, teamId, (m) => {
      for (const g of teamGames(data, teamId).filter((x) => monthOf(x.dateEt) === m)) {
        const opp = g.homeTeam.teamId === teamId ? g.awayTeam : g.homeTeam;
        const dot = el.container.querySelector(`[data-game-id="${g.gameId}"] .ck-opp .ck-b2b-mark`);
        expect(!!dot, g.dateEt).toBe(isBackToBack(data, opp.teamId, g.dateEt));
        if (dot) {
          n++;
          const prev = data.byDate.get(addDays(g.dateEt, -1))!.find((x) => x.homeTeam.teamId === opp.teamId || x.awayTeam.teamId === opp.teamId)!;
          const where = prev.homeTeam.teamId === opp.teamId ? `vs ${prev.awayTeam.teamTricode}` : `@ ${prev.homeTeam.teamTricode}`;
          expect(dot.getAttribute('data-tip')).toBe(`${opp.teamTricode} on 2nd night of a back-to-back · played ${where} yesterday`);
        }
        expect(el.container.querySelector(`[data-game-id="${g.gameId}"] .ck-self .ck-b2b-mark`)).toBeNull(); // own B2B: labels, not a dot
      }
      });
      expect(n).toBeGreaterThan(3);
      cleanup();
    }
  });

  it('both marks when both teams are on 2/2; nothing for the opponent’s 1/2', () => {
    const d = dataOf([
      game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK, raw: { arenaCity: 'Boston' } }),
      game({ date: '2026-11-01', utc: '2026-11-01T23:30:00Z', home: TEAM.MIA, away: CHI, raw: { arenaCity: 'Miami' } }),
      game({ id: '0022609911', date: '2026-11-02', utc: '2026-11-03T00:00:00Z', home: CHI, away: TEAM.BOS, raw: { arenaCity: 'Chicago' } }), // both on 2/2
      game({ id: '0022609912', date: '2026-11-04', utc: '2026-11-05T00:00:00Z', home: TEAM.BOS, away: BKN, raw: { arenaCity: 'Boston' } }), // BKN on 1/2
      game({ date: '2026-11-05', utc: '2026-11-06T00:00:00Z', home: BKN, away: TEAM.LAL, raw: { arenaCity: 'Brooklyn' } }),
    ]);
    const el = render(<TeamListView data={d} teamId={TEAM.BOS} tvOnly={false} size={WIDE} now={NOW} timeZone="UTC" />);
    const both = el.container.querySelector('[data-game-id="0022609911"]')!;
    expect(both.querySelector('.ck-b2b-n2')!.textContent).toBe('2/2 · HA');
    expect(both.querySelector('.ck-opp .ck-b2b-mark')!.getAttribute('data-tip')).toBe('CHI on 2nd night of a back-to-back · played @ MIA yesterday');
    expect(el.container.querySelector('[data-game-id="0022609912"] .ck-b2b-mark')).toBeNull();
    cleanup();
    const cal = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-11" onMonthChange={() => {}} size={PHONE} now={NOW} timeZone="UTC" />);
    expect(cal.container.querySelector('[data-date="2026-11-02"] .ck-opp .ck-b2b-mark')).toBeTruthy(); // phone cell too
  });
});

describe('uniform cells', () => {
  it('team calendar rows: one size for every week row (min 92 px on desktop, 1fr on phones); 5- and 6-week months', () => {
    for (const [month, weeks] of [['2026-11', 5], ['2027-01', 6]] as const) {
      const el = render(<TeamMonthGrid data={data} teamId={TEAM.BOS} month={month} onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
      expect(el.container.querySelector<HTMLElement>('[role="grid"]')!.style.gridTemplateRows).toBe(`auto repeat(${weeks}, minmax(92px, 1fr))`);
      cleanup();
      const ph = render(<TeamMonthGrid data={data} teamId={TEAM.BOS} month={month} onMonthChange={() => {}} size={PHONE} now={NOW} timeZone="UTC" />);
      expect(ph.container.querySelector<HTMLElement>('[role="grid"]')!.style.gridTemplateRows).toBe(`auto repeat(${weeks}, 1fr)`);
      cleanup();
    }
  });
});
