// @vitest-environment jsdom
// Fatigue on the tricodes in the league views (round 4, item 6): week view and League List. Replaces the week view's
// B2B dot and the League List's "B2B" badge. Filled = 2nd night of a back-to-back, outline = 1st night, ✈ = metro
// change between the nights, purple underline = in a 3-in-4 set; a tooltip per team (leg, code, both games, travel,
// every set, record going in; "rested" otherwise). Legend under the week grid and the League List.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { leagueFatigue } from '../src/data/fatigue';
import { addDays, teamGames } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LEGEND = '■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4';
/** Views with the Fatigue component: League List (desktop) and the 1-week view. Round 6: the leg dot, the merged chip; no
 * tricode keys (the tricodes there have no yellow marks). */
const LEGEND_FX = 'B2B back-to-back, 1st night (again tomorrow) · B2B 2nd night (played yesterday) ·  home  away, earlier night first, tonight solid · 3in4 · 2nd 3 games in 4 days, tonight the 2nd';
/** gameId → "4in6 · 2nd" for a team, worked out here: sets chained while one starts inside the stretch (round 6). */
function stretches(teamId: number) {
  const games = teamGames(data, teamId);
  const isSet = (i: number) => i + 2 < games.length && (Date.parse(games[i + 2]!.dateEt) - Date.parse(games[i]!.dateEt)) / 86_400_000 <= 3;
  const out = new Map<string, string>();
  for (let i = 0; i < games.length; i++) {
    if (!isSet(i)) continue;
    let end = i + 2;
    for (let k = i + 1; k <= end; k++) if (isSet(k)) end = k + 2;
    const st = games.slice(i, end + 1);
    const days = (Date.parse(st.at(-1)!.dateEt) - Date.parse(st[0]!.dateEt)) / 86_400_000 + 1;
    st.forEach((g, k) => out.set(g.gameId, `${st.length}in${days} · ${['', '1st', '2nd', '3rd'][k + 1] ?? `${k + 1}th`}`));
    i = end;
  }
  return out;
}
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
        // round 6: the merged stretch, one line ("4in6 · 2nd: 4 games in 6 days (Oct 28 – Nov 2), tonight the 2nd"), and its days
        const chip = stretches(t.id).get(id);
        expect(!!got.tif, `${t.tricode} ${id} stretch`).toBe(!!chip);
        if (chip) {
          expect(got.tip).toContain(`${chip}: ${chip.split('in')[0]} games in `);
          expect(got.tip).not.toContain('3 games in 4 days — ');
          expect(got.days!.split(' ').filter((d) => d.endsWith(':t'))).toHaveLength(1);
        }
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

/** `component`: the view shows the Fatigue component — the tricodes then have no plane and no yellow fill / outline. */
function check(root: ParentNode, sel: string, ids: string[], component = false) {
  const f = leagueFatigue(data);
  let n = 0;
  for (const id of ids) {
    const g = data.games.find((x) => x.gameId === id)!;
    const got = marks(root.querySelector(`[data-game-id="${id}"]`)!, sel);
    expect(got.map((m) => m.tri), id).toEqual([g.awayTeam.teamTricode, g.homeTeam.teamTricode]);
    [g.awayTeam, g.homeTeam].forEach((t, i) => {
      const want = f.get(id)!.get(t.teamId)!;
      expect(got[i], `${id} ${t.teamTricode}`).toEqual({ tri: t.teamTricode, fill: !component && want.nights.includes(2), outline: !component && want.nights.includes(1) && !want.nights.includes(2), plane: !component && want.travels, tif: want.tif?.position ?? 0, tip: want.tip, focus: 0 });
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
        // round 6: the leg dot beside the first B (1st night) or the second B (2nd night), whichever column
        const badge = fx.querySelector('.ck-fx-b2b');
        if (pair) expect(badge!.firstChild === badge!.querySelector('.ck-fx-leg') ? 1 : badge!.lastChild === badge!.querySelector('.ck-fx-leg') ? 2 : 0, `${g.gameId} ${i} leg`).toBe(want.nights[0]);
        expect(icons(fx)).toEqual(pair ? [...pair.code].map((c, k) => `${c === 'H' ? 'home' : 'away'}${want.nights[0] === k + 1 ? '!' : ''}`) : []);
        expect(fx.querySelector('.ck-fx-chip')?.textContent ?? '').toBe(stretches(t.teamId).get(g.gameId) ?? '');
        expect(fx.getAttribute('data-tip')).toBe(want.tip);
      });
      // the tricode marks lose their plane (the component's plane means "away") and, round 6, their yellow fill / outline
      expect(c.querySelector('.ck-fm-plane, .ck-fm-n1, .ck-fm-n2')).toBeNull();
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
      expect(l.querySelector('.ck-fm-plane, .ck-fm-n1, .ck-fm-n2')).toBeNull();
      // compact chips: the stretch without tonight's place ("4in6"; the full chip doesn't fit two under a 1280 line)
      for (const [x, t] of [[fx[0]!, g.awayTeam], [fx[1]!, g.homeTeam]] as const) expect(x.querySelector('.ck-fx-chip')?.textContent ?? '').toBe(stretches(t.teamId).get(g.gameId)?.split(' · ')[0] ?? '');
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
    expect(check(el, '.ck-matchup .ck-fm', ids, true)).toBe(2 * ids.length);
    expect(el.querySelector('.ck-b2b')).toBeNull();
    expect(el.querySelector('[data-testid="fatigue-legend"]')?.textContent).toBe(LEGEND_FX);
  });

  it('team views keep their own marks (labels, opponent dot), no league marks', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAMS[0]!.id }} />).container;
    expect(el.querySelector('.ck-fm')).toBeNull();
    expect(el.querySelector('[data-testid="fatigue-legend"]')).toBeNull();
  });
});

describe('pop-up (round 6): the merged stretch and its day strip', () => {
  it('HOU on Oct 30, 2026: "4in6 · 2nd" chip; the pop-up has the stretch line, the record, and the days game, rest, TONIGHT, game, rest, game', () => {
    const HOU = TEAMS.find((t) => t.tricode === 'HOU')!.id;
    const g = data.games.find((x) => x.dateEt === '2026-10-30' && (x.homeTeam.teamId === HOU || x.awayTeam.teamId === HOU))!;
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-10-30' }} />).container;
    const fx = el.querySelectorAll(`[data-testid="league-list"] [data-game-id="${g.gameId}"] .ck-matchup > .ck-fx`)[g.homeTeam.teamId === HOU ? 1 : 0]!;
    expect(fx.querySelector('.ck-fx-chip')!.textContent).toBe('4in6 · 2nd');
    fireEvent.mouseOver(fx);
    const tip = screen.getByTestId('tooltip');
    expect(tip.textContent).toContain('4in6 · 2nd: 4 games in 6 days (Oct 28 – Nov 2), tonight the 2nd');
    expect(tip.textContent).not.toContain('3 games in 4 days — ');
    const cells = [...within(tip).getByTestId('tip-days').children];
    expect(cells.map((c) => c.getAttribute('data-kind'))).toEqual(['game', 'rest', 'tonight', 'game', 'rest', 'game']);
    expect(cells.map((c) => c.getAttribute('data-date'))).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(cells.map((c) => c.querySelector('.ck-tip-num')!.textContent)).toEqual(['Oct 28', '29', '30', '31', 'Nov 1', '2']);
    // the tricode's own pop-up (2-week view / tablets) is the same, strip included
    expect(el.querySelector(`[data-game-id="${g.gameId}"] .ck-fm[data-tip-days]`)).not.toBeNull();
    // the other pop-up lines stay: HOU on Oct 23 (2nd of its Oct 21–26 stretch), whose record going in is known (the
    // saved feed is from Oct 23, so Oct 30's isn't)
    const g23 = data.games.find((x) => x.dateEt === '2026-10-23' && (x.homeTeam.teamId === HOU || x.awayTeam.teamId === HOU))!;
    const t23 = leagueFatigue(data).get(g23.gameId)!.get(HOU)!;
    expect(t23.tip).toMatch(/\n4in6 · 2nd: 4 games in 6 days \(Oct 21 – Oct 26\), tonight the 2nd\n/);
    expect(t23.tip).toMatch(/\nRecord going in: \d+-\d+$/);
  });

  it('no strip for a team not in a 3-in-4 stretch', () => {
    // a team on a back-to-back but in no 3-in-4 set
    const f = leagueFatigue(data);
    const no = (id: string, t: number) => !!f.get(id)!.get(t)!.nights.length && !f.get(id)!.get(t)!.tif;
    const g = data.games.find((x) => x.dateEt >= '2026-10-23' && (no(x.gameId, x.awayTeam.teamId) || no(x.gameId, x.homeTeam.teamId)))!;
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: g.dateEt }} />).container;
    const plain = el.querySelectorAll<HTMLElement>(`[data-game-id="${g.gameId}"] .ck-matchup > .ck-fx`)[no(g.gameId, g.awayTeam.teamId) ? 0 : 1]!;
    expect(plain.querySelector('.ck-fx-chip')).toBeNull();
    fireEvent.mouseOver(plain);
    expect(screen.getByTestId('tooltip')).toBeTruthy();
    expect(screen.queryByTestId('tip-days')).toBeNull();
  });
});
