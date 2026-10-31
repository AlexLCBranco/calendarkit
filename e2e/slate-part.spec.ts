// Round 10 (1.2, 1.3, 1.7): the Slate's self-contained part on a page of its own (slate.html: src/slate/ only, no app
// shell). Its cards are calendarkit's Slate cards pixel for pixel (same day, same width, same notes — one origin, one
// localStorage); nothing is drawn between them; its only requests are its own files, the snapshot (once, however many
// widgets) and the logos; nothing ticks at rest; a note typed in calendarkit shows in the widget and back, live.

import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const NOW = new Date('2026-11-15T15:00:00Z');
const DAY = '2026-11-02'; // 15 games in the snapshot: TV games, B2Bs, finals
const PLAYED = '2026-10-27';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

/** Counts timers and frames the page asks for from the moment `__ckCount.reset()` is called. */
const countTimers = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __ckCount: { n: number; what: string[]; reset: () => void } };
    w.__ckCount = { n: 0, what: [], reset: () => ((w.__ckCount.n = 0), (w.__ckCount.what = [])) };
    for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback'] as const) {
      const real = (window as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
      if (!real) continue;
      (window as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
        w.__ckCount.n++;
        w.__ckCount.what.push(name);
        return real.apply(window, a);
      };
    }
  });

async function openWidget(page: Page, query: string) {
  await page.goto(`${APP}slate.html?${query}`);
  await expect(page.getByTestId('slate-widget').first().locator('.ck-slate-card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.waitForTimeout(500); // the logos' SVGs are redrawn sharper a moment after they first show
  await page.mouse.move(0, 0);
}

/** Pixels of two PNGs that differ, and the largest difference of a channel, leaving out a 3 px frame and the 10 px corners; a size mismatch fails. */
const pixelDiff = (page: Page, a: Buffer, b: Buffer) =>
  page.evaluate(
    async ([a, b]) => {
      const read = async (s: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext('2d')!;
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [p, q] = [await read(a!), await read(b!)];
      if (p.width !== q.width || p.height !== q.height) return { n: Infinity, maxd: Infinity };
      let n = 0;
      let maxd = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        const x = (i / 4) % p.width;
        const y = Math.floor(i / 4 / p.width);
        if (x < 3 || y < 3 || x >= p.width - 3 || y >= p.height - 3) continue;
        if ((x < 10 || x >= p.width - 10) && (y < 10 || y >= p.height - 10)) continue; // the 10 px rounded corners
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(p.data[i + k]! - q.data[i + k]!));
        if (d) n++;
        maxd = Math.max(maxd, d);
      }
      return { n, maxd };
    },
    [a.toString('base64'), b.toString('base64')],
  );

async function openSlate(page: Page, date: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=slate&date=${date}`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.waitForTimeout(500); // the logos' SVGs are redrawn sharper a moment after they first show
  await page.mouse.move(0, 0);
}

for (const date of [DAY, PLAYED]) {
  test(`the widget's cards = calendarkit's Slate cards, pixel for pixel (${date}, with notes)`, async ({ page, context }) => {
    const notes = { pre: 'Watch the starters', live: 'Run 12-2', post: 'Closing lineup:\nA\nB\nC\nD', shown: 'post' };
    await openSlate(page, date);
    const ids = await page.locator('[data-testid="slate"] .ck-slate-card').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-game-id')!));
    await page.evaluate(([k, v]) => localStorage.setItem(k!, v!), ['ck:notes:v1', JSON.stringify({ [ids[0]!]: notes, [ids[1]!]: { ...notes, shown: 'pre' } })]);
    await openSlate(page, date);
    const frame = await page.locator('[data-testid="slate"]').evaluate((sc) => {
      const [s, g] = [sc.getBoundingClientRect(), sc.querySelector('.ck-slate-grid')!.getBoundingClientRect()];
      return { x: s.x, y: s.y, w: s.width, h: s.height, gx: g.x - s.x, gy: g.y - s.y, width: g.width };
    });
    const width = frame.width;
    const app = [];
    // the logos (with their light disc) are masked: an SVG <img> is sometimes rasterized a level apart between two pages (seen on 14–38 px of one
    // logo, a different card each run, with identical markup); they are compared by their address and size instead
    const shoot = (card: ReturnType<Page['locator']>) => card.screenshot({ caret: 'hide', mask: [card.locator('.ck-logo-backing')], maskColor: '#ff00ff' });
    const logos = (p: Page, sel: string) => p.locator(`${sel} .ck-slate-card img`).evaluateAll((is) => is.map((i) => { const r = i.getBoundingClientRect(); return [new URL((i as HTMLImageElement).src).pathname, r.width, r.height, (i as HTMLImageElement).naturalWidth > 0]; }));
    const appLogos = await logos(page, '[data-testid="slate"]');
    for (const id of ids) app.push(await shoot(page.locator(`[data-testid="slate"] [data-game-id="${id}"]`)));
    const widget = await context.newPage();
    await openWidget(widget, `date=${date}&width=${width}`);
    // the same frame as in calendarkit: a scroller of the same size at the same spot (its own raster layer: borders and
    // logos snap to its pixels) with the grid at the same offset in it (half-pixel offsets antialias differently)
    await widget.evaluate((f) => {
      const sc = document.createElement('div');
      Object.assign(sc.style, { position: 'absolute', left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, overflow: 'auto', padding: `${f.gy}px 0 0 ${f.gx}px`, boxSizing: 'border-box' });
      document.body.append(sc);
      sc.append(document.getElementById('root')!);
    }, frame);
    await widget.waitForTimeout(500);
    expect(await widget.locator('.ck-slate-card').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-game-id')))).toEqual(ids);
    for (const [i, id] of ids.entries()) {
      const shot = await shoot(widget.locator(`[data-game-id="${id}"]`));
      // inside the card's outer 3 px and 10 px corners (its rounded, antialiased edge blends with what is behind the card: the page in
      // calendarkit, nothing in the widget)
      const d = shot.equals(app[i]!) ? { n: 0, maxd: 0 } : await pixelDiff(widget, app[i]!, shot);
      if (d.n) for (const [k, b] of [["app", app[i]!], ["widget", shot]] as const) writeFileSync(`test-output/slate-part-${id}-${k}.png`, b);
      expect(d, `card ${id}: pixels that differ inside the edge, largest channel difference`).toEqual({ n: 0, maxd: 0 });
    }
    expect(await logos(widget, '')).toEqual(appLogos);
    expect(appLogos.every((l) => l[3])).toBe(true);
    // the notes are the same ones (one origin)
    await expect(widget.locator(`[data-game-id="${ids[0]}"] [data-testid="note-slot"]`)).toHaveText('POST');
    await expect(widget.locator(`[data-game-id="${ids[0]}"] textarea`)).toHaveValue(notes.post);
  });
}

test('nothing between the cards: no background on the widget, its grid or around it', async ({ page }) => {
  await openWidget(page, `date=${DAY}&width=1800`);
  const bg = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="slate-widget"]')!;
    const grid = w.querySelector('.ck-slate-grid')!;
    const card = w.querySelector('.ck-slate-card')!;
    return { widget: getComputedStyle(w).backgroundColor, grid: getComputedStyle(grid).backgroundColor, card: getComputedStyle(card).backgroundColor, cols: grid.getAttribute('data-cols') };
  });
  expect(bg.widget).toBe('rgba(0, 0, 0, 0)');
  expect(bg.grid).toBe('rgba(0, 0, 0, 0)');
  expect(bg.card).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg.cols).toBe('2');
  // one column below two note boxes of SLATE_NOTE_MIN, as in calendarkit (1233 px: 1 column)
  await openWidget(page, `date=${DAY}&width=1233`);
  expect(await page.locator('.ck-slate-grid').getAttribute('data-cols')).toBe('1');
});

test('requests: its own files, the snapshot once for 3 widgets, the logos — nothing else, nothing after; no timer at rest', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await countTimers(page);
  await openWidget(page, `date=${DAY}&width=1800&n=3`);
  await expect(page.getByTestId('slate-widget')).toHaveCount(3);
  await page.waitForLoadState('networkidle');
  const origin = new URL(page.url()).origin;
  expect(urls.filter((u) => !u.startsWith(origin + '/') && !u.startsWith('data:'))).toEqual([]);
  expect(urls.filter((u) => u.includes('/data/schedule.json'))).toHaveLength(1);
  const kinds = urls.map((u) => new URL(u).pathname.replace(APP, '/').replace(/^\/(assets|logos|fonts|data)\/.*$/, '/$1/…'));
  expect(new Set(kinds)).toEqual(new Set(['/slate.html', '/assets/…', '/fonts/…', '/data/…', '/logos/…']));
  // at rest: nothing asked for in 3 s, and no request
  const before = urls.length;
  await page.evaluate(() => (window as unknown as { __ckCount: { reset: () => void } }).__ckCount.reset());
  await page.waitForTimeout(3000);
  const c = await page.evaluate(() => (window as unknown as { __ckCount: { n: number; what: string[] } }).__ckCount);
  expect(c, 'timers / frames asked for at rest').toEqual({ n: 0, what: [] });
  expect(urls.length).toBe(before);
  // typing: only the save's debounce, then quiet again
  await page.locator('textarea').first().fill('x');
  await page.waitForTimeout(1000);
  await page.evaluate(() => (window as unknown as { __ckCount: { reset: () => void } }).__ckCount.reset());
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as { __ckCount: { n: number } }).__ckCount.n)).toBe(0);
});

test('a note typed in calendarkit shows in the widget at once, and back (one origin, the storage event)', async ({ page, context }) => {
  await openSlate(page, DAY);
  const id = await page.locator('[data-testid="slate"] .ck-slate-card').first().getAttribute('data-game-id');
  const widget = await context.newPage();
  await openWidget(widget, `date=${DAY}&width=1800`);
  await page.locator(`[data-game-id="${id}"] textarea`).fill('typed in calendarkit');
  await expect(widget.locator(`[data-game-id="${id}"] textarea`)).toHaveValue('typed in calendarkit');
  await widget.locator(`[data-game-id="${id}"] [data-testid="note-switch"]`).click();
  await widget.locator(`[data-game-id="${id}"] textarea`).fill('typed in the widget');
  await expect(page.locator(`[data-game-id="${id}"] [data-testid="note-slot"]`)).toHaveText('LIVE');
  await expect(page.locator(`[data-game-id="${id}"] textarea`)).toHaveValue('typed in the widget');
});
