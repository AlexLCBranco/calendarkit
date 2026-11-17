// gauntlet GT-5: a page that stays open (the gauntlet's Slate widget) picks up a newer schedule snapshot — the morning's
// final scores, a moved game — without a reload (src/data/load.ts refreshCalendarData).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8'));
const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.resetModules());

describe('refreshCalendarData', () => {
  it('the same snapshot: nothing new; a newer one: its data, also for a later loadCalendarData', async () => {
    const { loadCalendarData, refreshCalendarData } = await import('../src/data/load');
    const first = await loadCalendarData('x', answer(raw) as typeof fetch);
    expect(first.updatedAt).toBe(raw.meta.time);
    expect(await refreshCalendarData(first.updatedAt, 'x', answer(raw) as typeof fetch)).toBeUndefined();

    // the next morning: a new time
    const next = structuredClone(raw);
    next.meta.time = '2099-01-01T11:00:00Z';
    const fresh = await refreshCalendarData(first.updatedAt, 'x', answer(next) as typeof fetch);
    expect(fresh?.updatedAt).toBe('2099-01-01T11:00:00Z');
    expect(fresh).not.toBe(first);
    expect([...fresh!.byDate.keys()]).toEqual([...first.byDate.keys()]);
    // the page's data is now the new one
    expect(await loadCalendarData('x', answer(raw) as typeof fetch)).toBe(fresh);
  });

  it('asks the browser to revalidate (no-cache); a failure or a bad answer keeps what the page has', async () => {
    const { refreshCalendarData } = await import('../src/data/load');
    const seen: RequestInit[] = [];
    await refreshCalendarData('t', 'x', (async (_u: string, init: RequestInit) => (seen.push(init), new Response(JSON.stringify(raw)))) as typeof fetch);
    expect(seen[0]?.cache).toBe('no-cache');
    expect(await refreshCalendarData('t', 'x', answer({}, 503) as typeof fetch)).toBeUndefined();
    expect(await refreshCalendarData('t', 'x', (async () => { throw new Error('offline'); }) as typeof fetch)).toBeUndefined();
    expect(await refreshCalendarData('t', 'x', answer({ nope: 1 }) as typeof fetch)).toBeUndefined();
  });
});

describe('calendarDataFromRaw (gauntlet GT-10)', () => {
  it('the same data as loading the snapshot, without fetching or keeping it', async () => {
    const { calendarDataFromRaw, loadCalendarData } = await import('../src/data/load');
    const made = calendarDataFromRaw(raw);
    const loaded = await loadCalendarData('x', answer(raw) as typeof fetch);
    expect(made.updatedAt).toBe(raw.meta.time);
    expect([...made.byDate.keys()]).toEqual([...loaded.byDate.keys()]);
    expect(made).not.toBe(loaded);
    expect(await loadCalendarData('x', answer({}) as typeof fetch)).toBe(loaded); // the page's data is untouched
  });
});
