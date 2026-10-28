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

// Round 3's images (rest rows, fatigue columns, team week views, selections) are read back at 1280 × 900 too.
const AT_1280 = /selection|full team list|team calendar in 1 and 2 weeks|a single day/;
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl' && !(info.project.name === 'desktop' && AT_1280.test(info.title)), 'runs once, at 1920 × 1080'));
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

/** Area of an element inside the copied root, in CSS px, and what the image must show there. */
type Region = { kind: 'logo' | 'text' | 'score' | 'b2b' | 'tv' | 'rest' | 'tif'; x: number; y: number; w: number; h: number; what: string };
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
  add('score', '.ck-score, .ck-mscore');
  add('b2b', '.ck-b2b-label, .ck-b2b-mark, .ck-b2b-opp');
  add('tif', '.ck-tif');
  add('tv', '.ck-tv, .ck-tv-pill, .ck-tv-name');
  add('rest', '.ck-rest-row .ck-date, .ck-rest');
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
            else if ((r.kind === 'text' || r.kind === 'score') && dist(p, base) > 60) hit++;
            else if (r.kind === 'rest' && dist(p, base) > 40) hit++; // muted date + "Rest"
            else if (r.kind === 'tif' && p[2]! > p[1]! + 20 && p[2]! > p[0]! + 8) hit++; // purple (blue well above green and red)
            // hues, not exact colours: past games are drawn at 60 % opacity
            else if (r.kind === 'b2b' && p[0]! > p[1]! + 25 && p[1]! > p[2]! + 20) hit++; // orange
            else if (r.kind === 'tv' && p[1]! > p[0]! + 40 && p[1]! > p[2]! + 15) hit++; // green
          }
        const need = r.kind === 'logo' ? 0.08 : r.kind === 'text' || r.kind === 'score' || r.kind === 'rest' ? 0.02 : 0.05;
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
  const r = await check(page, 'view-team-list', view, ['logo', 'text', 'b2b', 'tv', 'tif']);
  // both fatigue columns are in the image: the team's and the opponent's chips and the opponent's 2/2
  expect(view.target.regions.filter((x) => x.kind === 'tif').length).toBe(await page.locator('.ck-team-rows .ck-tif').count());
  expect(view.target.regions.filter((x) => x.kind === 'b2b').length).toBe(await page.locator('.ck-team-rows :is(.ck-b2b-label, .ck-b2b-mark, .ck-b2b-opp)').count());
  expect(r.height / view.target.ratio, 'taller than the window').toBeGreaterThan(1080);

  // "Show rest days": the rest rows are in the image too, every one of them drawn
  await page.getByLabel('Show rest days').check();
  const rest = await page.locator('.ck-team-rows > .ck-rest-row').count();
  expect(rest).toBeGreaterThan(60);
  const withRest = await copyView(page);
  expect(withRest.target.regions.filter((x) => x.kind === 'rest').length).toBe(2 * rest); // date + "Rest"
  expect(withRest.target.regions.filter((x) => x.kind === 'logo').length).toBe(2 * shown + 1);
  const rr = await check(page, 'view-team-list-rest', withRest, ['logo', 'text', 'b2b', 'tv', 'rest']);
  expect(rr.height / withRest.target.ratio, 'taller with the rest rows').toBeGreaterThan(r.height / view.target.ratio);
});

test('whole view and a day: team calendar in 1 and 2 weeks', async ({ page }) => {
  for (const span of ['1w', '2w']) {
    await open(page, `?view=team&layout=calendar&team=LAL&span=${span}`);
    await expect(page.locator('.ck-team-month')).toHaveAttribute('data-span', span);
    const view = await copyView(page);
    // every game card of the shown weeks is in the image: 2 logos each, + the team header's
    const cards = await page.locator('.ck-team-grid .ck-card').count();
    expect(cards).toBeGreaterThan(span === '1w' ? 1 : 4);
    expect(view.target.regions.filter((r) => r.kind === 'logo').length).toBe(2 * cards + 1);
    await check(page, `view-team-calendar-${span}`, view, ['logo', 'text']);
    await check(page, `day-team-calendar-${span}`, await copyPart(page, page.locator('.ck-team-grid .ck-day-cell:has(.ck-card)').first(), 'copy-day'), ['logo', 'text']);
  }
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

test('final scores are in the images: week view (1 and 2 weeks), league list day, team calendar, team list', async ({ page }) => {
  await open(page, '?view=league&layout=calendar&date=2026-10-20');
  // the snapshot's final games: Oct 20–22, 2026 (week of Oct 18)
  const finals = await page.evaluate(async () => {
    const feed = await (await fetch('/data/schedule.json')).json();
    return feed.leagueSchedule.gameDates
      .flatMap((d: { games: { gameId: string; gameStatus: number; gameDateEst: string }[] }) => d.games)
      .filter((g: { gameId: string; gameStatus: number }) => /^00[2456]/.test(g.gameId) && g.gameStatus === 3)
      .map((g: { gameId: string; gameDateEst: string }) => g.gameDateEst.slice(0, 10)) as string[];
  });
  expect(finals.length).toBeGreaterThan(10);
  const scores = (v: { target: Target }) => v.target.regions.filter((r) => r.kind === 'score').length;
  const inWeek = finals.filter((d) => d >= '2026-10-18' && d <= '2026-10-24').length;

  let v = await copyView(page);
  expect(scores(v)).toBe(2 * inWeek);
  // logos only where a game isn't final yet (final lines show the scores in the logo slots)
  await check(page, 'scores-league-week', v, inWeek < (await page.locator('.ck-month-game').count()) ? ['logo', 'text', 'score'] : ['text', 'score']);
  await page.getByRole('tab', { name: '2 weeks' }).click();
  v = await copyView(page);
  expect(scores(v)).toBe(2 * finals.filter((d) => d >= '2026-10-18' && d <= '2026-10-31').length);
  await check(page, 'scores-league-2weeks', v, ['logo', 'text', 'score']);

  await open(page, '?view=league&layout=list&date=2026-10-21');
  const day = page.locator('.ck-lday[data-day="2026-10-21"]');
  v = await copyPart(page, day, 'copy-day');
  expect(scores(v)).toBe(2 * finals.filter((d) => d === '2026-10-21').length);
  await check(page, 'scores-league-list-day', v, ['logo', 'text', 'score']);

  await open(page, '?view=team&layout=calendar&team=BOS');
  await page.getByLabel('Previous month').click();
  v = await copyView(page);
  expect(scores(v)).toBeGreaterThan(0);
  await check(page, 'scores-team-calendar', v, ['logo', 'text', 'score']);
  const cell = page.locator('.ck-day-cell:has(.ck-score)').first();
  await check(page, 'scores-team-calendar-day', await copyPart(page, cell, 'copy-day'), ['logo', 'text', 'score']);

  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await check(page, 'scores-team-list', await copyView(page), ['logo', 'text', 'score']);
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

// ---------------------------------------------------------------- marquee selection images

/** A real drag over the on-screen games `from`..`to` of `sel` (clear of a list's auto-scroll zones). */
async function selectRange(page: Page, sel: string, from: number, to: number) {
  const [p, q] = await page.evaluate(
    ([sel, from, to]) => {
      const shown = [...document.querySelectorAll(sel)].filter((e) => {
        const r = e.getBoundingClientRect();
        const c = e.closest('[data-select-scroller]')?.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && (!c || (r.top >= c.top + 60 && r.bottom <= c.bottom - 60));
      });
      return [shown[from]!.getBoundingClientRect().toJSON(), shown[to]!.getBoundingClientRect().toJSON()] as DOMRect[];
    },
    [sel, from, to] as const,
  );
  const a = { x: Math.min(p!.left, q!.left) + 3, y: p!.top + 2 };
  const b = { x: Math.max(p!.right, q!.right) - 3, y: q!.bottom - 2 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  // the selected games in on-screen order, with their text as drawn
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ck-select-area [data-game-id]')]
      .filter((e) => getComputedStyle(e).outlineStyle === 'solid')
      .map((e) => ({ id: e.dataset.gameId!, text: e.textContent!, b2b: e.dataset.b2b ?? null, date: e.closest<HTMLElement>('[data-date]')?.dataset.date ?? e.closest<HTMLElement>('[data-day]')?.dataset.day ?? '' })),
  );
}

type Shot = Omit<Target, 'ratio'> & { items: { id: string; text: string; b2b: string | null; outline: string }[]; heads: string[]; rest: number; chrome: number };

/** Copies the selection (bar button, or Ctrl+C) and measures what was rendered for it. */
async function copySelectionImage(page: Page, how: 'button' | 'keys' = 'button') {
  await page.evaluate((src) => {
    const measure = (0, eval)(src);
    const w = window as unknown as { __ckStage?: unknown };
    w.__ckStage = undefined;
    const obs = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>('.ck-capture');
      if (root && !w.__ckStage) {
        Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined))).then(() => {
          if (!root.isConnected) return;
          w.__ckStage = {
            ...measure(root),
            items: [...root.querySelectorAll<HTMLElement>('[data-game-id]')].map((e) => ({ id: e.dataset.gameId!, text: e.textContent!, b2b: e.dataset.b2b ?? null, outline: getComputedStyle(e).outlineStyle })),
            heads: [...root.querySelectorAll('.ck-lday-head, .ck-sel-dayhead')].map((h) => h.textContent),
            rest: root.querySelectorAll('.ck-rest-row').length,
            chrome: root.querySelectorAll('.ck-selbar, [data-testid="marquee"], .ck-copy:not([data-capture-exclude="true"])').length, // copy buttons are left out of every image
          };
        });
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }, MEASURE);
  const button = page.getByTestId('copy-selection');
  let png: string;
  if (how === 'button') png = await clickCopy(page, button);
  else {
    await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.keyboard.press('Control+c');
    await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 20_000 });
    png = await page.evaluate(async () => {
      const item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'))!;
      const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
  }
  const stage = (await page.evaluate(() => (window as unknown as { __ckStage: unknown }).__ckStage)) as Shot;
  expect(stage, 'stage measured').toBeTruthy();
  const [size, ratio] = (await button.getAttribute('data-captured'))!.split('@');
  expect(size).toBe(`${stage.width}x${stage.height}`);
  await expect(page.locator('.ck-capture')).toHaveCount(0);
  return { png, target: { ...stage, ratio: Number(ratio) }, stage };
}

test('selection images: only the selected games, in on-screen order, as drawn in the view', async ({ page }) => {
  test.setTimeout(180_000);
  const cases: { name: string; search: string; sel: string; from: number; to: number; heads: boolean }[] = [
    { name: 'team-list', search: '?view=team&layout=list&team=ORL&rest=1', sel: '.ck-team-rows > .ck-card', from: 0, to: 4, heads: false },
    { name: 'league-list', search: '?view=league&layout=list&date=2026-11-15', sel: '.ck-lday .ck-card', from: 1, to: 5, heads: true },
    { name: 'team-calendar-month', search: '?view=team&layout=calendar&team=LAL', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 2, to: 5, heads: true },
    { name: 'team-calendar-1w', search: '?view=team&layout=calendar&team=LAL&span=1w', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 0, to: 2, heads: true },
    { name: 'team-calendar-2w', search: '?view=team&layout=calendar&team=LAL&span=2w', sel: '.ck-team-grid .ck-day-cell .ck-card', from: 1, to: 4, heads: true },
    { name: 'league-week-1w', search: '?view=league&layout=calendar&date=2026-11-15', sel: '.ck-week-grid .ck-month-game', from: 2, to: 7, heads: true },
    { name: 'league-week-2w', search: '?view=league&layout=calendar&date=2026-11-15&weeks=2', sel: '.ck-week-grid .ck-month-game', from: 4, to: 12, heads: true },
  ];
  for (const [i, k] of cases.entries()) {
    await open(page, k.search);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const picked = await selectRange(page, k.sel, k.from, k.to);
    expect(picked.length, k.name).toBeGreaterThanOrEqual(2);
    const shot = await copySelectionImage(page, i % 2 ? 'keys' : 'button');
    // only the selected games, same order, drawn the same (text incl. scores, markers, TV names, fatigue chips)
    expect(shot.stage.items.map((x) => x.id), k.name).toEqual(picked.map((x) => x.id));
    expect(shot.stage.items.map((x) => x.text), k.name).toEqual(picked.map((x) => x.text));
    // no highlight, bar, copy buttons or rest rows in the image
    expect(shot.stage.items.filter((x) => x.outline === 'solid'), k.name).toEqual([]);
    expect(shot.stage.chrome, k.name).toBe(0);
    expect(shot.stage.rest, k.name).toBe(0);
    // day headers: one per day with selected games (calendars and the League List), none in the Team List
    const days = [...new Set(picked.map((x) => x.date))];
    expect(shot.stage.heads.length, `${k.name} headers`).toBe(k.heads ? days.length : 0);
    // 2 logos per game (final lines of the week view show scores in the logo slots), + the team header in team views
    const logos = shot.target.regions.filter((r) => r.kind === 'logo').length;
    const lineScores = shot.target.regions.filter((r) => r.kind === 'score').length;
    if (k.name.startsWith('league-week')) expect(logos + lineScores, k.name).toBe(2 * picked.length);
    else expect(logos, k.name).toBe(2 * picked.length + (k.search.includes('view=team') ? 1 : 0));
    console.log(`[copy] selection-${k.name}: ${picked.length} games, ${days.length} day(s)`);
    await check(page, `selection-${k.name}`, shot, ['logo', 'text']);
    await page.keyboard.press('Escape');
  }
});

test('selection image of the Team List: the B2B bracket only when both nights are selected', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=ORL');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  // on-screen rows (clear of the auto-scroll zones), with their bracket
  const rows = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="team-list"]')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.ck-team-rows > .ck-card')]
      .filter((r) => r.getBoundingClientRect().top >= c.top + 60 && r.getBoundingClientRect().bottom <= c.bottom - 60)
      .map((r) => r.dataset.b2b ?? '');
  });
  const pair = rows.findIndex((b, j) => b === '1' && rows[j + 1] === '2');
  expect(pair, 'a back-to-back on screen').toBeGreaterThanOrEqual(0);
  // from the pair's night 1 to the next night 1 (its night 2 left out), else 2 rows past the pair
  const half = rows.findIndex((b, j) => j > pair + 1 && b === '1');
  const picked = await selectRange(page, '.ck-team-rows > .ck-card', pair, half >= 0 ? half : Math.min(rows.length - 1, pair + 3));
  const shot = await copySelectionImage(page);
  const got = new Map(shot.stage.items.map((x) => [x.id, x.b2b]));
  for (const [j, x] of picked.entries()) {
    const partner = x.b2b === '1' ? picked[j + 1] : x.b2b === '2' ? picked[j - 1] : undefined;
    const keep = !!partner && (x.b2b === '1' ? partner.b2b === '2' : partner.b2b === '1');
    expect(got.get(x.id), `${x.id} (${x.b2b})`).toBe(keep ? x.b2b : null);
  }
  if (half >= 0) expect(got.get(picked.at(-1)!.id), 'cut pair: no bracket').toBeNull();
  expect([...got.values()].filter(Boolean)).toEqual(['1', '2']);
  await check(page, 'selection-team-list-b2b', shot, ['logo', 'text', 'b2b']);
});
