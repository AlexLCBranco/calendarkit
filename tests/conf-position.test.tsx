// @vitest-environment jsdom
// Each team's current conference position ("2nd E") beside its record: both teams in League List rows (between the
// record and the streak); the Team List has no room in its rows, so its header shows the team's once. Current standings, not as of the game.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { conferencePositions } from '../src/data/standings';
import { TEAMS } from '../src/data/teams';
import { dataOf, game as mk } from './synthetic';

afterEach(cleanup);

const ID = Object.fromEntries(TEAMS.map((t) => [t.tricode, t.id])) as Record<string, number>;
const game = (s: Omit<Parameters<typeof mk>[0], 'utc'>) => mk({ ...s, utc: `${s.date}T23:00:00Z` } as Parameters<typeof mk>[0]);
// final = [away, home]. East: NYK 1-0, BOS 3-1, ATL 0-1; MIA no game yet.
const G = [
  game({ date: '2026-11-03', home: ID.NYK!, away: ID.BOS!, final: [99, 111] }),
  game({ date: '2026-11-04', home: ID.BOS!, away: ID.DEN!, final: [104, 118] }),
  game({ date: '2026-11-05', home: ID.LAL!, away: ID.BOS!, final: [120, 108] }),
  game({ date: '2026-11-07', home: ID.BOS!, away: ID.ATL!, final: [97, 101] }),
  game({ date: '2026-11-09', home: ID.MIA!, away: ID.BOS! }),
];
const data = dataOf(G);
const SIZE = { width: 1920, height: 1000 };
const NOW = Date.parse('2026-11-08T15:00:00Z');
const posOf = (root: ParentNode, gameId: string) => [...root.querySelectorAll<HTMLElement>(`[data-game-id="${gameId}"] [data-testid="row-pos"]`)].map((e) => [e.textContent, e.title]);

describe('conferencePositions', () => {
  it('the Standings seeds now; no position before a team’s first game', () => {
    const p = conferencePositions(data);
    expect([p.get(ID.NYK!)?.text, p.get(ID.BOS!)?.text, p.get(ID.ATL!)?.text]).toEqual(['1st E', '2nd E', '3rd E']);
    expect(p.get(ID.BOS!)?.tip).toBe('2nd in the East now');
    expect(p.get(ID.MIA!)).toBeUndefined();
  });
});

describe('League List rows', () => {
  it('both teams’ current position beside their records, an empty slot when none', () => {
    const c = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ date: '2026-11-07' }} />).container;
    // a past game still shows the position now
    expect(posOf(c, G[3]!.gameId)).toEqual([
      ['3rd E', '3rd in the East now'],
      ['2nd E', '2nd in the East now'],
    ]);
    cleanup();
    const c2 = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ date: '2026-11-09' }} />).container;
    expect(posOf(c2, G[4]!.gameId)).toEqual([
      ['2nd E', '2nd in the East now'],
      ['', ''],
    ]);
  });
});

describe('Team List rows', () => {
  it('the header’s controls row shows the team’s position once, with the months loaded; the Team Calendar’s doesn’t', () => {
    const c = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: ID.BOS, date: '2026-11-08' }} />).container;
    expect(c.querySelectorAll('[data-testid="team-pos"]')).toHaveLength(1);
    const pos = c.querySelector('[data-testid="what-row"] ~ [data-testid="bar-local"] [data-testid="team-pos"]')!;
    expect(pos.textContent).toBe('2nd in the East');
    expect(pos.nextElementSibling!.getAttribute('data-testid')).toBe('team-month');
    expect(c.querySelector('[data-testid="team-picker"]')!.textContent).toContain('Boston Celtics');
    cleanup();
    const cal = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: ID.BOS, date: '2026-11-08' }} />).container;
    expect(cal.querySelector('[data-testid="team-picker"]')!.textContent).toContain('Boston Celtics');
    expect(cal.querySelector('[data-testid="team-pos"]')).toBeNull();
  });
  it('no position in the rows: they have no room', () => {
    const c = render(<CalendarView data={data} size={SIZE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: ID.BOS, date: '2026-11-08' }} />).container;
    const block = c.querySelector(`[data-game-id="${G[3]!.gameId}"] [data-testid="season"]`)!;
    expect(block.querySelector('.ck-record')!.textContent).toBe('3-1');
    expect(c.querySelectorAll('[data-testid="row-pos"]')).toHaveLength(0);
  });
});
