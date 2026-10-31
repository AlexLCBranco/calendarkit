// @vitest-environment jsdom
// Round 9, Part 2: Slate cards — the streak going in after each team's record (as of that game), national TV games
// outlined and tinted green (only they), and the hoopsjunkie link as a "↗" icon after the time (team names no link).
// Expected streaks are worked out here from the scores, independently of model.ts.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { SlateView } from '../src/components/SlateView';
import { gameLinkUrl } from '../src/config';
import { nationalTv } from '../src/data/model';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { dataOf, game, TEAM } from './synthetic';
import { data, feed } from './feed';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const DESKTOP = { width: 1280, height: 900 };
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card')];

/** A team's streak going into `g`: the run of equal results over its regular-season games final before `g`. */
function streakInto(games: ScheduleGame[], teamId: number, g: ScheduleGame): string {
  if (g.gameType !== 'regular') return '';
  const mine = games.filter((x) => x.gameType === 'regular' && (x.homeTeam.teamId === teamId || x.awayTeam.teamId === teamId)).sort((a, b) => (a.startTimeUtc ?? a.dateEt).localeCompare(b.startTimeUtc ?? b.dateEt));
  const before = mine.slice(0, mine.indexOf(g));
  // the record must be known: every earlier game final
  if (before.some((x) => x.status !== 'final')) return '';
  const results = before.map((x) => {
    const own = x.homeTeam.teamId === teamId ? x.homeTeam.score : x.awayTeam.score;
    const opp = x.homeTeam.teamId === teamId ? x.awayTeam.score : x.homeTeam.score;
    return own > opp ? 'W' : 'L';
  });
  if (!results.length) return '';
  let n = 0;
  while (n < results.length && results[results.length - 1 - n] === results.at(-1)) n++;
  return `${results.at(-1)}${n}`;
}

const streaksOn = () =>
  cards().flatMap((c) => [...c.querySelectorAll<HTMLElement>('.ck-slate-row')].map((r) => `${c.dataset.gameId} ${r.dataset.side} ${r.querySelector('[data-testid="slate-streak"]')!.textContent}`));

describe('streak going in', () => {
  // BOS: W W L (Nov 1–3), then Nov 5 at NYK; NYK: L (Nov 1), W (Nov 3) …
  const games = [
    game({ id: '0022600001', date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
    game({ id: '0022600002', date: '2026-11-02', utc: '2026-11-02T23:00:00Z', home: TEAM.MIA, away: TEAM.BOS, final: [120, 101] }),
    game({ id: '0022600003', date: '2026-11-03', utc: '2026-11-03T23:00:00Z', home: TEAM.BOS, away: TEAM.LAL, final: [115, 99] }),
    game({ id: '0022600004', date: '2026-11-03', utc: '2026-11-04T00:00:00Z', home: TEAM.NYK, away: TEAM.DEN, final: [90, 95] }),
    game({ id: '0022600005', date: '2026-11-05', utc: '2026-11-05T23:00:00Z', home: TEAM.NYK, away: TEAM.BOS }),
    game({ id: '0022600006', date: '2026-11-05', utc: '2026-11-06T00:00:00Z', home: TEAM.LAL, away: TEAM.MIA }),
  ];
  const d = dataOf(games);

  it('each team: "3-2  W2"-style, as of that game; none on a first game; green W / red L with the Team List tooltip', () => {
    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']) {
      render(<SlateView data={d} date={date} tvOnly={false} timeZone="UTC" />);
      for (const c of cards()) {
        const g = games.find((x) => x.gameId === c.dataset.gameId)!;
        for (const [side, t] of [['away', g.awayTeam], ['home', g.homeTeam]] as const) {
          const s = c.querySelector<HTMLElement>(`.ck-slate-row[data-side="${side}"] [data-testid="slate-streak"]`)!;
          const want = streakInto(games, t.teamId, g);
          expect(s.textContent, `${date} ${side}`).toBe(want);
          expect(s.classList.contains('ck-streak-w'), `${date} ${side} green`).toBe(want.startsWith('W'));
          expect(s.classList.contains('ck-streak-l'), `${date} ${side} red`).toBe(want.startsWith('L'));
          if (want) expect(s.dataset.tip).toMatch(new RegExp(`^${t.teamTricode}: Game \\d+, record \\d+-\\d+ going in, on a ${want.slice(1)}-game ${want[0] === 'W' ? 'winning' : 'losing'} streak$`));
          else expect(s.dataset.tip).toBeUndefined();
        }
      }
      cleanup();
    }
  });

  it('a past night shows that night’s streaks, not today’s', () => {
    render(<SlateView data={d} date="2026-11-03" tvOnly={false} timeZone="UTC" />);
    const nov3 = streaksOn();
    cleanup();
    render(<SlateView data={d} date="2026-11-05" tvOnly={false} timeZone="UTC" />);
    const nov5 = streaksOn();
    // BOS beat NYK (Nov 1) and won at MIA (Nov 2): W2 going into Nov 3; lost to LAL there: L1 going into Nov 5
    expect(nov3).toContain('0022600003 home W2');
    expect(nov5).toContain('0022600005 away L1');
  });

  it('none where the record is unknown (an earlier game not final) or for a Cup Final / play-off game', () => {
    const open = [
      game({ id: '0022600001', date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
      game({ id: '0022600002', date: '2026-11-02', utc: '2026-11-02T23:00:00Z', home: TEAM.BOS, away: TEAM.MIA }), // not final
      game({ id: '0022600003', date: '2026-11-03', utc: '2026-11-03T23:00:00Z', home: TEAM.NYK, away: TEAM.BOS }),
      game({ id: '0062600001', date: '2026-11-04', utc: '2026-11-04T23:00:00Z', home: TEAM.MIA, away: TEAM.NYK }),
    ];
    const d2 = dataOf(open);
    render(<SlateView data={d2} date="2026-11-03" tvOnly={false} timeZone="UTC" />);
    const bos = cards()[0]!.querySelector('.ck-slate-row[data-side="away"]')!;
    expect(bos.querySelector('.ck-slate-rec')!.textContent).toBe('');
    expect(bos.querySelector('[data-testid="slate-streak"]')!.textContent).toBe('');
    cleanup();
    render(<SlateView data={d2} date="2026-11-04" tvOnly={false} timeZone="UTC" />);
    for (const s of document.querySelectorAll('[data-testid="slate-streak"]')) expect(s.textContent).toBe('');
  });

  it('real feed: every card of every day = the streak worked out from the scores', () => {
    const real = feed.games.filter((g) => /^00[2456]/.test(g.gameId));
    let n = 0;
    for (const date of [...new Set(real.map((g) => g.dateEt))].sort().slice(0, 12)) {
      render(<SlateView data={data} date={date} tvOnly={false} timeZone="UTC" />);
      for (const c of cards()) {
        const g = real.find((x) => x.gameId === c.dataset.gameId)!;
        for (const [side, t] of [['away', g.awayTeam], ['home', g.homeTeam]] as const) {
          const want = t.teamId ? streakInto(real, t.teamId, g) : '';
          expect(c.querySelector(`.ck-slate-row[data-side="${side}"] [data-testid="slate-streak"]`)!.textContent, `${date} ${g.gameId} ${side}`).toBe(want);
          if (want) n++;
        }
      }
      cleanup();
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe('national TV games highlighted', () => {
  it('exactly the cards with a national broadcaster (NBA TV alone is not one) get the green outline class', () => {
    let tv = 0;
    let other = 0;
    for (const date of ['2026-10-27', '2026-11-02', '2026-11-15', '2026-12-25']) {
      render(<SlateView data={data} date={date} tvOnly={false} timeZone="UTC" />);
      for (const c of cards()) {
        const g = feed.games.find((x) => x.gameId === c.dataset.gameId)!;
        const want = nationalTv(g).length > 0;
        expect(c.classList.contains('ck-slate-tv'), `${date} ${g.gameId}`).toBe(want);
        if (want) tv++;
        else other++;
      }
      cleanup();
    }
    expect(tv).toBeGreaterThan(3);
    expect(other).toBeGreaterThan(3);
  });
});

describe('hoopsjunkie link as an icon', () => {
  it('"↗" right after the start time (or "Final"), tooltip "Open on hoopsjunkie", new tab, excluded from copies; no link around the names', () => {
    render(<CalendarView data={data} size={DESKTOP} now={NOW} timeZone="UTC" gameLink={(g) => gameLinkUrl(g)} initial={{ mode: 'league', layout: 'slate' }} />);
    expect(cards().length).toBeGreaterThan(3);
    for (const c of cards()) {
      const links = c.querySelectorAll('a');
      expect(links).toHaveLength(1);
      const a = links[0]!;
      expect(a.textContent!.trim()).toBe('↗');
      expect(a.getAttribute('title')).toBe('Open on hoopsjunkie');
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('data-capture-exclude')).toBe('true');
      expect(a.closest('.ck-slate-head')).toBeTruthy();
      expect(a.previousElementSibling!.matches('[data-testid="tipoff"], [data-testid="slate-status"]')).toBe(true);
      const g = feed.games.find((x) => x.gameId === c.dataset.gameId)!;
      expect(a.getAttribute('href')).toBe(gameLinkUrl(g));
      expect(c.querySelector('.ck-slate-teams')!.tagName).not.toBe('A');
      expect(c.querySelector('.ck-slate-name')!.closest('a')).toBeNull();
    }
  });
});
