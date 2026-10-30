// @vitest-environment jsdom
// Round 6, A4: game links for NBA Cup knockout games (Dec 9–16, 2025), from a fixture in the feed's real format
// (tests/fixtures/cup-knockout-2025.json, built by make-cup-knockout-2025.mjs: quarterfinals at home sites, semifinals
// and the final at a neutral site, the final a 006… game, a late quarterfinal at 11:30 pm ET). Expected URL, as for
// every game: https://hoopsjunkie.io/games/<feed gameDateEst date>/<away>-vs-<home>, lowercase tricodes, away and home
// as the feed designates them (also at a neutral site: the feed still names a home team, and it's the only order the
// app has). Runs under America/New_York and America/Sao_Paulo; the views use the process zone, as in the app.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { appGameLink } from '../src/App';
import { CalendarView } from '../src/components/CalendarView';
import { buildCalendarData, localDate } from '../src/data/model';
import { parseSchedule } from '../src/shared/nba-schedule/parse';
import raw from './fixtures/cup-knockout-2025.json';

afterEach(cleanup);

const data = buildCalendarData(parseSchedule(raw));
const XL = { width: 1840, height: 1000 };
const NOW = Date.parse('2025-12-20T15:00:00Z');
type Raw = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; isNeutral: boolean; gameSubtype: string; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } };
const rawGames = (raw as unknown as { leagueSchedule: { gameDates: { games: Raw[] }[] } }).leagueSchedule.gameDates.flatMap((d) => d.games);

/** Written out by hand: the URL each fixture game must link to. */
const EXPECTED: Record<string, string> = {
  '0022501201': 'https://hoopsjunkie.io/games/2025-12-09/nyk-vs-tor', // round 7: these 7 URLs load the game's real page (checked 2026-10-30)
  '0022501202': 'https://hoopsjunkie.io/games/2025-12-09/mia-vs-orl',
  '0022501203': 'https://hoopsjunkie.io/games/2025-12-10/phx-vs-okc',
  '0022501204': 'https://hoopsjunkie.io/games/2025-12-10/sas-vs-lal', // 04:30 UTC Dec 11
  '0022501229': 'https://hoopsjunkie.io/games/2025-12-13/nyk-vs-orl', // neutral (Las Vegas)
  '0022501230': 'https://hoopsjunkie.io/games/2025-12-13/sas-vs-okc', // neutral, 02:00 UTC Dec 14
  '0062500001': 'https://hoopsjunkie.io/games/2025-12-16/sas-vs-nyk', // the final: neutral, 006…, 01:30 UTC Dec 17
};

describe('NBA Cup knockout games (Dec 9–16, 2025): link from the feed\'s ET date and its away/home order', () => {
  it('the fixture is knockout games in the feed\'s format, with the cases that matter', () => {
    expect(rawGames).toHaveLength(7);
    expect(rawGames.every((g) => g.gameSubtype === 'in-season-knockout')).toBe(true);
    expect(data.games.map((g) => g.gameId).sort()).toEqual(Object.keys(EXPECTED).sort()); // all shown, the final too
    expect(data.games.find((g) => g.gameId === '0062500001')!.gameType).toBe('cup-final');
    expect(data.games.filter((g) => g.isCupKnockout)).toHaveLength(7);
    expect(rawGames.filter((g) => g.isNeutral).length).toBe(3);
    // the late game: ET Dec 10, but Dec 11 in UTC
    const late = rawGames.find((g) => g.gameId === '0022501204')!;
    expect([late.gameDateEst.slice(0, 10), late.gameDateTimeUTC]).toEqual(['2025-12-10', '2025-12-11T04:30:00Z']);
  });

  it('appGameLink gives the expected URL for every game (the same rule as regular games)', () => {
    for (const g of data.games) expect(appGameLink!(g), g.gameId).toBe(EXPECTED[g.gameId]);
  });

  it('the late games link to their ET date, not the UTC or local date of the tip-off', () => {
    for (const id of ['0022501204', '0022501230', '0062500001']) {
      const g = data.games.find((x) => x.gameId === id)!;
      const url = appGameLink!(g)!;
      expect(url).toContain(`/games/${g.dateEt}/`);
      expect(url).not.toContain(g.startTimeUtc!.slice(0, 10));
      const local = localDate(Date.parse(g.startTimeUtc!));
      if (local !== g.dateEt) expect(url).not.toContain(local);
    }
  });

  for (const initial of [{ date: '2025-12-09' }, { layout: 'calendar', date: '2025-12-09' }, { layout: 'calendar', date: '2025-12-09', weeks: 2 }] as const) {
    it(`the views link every knockout game to it: ${JSON.stringify(initial)}`, () => {
      const el = render(<CalendarView data={data} size={XL} now={NOW} initial={initial} gameLink={appGameLink} />).container;
      const seen = new Set<string>();
      for (const a of el.querySelectorAll<HTMLAnchorElement>('a[data-testid="game-link"]')) {
        const id = a.closest<HTMLElement>('[data-game-id]')!.dataset.gameId!;
        expect(a.getAttribute('href'), id).toBe(EXPECTED[id]);
        seen.add(id);
      }
      // the League List renders the days near the top (Dec 9, 10, 13 at least); the week views: Dec 7–13 / Dec 7–20
      expect(seen.size).toBeGreaterThanOrEqual(initial.layout === 'calendar' && 'weeks' in initial ? 7 : 4);
    });
  }
});
