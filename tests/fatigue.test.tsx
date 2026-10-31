// @vitest-environment jsdom
// Schedule-fatigue columns in the Team List (desktop) and the 3-in-4 chip in Team Calendar cells. Every expected
// label is worked out here from the parsed feed with plain date arithmetic (not the app's helpers).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { seasonMonths } from '../src/data/model';
import { TEAM_BY_ID } from '../src/data/teams';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { data, feed } from './feed';
import { TEAM } from './synthetic';
import { acrossMonths, eachTeamMonth } from './teamMonths';

afterEach(cleanup);

const DESKTOP = { width: 1200, height: 800 };
const NARROW = { width: 1000, height: 800 }; // tablet-ish: below the 1080 px Team List column
const NOW = Date.parse('2026-10-23T15:00:00Z');
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
/**
 * gameId → [games in its merged 3-in-4 stretch, days from its first to its last game inclusive, the game's place]
 * (round 6), independently: from a set's first game, the stretch grows while another set starts inside it (and so
 * shares a game with it).
 */
function stretchOf(teamId: number) {
  const games = gamesOf(teamId);
  const isSet = (i: number) => i + 2 < games.length && day(games[i + 2]!.dateEt) - day(games[i]!.dateEt) <= 3;
  const out = new Map<string, [number, number, number]>();
  for (let i = 0; i < games.length; i++) {
    if (!isSet(i)) continue;
    let end = i + 2;
    for (let k = i + 1; k <= end; k++) if (isSet(k)) end = k + 2;
    const s = games.slice(i, end + 1);
    s.forEach((g, k) => out.set(g.gameId, [s.length, day(s.at(-1)!.dateEt) - day(s[0]!.dateEt) + 1, k + 1]));
    i = end;
  }
  return out;
}
const ord = (k: number) => ['', '1st', '2nd', '3rd'][k] ?? `${k}th`;
const shift = (d: string, n: number) => new Date((day(d) + n) * 86_400_000).toISOString().slice(0, 10);
const opponentOf = (g: ScheduleGame, teamId: number) => (g.homeTeam.teamId === teamId ? g.awayTeam : g.homeTeam);

/** The Fatigue component a team should show in game g, worked out from the feed: back-to-back nights by calendar day
 * (night 2 = played the day before, night 1 = plays the day after), each night's home/away, the 3-in-4 position. */
function expected(teamId: number, g: ScheduleGame) {
  const on = (d: string) => gamesOf(teamId).find((x) => x.dateEt === d);
  const home = (x: ScheduleGame) => (x.homeTeam.teamId === teamId ? 'home' : 'away');
  const prev = on(shift(g.dateEt, -1));
  const next = on(shift(g.dateEt, 1));
  const icons = prev ? [[home(prev), false], [home(g), true]] : next ? [[home(g), true], [home(next), false]] : [];
  const [pos] = tifOf(teamId).get(g.gameId) ?? [0, 0];
  const st = stretchOf(teamId).get(g.gameId);
  return { night: prev ? '2' : next ? '1' : null, icons, pos, chip: st ? `${st[0]}in${st[1]} · ${ord(st[2])}` : '', place: st?.[2] ?? 0 };
}

/** What a rendered Fatigue component shows: badge text, icons in DOM order (= left to right), chip, mirrored. */
function shown(fx: Element) {
  return {
    badge: fx.querySelector('.ck-fx-b2b')?.textContent ?? '',
    // the leg dot: before the first B (1) or after the second B (2), in DOM order = left to right
    leg: (() => {
      const b = fx.querySelector('.ck-fx-b2b');
      const dot = b?.querySelector('.ck-fx-leg');
      return !dot ? null : b!.firstChild === dot ? '1' : b!.lastChild === dot ? '2' : '?';
    })(),
    icons: [...fx.querySelectorAll('.ck-fx-icon')].map((i) => [i.getAttribute('data-kind'), i.classList.contains('ck-fx-tonight')]),
    chip: fx.querySelector('.ck-fx-chip')?.textContent ?? '',
    chipPos: fx.querySelector('.ck-fx-chip')?.className.match(/ck-tif-pos-(\d)/)?.[1],
    night: fx.getAttribute('data-night'),
    empty: fx.classList.contains('ck-fx-empty'),
    mirror: fx.classList.contains('ck-fx-mirror'),
  };
}

/** Checks one Fatigue component against the independent rule; returns what it showed. */
function checkFatigue(fx: Element, teamId: number, g: ScheduleGame, label: string) {
  const want = expected(teamId, g);
  const got = shown(fx);
  expect(got.night, `${label} night`).toBe(want.night);
  expect(got.badge, `${label} badge`).toBe(want.night ? 'B2B' : '');
  expect(got.leg, `${label} leg dot`).toBe(want.night);
  expect(got.icons, `${label} icons in time order, tonight solid`).toEqual(want.icons);
  expect(!!want.pos, `${label} in a 3-in-4 set iff in a stretch`).toBe(!!want.chip);
  expect(got.chip, `${label} merged 3in4 chip`).toBe(want.chip);
  if (want.chip) expect(got.chipPos).toBe(String(Math.min(3, want.place)));
  expect(got.empty, `${label} empty slot`).toBe(!want.night && !want.pos);
  return want;
}

describe('Team List fatigue columns (desktop, round 5: the Fatigue component)', () => {
  for (const [name, teamId] of [['LAL', TEAM.LAL], ['BOS', TEAM.BOS], ['NYK', TEAM.NYK]] as const) {
    it(`${name}: the team's and the opponent's Fatigue component on every row, worked out from the feed`, () => {
      const el = render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId }} />);
      const counts = { n1: 0, n2: 0, tif: 0, empty: 0, oppN1: 0, oppN2: 0, oppTif: 0, oppEmpty: 0 };
      let checked = 0;
      // round 9: month by month (the full-season values on every month's rows)
      eachTeamMonth(data, teamId, (m) => {
      for (const g of gamesOf(teamId).filter((x) => x.dateEt.startsWith(m))) {
        checked++;
        const row = el.container.querySelector(`[data-game-id="${g.gameId}"]`)!;
        const label = `${name} ${g.dateEt}`;
        // columns in order: date, time, team column, matchup, opponent column, tags
        const order = [...row.children].map((c) => c.className.split(' ')[0]);
        expect(order.slice(order.indexOf('ck-date')), label).toEqual(['ck-date', 'ck-time', 'ck-fat', 'ck-matchup', 'ck-fat', 'ck-tags', ...order.slice(order.indexOf('ck-tags') + 1)]);
        const team = row.querySelectorAll('[data-testid="fatigue-team"] [data-testid="fatigue"]');
        const opp = row.querySelectorAll('[data-testid="fatigue-opp"] [data-testid="fatigue"]');
        expect([team.length, opp.length], label).toEqual([1, 1]);
        // the team's column is left of its logo (badge on the right, next to it); the opponent's right of its logo
        expect(shown(team[0]!).mirror || shown(team[0]!).empty, label).toBe(true);
        expect(shown(opp[0]!).mirror).toBe(false);
        const t = checkFatigue(team[0]!, teamId, g, label);
        const o = checkFatigue(opp[0]!, opponentOf(g, teamId).teamId, g, `${label} opp`);
        // the old labels and chips are gone from the row (not among the tags either)
        expect(row.querySelectorAll('.ck-b2b-label, .ck-tif, .ck-b2b-opp'), label).toHaveLength(0);
        // round 7 (1.4): no dot on the opponent's tricode (its component says it), also on its 2nd night
        expect(row.querySelector('.ck-opp .ck-b2b-mark'), `${label} dot`).toBeNull();
        counts.n1 += +(t.night === '1'); counts.n2 += +(t.night === '2'); counts.tif += +!!t.pos; counts.empty += +(!t.night && !t.pos);
        counts.oppN1 += +(o.night === '1'); counts.oppN2 += +(o.night === '2'); counts.oppTif += +!!o.pos; counts.oppEmpty += +(!o.night && !o.pos);
      }
      });
      expect(checked).toBe(gamesOf(teamId).length);
      // every kind occurs for each team
      for (const [k, v] of Object.entries(counts)) expect(v, `${name} ${k}`).toBeGreaterThan(1);
    });
  }

  it('tooltips on hover and focus: the details (leg, the other night, the merged 3-in-4 stretch) for that team', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    const own = document.querySelector('[data-testid="fatigue-team"] [data-night="2"]')!;
    fireEvent.mouseOver(own);
    expect(screen.getByTestId('tooltip').textContent).toBe(own.getAttribute('data-tip'));
    expect(own.getAttribute('data-tip')).toMatch(/^BOS — 2\/2 · [HA]{2} \(2nd night of a back-to-back\)\n/);
    fireEvent.mouseLeave(own.closest('.ck-root')!);
    expect(screen.queryByTestId('tooltip')).toBeNull();
    const opp = document.querySelector('[data-testid="fatigue-opp"] [data-tif]')!;
    expect(opp.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(opp);
    expect(screen.getByTestId('tooltip').textContent).toMatch(/\d+in\d+ · \d+(st|nd|rd|th): \d+ games in \d+ days \(/);
    expect(screen.getByTestId('tip-days')).toBeTruthy();
  });

  it('rest rows have no fatigue columns; the TV filter never changes the labels', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.LAL, showRest: true }} />);
    const rest = acrossMonths(data, TEAM.LAL, () => [...document.querySelectorAll('[data-rest]')].map((r) => r.querySelectorAll('.ck-fat, .ck-fx, .ck-b2b-label, .ck-tif, .ck-b2b-opp').length));
    expect(rest.length).toBeGreaterThan(60);
    for (const n of rest) expect(n).toBe(0);
    const labels = (tvOnly: boolean) => new Map(acrossMonths(data, TEAM.LAL, () => [...document.querySelectorAll('[data-game-id]')].map((r) => [r.getAttribute('data-game-id'), [...r.querySelectorAll('.ck-fat')].map((c) => c.textContent).join('|')] as const), tvOnly));
    const all = labels(false);
    fireEvent.click(screen.getByLabelText('TV games only'));
    const tv = labels(true);
    expect(tv.size).toBeLessThan(all.size);
    for (const [id, text] of tv) expect(text).toBe(all.get(id));
  });

  it('narrower than the 1080 px column (tablet, phone): no columns, B2B labels among the tags as before, no chips', () => {
    for (const size of [NARROW, { width: 390, height: 800 }]) {
      render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
      const n = (sel: string) => acrossMonths(data, TEAM.BOS, () => [document.querySelectorAll(sel).length]).reduce((a, b) => a + b, 0);
      expect(n('.ck-fat, .ck-fx, .ck-tif, .ck-b2b-opp')).toBe(0);
      expect(n('.ck-tags .ck-b2b-label')).toBeGreaterThan(5);
      // no opponent component here, so the opponent's 2nd night keeps its dot (round 7, 1.4)
      expect(n('.ck-opp .ck-b2b-mark')).toBeGreaterThan(5);
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
        const want = g ? expected(TEAM.LAL, g).chip : '';
        const chip = cell.querySelector('[data-testid="tif"]');
        // round 7 (1.3): the merged chip "4in6 · 2nd", as in the Fatigue component (was the short "3in4·2nd")
        expect(chip?.textContent ?? '', `${cell.dataset.date}`).toBe(want);
        if (chip) {
          expect(chip.getAttribute('data-tip')).toMatch(new RegExp(`^${want}: \\d+ games in \\d+ days \\(.+\\), tonight the \\d+(st|nd|rd|th)$`));
          expect(chip.getAttribute('data-tip-days')).toMatch(/^(\d{4}-\d\d-\d\d:[grt] ?)+$/);
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

  it('the scale probe holds the widest merged chip of the season ("7in11 · 2nd")', () => {
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
    expect(new Set(seen)).toEqual(new Set(['7in11 · 2nd']));
    // and that is the longest chip of the season (every stretch of all 30 teams)
    const all = [...TEAM_BY_ID.keys()].flatMap((t) => [...stretchOf(t).values()].map(([n, d, k]) => `${n}in${d} · ${ord(k)}`));
    expect(Math.max(...all.map((c) => c.length))).toBe('7in11 · 2nd'.length);
    expect(TEAM_BY_ID.size).toBe(30);
  });
});
