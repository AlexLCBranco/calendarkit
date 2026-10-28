// @vitest-environment jsdom
// Site version: "v1.3.0" in the bottom-right corner, commit + build time in its tooltip; package.json is the source.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BUILD_INFO } from '../src/build-info';
import { SiteVersion } from '../src/SiteVersion';
import { changesNeedBump, isBumped } from '../scripts/check-version';

describe('site version', () => {
  it('"v1.3.0", tooltip with the commit and build time', () => {
    render(<SiteVersion version="1.3.0" commit="c93db81" builtAt="2026-10-28T21:00:00Z" />);
    const v = screen.getByTestId('site-version');
    expect(v.textContent).toBe('v1.3.0');
    expect(v.title).toMatch(/^Version 1\.3\.0 · commit c93db81, built Oct 28, 2026, \d\d:\d\d$/);
  });

  it('the build takes the version from package.json (MAJOR.MINOR.PATCH) and the commit from git', () => {
    expect(BUILD_INFO.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
    expect(BUILD_INFO.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(BUILD_INFO.commit).toMatch(/^[0-9a-f]{7}\+?$/);
  });
});

describe('check-version (CI)', () => {
  it('app changes need a bump; data snapshots, tests, docs and CI files don\'t', () => {
    expect(changesNeedBump(['src/App.tsx'])).toBe(true);
    expect(changesNeedBump(['public/logos/BOS.svg', 'README.md'])).toBe(true);
    expect(changesNeedBump(['index.html'])).toBe(true);
    expect(changesNeedBump(['public/data/schedule.json'])).toBe(false);
    expect(changesNeedBump(['tests/x.test.ts', 'e2e/y.spec.ts', 'PROJECT.md', '.github/workflows/ci.yml', 'scripts/z.ts'])).toBe(false);
  });
  it('a bump = a higher MAJOR.MINOR.PATCH', () => {
    expect(isBumped('1.3.0', '1.3.1')).toBe(true);
    expect(isBumped('1.3.9', '1.4.0')).toBe(true);
    expect(isBumped('1.9.9', '2.0.0')).toBe(true);
    expect(isBumped('1.3.0', '1.3.0')).toBe(false);
    expect(isBumped('1.4.0', '1.3.9')).toBe(false);
  });
});
