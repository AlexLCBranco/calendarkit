// `npm run e2e:live -- <url>`: with nothing else it runs the live check CI runs (the live job), not the whole suite —
// most of the suite is written for a local build (relative addresses, the snapshot's data, no live scores) and failed
// 50 times against the live site on 2026-11-24 although the site was fine.
// Vercel requests are a budget (CLAUDE.md, 2026-11-24): CI's live check is version + smoke only, and the wait for the
// deploy polls the live version.json no more often than every 30 s.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FULL_LIVE_TESTS, LIVE_TESTS, liveArgs } from '../scripts/e2e-live';
import { MAX_ATTEMPTS, POLL_MS } from '../scripts/wait-live';

describe('e2e:live arguments', () => {
  it('nothing after the address: the small live check CI runs (version + smoke only)', () => {
    expect(liveArgs([])).toEqual(['--project=desktop-xl', 'e2e/smoke.spec.ts', 'e2e/version.spec.ts']);
    expect(liveArgs([])).toEqual(LIVE_TESTS);
  });
  it('--full: the fuller live check by hand (adds move.spec.ts)', () => {
    expect(liveArgs(['--full'])).toEqual(['--project=desktop-xl', 'e2e/move.spec.ts', 'e2e/smoke.spec.ts', 'e2e/version.spec.ts']);
    expect(liveArgs(['--full'])).toEqual(FULL_LIVE_TESTS);
    expect(liveArgs(['--full', '-g', 'version'])).toEqual([...FULL_LIVE_TESTS, '-g', 'version']);
  });
  it('--all: the whole suite; anything else goes to Playwright as given', () => {
    expect(liveArgs(['--all'])).toEqual([]);
    expect(liveArgs(['--all', '-g', 'Rotations'])).toEqual(['-g', 'Rotations']);
    expect(liveArgs(['e2e/smoke.spec.ts', '-g', 'odds'])).toEqual(['e2e/smoke.spec.ts', '-g', 'odds']);
  });
  it("CI's live job runs this script with no extras (so only the small check), nothing else against the live site", () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const live = ci.slice(ci.indexOf('\n  live:'));
    expect(live).toMatch(/npx tsx scripts\/e2e-live\.ts https:\/\/gauntlet-home\.vercel\.app\s*$/);
    expect(live).not.toContain('npx playwright test');
    expect(live).not.toContain('--full');
    expect(live).not.toContain('--all');
    expect(live).not.toContain('check-live-data');
  });
});

describe('wait-live polling', () => {
  it('checks the live version.json no more often than every 30 s, for about 10 minutes', () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(30_000);
    expect(MAX_ATTEMPTS * POLL_MS).toBe(600_000);
  });
});
