// @vitest-environment jsdom
// Scores next to each other, logos mirrored (round 4, item 2): "[logo] BOS 113 @ 121 DET [logo]" in the League List,
// Team List (desktop, tablet, phone) and Team Calendar; team views keep the selected team first ("BOS 113 vs 121 CHI").
// Lists on desktop/tablet put every part in a fixed slot (empty score slots on games without a score).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const XL = { width: 1840, height: 1000 };
const TABLET = { width: 736, height: 900 };
const PHONE = { width: 360, height: 700 };
const NOW = Date.parse('2026-11-20T15:00:00Z');
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
/** The matchup's parts in document order: logo file names, tricodes, scores, "@"/"vs". */
const parts = (m: Element) =>
  [...m.querySelectorAll('img, .ck-team, .ck-score, .ck-score-slot, .ck-vsat')].map((e) =>
    e.tagName === 'IMG' ? `[${e.getAttribute('src')!.slice(7, 10)}]` : e.classList.contains('ck-score-slot') ? '_' : e.classList.contains('ck-score') ? e.textContent : e.firstChild?.textContent ?? '',
  );

const played = game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', away: TEAM.BOS, home: TEAM.NYK, final: [113, 121] });
const upcoming = game({ date: '2026-11-25', utc: '2026-11-26T00:00:00Z', away: TEAM.LAL, home: TEAM.BOS });
const data = dataOf([played, upcoming]);

describe('League List', () => {
  it('desktop and tablet: [logo] AWAY a @ h HOME [logo], scores in their slots (empty when not played)', () => {
    for (const size of [XL, TABLET]) {
      for (const [g, want] of [
        [played, ['[BOS]', 'BOS', '113', '@', '121', 'NYK', '[NYK]']],
        [upcoming, ['[LAL]', 'LAL', '_', '@', '_', 'BOS', '[BOS]']],
      ] as const) {
        const el = render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ date: g.dateEt }} />).container;
        const m = el.querySelector(`.ck-card[data-game-id="${g.gameId}"] .ck-matchup`)!;
        expect(parts(m), `${size.width} ${g.gameId}`).toEqual(want);
        expect(m.classList.contains('ck-slots')).toBe(true);
        cleanup();
      }
    }
    const el = render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: played.dateEt }} />).container;
    expect(text(el.querySelector(`.ck-card[data-game-id="${played.gameId}"] .ck-matchup`)!)).toBe('BOS 113 @ 121 NYK');
  });

  it('phone: mirrored logos, natural widths (no score on phones)', () => {
    const el = render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ date: played.dateEt }} />).container;
    const m = el.querySelector(`.ck-card[data-game-id="${played.gameId}"] .ck-matchup`)!;
    expect(parts(m)).toEqual(['[BOS]', 'BOS', '@', 'NYK', '[NYK]']);
    expect(m.classList.contains('ck-slots')).toBe(false);
  });
});

describe('team views', () => {
  const at = (size: typeof XL, layout: 'list' | 'calendar', teamId: number, id: string) =>
    render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout, teamId }} />).container.querySelector(`.ck-card[data-game-id="${id}"] .ck-matchup`)!;

  it('Team List desktop: selected team first, "vs"/"@", fixed slots', () => {
    expect(parts(at(XL, 'list', TEAM.NYK, played.gameId))).toEqual(['[NYK]', 'NYK', '121', 'vs', '113', 'BOS', '[BOS]']);
    cleanup();
    const m = at(XL, 'list', TEAM.BOS, upcoming.gameId);
    expect(parts(m)).toEqual(['[BOS]', 'BOS', '_', 'vs', '_', 'LAL', '[LAL]']);
    expect(m.classList.contains('ck-slots')).toBe(true);
  });

  it('Team List tablet and phone, Team Calendar: same order, natural widths', () => {
    for (const [size, layout] of [[TABLET, 'list'], [PHONE, 'list'], [XL, 'calendar']] as const) {
      const m = at(size, layout, TEAM.BOS, played.gameId);
      expect(parts(m), `${size.width} ${layout}`).toEqual(['[BOS]', 'BOS', '113', '@', '121', 'NYK', '[NYK]']);
      expect(m.classList.contains('ck-slots')).toBe(false);
      cleanup();
    }
  });
});
