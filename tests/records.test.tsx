// @vitest-environment jsdom
// Records going into the game in the League List (round 4, item 5): next to both teams on every row, the team's W-L
// before the game, by the Team List's season-line rule (counted from final scores, regular-season games only, unknown
// after the first regular-season game that isn't final, then left out). Desktop/tablet; phones have no records.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { leagueRecords } from '../src/data/model';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const TABLET = { width: 736, height: 900 };
const PHONE = { width: 360, height: 700 };

/** Records going in, worked out here from the scores (independent of the app's teamSeason): gameId → team → "W-L". */
function expected(games: typeof data.games) {
  const out = new Map<string, Map<number, string>>();
  const rec = new Map<number, { w: number; l: number } | null>();
  for (const g of games) {
    const m = new Map<number, string>();
    for (const t of [g.awayTeam, g.homeTeam]) {
      if (!t.teamId || g.gameType !== 'regular') continue;
      const r = rec.has(t.teamId) ? rec.get(t.teamId)! : { w: 0, l: 0 };
      if (r) m.set(t.teamId, `${r.w}-${r.l}`);
      const other = t === g.homeTeam ? g.awayTeam : g.homeTeam;
      rec.set(t.teamId, r && g.status === 'final' ? { w: r.w + (Number(t.score) > Number(other.score) ? 1 : 0), l: r.l + (Number(t.score) < Number(other.score) ? 1 : 0) } : null);
    }
    out.set(g.gameId, m);
  }
  return out;
}

describe('leagueRecords (model)', () => {
  it('every game of the real feed: both teams\' records going in = an independent count; cached per data set', () => {
    const want = expected(data.games);
    const got = leagueRecords(data);
    expect(got).toBe(leagueRecords(data));
    let known = 0;
    for (const g of data.games) {
      for (const t of [g.awayTeam, g.homeTeam]) {
        const r = got.get(g.gameId)?.get(t.teamId);
        expect(r ? `${r.wins}-${r.losses}` : undefined, `${g.gameId} ${t.teamTricode}`).toBe(want.get(g.gameId)!.get(t.teamId));
        if (r) known++;
      }
    }
    expect(known).toBeGreaterThan(60); // 0-0 on every team's first game, then the known ones
  });

  it('synthetic: W, L, then unknown after a game not yet final; the Cup Final has none', () => {
    const games = [
      game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
      game({ date: '2026-11-03', utc: '2026-11-03T23:00:00Z', home: TEAM.MIA, away: TEAM.BOS, final: [99, 120] }),
      game({ date: '2026-11-05', utc: '2026-11-05T23:00:00Z', home: TEAM.BOS, away: TEAM.MIA }),
      game({ date: '2026-11-07', utc: '2026-11-07T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
      game({ date: '2026-11-09', utc: '2026-11-09T23:00:00Z', home: TEAM.BOS, away: TEAM.LAL, prefix: '006', final: [80, 70] }),
    ];
    const r = leagueRecords(dataOf(games));
    const at = (i: number, t: number) => {
      const x = r.get(games[i]!.gameId)?.get(t);
      return x && `${x.wins}-${x.losses}`;
    };
    expect([at(0, TEAM.BOS), at(0, TEAM.NYK), at(1, TEAM.BOS), at(1, TEAM.MIA), at(2, TEAM.BOS), at(2, TEAM.MIA), at(3, TEAM.BOS), at(3, TEAM.NYK)]).toEqual(['0-0', '0-0', '1-0', '0-0', '1-1', '1-0', undefined, '0-1']);
    expect(at(4, TEAM.BOS)).toBeUndefined();
  });
});

describe('League List rows', () => {
  it('desktop and tablet: "3-1 [logo] BOS … DET [logo] 2-2" — away record first, home record after the home logo; aria-label', () => {
    const want = expected(data.games);
    for (const size of [XL, TABLET]) {
      for (const date of ['2026-10-21', '2026-10-22', '2026-10-24']) {
        const el = render(<CalendarView data={data} size={size} now={NOW} timeZone="UTC" initial={{ date }} />).container;
        for (const g of data.byDate.get(date)!) {
          const c = el.querySelector(`.ck-card[data-game-id="${g.gameId}"]`)!;
          const m = c.querySelector('.ck-matchup')!;
          const recs = [...m.querySelectorAll('.ck-rec')];
          expect(recs.map((x) => x.textContent), `${size.width} ${g.gameId}`).toEqual([want.get(g.gameId)!.get(g.awayTeam.teamId) ?? '', want.get(g.gameId)!.get(g.homeTeam.teamId) ?? '']);
          // outside the logos (and outside the Fatigue components on desktop, round 5): first and last part of the matchup
          const parts = [...m.children].map((x) => x.className.split(' ')[0]).filter((x) => x !== 'ck-ot');
          expect(parts, `${size.width} ${g.gameId}`).toEqual(size === XL ? ['ck-rec', 'ck-fx', 'ck-teams', 'ck-fx', 'ck-rec'] : ['ck-rec', 'ck-teams', 'ck-rec']);
          const a = want.get(g.gameId)!.get(g.awayTeam.teamId);
          const h = want.get(g.gameId)!.get(g.homeTeam.teamId);
          if (a && h) expect(c.getAttribute('aria-label')).toContain(`records going in ${g.awayTeam.teamTricode} ${a}, ${g.homeTeam.teamTricode} ${h}`);
        }
        cleanup();
      }
    }
  });

  it('phones: no records', () => {
    const el = render(<CalendarView data={data} size={PHONE} now={NOW} timeZone="UTC" initial={{ date: '2026-10-22' }} />).container;
    expect(el.querySelector('.ck-rec')).toBeNull();
  });
});
