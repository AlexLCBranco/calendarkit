// Copy as image: clicks the real buttons, reads the PNG back from the clipboard and checks its pixels. For every
// export: not blank, size = element size × the pixel ratio used, no transparent corners (dark background), every
// logo area holds logo pixels (not just its light disc), every tricode / "@" area holds text, every B2B mark is
// orange and every national-TV badge green in the image. PNGs are saved to test-output/copy-images/ (git-ignored).
// Desktop XL only (1920 × 1080): the week view needs a desktop width; the copy code is the same at every width.

import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
const OUT = 'test-output/copy-images';
const BG = [0x0f, 0x11, 0x15]; // --ck-bg
const RATIO = 4;
const MAX_SIDE = 16000;

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'runs once, at 1920 × 1080'));
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

/** Area of an element inside the copied root, in CSS px, and what the image must show there. */
type Region = { kind: 'logo' | 'text' | 'b2b' | 'tv'; x: number; y: number; w: number; h: number; what: string };
type Target = { width: number; height: number; regions: Region[]; ratio: number };

/** Every area to check inside `root` (runs in the page). Exported as a string so it works for the stage too. */
const MEASURE = `(root) => {
  const r0 = root.getBoundingClientRect();
  const out = [];
  const add = (kind, sel) => root.querySelectorAll(sel).forEach((el) => {
    if (el.closest('[data-capture-exclude="true"]')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    out.push({ kind, x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height, what: (el.getAttribute('alt') || el.textContent || el.className).slice(0, 40) });
  });
  add('logo', '.ck-logo-backing img');
  add('text', '.ck-team, .ck-mtri-text, .ck-vsat, .ck-at');
  add('b2b', '.ck-b2b-label, .ck-b2b-mark');
  add('tv', '.ck-tv, .ck-tv-pill, .ck-tv-name');
  return { width: root.offsetWidth, height: root.offsetHeight, regions: out };
}`;

async function open(page: Page, search: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Clicks `button`, waits for ✓, returns the clipboard PNG (base64). */
async function clickCopy(page: Page, button: Locator): Promise<string> {
  await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 5000 }); // ✓ of an earlier copy gone
  await page.evaluate(() => navigator.clipboard.writeText('')); // nothing left from an earlier copy
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 20_000 });
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((i) => i.types.includes('image/png'));
    if (!item) throw new Error(`no image/png on the clipboard (types: ${items.flatMap((i) => i.types).join(', ')})`);
    const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
}

/** A day cell / game card copy: hover its parent, measure it, click its button. */
async function copyPart(page: Page, parent: Locator, testId: string) {
  await parent.scrollIntoViewIfNeeded();
  await parent.hover();
  const button = parent.locator(`> [data-testid="${testId}"]`);
  await expect(button).toBeVisible();
  const target = (await parent.evaluate((el, src) => (0, eval)(src)(el), MEASURE)) as Omit<Target, 'ratio'>;
  // html-to-image sizes the image from the element's own box (scrollWidth/Height for the cap)
  const ratio = await parent.evaluate((el, [r, max]) => Math.min(r, max / Math.max(el.scrollWidth, el.scrollHeight)), [RATIO, MAX_SIDE] as const);
  return { png: await clickCopy(page, button), target: { ...target, ratio } };
}

/** Whole-view copy: the view is rendered off-screen (.ck-capture) only while copying; measure it when it appears. */
async function copyView(page: Page) {
  await page.evaluate((src) => {
    const measure = (0, eval)(src);
    const w = window as unknown as { __ckStage?: unknown };
    w.__ckStage = undefined;
    const obs = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>('.ck-capture');
      if (root && !w.__ckStage) {
        // measured once fonts and logos are in, as the copy itself waits for them
        Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined))).then(() => {
          if (root.isConnected) w.__ckStage = measure(root);
        });
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }, MEASURE);
  const button = page.getByTestId('copy-view');
  const png = await clickCopy(page, button);
  const target = (await page.evaluate(() => (window as unknown as { __ckStage: unknown }).__ckStage)) as Omit<Target, 'ratio'>;
  expect(target, 'stage measured').toBeTruthy();
  const [size, ratio] = (await button.getAttribute('data-captured'))!.split('@');
  expect(size).toBe(`${target.width}x${target.height}`);
  await expect(page.locator('.ck-capture')).toHaveCount(0); // removed after the copy
  return { png, target: { ...target, ratio: Number(ratio) } };
}

type Report = { width: number; height: number; corners: number[][]; inkShare: number; colors: number; failures: string[]; counts: Record<string, number> };

/** Decodes the PNG in the page and checks it against the target. */
async function analyze(page: Page, png: string, target: Target): Promise<Report> {
  return page.evaluate(
    async ({ png, target, BG }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const px = (x: number, y: number) => {
        const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
        return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
      };
      const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
      // not blank: share of pixels that aren't the background, and distinct colours on a sample grid
      let ink = 0;
      let n = 0;
      const colors = new Set<string>();
      const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 200_000)));
      for (let y = 0; y < height; y += step)
        for (let x = 0; x < width; x += step) {
          const p = px(x, y);
          n++;
          if (dist(p, BG) > 12) ink++;
          colors.add(`${p[0]! >> 3},${p[1]! >> 3},${p[2]! >> 3}`);
        }
      const failures: string[] = [];
      const counts: Record<string, number> = {};
      const DISC = [226, 231, 238];
      for (const r of target.regions) {
        counts[r.kind] = (counts[r.kind] ?? 0) + 1;
        const x0 = Math.round(r.x * target.ratio);
        const y0 = Math.round(r.y * target.ratio);
        const x1 = Math.round((r.x + r.w) * target.ratio);
        const y1 = Math.round((r.y + r.h) * target.ratio);
        let total = 0;
        let hit = 0;
        const base = px(x0, y0); // text: the corner of its box is background
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const p = px(x, y);
            total++;
            if (r.kind === 'logo' && dist(p, DISC) > 40) hit++;
            else if (r.kind === 'text' && dist(p, base) > 60) hit++;
            // hues, not exact colours: past games are drawn at 60 % opacity
            else if (r.kind === 'b2b' && p[0]! > p[1]! + 25 && p[1]! > p[2]! + 20) hit++; // orange
            else if (r.kind === 'tv' && p[1]! > p[0]! + 40 && p[1]! > p[2]! + 15) hit++; // green
          }
        const need = r.kind === 'logo' ? 0.08 : r.kind === 'text' ? 0.02 : 0.05;
        if (!total || hit / total < need) failures.push(`${r.kind} "${r.what}" at ${r.x.toFixed(0)},${r.y.toFixed(0)}: ${((hit / Math.max(total, 1)) * 100).toFixed(1)}% < ${need * 100}%`);
      }
      return { width, height, corners, inkShare: ink / n, colors: colors.size, failures, counts };
    },
    { png, target, BG },
  );
}

/** Saves the PNG and runs every check. `expectKinds`: marker kinds that must occur in this export. */
async function check(page: Page, name: string, { png, target }: { png: string; target: Target }, expectKinds: Region['kind'][] = ['logo', 'text']) {
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, 'base64'));
  const r = await analyze(page, png, target);
  console.log(`[copy] ${name}: ${r.width}×${r.height} px = ${target.width}×${target.height} CSS px × ${target.ratio}, ink ${(r.inkShare * 100).toFixed(0)}%, ${r.colors} colours, checked ${JSON.stringify(r.counts)}`);
  expect(r.width, 'image width = element width × ratio').toBe(Math.floor(target.width * target.ratio));
  expect(r.height, 'image height = element height × ratio').toBe(Math.floor(target.height * target.ratio));
  for (const c of r.corners) {
    expect(c[3], 'corner opaque').toBe(255);
    expect(Math.hypot(c[0]! - BG[0]!, c[1]! - BG[1]!, c[2]! - BG[2]!), `corner ${c} = dark background`).toBeLessThan(30);
  }
  expect(r.inkShare, 'not blank').toBeGreaterThan(0.02);
  expect(r.colors, 'not blank').toBeGreaterThan(20);
  for (const k of expectKinds) expect(r.counts[k] ?? 0, `${name} has ${k} areas to check`).toBeGreaterThan(0);
  expect(r.failures, 'every logo / text / marker area drawn').toEqual([]);
  return r;
}

test('whole view: league week view (1 and 2 weeks)', async ({ page }) => {
  await open(page, '?view=league&layout=calendar&date=2026-11-15');
  await expect(page.getByRole('region', { name: 'League week' })).toBeVisible();
  await check(page, 'view-league-week', await copyView(page), ['logo', 'text', 'b2b', 'tv']);
  await page.getByRole('tab', { name: '2 weeks' }).click();
  await check(page, 'view-league-2weeks', await copyView(page), ['logo', 'text', 'b2b', 'tv']);
});

test('whole view: team calendar and the full team list', async ({ page }) => {
  await open(page, '?view=team&layout=calendar&team=LAL');
  await expect(page.locator('.ck-team-grid')).toBeVisible();
  await check(page, 'view-team-calendar', await copyView(page), ['logo', 'text', 'b2b', 'tv']);

  await page.getByRole('tab', { name: 'List', exact: true }).click();
  const shown = await page.locator('.ck-team-rows > .ck-card').count();
  const view = await copyView(page);
  // every game, not just the rows scrolled into view: 2 logos per row, + the team header's
  expect(view.target.regions.filter((r) => r.kind === 'logo').length).toBe(2 * shown + 1);
  const r = await check(page, 'view-team-list', view, ['logo', 'text', 'b2b', 'tv']);
  expect(r.height / view.target.ratio, 'taller than the window').toBeGreaterThan(1080);
});

test('whole view: league list copies the whole week', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-15');
  const view = await copyView(page);
  await check(page, 'view-league-list', view, ['logo', 'text', 'tv']);
  // Nov 15 – 21: every game of the week (2 logos each)
  const week = await page.evaluate(async () => {
    const feed = await (await fetch('/data/schedule.json')).json();
    const dates = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
    return feed.leagueSchedule.gameDates.flatMap((d: { games: { gameId: string; gameDateEst: string }[] }) => d.games).filter((g: { gameId: string; gameDateEst: string }) => g.gameId.startsWith('002') && dates.includes(g.gameDateEst.slice(0, 10))).length;
  });
  expect(view.target.regions.filter((r) => r.kind === 'logo').length).toBe(2 * week);
});

test('a single day: week view cell, team calendar cell, league list day', async ({ page }) => {
  await open(page, '?view=league&layout=calendar&date=2026-11-15');
  const cell = page.locator('.ck-month-cell[data-date="2026-11-18"]');
  await check(page, 'day-league-week', await copyPart(page, cell, 'copy-day'), ['logo', 'text', 'tv']);

  await open(page, '?view=team&layout=calendar&team=ORL');
  const b2bCell = page.locator('.ck-day-cell:has(.ck-b2b-label)').first();
  await check(page, 'day-team-calendar', await copyPart(page, b2bCell, 'copy-day'), ['logo', 'text', 'b2b']);

  await open(page, '?view=league&layout=list&date=2026-11-15');
  const day = page.locator('.ck-lday[data-day="2026-11-15"]');
  await check(page, 'day-league-list', await copyPart(page, day, 'copy-day'), ['logo', 'text']);
});

test('a single game: league list card, team list card with B2B and TV', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-16');
  const card = page.locator('.ck-lday[data-day="2026-11-16"] .ck-card:has([data-testid="tv-badge"])').first();
  await check(page, 'game-league-list', await copyPart(page, card, 'copy-game'), ['logo', 'text', 'tv']);

  await open(page, '?view=team&layout=list&team=ORL');
  const row = page.locator('.ck-team-rows > .ck-card:has(.ck-b2b-label):has(.ck-b2b-mark)').first();
  await check(page, 'game-team-list', await copyPart(page, row, 'copy-game'), ['logo', 'text', 'b2b']);
});

test('blank logos are caught: the pixel check flags them; a logo that cannot be fetched fails the copy with !', async ({ page }) => {
  // html-to-image keeps embedded images for the page's life, so each case starts on a fresh page
  const card = page.locator('.ck-lday[data-day="2026-11-15"] .ck-card').first();
  const button = card.locator('> [data-testid="copy-game"]');

  // logo files missing: no half-made image on the clipboard — the button shows ! and the error is logged
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await open(page, '?view=league&layout=list&date=2026-11-15');
  await page.route('**/logos/*.svg', (r) => r.fulfill({ status: 404, body: '' }));
  await card.hover();
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'error');
  await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 2500 });
  expect(errors.some((e) => e.includes('Copy game as image failed'))).toBe(true);
  await page.unroute('**/logos/*.svg');

  // logo files that load but draw nothing: an image is made, and the logo check must reject it
  await page.route('**/logos/*.svg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>' }));
  await open(page, '?view=league&layout=list&date=2026-11-15');
  const { png, target } = await copyPart(page, card, 'copy-game');
  const r = await analyze(page, png, target);
  expect(r.failures.filter((f) => f.startsWith('logo')).length).toBe(2);
});

test('buttons: ✓ then back after 1.5 s; never in the image; the hover buttons hide until hovered', async ({ page }) => {
  await open(page, '?view=league&layout=list&date=2026-11-15');
  const card = page.locator('.ck-lday[data-day="2026-11-15"] .ck-card').first();
  const button = card.locator('> [data-testid="copy-game"]');
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('opacity', '0');
  await card.hover();
  await expect(button).toHaveCSS('opacity', '1');
  for (const b of await page.locator('.ck-copy').all()) expect(await b.getAttribute('data-capture-exclude')).toBe('true');
  await clickCopy(page, button);
  await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 2500 });
});
