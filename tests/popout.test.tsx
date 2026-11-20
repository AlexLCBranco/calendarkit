// @vitest-environment jsdom
// CK-23: the floating live scores window — each game's line (tip-off / LIVE / final, the scores), the countdown before
// the first game that turns into the list at tip-off, the window's size, and the button: hidden without Document
// Picture-in-Picture, a second click closes the window, the window outlives the Slate (another place keeps it).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { countdownText, firstGame, livePopout, popHeight, popRow, POP_WIDTH } from '../src/components/LivePopout';
import { createOddsStore, oddsKey, type DayOdds } from '../src/slate/odds';
import { dataOf, game, TEAM } from './synthetic';
import { goTo } from './nav';

const DATE = '2026-11-10';
const early = game({ date: DATE, utc: '2026-11-11T00:00:00Z', away: TEAM.BOS, home: TEAM.NYK }); // 19:00 ET
const late = game({ date: DATE, utc: '2026-11-11T03:00:00Z', away: TEAM.LAL, home: TEAM.NYK }); // 22:00 ET
const done = game({ date: DATE, utc: '2026-11-10T20:00:00Z', away: TEAM.MIA, home: TEAM.DEN, final: [101, 99] });
const data = dataOf([early, late, done]);

afterEach(() => {
  livePopout.close();
  cleanup();
  vi.useRealTimers();
  delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

describe('a line', () => {
  it('upcoming: the local tip-off; live: the score so far; final: the score and Final / Final/OT', () => {
    expect(popRow(early, undefined, 'UTC')).toEqual({ id: early.gameId, away: 'BOS', home: 'NYK', state: 'upcoming', status: '00:00 (+1)' });
    expect(popRow(early, undefined, 'America/New_York').status).toBe('19:00');
    expect(popRow(early, { away: 58, home: 61, period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' })).toMatchObject({ state: 'live', awayScore: 58, homeScore: 61 });
    expect(popRow(done, undefined)).toMatchObject({ state: 'final', status: 'Final', awayScore: 101, homeScore: 99 });
    expect(popRow({ ...done, statusText: 'Final/OT2' }, undefined).status).toBe('Final/2OT');
  });

  it('the first game, the countdown text, the window size', () => {
    expect(firstGame([late, early])!.game).toBe(early);
    expect(firstGame([])).toBeUndefined();
    expect([countdownText(3 * 3600_000 + 5 * 60_000 + 9_000), countdownText(23 * 60_000 + 45_000), countdownText(4_200), countdownText(-5)]).toEqual(['3:05:09', '23:45', '0:05', '0:00']);
    // a normal night (up to 15 games) fits without a scrollbar: one 26 px line each
    expect([popHeight(0), popHeight(12), popHeight(15), popHeight(20)]).toEqual([4 * 26 + 52, 12 * 26 + 52, 15 * 26 + 52, 15 * 26 + 52]);
  });
});

describe('the window', () => {
  /** Document Picture-in-Picture stood in for by an iframe (same origin, its own document). */
  function fakePip() {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const requestWindow = vi.fn(async () => frame.contentWindow!);
    (window as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow };
    const doc = () => frame.contentDocument!;
    return { requestWindow, doc, close: () => frame.contentWindow!.dispatchEvent(new Event('pagehide')) };
  }
  const answer: DayOdds = { date: DATE, games: {}, live: true, inPlay: { [oddsKey(early)]: { away: 58, home: 61, period: 3, clock: '4:12', status: 'STATUS_IN_PROGRESS' } } };
  const open = (now: number, d = data) => {
    const odds = createOddsStore(async () => answer, () => now);
    return render(<CalendarView data={d} odds={odds} size={{ width: 1600, height: 1000 }} now={now} timeZone="UTC" initial={{ mode: 'league', layout: 'slate', date: DATE }} />);
  };

  it('no Document Picture-in-Picture (Firefox, Safari): no button', () => {
    open(Date.parse('2026-11-11T01:00:00Z'));
    expect(screen.queryByTestId('live-popout')).toBeNull();
  });

  it('during the night: one line per game in tip-off order — the final, the live one (red LIVE Q3 4:12, 58 @ 61), the one to come', async () => {
    const now = Date.parse('2026-11-11T01:00:00Z');
    vi.useFakeTimers({ now, toFake: ['Date'] });
    const pip = fakePip();
    open(now);
    await act(async () => fireEvent.click(screen.getByTestId('live-popout')));
    expect(pip.requestWindow).toHaveBeenCalledWith({ width: POP_WIDTH, height: popHeight(3) });
    const rows = () => [...pip.doc().querySelectorAll('[data-testid="popout-list"] li')].map((li) => [li.getAttribute('data-state'), li.textContent!.replace(/\s+/g, ' ').trim()]);
    await vi.waitFor(() => expect(rows()[1]).toEqual(['live', 'LIVE Q3 4:12BOS58@61NYK']));
    expect(rows()).toEqual([
      ['final', 'FinalMIA101@99DEN'],
      ['live', 'LIVE Q3 4:12BOS58@61NYK'],
      ['upcoming', '03:00 (+1)LAL@NYK'],
    ]);
    // the page's styles came along (the LIVE label's red)
    expect(pip.doc().querySelectorAll('style').length).toBeGreaterThan(0);
    // the button now closes it; another place keeps the window open
    expect(screen.getByTestId('live-popout').textContent).toBe('Close live scores window');
    goTo('Standings');
    expect(pip.doc().querySelector('[data-testid="popout"]')).toBeTruthy();
    goTo('Schedule');
    // closed by the browser (its ×): the button opens again
    act(() => pip.close());
    expect(screen.getByTestId('live-popout').textContent).toBe('⧉ Pop out live scores');
  });

  it('before the first game: a countdown to it, which turns into the list at tip-off', async () => {
    const tip = Date.parse(early.startTimeUtc!);
    vi.useFakeTimers({ now: tip - (2 * 3600_000 + 5_000), toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const pip = fakePip();
    open(Date.now(), dataOf([early, late])); // the night's first game is still to come
    await act(async () => fireEvent.click(screen.getByTestId('live-popout')));
    const doc = pip.doc();
    expect(doc.querySelector('[data-testid="popout-countdown"]')!.textContent).toMatch(/^First game · BOS @ NYK 00:00 \(\+1\)/);
    expect(doc.querySelector('[data-testid="popout-clock"]')!.textContent).toBe('2:00:05');
    await act(async () => void vi.advanceTimersByTime(3_000));
    expect(doc.querySelector('[data-testid="popout-clock"]')!.textContent).toBe('2:00:02');
    await act(async () => void vi.advanceTimersByTime(2 * 3600_000 + 3_000));
    expect(doc.querySelector('[data-testid="popout-countdown"]')).toBeNull();
    expect(doc.querySelectorAll('[data-testid="popout-list"] li')).toHaveLength(2);
  });
});
