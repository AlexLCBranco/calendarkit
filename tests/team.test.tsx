// @vitest-environment jsdom
// Team views: header (large logo + full name), team picker with logos (keyboard), selected team first on every
// game ("BOS vs CHI" / "BOS @ DET", both logos), the team's back-to-back pairs (1/2 · XY, 2/2 · XY, plane on a metro
// change, bar / bracket, tooltips), and the opponent's 2/2 dot.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView, TeamMonthGrid, TeamListView } from '../src/components/CalendarView';
import { addDays, isBackToBack, monthOf, teamGames, weekday, type CalendarData } from '../src/data/model';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { TEAM_BY_ID, TEAMS } from '../src/data/teams';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

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

/** Metro of an arena city, written out here independently of src/data/metro.ts (see PROJECT.md). */
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

describe('team header', () => {
  for (const [layout, size, px] of [['list', WIDE, 48], ['calendar', WIDE, 48], ['list', PHONE, 40], ['calendar', PHONE, 40]] as const) {
    it(`${layout} at ${size.width} px: large logo (${px} px) + full name`, () => {
      team(TEAM.BOS, layout, size);
      const h = screen.getByTestId('team-header');
      expect(within(h).getByRole('heading').textContent).toBe('Boston Celtics');
      const img = h.querySelector('img')!;
      expect(img.getAttribute('src')).toBe('/logos/BOS.svg');
      expect(img.getAttribute('width')).toBe(String(px));
      expect(img.parentElement!.classList).toContain('ck-logo-backing');
    });
  }

  it('not shown in league views', () => {
    render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    expect(screen.queryByTestId('team-header')).toBeNull();
  });
});

describe('team picker', () => {
  it('button shows the team logo and full name (tricode on phones); the list has all 30 teams with logos, grouped by conference · division', () => {
    team(TEAM.BOS, 'list');
    const btn = screen.getByTestId('team-picker');
    expect(btn.textContent).toMatch(/Boston Celtics/);
    expect(imgs(btn)).toEqual(['/logos/BOS.svg']);
    expect(btn.getAttribute('aria-haspopup')).toBe('listbox');
    expect(screen.getByRole('button', { name: /^Team Boston Celtics/ })).toBe(btn);
    fireEvent.click(btn);
    const list = screen.getByRole('listbox', { name: 'Teams' });
    const groups = within(list).getAllByRole('group');
    expect(groups.map((g) => g.querySelector('.ck-picker-head')!.textContent)).toEqual([
      'East · Atlantic', 'East · Central', 'East · Southeast', 'West · Northwest', 'West · Pacific', 'West · Southwest',
    ]);
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(30);
    for (const o of options) {
      const t = TEAM_BY_ID.get(Number(o.getAttribute('data-team-id')))!;
      expect(o.textContent).toBe(`${t.city} ${t.name}`);
      expect(imgs(o)).toEqual([`/logos/${t.tricode}.svg`]);
    }
    expect(options.find((o) => o.getAttribute('aria-selected') === 'true')!.textContent).toBe('Boston Celtics');
    cleanup();
    team(TEAM.BOS, 'list', PHONE);
    expect(screen.getByTestId('team-picker').textContent).toMatch(/^BOS/);
  });

  it('mouse: picking a team changes the views and tells the host', () => {
    const onStateChange = vi.fn();
    team(TEAM.BOS, 'list', WIDE, onStateChange);
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('team-header').textContent).toBe('Miami Heat');
    expect(screen.getByRole('region', { name: 'Heat games' })).toBeTruthy();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: TEAM.MIA }));
  });

  it('keyboard: ↓ opens on the current team, arrows/Home/End/letters move, Enter picks, Escape closes; focus returns to the button', () => {
    team(TEAM.BOS, 'calendar');
    const btn = screen.getByTestId('team-picker');
    btn.focus();
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    expect(document.activeElement).toBe(list);
    const active = () => document.getElementById(list.getAttribute('aria-activedescendant')!)!.textContent;
    expect(active()).toBe('Boston Celtics');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(active()).toBe('Brooklyn Nets');
    fireEvent.keyDown(list, { key: 'ArrowRight' }); // next division, same place
    expect(active()).toBe('Cleveland Cavaliers');
    fireEvent.keyDown(list, { key: 'End' });
    expect(active()).toBe('San Antonio Spurs');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(active()).toBe('Boston Celtics');
    fireEvent.keyDown(list, { key: 'm' }); // next team starting with M, in picker order
    expect(active()).toBe('Milwaukee Bucks');
    fireEvent.keyDown(list, { key: 'm' });
    expect(active()).toBe('Miami Heat');
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(btn);
    expect(screen.getByTestId('team-header').textContent).toBe('Boston Celtics'); // Escape doesn't pick
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'l' }); // L…: LA Clippers
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'l' }); // then Los Angeles Lakers
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(screen.getByTestId('team-header').textContent).toBe('Los Angeles Lakers');
    expect(screen.getByRole('region', { name: 'Lakers schedule' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('team-picker'));
  });

  it('phone: same picker in Team → List and Team → Calendar, team kept', () => {
    team(TEAM.BOS, 'list', PHONE);
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(screen.getByRole('option', { name: 'Miami Heat' }));
    expect(screen.getByRole('region', { name: 'Heat games' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(screen.getByTestId('team-picker').getAttribute('data-team-id')).toBe(String(TEAM.MIA));
  });
});

describe('selected team first, both logos', () => {
  for (const teamId of [TEAM.BOS, TEAM.LAL]) {
    const tri = TEAM_BY_ID.get(teamId)!.tricode;
    it(`${tri} list: "${tri} vs OPP" at home, "${tri} @ OPP" away; logos [${tri}, OPP]`, () => {
      const el = team(teamId, 'list');
      for (const g of teamGames(data, teamId)) {
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        const home = g.homeTeam.teamId === teamId;
        const opp = home ? g.awayTeam : g.homeTeam;
        // final games: the score beside each tricode (straight from the feed's scores)
        const self = home ? g.homeTeam : g.awayTeam;
        const [s, o] = g.status === 'final' ? [` ${self.score}`, ` ${opp.score}`] : ['', ''];
        expect(row.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim(), g.gameId).toBe(`${tri}${s} ${home ? 'vs' : '@'} ${opp.teamTricode}${o}`);
        expect(imgs(row), g.gameId).toEqual([`/logos/${tri}.svg`, `/logos/${opp.teamTricode}.svg`]);
        expect(row.querySelector('.ck-matchup > :first-child .ck-self')!.textContent).toBe(tri); // always first
      }
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
          expect(cell.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${tri} ${home ? 'vs' : '@'} ${opp.teamTricode}`);
          expect(imgs(cell)).toEqual([`/logos/${tri}.svg`, `/logos/${opp.teamTricode}.svg`]);
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

  it('league views unchanged: AWAY @ HOME in the list', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" />);
    const g = data.byDate.get('2026-10-23')![0]!;
    expect(el.container.querySelector(`[data-game-id="${g.gameId}"] .ck-matchup`)!.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}`);
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
      for (const p of pairs) {
        want.set(p.a.gameId, [...(want.get(p.a.gameId) ?? []), { text: `1/2 · ${p.code}`, night: '1', plane: p.travels }]);
        want.set(p.b.gameId, [...(want.get(p.b.gameId) ?? []), { text: `2/2 · ${p.code}`, night: '2', plane: p.travels }]);
      }
      for (const g of teamGames(data, teamId)) {
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        expect(label(row), `${tri} ${g.dateEt}`).toEqual(want.get(g.gameId) ?? []);
        expect(row.getAttribute('data-b2b') ?? '', g.dateEt).toBe((want.get(g.gameId) ?? []).map((w) => w.night).join(' '));
        expect(row.querySelector('.ck-b2b'), g.dateEt).toBeNull();
      }
      const n1 = el.container.querySelector('.ck-b2b-n1')!;
      const n2 = el.container.querySelector('.ck-b2b-n2')!;
      expect(n1.className).not.toBe(n2.className); // outlined vs solid (calendar.css)
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

  it('calendar: same labels on both cells; one bar across both cells when side by side, halves with arrows across a week break', () => {
    const pairs = expectedPairs(data, ORL).filter((p) => monthOf(p.a.dateEt) === '2026-11' && monthOf(p.b.dateEt) === '2026-11');
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    const el = render(<TeamMonthGrid data={data} teamId={ORL} month="2026-11" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
    const bars = [...el.container.querySelectorAll<HTMLElement>('[data-b2b-bar]')];
    let breaks = 0;
    for (const p of pairs) {
      for (const [g, n] of [[p.a, 1], [p.b, 2]] as const) {
        const cell = el.container.querySelector(`[data-date="${g.dateEt}"]`)!;
        expect(label(cell)).toEqual([{ text: `${n}/2 · ${p.code}`, night: String(n), plane: p.travels }]);
      }
      const mine = bars.filter((b) => b.getAttribute('data-pair') === `${p.a.dateEt}/${p.b.dateEt}`);
      if (weekday(p.a.dateEt) === 6) {
        breaks++;
        expect(mine.map((b) => b.getAttribute('data-b2b-bar'))).toEqual(['start', 'end']);
        expect(mine[0]!.style.gridColumn).toBe('7 / span 1');
        expect(mine[1]!.style.gridColumn).toBe('1 / span 1');
        expect(Number(mine[1]!.style.gridRow)).toBe(Number(mine[0]!.style.gridRow) + 1);
      } else {
        expect(mine.map((b) => b.getAttribute('data-b2b-bar'))).toEqual(['full']);
        expect(mine[0]!.style.gridColumn).toBe(`${weekday(p.a.dateEt) + 1} / span 2`);
      }
    }
    expect(breaks).toBeGreaterThan(0); // ORL Nov 2026 has a Sat → Sun back-to-back
    expect(bars).toHaveLength(pairs.reduce((n, p) => n + (weekday(p.a.dateEt) === 6 ? 2 : 1), 0));
  });

  it('a pair across months: the half in this month ends in an arrow toward the other month', () => {
    const d = dataOf([
      game({ date: '2026-11-30', utc: '2026-12-01T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
      game({ date: '2026-12-01', utc: '2026-12-02T00:00:00Z', home: TEAM.MIA, away: TEAM.BOS }),
    ]);
    const nov = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-11" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
    expect([...nov.container.querySelectorAll('[data-b2b-bar]')].map((b) => b.getAttribute('data-b2b-bar'))).toEqual(['start']);
    cleanup();
    const dec = render(<TeamMonthGrid data={d} teamId={TEAM.BOS} month="2026-12" onMonthChange={() => {}} size={WIDE} now={NOW} timeZone="UTC" />);
    expect([...dec.container.querySelectorAll('[data-b2b-bar]')].map((b) => b.getAttribute('data-b2b-bar'))).toEqual(['end']);
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
      for (const g of teamGames(data, teamId)) {
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
