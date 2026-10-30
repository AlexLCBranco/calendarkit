// @vitest-environment jsdom
// Fatigue on the tricodes in the league views (round 4, item 6): week view and League List. Replaces the week view's
// B2B dot and the League List's "B2B" badge. Filled = 2nd night of a back-to-back, outline = 1st night, ✈ = metro
// change between the nights, purple underline = in a 3-in-4 set; a tooltip per team (leg, code, both games, travel,
// every set, record going in; "rested" otherwise). Legend under the week grid and the League List.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { leagueFatigue } from '../src/data/fatigue';
import { addDays, teamGames } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LEGEND = '■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4';
/** Views with the Fatigue component (round 5): League List (desktop) and the 1-week view. */
const LEGEND_FX = 'B2B back-to-back:  home  away, earlier night first, tonight solid · 3in4 3 games in 4 nights · ■ 2nd night · ▢ 1st night';
/** Metro of an arena city, written out here (the app's table is src/data/metro.ts). */
const metro = (city: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' })[city] ?? city;

/** Worked out here from dates only: nights, plane, 3-in-4 position per team game. */
function expected(teamId: number) {
  const games = teamGames(data, teamId);
  const out = new Map<string, { nights: number[]; travels: boolean; tif: number }>();
  for (const g of games) out.set(g.gameId, { nights: [], travels: false, tif: 0 });
  games.forEach((g, i) => {
    const next = games[i + 1];
    if (next && addDays(g.dateEt, 1) === next.dateEt) {
      out.get(g.gameId)!.nights.push(1);
      out.get(next.gameId)!.nights.push(2);
      const a = String(g.arenaCity ?? '').trim();
      const b = String(next.arenaCity ?? '').trim();
      if (a && b && metro(a) !== metro(b)) out.get(g.gameId)!.travels = out.get(next.gameId)!.travels = true;
    }
    const third = games[i + 2];
    if (third && (Date.parse(third.dateEt) - Date.parse(g.dateEt)) / 86_400_000 <= 3)
      [g, games[i + 1]!, third].forEach((x, k) => (out.get(x.gameId)!.tif = Math.max(out.get(x.gameId)!.tif, k + 1)));
  });
  return out;
}

describe('leagueFatigue (model)', () => {
  it('every team, every game: nights, plane and 3-in-4 position = an independent count; tooltip parts; cached', () => {
    const f = leagueFatigue(data);
    expect(f).toBe(leagueFatigue(data));
    let b2b = 0;
    let rested = 0;
    for (const t of TEAMS) {
      for (const [id, want] of expected(t.id)) {
        const got = f.get(id)!.get(t.id)!;
        expect({ nights: [...got.nights].sort(), travels: got.travels, tif: got.tif?.position ?? 0 }, `${t.tricode} ${id}`).toEqual({ ...want, nights: [...want.nights].sort() });
        for (const n of got.nights) expect(got.tip).toContain(`${t.tricode} — ${n}/2 · `);
        if (got.nights.length) {
          b2b++;
          const p = got.pairs[0]!;
          // both games with dates and opponents, home/away
          expect(got.tip).toMatch(/\n[A-Z][a-z]{2} \d{1,2} (vs|@) [A-Z]{3} \((home|away)\) → [A-Z][a-z]{2} \d{1,2} (vs|@) [A-Z]{3} \((home|away)\)/);
          expect(got.tip.includes(`Travels ${p.fromCity} → ${p.toCity}`)).toBe(got.travels);
        }
        if (got.tif) expect(got.tip).toContain('3 games in 4 days — ');
        if (!got.nights.length && !got.tif) {
          rested++;
          expect(got.tip.split('\n')[0]).toBe(`${t.tricode} — rested`);
        }
      }
    }
    expect(b2b).toBeGreaterThan(400);
    expect(rested).toBeGreaterThan(400);
  });

  it('record going in on the tooltip (known on each team\'s first game: 0-0)', () => {
    const g = data.games.find((x) => x.gameType === 'regular')!;
    expect(leagueFatigue(data).get(g.gameId)!.get(g.homeTeam.teamId)!.tip).toContain('Record going in: 0-0');
  });
});

/** Every tricode mark in a container: [tricode, fill, outline, plane, tif position, tip]. */
const marks = (root: ParentNode, sel: string) =>
  [...root.querySelectorAll<HTMLElement>(sel)].map((e) => ({
    tri: e.textContent!.replace('✈', '').trim(),
    fill: e.classList.contains('ck-fm-n2'),
    outline: e.classList.contains('ck-fm-n1'),
    plane: !!e.querySelector('.ck-fm-plane'),
    tif: Number(e.dataset.tif ?? 0),
    tip: e.dataset.tip,
    focus: e.tabIndex,
  }));

function check(root: ParentNode, sel: string, ids: string[], planes = true) {
  const f = leagueFatigue(data);
  let n = 0;
  for (const id of ids) {
    const g = data.games.find((x) => x.gameId === id)!;
    const got = marks(root.querySelector(`[data-game-id="${id}"]`)!, sel);
    expect(got.map((m) => m.tri), id).toEqual([g.awayTeam.teamTricode, g.homeTeam.teamTricode]);
    [g.awayTeam, g.homeTeam].forEach((t, i) => {
      const want = f.get(id)!.get(t.teamId)!;
      expect(got[i], `${id} ${t.teamTricode}`).toEqual({ tri: t.teamTricode, fill: want.nights.includes(2), outline: want.nights.includes(1) && !want.nights.includes(2), plane: planes && want.travels, tif: want.tif?.position ?? 0, tip: want.tip, focus: 0 });
      n++;
    });
  }
  return n;
}

describe('week view', () => {
  it('every line of two weeks: marks on both tricodes, tooltip per team; no B2B dot; legend under the grid', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-01', weeks: 2 }} />).container;
    const ids = [...el.querySelectorAll<HTMLElement>('.ck-month-game')].map((l) => l.dataset.gameId!);
    expect(ids.length).toBeGreaterThan(80);
    expect(check(el, '.ck-fm', ids)).toBe(2 * ids.length);
    expect(el.querySelector('.ck-b2b-mark')).toBeNull();
    expect(el.querySelectorAll('.ck-month-game .ck-fm-n2').length).toBeGreaterThan(5);
    expect(el.querySelector('[data-testid="fatigue-legend"]')?.textContent).toBe(LEGEND);
  });
});

describe('Fatigue component (round 5)', () => {
  const icons = (fx: Element) => [...fx.querySelectorAll('.ck-fx-icon')].map((i) => `${i.getAttribute('data-kind')}${i.classList.contains('ck-fx-tonight') ? '!' : ''}`);
  const row = (el: Element, id: string) => el.querySelector(`[data-testid="league-list"] .ck-card[data-game-id="${id}"]`)!;

  it('League List (desktop): [rec] [away fatigue] [teams] [home fatigue] [rec] on every row, each team its own', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-02' }} />).container;
    const f = leagueFatigue(data);
    const cards = [...el.querySelectorAll<HTMLElement>('[data-testid="league-list"] .ck-card')];
    expect(cards.length).toBeGreaterThan(15);
    let shown = 0;
    for (const c of cards) {
      const g = data.games.find((x) => x.gameId === c.dataset.gameId)!;
      const m = c.querySelector('.ck-matchup')!;
      expect([...m.children].map((x) => x.className.split(' ')[0]), g.gameId).toEqual(['ck-rec', 'ck-fx', 'ck-teams', 'ck-fx', 'ck-rec', ...(m.querySelector('.ck-ot') ? ['ck-ot'] : [])]);
      const fxs = [...m.querySelectorAll(':scope > .ck-fx')];
      [g.awayTeam, g.homeTeam].forEach((t, i) => {
        const fx = fxs[i]!;
        const want = f.get(g.gameId)!.get(t.teamId)!;
        const pair = want.pairs[0];
        expect(fx.classList.contains('ck-fx-empty'), `${g.gameId} ${i}`).toBe(!pair && !want.tif);
        if (fx.classList.contains('ck-fx-empty')) return;
        shown++;
        // badge next to the logo: the away column mirrored, the home column not
        expect(fx.classList.contains('ck-fx-mirror')).toBe(i === 0);
        expect(fx.querySelector('.ck-fx-b2b')?.textContent ?? '').toBe(pair ? 'B2B' : '');
        expect(icons(fx)).toEqual(pair ? [...pair.code].map((c, k) => `${c === 'H' ? 'home' : 'away'}${want.nights[0] === k + 1 ? '!' : ''}`) : []);
        expect(fx.querySelector('.ck-fx-chip')?.textContent ?? '').toBe(want.tif ? '3in4' : '');
        expect(fx.getAttribute('data-tip')).toBe(want.tip);
      });
      // the tricode marks stay (yellow), without their plane (the component's plane means "away")
      expect(c.querySelector('.ck-fm-plane')).toBeNull();
    }
    expect(shown).toBeGreaterThan(10);
  });

  it('a known HA 2nd night (MIA @ CHA, Oct 24, 2026): B2B, faded house left, solid plane right; the mirrored home column keeps time order', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-10-24' }} />).container;
    const away = row(el, '0022600104').querySelector('.ck-matchup > .ck-fx')!;
    expect([away.getAttribute('data-code'), away.getAttribute('data-night')]).toEqual(['HA', '2']);
    expect(away.querySelector('.ck-fx-b2b')!.textContent).toBe('B2B');
    expect(icons(away)).toEqual(['home', 'away!']);
    // the home (mirrored) column: a team on an HA 2nd night is always away, so the home column is checked with the same
    // pattern from the other side — AH 2nd night (WAS @ CHI, CHI: faded plane left, solid house right) …
    const home = row(el, '0022600108').querySelectorAll('.ck-matchup > .ck-fx')[1]!;
    expect([home.getAttribute('data-code'), home.getAttribute('data-night')]).toEqual(['AH', '2']);
    expect(icons(home)).toEqual(['away', 'home!']);
    cleanup();
    // … and HA 1st night at home (CHI @ MIL, Oct 23, MIL: solid house left, faded plane right)
    const el2 = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-10-23' }} />).container;
    const home1 = row(el2, '0022600099').querySelectorAll('.ck-matchup > .ck-fx')[1]!;
    expect([home1.getAttribute('data-code'), home1.getAttribute('data-night')]).toEqual(['HA', '1']);
    expect(icons(home1)).toEqual(['home!', 'away']);
  });

  it('week view: compact components under the 1-week lines whose teams have fatigue; none in 2-week mode', () => {
    const f = leagueFatigue(data);
    const has = (id: string, t: number) => {
      const x = f.get(id)!.get(t)!;
      return x.nights.length > 0 || !!x.tif;
    };
    const one = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-01', weeks: 1 }} />).container;
    let rows = 0;
    for (const l of one.querySelectorAll<HTMLElement>('.ck-month-game')) {
      const g = data.games.find((x) => x.gameId === l.dataset.gameId)!;
      const want = has(g.gameId, g.awayTeam.teamId) || has(g.gameId, g.homeTeam.teamId);
      const fx = [...l.querySelectorAll('.ck-mfx .ck-fx')];
      expect(fx.length, g.gameId).toBe(want ? 2 : 0);
      if (!want) continue;
      rows++;
      expect(fx.map((x) => [x.classList.contains('ck-fx-compact'), x.classList.contains('ck-fx-mirror'), x.classList.contains('ck-fx-empty')])).toEqual([
        [true, false, !has(g.gameId, g.awayTeam.teamId)],
        [true, true, !has(g.gameId, g.homeTeam.teamId)],
      ]);
      expect(l.querySelector('.ck-fm-plane')).toBeNull();
    }
    expect(rows).toBeGreaterThan(20);
    expect(one.querySelector('[data-testid="fatigue-legend"]')?.textContent).toBe(LEGEND_FX);
    cleanup();
    const two = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-01', weeks: 2 }} />).container;
    expect(two.querySelectorAll('.ck-fx')).toHaveLength(0);
    expect(two.querySelectorAll('.ck-fm-plane').length).toBeGreaterThan(0);
  });
});

describe('League List', () => {
  it('every rendered row: marks on both tricodes, tooltip per team; no "B2B" badge; legend under the list', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-02' }} />).container;
    const ids = [...el.querySelectorAll<HTMLElement>('[data-testid="league-list"] .ck-card')].map((c) => c.dataset.gameId!);
    expect(ids.length).toBeGreaterThan(15);
    expect(check(el, '.ck-matchup .ck-fm', ids, false)).toBe(2 * ids.length);
    expect(el.querySelector('.ck-b2b')).toBeNull();
    expect(el.querySelector('[data-testid="fatigue-legend"]')?.textContent).toBe(LEGEND_FX);
  });

  it('team views keep their own marks (labels, opponent dot), no league marks', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAMS[0]!.id }} />).container;
    expect(el.querySelector('.ck-fm')).toBeNull();
    expect(el.querySelector('[data-testid="fatigue-legend"]')).toBeNull();
  });
});
