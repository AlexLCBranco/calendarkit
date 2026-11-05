// @vitest-environment jsdom
// Round 14 (item 4): moneyline odds — ESPN's answers (real responses of 2026-11-04, trimmed: tests/fixtures/espn/) read
// into decimal odds per team, the server function, the page's odds store, and the cards.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/odds';
import { dayOdds, decimalOdds, espnDate, eventKey, nbaTricode, oddsCacheSeconds, type EspnEvent } from '../src/data/odds';
import { TEAMS } from '../src/data/teams';
import { createOddsStore, ODDS_REFRESH_MS, ODDS_RETRY_MS, oddsKey, type DayOdds } from '../src/slate/odds';
import { SlateDay } from '../src/slate/SlateCard';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fixture = (f: string) => JSON.parse(readFileSync(`tests/fixtures/espn/${f}`, 'utf8'));
const pre = fixture('scoreboard-20261104.json') as { events: EspnEvent[] };
const post = fixture('scoreboard-20261102.json') as { events: EspnEvent[] };
const summary = fixture('summary-401909907.json');

describe('reading ESPN', () => {
  it('American → decimal, two places: +115 → 2.15, −136 → 1.74, −518 → 1.19, +394 → 4.94, EVEN → 2; junk → none', () => {
    expect(decimalOdds('+115')).toBe(2.15);
    expect(decimalOdds('-136')).toBe(1.74);
    expect(decimalOdds('-518')).toBe(1.19);
    expect(decimalOdds('+394')).toBe(4.94);
    expect(decimalOdds('+100')).toBe(2);
    expect(decimalOdds('EVEN')).toBe(2);
    for (const bad of [undefined, null, '', 'OFF', '50', '-99', 'abc']) expect(decimalOdds(bad as string)).toBeUndefined();
  });

  it('ESPN abbreviations → NBA tricodes: the 6 that differ, the rest unchanged, all 30 teams covered', () => {
    const espn = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NO', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SA', 'TOR', 'UTAH', 'WSH']; // ESPN /teams, 2026-11-04
    expect(new Set(espn.map(nbaTricode))).toEqual(new Set(TEAMS.map((t) => t.tricode)));
  });

  it('a night before tip-off: every game\'s current line (DraftKings), keyed by the NBA tricodes', async () => {
    const day = await dayOdds('2026-11-04', pre, async () => undefined);
    expect(Object.keys(day.games)).toHaveLength(pre.events.length);
    expect(day.games['PHI@DET']).toEqual({ away: 2.15, home: 1.74, provider: 'DraftKings' });
    expect(day.games['MIL@BOS']).toEqual({ away: 4.94, home: 1.19, provider: 'DraftKings' });
    expect(day.games['ATL@WAS']).toBeDefined(); // ESPN "WSH"
    // every key is a real game of that night in the NBA feed's snapshot
    const nba = new Set((data.byDate.get('2026-11-04') ?? []).map(oddsKey));
    if (nba.size) for (const k of Object.keys(day.games)) expect(nba.has(k), k).toBe(true);
  });

  it('a played night: the scoreboard has no odds, the summary\'s pickcenter gives the last line before tip-off', async () => {
    const asked: string[] = [];
    const day = await dayOdds('2026-11-02', post, async (id) => (asked.push(id), id === '401909907' ? summary : undefined));
    expect(asked).toHaveLength(post.events.length); // one summary per started game
    const k = eventKey(post.events.find((e) => e.id === '401909907')!)!;
    expect(day.games[k]).toEqual({ away: 2.46, home: 1.58, provider: 'DraftKings' }); // +146 / −173
    expect(Object.keys(day.games)).toEqual([k]); // the others had no summary here: left out, not invented
  });

  it('cache: a day all over → 1 day, otherwise 10 minutes', () => {
    expect(oddsCacheSeconds(post.events)).toBe(86_400);
    expect(oddsCacheSeconds(pre.events)).toBe(600);
    expect(oddsCacheSeconds([])).toBe(600);
  });

  it('dates: only YYYY-MM-DD', () => {
    expect(espnDate('2026-11-04')).toBe('20261104');
    for (const bad of [null, '', '2026-1-4', '20261104', '2026-13-40x', '../x']) expect(espnDate(bad)).toBeUndefined();
  });
});

describe('the server function', () => {
  it('answers the day\'s decimal odds with the CDN cache headers; a bad date 400; ESPN down 502 with no odds', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => (urls.push(String(u)), new Response(JSON.stringify(pre), { status: 200 })));
    const r = await GET(new Request('https://x.test/api/odds?date=2026-11-04'));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=600, stale-while-revalidate=600');
    expect(((await r.json()) as DayOdds).games['PHI@DET']).toEqual({ away: 2.15, home: 1.74, provider: 'DraftKings' });
    expect(urls).toEqual(['https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261104']);
    expect((await GET(new Request('https://x.test/api/odds?date=tomorrow'))).status).toBe(400);
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));
    const bad = await GET(new Request('https://x.test/api/odds?date=2026-11-04'));
    expect(bad.status).toBe(502);
    expect(((await bad.json()) as DayOdds).games).toEqual({});
  });
});

describe('the odds store', () => {
  it('loads a date only when a Slate shows it; refreshes every 10 minutes while shown, not after; a finished day once', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const store = createOddsStore(async (d) => (calls.push(d), { date: d, games: { [`A@B${calls.length}`]: { away: 2, home: 1.8 } } }));
    expect(calls).toEqual([]);
    const stop = store.show('2026-11-04', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['2026-11-04']);
    expect(store.get('2026-11-04')).toBeDefined();
    await vi.advanceTimersByTimeAsync(ODDS_REFRESH_MS);
    expect(calls).toHaveLength(2);
    stop();
    await vi.advanceTimersByTimeAsync(3 * ODDS_REFRESH_MS);
    expect(calls).toHaveLength(2);
    const stop2 = store.show('2026-11-02', true);
    await vi.advanceTimersByTimeAsync(3 * ODDS_REFRESH_MS);
    stop2();
    store.show('2026-11-02', true)();
    expect(calls.filter((d) => d === '2026-11-02')).toHaveLength(1);
  });

  it('a failure: no odds, retried no sooner than a minute later', async () => {
    let t = 0;
    let n = 0;
    const store = createOddsStore(async () => (n++, Promise.reject(new Error('down'))), () => t);
    store.show('2026-11-04', true)();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    store.show('2026-11-04', true)();
    expect(n).toBe(1);
    t = ODDS_RETRY_MS;
    store.show('2026-11-04', true)();
    expect(n).toBe(2);
    expect(store.get('2026-11-04')).toBeUndefined();
  });
});

describe('cards', () => {
  const date = [...data.byDate.keys()].sort().find((d) => data.byDate.get(d)!.length >= 5)!;
  const games = data.byDate.get(date)!;

  it('the odds column is reserved on every row; filled with two decimals when the odds come, without moving anything', async () => {
    let resolve!: (d: DayOdds) => void;
    const store = createOddsStore(() => new Promise((r) => (resolve = r)));
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" odds={store} />);
    const cells = () => [...document.querySelectorAll<HTMLElement>('[data-testid="slate-odds"]')];
    expect(cells()).toHaveLength(2 * games.length);
    expect(cells().every((c) => c.textContent === '')).toBe(true);
    const g = games[0]!;
    await act(async () => resolve({ date, games: { [oddsKey(g)]: { away: 1.65, home: 2.3, provider: 'DraftKings' } } }));
    const card = document.querySelector<HTMLElement>(`[data-game-id="${g.gameId}"]`)!;
    expect([...card.querySelectorAll('[data-testid="slate-odds"]')].map((c) => c.textContent)).toEqual(['1.65', '2.30']);
    expect(card.querySelector<HTMLElement>('[data-testid="slate-odds"]')!.dataset.tip).toContain('decimal, DraftKings');
    // the other cards have none
    expect(cells().filter((c) => c.textContent).length).toBe(2);
  });

  it('without a store: no request, empty columns', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
    expect(f).not.toHaveBeenCalled();
    expect([...document.querySelectorAll('[data-testid="slate-odds"]')].every((c) => c.textContent === '')).toBe(true);
  });
});
