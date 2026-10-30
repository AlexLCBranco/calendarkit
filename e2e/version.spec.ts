// The served site says which version it is: "v1.3.0" in the bottom-right corner of the window (every view, every
// width, over nothing it hides) and /version.json (version + commit) agree with package.json and, for a local build,
// git HEAD. `npm run e2e:live` runs this against the deployed site (then: version.json is served uncached).

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('v<version> in the bottom-right corner = version.json = package.json', async ({ page, request }, info) => {
  const res = await request.get('/version.json');
  expect(res.ok()).toBe(true);
  const v = (await res.json()) as { version: string; commit: string; builtAt: string };
  expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(v.commit).toMatch(/^[0-9a-f]{7}\+?$/);
  if (!process.env.E2E_BASE_URL) {
    expect(v.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
    expect(v.commit.replace('+', '')).toBe(execSync('git rev-parse --short=7 HEAD').toString().trim());
  } else expect(res.headers()['cache-control'] ?? '').toContain('no-cache');
  for (const search of ['/', '/?view=team&layout=list&team=BOS', '/?view=team&layout=calendar&team=BOS']) {
    await page.goto(search);
    const label = page.getByTestId('site-version');
    await expect(label).toHaveText(`v${v.version}`);
    await expect(label).toHaveAttribute('title', new RegExp(`^Version ${v.version.replace(/\./g, '\\.')} · commit ${v.commit.replace('+', '\\+')}, built `));
    const box = (await label.boundingBox())!;
    // the visible area: the window minus the strip kept for the scrollbar (html { scrollbar-gutter: stable })
    const vp = await page.evaluate(() => ({ width: document.documentElement.getBoundingClientRect().width, height: innerHeight }));
    // in the corner, and stays there (fixed) when the page scrolls
    expect(vp.width - (box.x + box.width)).toBeLessThanOrEqual(8);
    expect(vp.height - (box.y + box.height)).toBeLessThanOrEqual(6);
    // over no cell, game row or control
    const covered = await page.evaluate((b) => [...document.querySelectorAll('.ck-cell, .ck-card, button, .ck-llist')].filter((e) => {
        // only the part on screen: rows scrolled out of a list are clipped by it
        const r = e.getBoundingClientRect();
        const c = e.closest('.ck-llist')?.getBoundingClientRect() ?? { top: -1e9, bottom: 1e9 };
        const top = Math.max(r.top, c.top);
        const bottom = Math.min(r.bottom, c.bottom);
        return r.width > 0 && top < bottom && r.left < b.x + b.width && r.right > b.x && top < b.y + b.height && bottom > b.y;
      }).map((e) => e.className), box);
    expect(covered, search).toEqual([]);
    await page.mouse.wheel(0, 2000);
    const after = (await label.boundingBox())!;
    expect([after.x, after.y]).toEqual([box.x, box.y]);
  }
  console.log(`[version] ${info.project.name}: v${v.version} (commit ${v.commit}, built ${v.builtAt})`);
});
