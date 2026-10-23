// Node fetch helper: retries and parsing, with fetch mocked (no network).

import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixture.json';
import { fetchSchedule, ScheduleFetchError } from './node';

afterEach(() => vi.unstubAllGlobals());

const response = (status: number, body: string) => new Response(body, { status });

describe('fetchSchedule', () => {
  it('sends browser-like headers, retries on 5xx, then parses', async () => {
    const calls: RequestInit[] = [];
    let n = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls.push(init);
      return ++n === 1 ? response(500, 'oops') : response(200, JSON.stringify(fixture));
    });
    const retries: number[] = [];
    const s = await fetchSchedule({ retryDelaysMs: [1, 1], onRetry: (a) => retries.push(a) });
    expect(s.games).toHaveLength(9);
    expect(retries).toEqual([1]);
    expect((calls[0]!.headers as Record<string, string>).Referer).toBe('https://www.nba.com/');
  });

  it('does not retry 404 and reports the status', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => (n++, response(404, 'missing')));
    await expect(fetchSchedule({ retryDelaysMs: [1, 1] })).rejects.toMatchObject({ status: 404 });
    expect(n).toBe(1);
  });

  it('gives up after the configured retries', async () => {
    vi.stubGlobal('fetch', async () => response(503, 'busy'));
    await expect(fetchSchedule({ retryDelaysMs: [1, 1] })).rejects.toBeInstanceOf(ScheduleFetchError);
  });
});
