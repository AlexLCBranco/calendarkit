// @vitest-environment jsdom
// CK-21: live scores with a red LIVE label — ESPN status → label text, the polling rules (only while a game on screen is
// live or within 15 min of tip-off, only while the tab is visible, never after the end), a failure keeps the last
// score, and the views show the score so far and LIVE, then the final, without a reload.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { dayInPlay, liveDetail, oddsCacheSeconds, periodName, type EspnEvent } from '../src/data/odds';
import { createOddsStore, LIVE_MAX_MS, LIVE_REFRESH_MS, oddsKey, type DayOdds } from '../src/slate/odds';
import { dataOf, game, TEAM } from './synthetic';
import { SlateDay } from '../src/slate/SlateCard';
import { cupSquareNow } from '../src/slate/CupSquare';
import { LiveLabel } from '../src/slate/live';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TIP = Date.parse('2026-11-11T00:00:00Z'); // 19:00 ET, Nov 10
const g1 = game({ date: '2026-11-10', utc: '2026-11-11T00:00:00Z', away: TEAM.BOS, home: TEAM.NYK });
const key = oddsKey(g1);
const inPlay = (away: number, home: number, period = 3, clock = '4:12', status = 'STATUS_IN_PROGRESS'): DayOdds => ({ date: g1.dateEt, games: {}, live: true, inPlay: { [key]: { away, home, period, clock, status } } });
const final = (away: number, home: number, statusText = 'Final'): DayOdds => ({ date: g1.dateEt, games: {}, live: false, finals: { [key]: { away, home, statusText } } });

/** A visibility state the test can flip, with the listeners the store adds. */
function fakeDoc() {
  const fns = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, f: () => void) => void fns.add(f),
    removeEventListener: (_: string, f: () => void) => void fns.delete(f),
  };
  return { doc: doc as unknown as Document, set: (v: DocumentVisibilityState) => ((doc.visibilityState = v), fns.forEach((f) => f())) };
}

describe('the label', () => {
  it('ESPN status → period and clock: Q1–Q4, Half, End of a quarter, OT, 2OT', () => {
    expect(liveDetail({ period: 1, clock: '11:48', status: 'STATUS_IN_PROGRESS' })).toBe('Q1 11:48');
    expect(liveDetail({ period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' })).toBe('Q3 4:12');
    expect(liveDetail({ period: 4, clock: '24.6', status: 'STATUS_IN_PROGRESS' })).toBe('Q4 24.6');
    expect(liveDetail({ period: 2, clock: '0.0', status: 'STATUS_HALFTIME' })).toBe('Half');
    expect(liveDetail({ period: 3, clock: '0.0', status: 'STATUS_END_PERIOD' })).toBe('End Q3');
    expect(liveDetail({ period: 1, clock: '0:00', status: 'STATUS_SOMETHING_NEW' })).toBe('End Q1');
    expect(liveDetail({ period: 5, clock: '1:30', status: 'STATUS_IN_PROGRESS' })).toBe('OT 1:30');
    expect(liveDetail({ period: 6, clock: '0:12', status: 'STATUS_IN_PROGRESS' })).toBe('2OT 0:12');
    expect([1, 4, 5, 7].map(periodName)).toEqual(['Q1', 'Q4', 'OT', '3OT']);
  });

  it('the scoreboard: only games in play, with both scores, keyed like the odds; pre-game and final ones left out', () => {
    const ev = (id: string, state: string, score?: string, extra = {}): EspnEvent => ({
      id,
      competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'NY' }, score }, { homeAway: 'away', team: { abbreviation: 'BOS' }, score }], status: { period: 2, displayClock: '0.0', type: { name: 'STATUS_HALFTIME', state }, ...extra } }],
    });
    expect(dayInPlay({ events: [ev('1', 'in', '55')] })).toEqual({ 'BOS@NYK': { away: 55, home: 55, period: 2, clock: '0.0', status: 'STATUS_HALFTIME' } });
    expect(dayInPlay({ events: [ev('1', 'pre', '0'), ev('2', 'post', '99'), ev('3', 'in', undefined)] })).toEqual({});
  });

  it('the CDN keeps an answer 1 minute from 15 min before a tip-off, 10 minutes before that', () => {
    const pre = (date: string): EspnEvent => ({ id: 'x', date, competitions: [{ competitors: [], status: { type: { state: 'pre' } } }] });
    expect(oddsCacheSeconds([pre('2026-11-11T00:00Z')], TIP - 16 * 60_000)).toBe(600);
    expect(oddsCacheSeconds([pre('2026-11-11T00:00Z')], TIP - 14 * 60_000)).toBe(60);
    expect(oddsCacheSeconds([pre('2026-11-11T00:00Z')], TIP + 3 * 86_400_000)).toBe(600); // postponed, days ago
  });
});

describe('the polling', () => {
  it('nothing until 15 min before tip-off; then every minute; stops once the game is final', async () => {
    vi.useFakeTimers({ now: TIP - 3 * 3_600_000 });
    const answers = [inPlay(0, 0, 1, '12:00'), inPlay(10, 8, 1, '7:01'), final(101, 99)];
    let n = 0;
    const store = createOddsStore(async () => answers[Math.min(n++, answers.length - 1)]!, Date.now, fakeDoc().doc);
    store.watch([g1]);
    await vi.advanceTimersByTimeAsync(2 * 3_600_000 + 44 * 60_000); // 16 min before
    expect(n).toBe(0);
    await vi.advanceTimersByTimeAsync(90_000); // 14.5 min before (the first ask came at 15)
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(n).toBe(2);
    expect(store.get(g1.dateEt)?.inPlay?.[key]).toMatchObject({ away: 10, home: 8 });
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(n).toBe(3);
    expect(store.get(g1.dateEt)?.finals?.[key]).toMatchObject({ away: 101, home: 99 });
    await vi.advanceTimersByTimeAsync(30 * LIVE_REFRESH_MS);
    expect(n).toBe(3); // final: nothing more
  });

  it('no game near or live on screen: no request and no repeating timer; unwatched: nothing', async () => {
    vi.useFakeTimers({ now: TIP + LIVE_MAX_MS + 60_000 }); // well after tip-off, ESPN never said live
    let n = 0;
    const store = createOddsStore(async () => (n++, { date: g1.dateEt, games: {} }), Date.now, fakeDoc().doc);
    const stop = store.watch([g1]);
    await vi.advanceTimersByTimeAsync(60 * LIVE_REFRESH_MS);
    expect(n).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    vi.setSystemTime(TIP - 60_000);
    const stop2 = store.watch([g1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(1);
    stop2();
    await vi.advanceTimersByTimeAsync(10 * LIVE_REFRESH_MS);
    expect(n).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hidden tab asks nothing; coming back asks at once', async () => {
    vi.useFakeTimers({ now: TIP + 60_000 });
    let n = 0;
    const vis = fakeDoc();
    const store = createOddsStore(async () => (n++, inPlay(2, 0, 1, '11:00')), Date.now, vis.doc);
    store.watch([g1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(1);
    vis.set('hidden');
    await vi.advanceTimersByTimeAsync(10 * LIVE_REFRESH_MS);
    expect(n).toBe(1);
    vis.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(2);
  });

  it('a failure keeps the last score on screen', async () => {
    vi.useFakeTimers({ now: TIP + 60_000 });
    let n = 0;
    const store = createOddsStore(async () => (n++ === 0 ? inPlay(30, 28) : Promise.reject(new Error('ESPN down'))), Date.now, fakeDoc().doc);
    store.watch([g1]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3 * LIVE_REFRESH_MS);
    expect(n).toBeGreaterThan(1);
    expect(store.get(g1.dateEt)?.inPlay?.[key]).toMatchObject({ away: 30, home: 28 });
  });
});

describe('the views', () => {
  it('League List and Team Calendar: the score so far and a red LIVE label, then the final with no reload', async () => {
    vi.useFakeTimers({ now: TIP + 60 * 60_000 });
    let answer = inPlay(58, 61, 3, '4:12');
    const store = createOddsStore(async () => answer, Date.now, fakeDoc().doc);
    const data = dataOf([g1]);
    const list = render(<CalendarView data={data} odds={store} size={{ width: 1840, height: 1000 }} now={Date.now()} timeZone="UTC" initial={{ date: '2026-11-10' }} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const row = () => list.container.querySelector<HTMLElement>(`.ck-card[data-game-id="${g1.gameId}"]`)!;
    expect(row().querySelector('[data-testid="live"]')!.textContent).toBe('LIVE Q3 4:12');
    expect([...row().querySelectorAll('.ck-score')].map((s) => s.textContent)).toEqual(['58', '61']);
    expect(row().querySelector('.ck-score-win')).toBeNull(); // no winner yet
    answer = final(101, 99, 'Final/OT');
    await act(async () => vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS));
    expect(row().querySelector('[data-testid="live"]')).toBeNull();
    expect([...row().querySelectorAll('.ck-score')].map((s) => s.textContent)).toEqual(['101', '99']);
    expect(row().querySelector('.ck-ot')!.textContent).toBe('OT');
    list.unmount();

    answer = inPlay(40, 44, 2, '0.0', 'STATUS_HALFTIME');
    const store2 = createOddsStore(async () => answer, Date.now, fakeDoc().doc);
    const cal = render(<CalendarView data={data} odds={store2} size={{ width: 1840, height: 1000 }} now={Date.now()} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS, date: '2026-11-10' }} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const cell = cal.container.querySelector<HTMLElement>(`.ck-card[data-game-id="${g1.gameId}"]`)!;
    expect(cell.querySelector('[data-testid="live"]')!.textContent).toMatch(/^LIVE/);
    expect(cell.textContent).toContain('40');
    expect(cell.textContent).toContain('44');
  });

  it('Slate: LIVE with the period and clock in the status, the scores by the names; then Final', async () => {
    vi.useFakeTimers({ now: TIP + 60 * 60_000 });
    let answer = inPlay(77, 70, 4, '2:05');
    const store = createOddsStore(async () => answer, Date.now, fakeDoc().doc);
    const r = render(<SlateDay data={dataOf([g1])} date="2026-11-10" width={1840} timeZone="UTC" odds={store} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const card = () => r.container.querySelector<HTMLElement>(`.ck-slate-card[data-game-id="${g1.gameId}"]`)!;
    expect(card().querySelector('[data-testid="slate-status"]')!.textContent).toBe('LIVE Q4 2:05');
    expect([...card().querySelectorAll('.ck-slate-score')].map((x) => x.textContent)).toEqual(['77', '70']);
    expect(card().querySelector('.ck-loss')).toBeNull();
    answer = final(110, 104);
    await act(async () => vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS));
    expect(card().querySelector('[data-testid="slate-status"]')!.textContent).toBe('Final');
    expect([...card().querySelectorAll('.ck-slate-score')].map((x) => x.textContent)).toEqual(['110', '104']);
  });

  it('a Cup square: LIVE and the score so far from the team’s side; W / L once ESPN has it final', () => {
    const sq = { gameId: g1.gameId, opponent: 'BOS', home: true, played: false };
    const live = cupSquareNow(sq, g1, { away: 50, home: 61, period: 3, clock: '1:00', status: 'STATUS_IN_PROGRESS' });
    expect(live.live).toEqual({ score: '61–50', tip: 'LIVE Q3 1:00 · BOS 50 @ NYK 61' });
    const done = { ...g1, status: 'final' as const, statusText: 'Final', awayTeam: { ...g1.awayTeam, score: 99 }, homeTeam: { ...g1.homeTeam, score: 104 } };
    expect(cupSquareNow(sq, done, undefined)).toMatchObject({ played: true, win: true, margin: 5, final: 'BOS 99 @ NYK 104 · Final' });
  });

  it('the Slate strip: a clock longer than "Q3 4:12" shows the period alone, the full clock in the tooltip', () => {
    const r = render(<LiveLabel live={{ away: 1, home: 2, period: 6, clock: '10:59', status: 'STATUS_IN_PROGRESS' }} maxChars={7} />);
    expect(r.getByTestId('live').textContent).toBe('LIVE 2OT');
    expect(r.getByTestId('live').dataset.tip).toBe('Live: 2OT 10:59');
    cleanup();
    expect(render(<LiveLabel live={{ away: 1, home: 2, period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' }} maxChars={7} />).getByTestId('live').textContent).toBe('LIVE Q3 4:12');
  });

  it('without a store: no request, the tip-off as before', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = render(<CalendarView data={dataOf([g1])} size={{ width: 1840, height: 1000 }} now={TIP + 60_000} timeZone="UTC" initial={{ date: '2026-11-10' }} />);
    expect(r.container.querySelector('[data-testid="live"]')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
