// Daily deploy check (scripts/verify-deploy.ts): polls the live snapshot until its meta.time matches the committed
// one; fails after the last try. Fake fetch and sleep, so no network and no waiting. The workflow wiring is checked
// against the YAML text.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOOK_AFTER, INTERVAL_MS, TRIES, verifyDeploy } from '../scripts/verify-deploy';

const json = (time: string) => new Response(JSON.stringify({ meta: { time } }), { status: 200 });

function setup(responses: (() => Response)[]) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    expect((init?.headers as Record<string, string>)['cache-control']).toBe('no-cache');
    return responses[Math.min(i++, responses.length - 1)]!();
  }) as unknown as typeof fetch;
  return { urls, sleeps, opts: { fetchImpl, sleep: async (ms: number) => void sleeps.push(ms), log: () => {} } };
}

describe('verifyDeploy', () => {
  it('passes as soon as the live meta.time equals the committed one (old deploy first, then a 404, then the new)', async () => {
    const { urls, sleeps, opts } = setup([() => json('2026-10-22T11:00:00Z'), () => new Response('', { status: 404 }), () => json('2026-10-23T11:29:41.2941Z')]);
    expect(await verifyDeploy({ expected: '2026-10-23T11:29:41.2941Z', url: 'https://x.test/data/schedule.json', ...opts })).toBe(true);
    expect(urls).toHaveLength(3);
    expect(new Set(urls).size).toBe(3); // a fresh query each time: no CDN-cached answer
    expect(urls[0]).toMatch(/^https:\/\/x\.test\/data\/schedule\.json\?verify=/);
    expect(sleeps).toEqual([INTERVAL_MS, INTERVAL_MS]);
  });

  it('fails after ~30 minutes of the old snapshot (or network errors)', async () => {
    const { urls, sleeps, opts } = setup([
      () => {
        throw new Error('ECONNRESET');
      },
      () => json('2026-10-22T11:00:00Z'),
    ]);
    expect(await verifyDeploy({ expected: '2026-10-23T11:29:41.2941Z', ...opts })).toBe(false);
    expect(urls).toHaveLength(TRIES);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe((TRIES - 1) * INTERVAL_MS);
    expect((TRIES * INTERVAL_MS) / 60_000).toBe(30);
    expect(urls[0]).toMatch(/^https:\/\/gauntlet-home\.vercel\.app\/calendar\/data\/schedule\.json\?/);
  });
});

describe('verifyDeploy: a slow Vercel build (v1.40.0)', () => {
  // 2026-11-05: the bot's commit was built 20 min after the push; the old 10-minute check failed while it queued.
  it('still passes when the new snapshot goes live after 20 minutes, and calls the deploy hook once at 10 minutes', async () => {
    const responses = Array.from({ length: 40 }, () => () => json('2026-11-04T13:16:43.1643Z'));
    const { urls, opts } = setup([...responses, () => json('2026-11-05T13:23:25.2325Z')]);
    const hookAt: number[] = [];
    const onSlow = async () => void hookAt.push(urls.length);
    expect(await verifyDeploy({ expected: '2026-11-05T13:23:25.2325Z', ...opts, onSlow })).toBe(true);
    expect(urls).toHaveLength(41);
    expect(hookAt).toEqual([HOOK_AFTER]);
    expect((HOOK_AFTER * INTERVAL_MS) / 60_000).toBe(10);
  });
  it('a failing deploy hook does not stop the check', async () => {
    const { opts } = setup([...Array.from({ length: 25 }, () => () => json('old')), () => json('new')]);
    expect(await verifyDeploy({ expected: 'new', ...opts, onSlow: async () => Promise.reject(new Error('HTTP 404')) })).toBe(true);
  });
});

describe('workflow wiring (schedule-update.yml)', () => {
  const yml = readFileSync('.github/workflows/schedule-update.yml', 'utf8');
  it('the commit step reports whether it committed; the check runs only then', () => {
    expect(yml).toMatch(/id: commit/);
    expect(yml).toMatch(/committed=true.*>>\s*"\$GITHUB_OUTPUT"/);
    expect(yml).toMatch(/if: steps\.commit\.outputs\.committed == 'true'\s*\n\s*run: npx tsx scripts\/verify-deploy\.ts/);
  });
  it('the check gets the optional deploy hook secret, and the job has time for the 30-minute wait', () => {
    expect(yml).toMatch(/VERCEL_DEPLOY_HOOK_URL: \$\{\{ secrets\.VERCEL_DEPLOY_HOOK_URL \}\}/);
    expect(Number(/timeout-minutes: (\d+)/.exec(yml)![1])).toBeGreaterThanOrEqual(45);
  });
});
