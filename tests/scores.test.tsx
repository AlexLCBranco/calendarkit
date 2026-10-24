// @vitest-environment jsdom
// Final scores in every view, for games with status final in the snapshot: League List rows ("BOS 113 @ DET 121"),
// Team Calendar cells, the league week view (score in the logo's slot, no TV pill; upcoming lines unchanged) and the
// Team List. Winner's score and tricode bright and bold, loser's muted. Phones keep the league/calendar views as before.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { hasNationalTv, teamGames } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const PHONE = { width: 360, height: 700 };
const finals = data.games.filter((g) => g.status === 'final');
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
const card = (root: ParentNode, id: string) => root.querySelector(`.ck-card[data-game-id="${id}"]`)!;
const won = (g: (typeof finals)[number], side: 'home' | 'away') => (side === 'home' ? g.homeTeam.score > g.awayTeam.score : g.awayTeam.score > g.homeTeam.score);

it('the fixture has final games to check (regular season, Oct 20–22)', () => {
  expect(finals.length).toBeGreaterThanOrEqual(15);
});

describe('League List', () => {
  it('every final game: "AWAY a @ HOME h", winner bright and bold, loser muted (score and tricode)', () => {
    for (const date of new Set(finals.map((g) => g.dateEt))) {
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date }} />).container;
      for (const g of finals.filter((x) => x.dateEt === date)) {
        const c = card(el, g.gameId);
        expect(text(c.querySelector('.ck-matchup')!), g.gameId).toBe(`${g.awayTeam.teamTricode} ${g.awayTeam.score} @ ${g.homeTeam.teamTricode} ${g.homeTeam.score}`);
        const scores = [...c.querySelectorAll('.ck-score')];
        expect(scores.map((s) => [s.textContent, s.classList.contains('ck-score-win')])).toEqual([
          [String(g.awayTeam.score), won(g, 'away')],
          [String(g.homeTeam.score), won(g, 'home')],
        ]);
        expect([...c.querySelectorAll('.ck-team')].map((t) => t.classList.contains('ck-loss'))).toEqual([!won(g, 'away'), !won(g, 'home')]);
        expect(c.getAttribute('aria-label')).toContain(`final ${g.awayTeam.teamTricode} ${g.awayTeam.score}, ${g.homeTeam.teamTricode} ${g.homeTeam.score}`);
      }
      // the day's games that aren't final: no score
      for (const g of data.byDate.get(date)!.filter((x) => x.status !== 'final')) expect(card(el, g.gameId).querySelector('.ck-score')).toBeNull();
      cleanup();
    }
  });

  it('phones: no scores (phone rows unchanged)', () => {
    const el = render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ date: '2026-10-21' }} />).container;
    expect(el.querySelector('.ck-score')).toBeNull();
  });
});

describe('Team Calendar', () => {
  it('every team, every final game: "TEAM s vs/@ OPP o" in its cell, winner highlighted', () => {
    let n = 0;
    for (const t of TEAMS) {
      const games = teamGames(data, t.id).filter((g) => g.status === 'final');
      if (!games.length) continue;
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: t.id }} />).container;
      for (const g of games) {
        const home = g.homeTeam.teamId === t.id;
        const [me, opp] = home ? [g.homeTeam, g.awayTeam] : [g.awayTeam, g.homeTeam];
        const cell = el.querySelector(`[data-date="${g.dateEt}"]`)!;
        expect(text(cell.querySelector('.ck-matchup')!), `${t.tricode} ${g.dateEt}`).toBe(`${me.teamTricode} ${me.score} ${home ? 'vs' : '@'} ${opp.teamTricode} ${opp.score}`);
        expect([...cell.querySelectorAll('.ck-score')].map((s) => s.classList.contains('ck-score-win'))).toEqual([me.score > opp.score, opp.score > me.score]);
        n++;
      }
      // games not final: no score
      for (const g of teamGames(data, t.id).filter((g) => g.status !== 'final' && g.dateEt.startsWith('2026-10'))) expect(el.querySelector(`[data-date="${g.dateEt}"] .ck-score`)).toBeNull();
      cleanup();
    }
    expect(n).toBe(2 * finals.length);
  });

  it('phones: cells unchanged (no score)', () => {
    const el = render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAMS.find((t) => t.tricode === 'BOS')!.id }} />).container;
    expect(el.querySelector('.ck-score')).toBeNull();
  });
});

describe('League week view (1 and 2 weeks)', () => {
  for (const weeks of [1, 2] as const) {
    it(`${weeks} week(s): final lines show "a AWAY @ h HOME" with the score in the logo slot and no TV pill; upcoming lines unchanged`, () => {
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-10-20', weeks }} />).container;
      for (const g of finals) {
        const line = el.querySelector(`.ck-month-game[data-game-id="${g.gameId}"]`)!;
        expect(line.querySelectorAll('img'), g.gameId).toHaveLength(0);
        expect([...line.children].map((c) => c.textContent!.trim())).toEqual([String(g.awayTeam.score), g.awayTeam.teamTricode, '@', String(g.homeTeam.score), g.homeTeam.teamTricode, '']);
        expect([...line.querySelectorAll('.ck-mscore')].map((s) => s.classList.contains('ck-score-win'))).toEqual([won(g, 'away'), won(g, 'home')]);
        expect([...line.querySelectorAll('.ck-mtri')].map((s) => s.classList.contains('ck-loss'))).toEqual([!won(g, 'away'), !won(g, 'home')]);
        expect(line.querySelector('.ck-tv-pill')).toBeNull();
        expect(line.querySelector('.ck-tv-slot')).not.toBeNull(); // the TV column stays reserved
        expect(line.getAttribute('aria-label')).toContain(`final ${g.awayTeam.score}–${g.homeTeam.score}`);
      }
      const upcoming = [...el.querySelectorAll('.ck-month-game')].filter((l) => !finals.some((g) => g.gameId === l.getAttribute('data-game-id')));
      expect(upcoming.length).toBeGreaterThan(10);
      for (const l of upcoming) {
        const g = data.games.find((x) => x.gameId === l.getAttribute('data-game-id'))!;
        expect(l.querySelector('.ck-mscore')).toBeNull();
        expect(l.querySelectorAll('img')).toHaveLength([g.awayTeam, g.homeTeam].filter((t) => t.teamId).length);
        expect(!!l.querySelector('.ck-tv-pill')).toBe(hasNationalTv(g));
      }
    });
  }
});

describe('Team List', () => {
  it('loser\'s tricode muted, winner\'s not (scores as before)', () => {
    const bos = TEAMS.find((t) => t.tricode === 'BOS')!.id;
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: bos }} />).container;
    const g = teamGames(data, bos).find((x) => x.status === 'final')!; // Oct 20: BOS 113 @ DET 121
    const c = card(el, g.gameId);
    expect([...c.querySelectorAll('.ck-team')].map((t) => [t.textContent, t.classList.contains('ck-loss')])).toEqual([
      ['BOS', true],
      ['DET', false],
    ]);
  });
});
