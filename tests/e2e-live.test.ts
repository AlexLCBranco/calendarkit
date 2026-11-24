// `npm run e2e:live -- <url>`: with nothing else it runs the live check CI runs (the live job), not the whole suite —
// most of the suite is written for a local build (relative addresses, the snapshot's data, no live scores) and failed
// 50 times against the live site on 2026-11-24 although the site was fine.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIVE_TESTS, liveArgs } from '../scripts/e2e-live';

describe('e2e:live arguments', () => {
  it('nothing after the address: the live check CI runs', () => {
    expect(liveArgs([])).toEqual(['--project=desktop-xl', 'e2e/move.spec.ts', 'e2e/smoke.spec.ts', 'e2e/version.spec.ts']);
    expect(liveArgs([])).toEqual(LIVE_TESTS);
  });
  it('--all: the whole suite; anything else goes to Playwright as given', () => {
    expect(liveArgs(['--all'])).toEqual([]);
    expect(liveArgs(['--all', '-g', 'Rotations'])).toEqual(['-g', 'Rotations']);
    expect(liveArgs(['e2e/smoke.spec.ts', '-g', 'odds'])).toEqual(['e2e/smoke.spec.ts', '-g', 'odds']);
  });
  it("CI's live job runs this script, so the two lists can't drift apart", () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const live = ci.slice(ci.indexOf('\n  live:'));
    expect(live).toContain('npx tsx scripts/e2e-live.ts https://gauntlet-home.vercel.app');
    expect(live).not.toContain('npx playwright test');
  });
});
