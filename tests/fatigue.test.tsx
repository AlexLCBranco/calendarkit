// @vitest-environment jsdom
// Schedule-fatigue columns in the Team List (desktop) and the 3-in-4 chip in Team Calendar cells. Every expected
// label is worked out here from the parsed feed with plain date arithmetic (not the app's helpers).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { opponentSecondNight, seasonMonths } from '../src/data/model';
import { TEAM_BY_ID } from '../src/data/teams';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { data, feed } from './feed';
import { TEAM } from './synthetic';

afterEach(cleanup);

const DESKTOP = { width: 1200, height: 800 };
const NARROW = { width: 1000, height: 800 }; // tablet-ish: below the 1080 px Team List column
const NOW = Date.parse('2026-10-23T15:00:00Z');
const ORD = ['', '1st', '2nd', '3rd'];
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** A team's shown games straight from the parsed feed (game types by ID prefix), by ET date. */
const gamesOf = (teamId: number) =>
  feed.games.filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId)).sort((a, b) => a.dateEt.localeCompare(b.dateEt));

/** gameId → [highest 3-in-4 position, number of sets], independently. */
function tifOf(teamId: number) {
  const games = gamesOf(teamId);
  const out = new Map<string, [number, number]>();
  for (let i = 0; i + 2 < games.length; i++) {
    if (day(games[i + 2]!.dateEt) - day(games[i]!.dateEt) > 3) continue;
    for (let k = 0; k < 3; k++) {
      const id = games[i + k]!.gameId;
      const [p, n] = out.get(id) ?? [0, 0];
      out.set(id, [Math.max(p, k + 1), n + 1]);
    }
  }
  return out;
}
const plays = (teamId: number, date: string) => gamesOf(teamId).some((g) => g.dateEt === date);
const shift = (d: string, n: number) => new Date((day(d) + n) * 86_400_000).toISOString().slice(0, 10);
const opponentOf = (g: ScheduleGame, teamId: number) => (g.homeTeam.teamId === teamId ? g.awayTeam : g.homeTeam);
const tipLines = (el: Element) => el.getAttribute('data-tip')!.split('\n');

describe('Team List fatigue columns (desktop)', () => {
  for (const [name, teamId] of [['LAL', TEAM.LAL], ['BOS', TEAM.BOS], ['NYK', TEAM.NYK]] as const) {
    it(`${name}: team B2B + 3-in-4 and opponent 2/2 + 3-in-4 on exactly the right rows`, () => {
      const el = render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId }} />);
      const own = tifOf(teamId);
      let counts = { n1: 0, n2: 0, tif: 0, opp2: 0, oppTif: 0 };
      for (const g of gamesOf(teamId)) {
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        const label = `${name} ${g.dateEt}`;
        const team = row.querySelector('[data-testid="fatigue-team"]')!;
        const opp = row.querySelector('[data-testid="fatigue-opp"]')!;
        // columns in order: date, time, team column, matchup, opponent column, tags
        const order = [...row.children].map((c) => c.className.split(' ')[0]);
        expect(order.slice(order.indexOf('ck-date')), label).toEqual(['ck-date', 'ck-time', 'ck-fat', 'ck-matchup', 'ck-fat', 'ck-tags', ...order.slice(order.indexOf('ck-tags') + 1)]);
        // team: night 2 = played the previous calendar day, night 1 = plays the next one
        const n2 = plays(teamId, shift(g.dateEt, -1));
        const n1 = plays(teamId, shift(g.dateEt, 1));
        expect(!!team.querySelector('.ck-b2b-n2'), `${label} 2/2`).toBe(n2);
        expect(!!team.querySelector('.ck-b2b-n1'), `${label} 1/2`).toBe(n1);
        const [pos, sets] = own.get(g.gameId) ?? [0, 0];
        const chip = team.querySelector('[data-testid="tif"]');
        expect(chip?.textContent ?? '', `${label} 3-in-4`).toBe(pos ? `3-in-4 · ${ORD[pos]}` : '');
        if (chip) {
          expect(chip.className).toContain(`ck-tif-pos-${pos}`);
          expect(tipLines(chip), `${label} tooltip lists every set`).toHaveLength(1 + sets);
          expect(tipLines(chip)[0]).toBe(`3 games in 4 days — ${sets === 1 ? 'set' : `${sets} sets`}:`);
        }
        // no B2B label left among the tags; nothing else in the team column
        expect(row.querySelectorAll('.ck-tags .ck-b2b-label, .ck-tags .ck-tif'), label).toHaveLength(0);
        expect(team.children.length).toBe(+n1 + +n2 + (pos ? 1 : 0));
        // opponent: "2/2" when it played the previous calendar day (its 1/2 isn't marked), and its own 3-in-4
        const o = opponentOf(g, teamId);
        const o2 = plays(o.teamId, shift(g.dateEt, -1));
        const mark = opp.querySelector('.ck-b2b-opp');
        expect(mark?.textContent ?? '', `${label} opp 2/2`).toBe(o2 ? '2/2' : '');
        if (mark) expect(mark.getAttribute('data-tip')).toBe(opponentSecondNight(data, g, teamId));
        if (mark) expect(mark.getAttribute('data-tip')).toMatch(new RegExp(`^${o.teamTricode} on 2nd night of a back-to-back · played (vs|@) [A-Z]{3} yesterday$`));
        // the existing dot on the opponent's tricode stays, same tooltip
        const dot = row.querySelector('.ck-opp .ck-b2b-mark');
        expect(!!dot, `${label} dot`).toBe(o2);
        if (dot) expect(dot.getAttribute('data-tip')).toBe(mark!.getAttribute('data-tip'));
        const [opos, osets] = tifOf(o.teamId).get(g.gameId) ?? [0, 0];
        const ochip = opp.querySelector('[data-testid="tif-opp"]');
        expect(ochip?.textContent ?? '', `${label} opp 3-in-4`).toBe(opos ? `3-in-4 · ${ORD[opos]}` : '');
        if (ochip) {
          expect(tipLines(ochip)).toHaveLength(1 + osets);
          expect(tipLines(ochip)[0]).toBe(`${o.teamTricode}: 3 games in 4 days — ${osets === 1 ? 'set' : `${osets} sets`}:`);
        }
        expect(opp.children.length).toBe(+o2 + (opos ? 1 : 0));
        counts = { n1: counts.n1 + +n1, n2: counts.n2 + +n2, tif: counts.tif + +!!pos, opp2: counts.opp2 + +o2, oppTif: counts.oppTif + +!!opos };
      }
      // every kind occurs for each team
      for (const [k, v] of Object.entries(counts)) expect(v, `${name} ${k}`).toBeGreaterThan(2);
    });
  }

  it('tooltips on hover and focus: the chip lists its sets, line by line', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    const chip = document.querySelector('[data-testid="tif"][data-sets="2"]') ?? document.querySelector('[data-testid="tif"]')!;
    fireEvent.mouseOver(chip);
    expect(screen.getByTestId('tooltip').textContent).toBe(chip.getAttribute('data-tip'));
    fireEvent.mouseLeave(chip.closest('.ck-root')!);
    expect(screen.queryByTestId('tooltip')).toBeNull();
    fireEvent.focus(document.querySelector('[data-testid="tif-opp"]')!);
    expect(screen.getByTestId('tooltip').textContent).toMatch(/^[A-Z]{3}: 3 games in 4 days — /);
    fireEvent.focus(document.querySelector('.ck-b2b-opp')!);
    expect(screen.getByTestId('tooltip').textContent).toMatch(/on 2nd night of a back-to-back/);
  });

  it('rest rows have no fatigue columns; the TV filter never changes the labels', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.LAL, showRest: true }} />);
    const rest = document.querySelectorAll('[data-rest]');
    expect(rest.length).toBeGreaterThan(60);
    for (const r of rest) expect(r.querySelectorAll('.ck-fat, .ck-b2b-label, .ck-tif, .ck-b2b-opp')).toHaveLength(0);
    const labels = () => new Map([...document.querySelectorAll('[data-game-id]')].map((r) => [r.getAttribute('data-game-id'), [...r.querySelectorAll('.ck-fat')].map((c) => c.textContent).join('|')]));
    const all = labels();
    fireEvent.click(screen.getByLabelText('TV games only'));
    const tv = labels();
    expect(tv.size).toBeLessThan(all.size);
    for (const [id, text] of tv) expect(text).toBe(all.get(id));
  });

  it('narrower than the 1080 px column (tablet, phone): no columns, B2B labels among the tags as before, no chips', () => {
    for (const size of [NARROW, { width: 390, height: 800 }]) {
      render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
      expect(document.querySelectorAll('.ck-fat, .ck-tif, .ck-b2b-opp')).toHaveLength(0);
      expect(document.querySelectorAll('.ck-tags .ck-b2b-label').length).toBeGreaterThan(5);
      cleanup();
    }
  });
});

describe('Team Calendar: 3-in-4 chip next to the B2B label', () => {
  it('every month of LAL: chip on exactly the right cells, after the B2B label; not on phones', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.LAL }} />);
    const own = tifOf(TEAM.LAL);
    const byDate = new Map(gamesOf(TEAM.LAL).map((g) => [g.dateEt, g]));
    const months = seasonMonths(data);
    // go to the first month
    for (let i = 0; i < months.length; i++) fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    let seen = 0;
    for (const m of months) {
      for (const cell of document.querySelectorAll<HTMLElement>('.ck-team-grid [data-date]')) {
        const g = byDate.get(cell.dataset.date!);
        const [pos] = (g && own.get(g.gameId)) ?? [0];
        const chip = cell.querySelector('[data-testid="tif"]');
        // short chip in cells (round 4): "3in4·2nd"; the full text stays in the tooltip and aria-label
        expect(chip?.textContent ?? '', `${cell.dataset.date}`).toBe(pos ? `3in4·${ORD[pos]}` : '');
        if (chip) {
          expect(chip.getAttribute('data-tip')).toMatch(/^3 games in 4 days — (set|\d sets):\n/);
          expect(chip.getAttribute('aria-label')).toBe(chip.getAttribute('data-tip'));
          seen++;
          const tags = [...chip.parentElement!.children];
          const b2b = tags.filter((t) => t.classList.contains('ck-b2b-label'));
          // right after the B2B label(s), before markers / TV
          expect(tags.indexOf(chip)).toBe(b2b.length);
        }
      }
      if (m !== months.at(-1)) fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    }
    expect(seen).toBe([...own.keys()].length);
    cleanup();
    render(<CalendarView data={data} size={{ width: 390, height: 800 }} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.LAL }} />);
    expect(document.querySelectorAll('.ck-tif')).toHaveLength(0);
  });

  it('the scale probe holds the widest chip ("3in4·3rd", the cells\' short chip)', () => {
    // the probe renders only while measuring; jsdom measures 0-size boxes, so check what it renders on first layout
    const seen: string[] = [];
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.closest?.('.ck-team-probe')) seen.push(...[...this.closest('.ck-team-probe')!.querySelectorAll('.ck-tif')].map((c) => c.textContent!));
      return orig.call(this);
    };
    try {
      render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.LAL }} />);
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
    expect(new Set(seen)).toEqual(new Set(['3in4·3rd']));
    expect(TEAM_BY_ID.size).toBe(30);
  });
});
