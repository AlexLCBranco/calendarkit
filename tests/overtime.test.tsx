// @vitest-environment jsdom
// Overtime marker (round 4, item 1): a final game whose status text is "Final/OT" (or "Final/2OT", …) shows a small
// muted "OT" / "2OT" after the final score in every view with scores, and says so in its aria-label.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { CalendarView } from '../src/components/CalendarView';
import { overtime } from '../src/data/model';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const XL = { width: 1840, height: 1000 };
const NOW = Date.parse('2026-11-20T15:00:00Z');
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

const ot = game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', away: TEAM.NYK, home: TEAM.BOS, final: [118, 121], raw: { gameStatusText: 'Final/OT' } });
const ot2 = game({ date: '2026-11-10', utc: '2026-11-11T00:30:00Z', away: TEAM.LAL, home: TEAM.DEN, final: [140, 137], raw: { gameStatusText: 'Final/2OT' } });
const reg = game({ date: '2026-11-10', utc: '2026-11-11T01:00:00Z', away: TEAM.MIA, home: TEAM.LAL, final: [101, 99] });
const data = dataOf([ot, ot2, reg]);

describe('overtime()', () => {
  it('reads OT / 2OT / 3OT from the final status text, nothing otherwise', () => {
    expect(overtime(ot)).toBe('OT');
    expect(overtime(ot2)).toBe('2OT');
    expect(overtime(game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', final: [1, 2], raw: { gameStatusText: 'Final/3OT' } }))).toBe('3OT');
    expect(overtime(reg)).toBeUndefined();
    // not final yet: never OT (live games carry "OT 2:31" style texts)
    expect(overtime(game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', raw: { gameStatusText: 'OT 2:31' } }))).toBeUndefined();
  });

  it('every final status text in the served snapshot is "Final" or "Final/<n>OT"', () => {
    const feed = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { gameStatus: number; gameStatusText: string }[] }[] } };
    const texts = new Set(feed.leagueSchedule.gameDates.flatMap((d) => d.games.filter((g) => g.gameStatus === 3).map((g) => g.gameStatusText.trim())));
    for (const t of texts) expect(t).toMatch(/^Final(\/\d*OT)?$/);
  });
});

const otOf = (el: Element) => el.querySelector('.ck-ot')?.textContent;

describe('League List', () => {
  it('"NYK 118 @ 121 BOS OT": the marker after the last score, muted; aria-label says overtime', () => {
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-10' }} />).container;
    const c = el.querySelector(`.ck-card[data-game-id="${ot.gameId}"]`)!;
    expect(text(c.querySelector('.ck-matchup')!)).toBe('NYK 118 @ 121 BOS OT');
    expect(otOf(c)).toBe('OT');
    expect(c.getAttribute('aria-label')).toContain('final NYK 118, BOS 121 (OT)');
    expect(otOf(el.querySelector(`.ck-card[data-game-id="${ot2.gameId}"]`)!)).toBe('2OT');
    const r = el.querySelector(`.ck-card[data-game-id="${reg.gameId}"]`)!;
    expect(r.querySelector('.ck-ot')).toBeNull();
    expect(r.getAttribute('aria-label')).not.toContain('OT');
  });
});

describe('team views', () => {
  it('Team List and Team Calendar: the marker after the scores, aria-label "won 121–118 (OT)"', () => {
    for (const layout of ['list', 'calendar'] as const) {
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout, teamId: TEAM.BOS }} />).container;
      const c = el.querySelector(`.ck-card[data-game-id="${ot.gameId}"]`)!;
      expect(otOf(c), layout).toBe('OT');
      expect(c.getAttribute('aria-label'), layout).toContain('won 121–118 (OT)');
      cleanup();
    }
  });
});

describe('week view', () => {
  it('in the final line\'s empty TV slot (no width added), and in the aria-label', () => {
    for (const weeks of [1, 2] as const) {
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ layout: 'calendar', date: '2026-11-10', weeks }} />).container;
      const line = el.querySelector(`.ck-month-game[data-game-id="${ot.gameId}"]`)!;
      expect(line.querySelector('.ck-tv-slot .ck-ot')?.textContent).toBe('OT');
      expect(line.getAttribute('aria-label')).toContain('final 118–121 (OT)');
      expect(el.querySelector(`.ck-month-game[data-game-id="${ot2.gameId}"] .ck-ot`)?.textContent).toBe('2OT');
      expect(el.querySelector(`.ck-month-game[data-game-id="${reg.gameId}"] .ck-ot`)).toBeNull();
      cleanup();
    }
  });
});
