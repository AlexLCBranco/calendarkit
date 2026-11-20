// @vitest-environment jsdom
// Moneyline odds — ESPN's answers (real responses of 2026-11-04, trimmed: tests/fixtures/espn/) read
// into decimal odds per team, the server function, the page's odds store, and the cards.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/odds';
import { anyLive, dayFinals, dayOdds, decimalOdds, espnDate, eventKey, finalText, nbaTricode, oddsCacheSeconds, type EspnEvent } from '../src/data/odds';
import { TEAMS } from '../src/data/teams';
import { createOddsStore, LIVE_REFRESH_MS, ODDS_REFRESH_MS, ODDS_RETRY_MS, oddsKey, withFinal, withFinals, type DayOdds } from '../src/slate/odds';
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

// gauntlet GT-5: the night's final scores from ESPN (the same answer as the odds), shown before the morning snapshot.
describe('final scores from ESPN', () => {
  const finished = fixture('scoreboard-20261115.json') as { events: EspnEvent[] }; // real answer of 2026-11-15, trimmed

  it('reads every finished game with both scores, keyed like the odds; overtime from the periods played', () => {
    const f = dayFinals(finished);
    expect(Object.keys(f)).toHaveLength(9);
    expect(f['IND@PHI']).toEqual({ away: 124, home: 131, statusText: 'Final' });
    expect(f['SAS@UTA']).toEqual({ away: 110, home: 102, statusText: 'Final' }); // ESPN "SA", "UTAH"
    expect(f['NYK@TOR']).toEqual({ away: 112, home: 108, statusText: 'Final/OT' }); // 5 periods
    expect(finalText(4)).toBe('Final');
    expect(finalText(6)).toBe('Final/2OT');
  });

  it('a game not over, or a half-written answer, is left out', () => {
    const [a, b, c] = finished.events;
    const playing = { ...a!, competitions: [{ ...a!.competitions[0]!, status: { period: 3, type: { state: 'in', completed: false } } }], status: { type: { state: 'in' } } };
    const noScore = { ...b!, competitions: [{ ...b!.competitions[0]!, competitors: b!.competitions[0]!.competitors.map((x) => ({ ...x, score: undefined })) }] };
    const tied = { ...c!, competitions: [{ ...c!.competitions[0]!, competitors: c!.competitions[0]!.competitors.map((x) => ({ ...x, score: '100' })) }] };
    expect(dayFinals({ events: [playing, noScore, tied] })).toEqual({});
    expect(dayFinals(pre)).toEqual({});
    expect(anyLive([playing])).toBe(true);
    expect(anyLive(finished.events)).toBe(false);
  });

  it('cache: 1 minute while a game is on (CK-21: the live scores’ pace)', () => {
    const [a, ...rest] = finished.events;
    const playing = { ...a!, competitions: [{ ...a!.competitions[0]!, status: { type: { state: 'in' } } }], status: { type: { state: 'in' } } };
    expect(oddsCacheSeconds([playing, ...rest])).toBe(60);
    expect(oddsCacheSeconds(finished.events)).toBe(86_400);
  });

  it('the server function sends the finals and whether a game is on', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(finished), { status: 200 }));
    const j = (await (await GET(new Request('https://x.test/api/odds?date=2026-11-15'))).json()) as DayOdds;
    expect(j.finals?.['NYK@TOR']).toEqual({ away: 112, home: 108, statusText: 'Final/OT' });
    expect(j.live).toBe(false);
  });

  it('a card: a game the snapshot still has scheduled shows ESPN\'s final; the same game object when there is none', () => {
    const g = [...data.byDate.values()].flat().find((x) => x.status !== 'final')!;
    expect(withFinal(g, undefined)).toBe(g);
    expect(withFinal(g, { date: g.dateEt, games: {} })).toBe(g);
    const day: DayOdds = { date: g.dateEt, games: {}, finals: { [oddsKey(g)]: { away: 99, home: 101, statusText: 'Final/OT' } } };
    const f = withFinal(g, day);
    expect(f).toMatchObject({ status: 'final', statusText: 'Final/OT', awayTeam: { score: 99 }, homeTeam: { score: 101 } });
    expect(g.status).not.toBe('final'); // the snapshot's game is untouched
    const list = [g];
    expect(withFinals(list, { date: g.dateEt, games: {} })).toBe(list);
    // a game the snapshot already has as final keeps the snapshot's score
    const done = [...data.byDate.values()].flat().find((x) => x.status === 'final');
    if (done) expect(withFinal(done, { date: done.dateEt, games: {}, finals: { [oddsKey(done)]: { away: 1, home: 2, statusText: 'Final' } } })).toBe(done);
  });

  it('cards show the final scores when they come, and the refresh goes every 2 minutes while a game is on, then stops when all are over', async () => {
    vi.useFakeTimers();
    const date = [...data.byDate.keys()].sort().find((d) => data.byDate.get(d)!.length >= 2 && data.byDate.get(d)!.every((x) => x.status !== 'final'))!;
    const night = data.byDate.get(date)!;
    const answers: DayOdds[] = [
      { date, games: {}, live: true },
      { date, games: {}, live: true, finals: { [oddsKey(night[0]!)]: { away: 120, home: 101, statusText: 'Final' } } },
      { date, games: {}, live: false, finals: Object.fromEntries(night.map((g) => [oddsKey(g), { away: 100, home: 90, statusText: 'Final' }])) },
    ];
    let n = 0;
    const store = createOddsStore(async () => answers[Math.min(n++, answers.length - 1)]!);
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" odds={store} />);
    const scores = (g: { gameId: string }) => [...document.querySelectorAll(`[data-game-id="${g.gameId}"] .ck-slate-score`)].map((s) => s.textContent);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(n).toBe(1);
    expect(scores(night[0]!)).toEqual(['', '']);
    await act(async () => vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS));
    expect(n).toBe(2);
    expect(scores(night[0]!)).toEqual(['120', '101']);
    expect(scores(night[1]!)).toEqual(['', '']);
    await act(async () => vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS));
    expect(n).toBe(3);
    expect(scores(night[1]!)).toEqual(['100', '90']);
    // all over: no more requests
    await act(async () => vi.advanceTimersByTimeAsync(5 * ODDS_REFRESH_MS));
    expect(n).toBe(3);
  });
});
