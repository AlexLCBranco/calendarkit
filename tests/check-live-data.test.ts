// The live data freshness alarm (scripts/check-live-data.ts) and the data cache header that bounds how long
// the gauntlet's edge may keep serving an old snapshot after a deploy.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freshnessProblems, liveMetaTime } from '../scripts/check-live-data';

const NOW = Date.parse('2026-11-05T19:00:00Z');

describe('freshnessProblems', () => {
  it('passes when the live site serves the latest snapshot, or one less than a day older', () => {
    expect(freshnessProblems({ live: '2026-11-05T13:23:25.2325Z', latest: '2026-11-05T13:23:25.2325Z', now: NOW })).toEqual([]);
    expect(freshnessProblems({ live: '2026-11-04T13:30:00Z', latest: '2026-11-05T13:23:25Z', now: NOW })).toEqual([]);
  });
  it('fails when the live data is more than 1 day behind the latest snapshot', () => {
    const p = freshnessProblems({ live: '2026-11-03T13:00:00Z', latest: '2026-11-05T13:23:25Z', now: NOW });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/48\.4 h behind the latest snapshot.*didn't reach production/);
  });
  it('fails when the live file can\'t be read', () => {
    expect(freshnessProblems({ live: 'HTTP 404', latest: '2026-11-05T13:23:25Z', now: NOW })[0]).toMatch(/can't be read \(HTTP 404\)/);
  });
  it('fails when the latest snapshot itself is more than 2 days old (the daily job stopped)', () => {
    const p = freshnessProblems({ live: '2026-11-03T11:00:00Z', latest: '2026-11-03T11:00:00Z', now: NOW });
    expect(p).toEqual([expect.stringMatching(/56\.0 h old: the daily schedule update has stopped/)]);
  });
});

describe('liveMetaTime', () => {
  it('reads meta.time with a fresh query and no-cache; reports HTTP and network errors as text', async () => {
    const urls: string[] = [];
    const ok = (async (u: string, init?: RequestInit) => {
      urls.push(u);
      expect((init?.headers as Record<string, string>)['cache-control']).toBe('no-cache');
      return new Response(JSON.stringify({ meta: { time: 'T' } }));
    }) as unknown as typeof fetch;
    expect(await liveMetaTime('https://x.test/s.json', ok)).toBe('T');
    expect(urls[0]).toMatch(/^https:\/\/x\.test\/s\.json\?fresh=\d+$/);
    expect(await liveMetaTime('https://x.test/s.json', (async () => new Response('', { status: 503 })) as unknown as typeof fetch)).toBe('HTTP 503');
    expect(await liveMetaTime('https://x.test/s.json', (async () => Promise.reject(new Error('ENOTFOUND'))) as unknown as typeof fetch)).toBe('error: ENOTFOUND');
  });
});

describe('wiring', () => {
  it('runs every 4 hours and after each push to main (CI live job)', () => {
    expect(readFileSync('.github/workflows/data-freshness.yml', 'utf8')).toMatch(/cron: '17 \*\/4 \* \* \*'[\s\S]*npx tsx scripts\/check-live-data\.ts/);
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toMatch(/live:[\s\S]*run: npx tsx scripts\/check-live-data\.ts/);
  });
  it('the snapshot may be served stale for minutes, not a day, after a deploy', () => {
    // was stale-while-revalidate=86400: through the gauntlet's rewrite, the first visitor after a quiet spell got the
    // previous day's snapshot (X-Vercel-Cache: STALE) while the edge refetched
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const data = v.headers.filter((h) => h.source.includes('/data/'));
    expect(data).toHaveLength(2);
    for (const h of data) {
      const cc = h.headers.find((x) => x.key === 'Cache-Control')!.value;
      // (`\\d` in a template string: a plain `\d` is just "d", and the check then read 0 + 0 and always passed)
      const n = (k: string) => Number(new RegExp(`${k}=(\\d+)`).exec(cc)?.[1] ?? NaN);
      expect(n('max-age'), cc).toBeGreaterThan(0);
      expect(n('max-age') + n('stale-while-revalidate')).toBeLessThanOrEqual(600);
    }
  });
});
