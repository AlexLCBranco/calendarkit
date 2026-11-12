// @vitest-environment jsdom
// Cup standings: each team row's 4 group games (src/data/cup.ts cupSlots, CupView's slots) — date order, the
// opponent, W / L and the differential from the final score, upcoming games muted with no result, teams with 0, 2 and 4
// games played; and the real feed saved 2026-10-31.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import cupFeed from './fixtures/cup-2026-10-31.json';
import CupView from '../src/components/CupView';
import { CUP_GROUP_TEAMS, cupSlots, cupStandings, LAST_SEASON_WINS } from '../src/data/cup';
import { parseSchedule, type ScheduleGame } from '../src/shared/nba-schedule/parse';
import { TEAMS } from '../src/data/teams';
import { dataOf, game } from './synthetic';

afterEach(cleanup);

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const GROUP_OF = Object.fromEntries(Object.entries(CUP_GROUP_TEAMS).flatMap(([g, ts]) => ts.map((t) => [t, g])));

/** A group game `away` @ `home` on ET `date`, tipping off at `hour`:00 UTC that day; final when `score` = [away, home]. */
const g = (away: string, home: string, date: string, score?: [number, number], hour = 23, ot = false): ScheduleGame =>
  game({
    date,
    utc: `${date}T${String(hour).padStart(2, '0')}:00:00Z`,
    home: ID[home],
    away: ID[away],
    subtype: 'in-season',
    subLabel: GROUP_OF[home],
    final: score,
    raw: ot ? { gameStatusText: 'Final/OT' } : {},
  });

// West A round robin (10 games): DEN has played all 4, DAL 2 of 4. West B: MIN has played none. Feed order shuffled.
const GAMES = [
  g('DAL', 'DEN', '2026-11-13', [99, 121]), // DEN W +22 (home)
  g('UTA', 'DAL', '2026-11-24'),
  g('DEN', 'UTA', '2026-11-20', [128, 116], 23, true), // DEN W +12 in OT (away)
  g('DEN', 'PHX', '2026-11-06', [101, 112], 22), // DEN L −11 (away), later the same night as PHX @ DAL
  g('PHX', 'DAL', '2026-11-06', [104, 109], 20), // DAL W +5
  g('DEN', 'HOU', '2026-10-31', [118, 111]), // DEN W +7 (away)
  g('HOU', 'UTA', '2026-11-14'),
  g('DAL', 'HOU', '2026-11-27'),
  g('PHX', 'UTA', '2026-11-21'),
  g('HOU', 'PHX', '2026-11-25'),
  g('LAC', 'MIN', '2026-11-27'),
  g('MIN', 'OKC', '2026-11-07'),
  g('MIN', 'MEM', '2026-11-21'),
  g('NOP', 'MIN', '2026-11-14'),
];

describe('cupSlots', () => {
  const slots = cupSlots(GAMES);
  const view = (tri: string) => slots.get(ID[tri]!)!.map((s) => [s.opponent, s.home ? 'home' : 'away', s.played, s.win, s.diff]);

  it('4 played: date then tip-off order (whatever the feed order), opponent, home/away, W / L, differential', () => {
    expect(view('DEN')).toEqual([
      ['HOU', 'away', true, true, 7],
      ['PHX', 'away', true, false, -11],
      ['DAL', 'home', true, true, 22],
      ['UTA', 'away', true, true, 0], // 128-116 in OT: 0 to the differential (NBA.com Cup rules)
    ]);
  });

  it('2 played, 2 to come: no result or differential on the games to come', () => {
    expect(view('DAL')).toEqual([
      ['PHX', 'home', true, true, 5],
      ['DEN', 'away', true, false, -22],
      ['UTA', 'home', false, undefined, undefined],
      ['HOU', 'away', false, undefined, undefined],
    ]);
  });

  it('0 played: four upcoming slots', () => {
    expect(view('MIN')).toEqual([
      ['OKC', 'away', false, undefined, undefined],
      ['NOP', 'home', false, undefined, undefined],
      ['MEM', 'away', false, undefined, undefined],
      ['LAC', 'home', false, undefined, undefined],
    ]);
  });

  it('the full final score for the tooltip, away team first, OT from the feed status', () => {
    const den = slots.get(ID.DEN!)!;
    expect(den.map((s) => s.final)).toEqual(['DEN 118 @ HOU 111 · Final', 'DEN 101 @ PHX 112 · Final', 'DAL 99 @ DEN 121 · Final', 'DEN 128 @ UTA 116 · Final/OT']);
    expect(den[2]).toMatchObject({ score: 121, oppScore: 99 });
  });

  it('only games the standings count are "played": a final game outside group play dates is not', () => {
    const late = cupSlots([g('DEN', 'HOU', '2026-11-28', [100, 90])]);
    expect(late.get(ID.DEN!)![0]!.played).toBe(false);
    expect(late.get(ID.DEN!)![0]!.win).toBeUndefined();
  });

  it('the standings lines carry them, and W / L = the played slots', () => {
    const s = cupStandings(GAMES);
    for (const t of s.groups.flatMap((x) => x.teams)) {
      expect(t.slots).toEqual(slots.get(t.teamId) ?? []);
      expect([t.w, t.l]).toEqual([t.slots.filter((x) => x.win === true).length, t.slots.filter((x) => x.win === false).length]);
      expect(t.diff).toBe(t.slots.reduce((n, x) => n + (x.diff ?? 0), 0));
    }
  });

  it('real feed (2026-10-31): every team has 4 group games in date order, each the other side of its opponent’s slot', () => {
    const games = parseSchedule(cupFeed).games;
    const all = cupSlots(games);
    expect(all.size).toBe(30);
    for (const [teamId, list] of all) {
      expect(list).toHaveLength(4);
      const tri = TEAMS.find((t) => t.id === teamId)!.tricode;
      for (const s of list) {
        const other = all.get(ID[s.opponent]!)!.find((o) => o.gameId === s.gameId)!;
        expect([other.opponent, other.home, other.played]).toEqual([tri, !s.home, s.played]);
        if (s.played) expect([other.win, other.diff]).toEqual([!s.win, -s.diff!]);
      }
      const dates = list.map((s) => games.find((x) => x.gameId === s.gameId)!.dateEt);
      expect(dates).toEqual([...dates].sort());
    }
  });
});

describe('Cup standings rows: the slots on screen', () => {
  const rowOf = (tri: string) => document.querySelector<HTMLElement>(`.ck-cup-pill[data-team="${tri}"]`)!;
  const slotsOf = (tri: string) =>
    [...rowOf(tri).querySelectorAll<HTMLElement>('.ck-cup-slot')].map((e) => ({
      opp: e.querySelector('.ck-cup-slot-opp')!.textContent!.replace(e.querySelector('.ck-cup-slot-at')!.textContent!, ''),
      at: e.querySelector('.ck-cup-slot-at')!.textContent,
      res: e.querySelector('.ck-cup-slot-res')?.textContent ?? null,
      kind: e.classList.contains('ck-cup-slot-next') ? 'next' : e.classList.contains('ck-cup-slot-w') ? 'w' : e.classList.contains('ck-cup-slot-l') ? 'l' : '?',
      tip: e.dataset.tip ?? null,
    }));

  it('4 played: "@" / "vs" (round 21, item 5) and the opponent over W / L, the full final score in the tooltip; no differential', () => {
    render(<CupView data={dataOf(GAMES)} />);
    expect(slotsOf('DEN')).toEqual([
      { at: '@', opp: 'HOU', res: 'W', kind: 'w', tip: 'DEN 118 @ HOU 111 · Final' },
      { at: '@', opp: 'PHX', res: 'L', kind: 'l', tip: 'DEN 101 @ PHX 112 · Final' },
      { at: 'vs', opp: 'DAL', res: 'W', kind: 'w', tip: 'DAL 99 @ DEN 121 · Final' },
      { at: '@', opp: 'UTA', res: 'W', kind: 'w', tip: 'DEN 128 @ UTA 116 · Final/OT' },
    ]);
    expect(rowOf('DEN').querySelector('[data-testid="cup-slots"]')!.textContent).toBe('@HOUW@PHXLvsDALW@UTAW');
  });

  it('every square is its game page, in a new tab (round 21: no dead clicks)', () => {
    render(<CupView data={dataOf(GAMES)} gameLink={(game) => `https://hj.test/${game.gameId}`} />);
    const squares = [...rowOf('DAL').querySelectorAll<HTMLAnchorElement>('.ck-cup-slot')];
    expect(squares).toHaveLength(4);
    for (const a of squares) {
      expect(a.tagName).toBe('A');
      expect([a.target, a.rel]).toEqual(['_blank', 'noopener noreferrer']);
      expect(a.href).toBe(`https://hj.test/${a.dataset.gameId}`);
    }
  });

  it('2 played: two results, then two upcoming slots — opponent only, muted, no result, no tooltip', () => {
    render(<CupView data={dataOf(GAMES)} />);
    expect(slotsOf('DAL')).toEqual([
      { at: 'vs', opp: 'PHX', res: 'W', kind: 'w', tip: 'PHX 104 @ DAL 109 · Final' },
      { at: '@', opp: 'DEN', res: 'L', kind: 'l', tip: 'DAL 99 @ DEN 121 · Final' },
      { at: 'vs', opp: 'UTA', res: null, kind: 'next', tip: null },
      { at: '@', opp: 'HOU', res: null, kind: 'next', tip: null },
    ]);
    expect(rowOf('DAL').querySelector('.ck-cup-slot-next')!.getAttribute('aria-label')).toBe('vs UTA, not played yet');
  });

  it('0 played: four upcoming slots', () => {
    render(<CupView data={dataOf(GAMES)} />);
    expect(slotsOf('MIN')).toEqual([['@', 'OKC'], ['vs', 'NOP'], ['@', 'MEM'], ['vs', 'LAC']].map(([at, opp]) => ({ at, opp, res: null, kind: 'next', tip: null })));
  });

  it('"tied" moved under the rank marker, out of the name', () => {
    // a tie no rule breaks: no games, and MIN and OKC (West B) given the same 2025-26 wins
    const wins = LAST_SEASON_WINS as Record<string, number>;
    const old = wins.MIN!;
    wins.MIN = wins.OKC!;
    try {
      render(<CupView data={dataOf([])} />);
    } finally {
      wins.MIN = old;
    }
    const pill = rowOf('MIN');
    expect(pill.querySelector('.ck-cup-name')!.textContent).toBe('Minnesota Timberwolves');
    expect(pill.querySelector('.ck-cup-markcell .ck-cup-tied')!.textContent).toBe('tied');
  });

  it('real feed: every row has 4 slots and its W / L = its W and L slots', () => {
    render(<CupView data={dataOf(parseSchedule(cupFeed).games)} />);
    const pills = document.querySelectorAll<HTMLElement>('.ck-cup-pill');
    expect(pills).toHaveLength(30);
    for (const pill of pills) {
      const [w, l] = [...pill.querySelectorAll('.ck-cup-num')].map((n) => Number(n.textContent));
      expect(pill.querySelectorAll('.ck-cup-slot')).toHaveLength(4);
      expect(pill.querySelectorAll('.ck-cup-slot-w')).toHaveLength(w!);
      expect(pill.querySelectorAll('.ck-cup-slot-l')).toHaveLength(l!);
    }
  });
});
