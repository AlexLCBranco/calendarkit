// @vitest-environment jsdom
// Game page link: hoopsjunkie.io game pages (injury report, win probability, box score). URL
// verified on the live site 2026-10-29 (Alex's Chrome): /games/<NBA ET date>/<away>-vs-<home>, lowercase tricodes —
// the ET date also for games after midnight (POR @ LAL, ET Oct 27, 03:00 UTC Oct 28: 2026-10-27/por-vs-lal loads,
// 2026-10-28/por-vs-lal redirects to that day's scores). The matchup is an <a> to it (new tab), the URL rule
// from the shell (gameLink). Undecided teams: no link.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appGameLink } from '../src/App';
import { CalendarView } from '../src/components/CalendarView';
import { gameLinkUrl, HOOPSJUNKIE_BASE_URL, isGameLinkConfigured } from '../src/config';
import { dataOf, game, TEAM } from './synthetic';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const XL = { width: 1840, height: 1000 };
const NOW = Date.parse('2026-11-20T15:00:00Z');
// LAL @ DEN on ET Nov 10, tip 03:00 UTC Nov 11 (after midnight UTC); BOS @ NYK; a TBD game
const late = game({ date: '2026-11-10', utc: '2026-11-11T03:00:00Z', away: TEAM.LAL, home: TEAM.DEN });
const early = game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', away: TEAM.BOS, home: TEAM.NYK });
const tbd = game({ date: '2026-11-10', utc: '2026-11-11T01:00:00Z', away: 0, home: 0 });
const data = dataOf([early, tbd, late]);

describe('URL (shell)', () => {
  it('https://hoopsjunkie.io/games/<ET date>/<away>-vs-<home>, lowercase; the ET date after midnight too; none for TBD', () => {
    expect(isGameLinkConfigured()).toBe(true);
    expect(HOOPSJUNKIE_BASE_URL).toBe('https://hoopsjunkie.io');
    expect(gameLinkUrl(late)).toBe('https://hoopsjunkie.io/games/2026-11-10/lal-vs-den');
    expect(gameLinkUrl(early)).toBe('https://hoopsjunkie.io/games/2026-11-10/bos-vs-nyk');
    expect(gameLinkUrl(tbd)).toBeUndefined();
  });

  it('the shell gives the widgets that rule (none when no base URL is configured)', () => {
    expect(appGameLink?.(late)).toBe('https://hoopsjunkie.io/games/2026-11-10/lal-vs-den');
    expect(appGameLink?.(tbd)).toBeUndefined();
  });
});

describe('widgets: a real <a> to the game page (round 5: the matchup; round 16: the List rows get the "↗" icon)', () => {
  for (const [name, initial, sel] of [
    ['League List', { date: '2026-11-10' }, '.ck-card'],
    ['Team List', { mode: 'team', layout: 'list', teamId: TEAM.LAL }, '.ck-card'],
    ['Team Calendar', { mode: 'team', layout: 'calendar', teamId: TEAM.LAL }, '.ck-day-cell'],
    ['week view', { layout: 'calendar', date: '2026-11-10' }, '.ck-month-game'],
  ] as const) {
    it(name, () => {
      const win = vi.spyOn(window, 'open').mockImplementation(() => null);
      const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={initial} gameLink={appGameLink} />).container;
      const target = el.querySelector(`${sel}[data-game-id="${late.gameId}"], ${sel}:has([data-game-id="${late.gameId}"])`)!;
      const links = target.querySelectorAll<HTMLAnchorElement>('a[data-testid="game-link"]');
      expect(links).toHaveLength(1);
      const a = links[0]!;
      expect(a.getAttribute('href')).toBe('https://hoopsjunkie.io/games/2026-11-10/lal-vs-den');
      expect(a.target).toBe('_blank');
      expect(a.rel.split(' ')).toContain('noopener');
      expect(a.draggable).toBe(false);
      const icon = name.endsWith('List');
      if (icon) {
        // List rows — the Slate's "↗" icon among the tags, never in a copy; the matchup is no link
        expect(a.textContent!.trim()).toBe('↗');
        expect(a.className).toBe('ck-slate-link');
        expect(a.title).toBe('Open on hoopsjunkie');
        expect(a.getAttribute('aria-label')).toBe('Open on hoopsjunkie');
        expect(a.dataset.captureExclude).toBe('true');
        expect(a.parentElement!.classList.contains('ck-tags')).toBe(true);
        expect(target.querySelector('.ck-mlink')).toBeNull();
        expect(target.querySelector('.ck-matchup')!.closest('a')).toBeNull();
      } else {
        // calendar cells and week lines: the link is the matchup — both tricodes (or the opponent), nothing hover-only
        expect(a.textContent).toMatch(/DEN/);
        expect(a.classList.contains('ck-mlink')).toBe(true);
        expect(target.querySelector('.ck-slate-link')).toBeNull();
      }
      expect(el.querySelector('[data-testid="open-link"], .ck-open-link')).toBeNull();
      // the copy button, fatigue components and records are not inside it
      expect(a.querySelector('button, [data-testid="fatigue"], .ck-rec')).toBeNull();
      fireEvent.click(a);
      expect(win).not.toHaveBeenCalled(); // the browser follows the link; the widget opens nothing itself
      // undecided teams: no link
      const t = el.querySelector(`[data-game-id="${tbd.gameId}"]`);
      if (t) expect((t.closest(sel) ?? t).querySelector('a')).toBeNull();
      cleanup();
      // no gameLink: no link, the same matchup as a span
      const plain = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={initial} />).container;
      expect(plain.querySelector('a[data-testid="game-link"]')).toBeNull();
      expect(plain.querySelector('.ck-teams, .ck-mline, .ck-matchup .ck-side')).not.toBeNull();
    });
  }
});

describe('round 16: room for the "↗" in the desktop Team List (fatigue columns)', () => {
  it('a Cup group tag drops "Group" there ("NBA Cup · West A", full name in its tooltip); the League List keeps it', () => {
    const cup = game({ date: '2026-11-10', utc: '2026-11-11T02:00:00Z', away: TEAM.LAL, home: TEAM.DEN, subtype: 'in-season', subLabel: 'West Group A', raw: { gameLabel: 'Emirates NBA Cup' } });
    const d = dataOf([cup]);
    const team = render(<CalendarView data={d} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.LAL }} gameLink={appGameLink} />).container;
    const row = team.querySelector(`.ck-card[data-game-id="${cup.gameId}"]`)!;
    expect(row.querySelector('[data-testid="fatigue-team"]')).not.toBeNull(); // the desktop columns
    const tag = row.querySelector<HTMLElement>('.ck-tag.ck-cup')!;
    expect(tag.textContent).toBe('NBA Cup · West A');
    expect(tag.title).toBe('NBA Cup · West Group A');
    expect(row.querySelector('.ck-tags')!.firstElementChild!.textContent).toBe('↗');
    cleanup();
    const league = render(<CalendarView data={d} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-10' }} gameLink={appGameLink} />).container;
    expect(league.querySelector('.ck-tag.ck-cup')!.textContent).toBe('NBA Cup · West Group A');
  });
});
