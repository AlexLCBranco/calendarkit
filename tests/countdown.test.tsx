// @vitest-environment jsdom
// CK-22: the Slate header's "⏱ Countdown" link — halftime-timer on a timer ending at the night's first tip-off, or at
// the next game that hasn't started; disabled when none is left.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countdownName, countdownTarget, countdownUrl, isoWithOffset } from '../src/slate/countdown';
import { SlateCopy, SlateDay } from '../src/slate/SlateCard';
import { dataOf, game, TEAM } from './synthetic';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DATE = '2026-11-19';
// 20:00, 20:00 (a second game at the same time), 22:30 ET; one without a time
const first = game({ date: DATE, utc: '2026-11-20T01:00:00Z', away: TEAM.BOS, home: TEAM.DEN });
const late = game({ date: DATE, utc: '2026-11-20T03:30:00Z', away: TEAM.LAL, home: TEAM.MIA });
const tbd = game({ date: DATE, utc: null, away: TEAM.NYK, home: TEAM.BOS });
const night = [late, tbd, first];
const T = Date.parse('2026-11-20T01:00:00Z');

describe('countdownTarget', () => {
  it('before the first tip-off: the first game', () => {
    expect(countdownTarget(night, T - 60_000)).toMatchObject({ game: first, start: T, first: true });
  });
  it('once the first has started: the next game that has not, marked as next', () => {
    expect(countdownTarget(night, T)).toMatchObject({ game: late, first: false });
    expect(countdownTarget(night, T + 3_600_000)).toMatchObject({ game: late, first: false });
  });
  it('none left (and games without a time never count): undefined', () => {
    expect(countdownTarget(night, Date.parse('2026-11-20T03:30:00Z'))).toBeUndefined();
    expect(countdownTarget([tbd], T - 86_400_000)).toBeUndefined();
    expect(countdownTarget([], T)).toBeUndefined();
  });
  it('a game already final has started, whatever its time says', () => {
    const done = game({ date: DATE, utc: '2026-11-20T01:00:00Z', final: [100, 90] });
    expect(countdownTarget([done, late], T - 60_000)).toMatchObject({ game: late, first: false });
  });
});

describe('the link', () => {
  it('ISO date-time with the zone’s offset at that moment', () => {
    expect(isoWithOffset(T, 'America/New_York')).toBe('2026-11-19T20:00:00-05:00');
    expect(isoWithOffset(T, 'Europe/Lisbon')).toBe('2026-11-20T01:00:00+00:00');
    expect(isoWithOffset(T, 'Asia/Kolkata')).toBe('2026-11-20T06:30:00+05:30');
    // summer time
    expect(isoWithOffset(Date.parse('2026-10-22T23:30:00Z'), 'America/New_York')).toBe('2026-10-22T19:30:00-04:00');
    // every form is the same instant
    for (const tz of ['America/New_York', 'Europe/Lisbon', 'Asia/Kolkata']) expect(Date.parse(isoWithOffset(T, tz))).toBe(T);
  });
  it('the name: First / Next game, the matchup, the time as the cards show it', () => {
    expect(countdownName(countdownTarget(night, T - 1)!, 'America/New_York')).toBe('First game · BOS @ DEN 20:00');
    expect(countdownName(countdownTarget(night, T)!, 'America/New_York')).toBe('Next game · LAL @ MIA 22:30');
    expect(countdownName(countdownTarget(night, T - 1)!, 'Europe/Lisbon')).toBe('First game · BOS @ DEN 01:00');
  });
  it('halftime-timer’s format (its README), end and name URL-encoded', () => {
    expect(countdownUrl(countdownTarget(night, T - 1)!, 'America/New_York')).toBe('https://halftime-timer.vercel.app/?end=2026-11-19T20:00:00-05:00&name=First%20game%20%C2%B7%20BOS%20%40%20DEN%2020%3A00');
    const url = new URL(countdownUrl(countdownTarget(night, T - 1)!, 'Asia/Kolkata'));
    // "+" must travel as %2B, or the timer reads a space
    expect(url.search).toContain('end=2026-11-20T06:30:00%2B05:30');
    expect(url.searchParams.get('end')).toBe('2026-11-20T06:30:00+05:30');
    expect(url.searchParams.get('name')).toBe('First game · BOS @ DEN 06:30');
  });
});

describe('the button in the Slate header', () => {
  const data = dataOf(night);
  const button = () => screen.getByTestId('slate-countdown');

  it('a link to the first game’s countdown, in a new tab, inside the header line, never in a copy', () => {
    vi.useFakeTimers({ now: T - 3_600_000, toFake: ['Date'] });
    render(<SlateDay data={data} date={DATE} width={1840} timeZone="America/New_York" />);
    expect(button().closest('[data-testid="slate-header"]')).not.toBeNull();
    expect(button().textContent).toBe('⏱ Countdown');
    expect(button().getAttribute('href')).toBe(countdownUrl({ game: first, start: T, first: true }, 'America/New_York'));
    expect(button().getAttribute('target')).toBe('_blank');
    expect(button().getAttribute('data-capture-exclude')).toBe('true');
  });

  it('the first game has started by the time the pointer reaches it: the next game', () => {
    vi.useFakeTimers({ now: T - 60_000, toFake: ['Date'] });
    render(<SlateDay data={data} date={DATE} width={1840} timeZone="America/New_York" />);
    expect(new URL(button().getAttribute('href')!).searchParams.get('name')).toBe('First game · BOS @ DEN 20:00');
    vi.setSystemTime(T + 60_000);
    fireEvent.pointerEnter(button());
    expect(new URL(button().getAttribute('href')!).searchParams.get('name')).toBe('Next game · LAL @ MIA 22:30');
    expect(new URL(button().getAttribute('href')!).searchParams.get('end')).toBe('2026-11-19T22:30:00-05:00');
  });

  it('no game left: disabled, "No more games today"', () => {
    vi.useFakeTimers({ now: T + 86_400_000, toFake: ['Date'] });
    render(<SlateDay data={data} date={DATE} width={1840} timeZone="America/New_York" />);
    expect(button().getAttribute('href')).toBeNull();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().getAttribute('data-tip')).toBe('No more games today');
  });

  it('the night with the TV filter on still counts to the whole night’s first game', () => {
    vi.useFakeTimers({ now: T - 3_600_000, toFake: ['Date'] });
    const tv = game({ date: DATE, utc: '2026-11-20T03:30:00Z', away: TEAM.LAL, home: TEAM.MIA, natl: ['ESPN'] });
    render(<SlateDay data={dataOf([first, tv])} date={DATE} width={1840} timeZone="America/New_York" tvOnly />);
    expect(new URL(button().getAttribute('href')!).searchParams.get('name')).toBe('First game · BOS @ DEN 20:00');
  });

  it('the copy layout: in a host’s live widget, not in an image', () => {
    vi.useFakeTimers({ now: T - 3_600_000, toFake: ['Date'] });
    const { unmount } = render(<SlateCopy data={data} games={data.byDate.get(DATE)!} cols={2} cardWidth={500} timeZone="America/New_York" />);
    expect(screen.queryByTestId('slate-countdown')).toBeNull();
    unmount();
    render(<SlateCopy data={data} games={data.byDate.get(DATE)!} cols={2} cardWidth={500} timeZone="America/New_York" editNotes gameLink={() => 'https://example.test/'} />);
    expect(new URL(button().getAttribute('href')!).searchParams.get('name')).toBe('First game · BOS @ DEN 20:00');
  });
});
