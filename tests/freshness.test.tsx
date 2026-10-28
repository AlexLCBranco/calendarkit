// @vitest-environment jsdom
// Data freshness: "Data updated <date, time>" under the time-zone note (viewer's zone, from the feed's meta.time),
// orange with a tooltip once older than 36 h; the loader keeps meta.time; the app's "Try again" after a failed load.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import raw from './fixtures/feed-2026-10-23.json';
import { CalendarView } from '../src/components/CalendarView';
import { loadCalendarData } from '../src/data/load';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DESKTOP = { width: 1840, height: 1000 };
const UPDATED = '2026-10-23T11:29:41.2941Z';
const T = Date.parse(UPDATED);
const H = 3_600_000;
const stamp = () => screen.getByTestId('data-updated');
const view = (now: number, timeZone: string, updatedAt: string | null = UPDATED) =>
  render(<CalendarView data={data} size={DESKTOP} now={now} timeZone={timeZone} note={`Times in your time zone (${timeZone})`} updatedAt={updatedAt ?? undefined} />);

describe('"Data updated" stamp', () => {
  it('shows the feed time in the viewer\'s zone, small and muted, next to (under) the time-zone note', () => {
    view(T + H, 'America/Sao_Paulo');
    expect(stamp().textContent).toBe('Data updated Oct 23, 08:29');
    expect(stamp().classList).not.toContain('ck-stamp-stale');
    expect(stamp().getAttribute('data-tip')).toBeNull();
    expect(stamp().parentElement).toBe(screen.getByTestId('tz-note').parentElement);
    cleanup();
    view(T + H, 'America/New_York');
    expect(stamp().textContent).toBe('Data updated Oct 23, 07:29');
    cleanup();
    view(T + H, 'Asia/Tokyo');
    expect(stamp().textContent).toBe('Data updated Oct 23, 20:29');
  });

  it('turns orange with a tooltip once the data is older than 36 hours', () => {
    const { rerender } = view(T + 36 * H - 60_000, 'UTC');
    expect(stamp().classList).not.toContain('ck-stamp-stale');
    rerender(<CalendarView data={data} size={DESKTOP} now={T + 36 * H + 60_000} timeZone="UTC" note="tz" updatedAt={UPDATED} />);
    expect(stamp().classList).toContain('ck-stamp-stale');
    expect(stamp().getAttribute('data-tip')).toMatch(/more than 36 hours old.*daily update may have failed/);
    fireEvent.mouseOver(stamp());
    expect(screen.getByTestId('tooltip').textContent).toMatch(/daily update may have failed/);
  });

  it('no stamp without a feed time, and none on phones (desktop only)', () => {
    view(T + H, 'UTC', null);
    expect(screen.queryByTestId('data-updated')).toBeNull();
    cleanup();
    render(<CalendarView data={data} size={{ width: 360, height: 700 }} now={T + H} timeZone="UTC" note="tz" updatedAt={UPDATED} />);
    expect(screen.queryByTestId('data-updated')).toBeNull();
  });
});

describe('loader', () => {
  it('keeps the feed\'s own timestamp (meta.time)', async () => {
    const d = await loadCalendarData('/x.json', (async () => new Response(JSON.stringify(raw))) as unknown as typeof fetch);
    expect(d.updatedAt).toBe(raw.meta.time);
  });
});

describe('app: Try again after a failed load', () => {
  it('shows the error with a "Try again" button; clicking it loads the schedule', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-23T15:00:00Z'));
    let calls = 0;
    vi.stubGlobal('fetch', async () => (++calls === 1 ? new Response('down', { status: 503 }) : new Response(JSON.stringify(raw), { status: 200 })));
    vi.resetModules(); // a fresh loader: its in-memory cache holds the earlier test's data
    const { App } = await import('../src/App');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/HTTP 503/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('top-bar')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls).toBe(2);
  });
});
