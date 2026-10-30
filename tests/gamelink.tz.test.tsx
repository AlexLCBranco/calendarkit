// @vitest-environment jsdom
// Round 5, item 5a: the game link's date is the feed's NBA (Eastern-time) game date (`gameDateEst` → `dateEt`), never a
// date the app works out from the tip-off time — checked on late games either side of the end of daylight saving time
// (Sun Nov 1, 2026, 2:00 EDT → 1:00 EST): an ET evening game then tips off on the next UTC day, and in São Paulo on the
// next local day too. Runs under every zone in vite.config.ts (America/New_York and America/Sao_Paulo); the views use
// the process zone (no timeZone prop), as in the app.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { appGameLink } from '../src/App';
import { CalendarView } from '../src/components/CalendarView';
import { localDate } from '../src/data/model';
import raw from './fixtures/feed-2026-10-23.json';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const XL = { width: 1840, height: 1000 };
const NOW = Date.parse('2026-10-25T15:00:00Z');
const utcDay = (iso: string) => iso.slice(0, 10);
/** gameId → the raw feed's gameDateEst (date part). */
const rawEt = new Map((raw as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] } }).leagueSchedule.gameDates.flatMap((d) => d.games).map((g) => [g.gameId, g.gameDateEst.slice(0, 10)]));

/** The real feed's games tipping off after midnight UTC on ET Oct 31 (EDT, UTC−4) and ET Nov 1 (EST, UTC−5). */
const late = (et: string) => data.games.filter((g) => g.dateEt === et && g.startTimeUtc && utcDay(g.startTimeUtc) > et);

describe('link date = the feed\'s ET game date, across the Nov 1, 2026 DST change', () => {
  it('the real feed has late games on both sides, and each one\'s ET date differs from its UTC date', () => {
    for (const et of ['2026-10-31', '2026-11-01']) {
      expect(late(et).length, et).toBeGreaterThan(0);
      for (const g of late(et)) {
        // the ET date is the feed's own field as served (gameDateEst in the saved raw feed), not derived here
        expect(rawEt.get(g.gameId)).toBe(et);
      }
    }
  });

  for (const et of ['2026-10-31', '2026-11-01']) {
    it(`ET ${et}: every late game's link in the League List and the week view carries ${et}`, () => {
      const games = late(et);
      for (const initial of [{ date: et }, { layout: 'calendar', date: et }] as const) {
        const el = render(<CalendarView data={data} size={XL} now={NOW} initial={initial} gameLink={appGameLink} />).container;
        for (const g of games) {
          const a = el.querySelector<HTMLAnchorElement>(`[data-game-id="${g.gameId}"] a[data-testid="game-link"]`)!;
          expect(a, `${g.gameId} ${initial.date}`).not.toBeNull();
          expect(a.getAttribute('href')).toBe(`https://hoopsjunkie.io/games/${et}/${g.awayTeam.teamTricode.toLowerCase()}-vs-${g.homeTeam.teamTricode.toLowerCase()}`);
          // and not the UTC day or this zone's local day of the tip-off
          expect(a.getAttribute('href')).not.toContain(utcDay(g.startTimeUtc!));
          if (localDate(Date.parse(g.startTimeUtc!)) !== et) expect(a.getAttribute('href')).not.toContain(localDate(Date.parse(g.startTimeUtc!)));
        }
        cleanup();
      }
    });
  }

  it('the field wins even where it disagrees with any date the tip-off time gives (synthetic)', () => {
    // a feed date of Oct 31 on a game whose tip-off is midday Nov 1 in every zone: only the field can give Oct 31
    const odd = game({ date: '2026-10-31', utc: '2026-11-01T16:00:00Z', away: TEAM.LAL, home: TEAM.BOS });
    expect(appGameLink!(odd)).toBe('https://hoopsjunkie.io/games/2026-10-31/lal-vs-bos');
    const el = render(<CalendarView data={dataOf([odd])} size={XL} now={NOW} initial={{ date: '2026-10-31' }} gameLink={appGameLink} />).container;
    expect(el.querySelector('a[data-testid="game-link"]')!.getAttribute('href')).toBe('https://hoopsjunkie.io/games/2026-10-31/lal-vs-bos');
  });
});
