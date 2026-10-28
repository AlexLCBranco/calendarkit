// The served site says which commit it was built from: /version.json and "v<commit>" in the top bar agree, and (for
// a local build) match git HEAD. `npm run e2e:live` runs this against the deployed site.

import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('version.json and the top bar show the same commit, uncached', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'phones show it in the "i" tooltip (unit test)');
  const res = await request.get('/version.json');
  expect(res.ok()).toBe(true);
  const v = (await res.json()) as { version: string; builtAt: string };
  expect(v.version).toMatch(/^[0-9a-f]{7}\+?$/);
  if (!process.env.E2E_BASE_URL) expect(v.version.replace('+', '')).toBe(execSync('git rev-parse --short=7 HEAD').toString().trim());
  else expect(res.headers()['cache-control'] ?? '').toContain('no-cache');
  await page.goto('/');
  await expect(page.getByTestId('site-version')).toHaveText(`v${v.version}`);
  console.log(`[version] ${info.project.name}: site v${v.version}, built ${v.builtAt}`);
});
