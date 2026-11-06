// Round 10 (1.4): the Slate drawn from its self-contained part (src/slate/) is pixel for pixel the reference Slate (REF below; v1.27.0 until round 14, now v1.33.0: tight cards, odds, series chip) — on
// screen and in its copied images — measured in the same run against that build (scripts/perf-ref.ts, served with the
// same snapshot). At 1280 × 900 (desktop) and 1920 × 1080 (desktop-xl); days of 1, 5, 12 and 15 games; with notes, with
// no notes at all, and with notes but "Hide all notes". Move REF on purpose only when the Slate is meant to change.

import { readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { APP } from './app';
import { serveRef } from './refbuild';
import { copySlate } from './slatecopy';

const REF = { commit: 'a47ea2bb2dfa4d1408420fdda410b951bad281bf', version: '1.33.0' };
const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [1, 5, 12, 15];

// Round 14 (item 1): the cause of the flaky screen comparisons (about 1 in 3 runs locally). Chromium re-rasterizes only the
// rect of an image that finishes loading after its tile was first rasterized ("partial raster"); the logo disc's
// antialiased edge pixels inside that rect then come out up to 38 levels apart from a full-tile raster. Which cards get it
// depends on load timing, so under CPU load the same build gave up to 10 distinct screenshots in 12 loads
// (test-output/loads.mjs). With partial raster off every tile is rasterized whole: 30 of 30 loads identical under the same
// load. No retries, nothing masked locally.
test.use({ launchOptions: { args: ['--disable-partial-raster'] } });
// one worker builds and serves the reference for all of this file's tests (playwright.config.ts runs tests fully parallel)
test.describe.configure({ mode: 'default' });

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

let ref: { base: string; server: Server } | undefined;
test.beforeAll(async ({}, info) => {
  if (!['desktop', 'desktop-xl'].includes(info.project.name)) return;
  test.setTimeout(120_000); // the first run builds the reference
  ref = await serveRef(REF.commit);
});
test.afterAll(() => ref?.server.close());

// the snapshot's regular-season / Cup nights, read here (not through the app)
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string; gameSubtype?: string }[] }[] } };
const nights: Record<string, string[]> = {};
// round 21 (item 1): Cup group nights are left out — their cards have the Cup track now, on purpose
const cupNights = new Set<string>();
for (const d of raw.leagueSchedule.gameDates)
  for (const g of d.games) {
    // (and knockout nights: their cards have the venue track, item 10)
    if (g.gameSubtype === 'in-season' || g.gameSubtype === 'in-season-knockout' || /^006/.test(g.gameId)) cupNights.add(g.gameDateEst.slice(0, 10));
    if (/^00[2456]/.test(g.gameId)) (nights[g.gameDateEst.slice(0, 10)] ??= []).push(g.gameId);
  }
for (const d of cupNights) delete nights[d];
// a night of n games, else the night with the closest count (round 21: the only 1-game night is the Cup final, left out)
const dayWith = (n: number) => Object.keys(nights).sort().find((d) => nights[d]!.length === n) ?? Object.keys(nights).sort().reduce((b, d) => (Math.abs(nights[d]!.length - n) < Math.abs(nights[b]!.length - n) ? d : b));

/** Notes on the first three games of each night: one per slot on show, the third long enough to grow its card. */
const NOTES: Record<string, { pre: string; live: string; post: string; shown: string }> = {};
for (const n of SIZES) {
  const [a, b, c] = nights[dayWith(n)]!;
  if (a) NOTES[a] = { pre: 'Watch the minutes of the starters', live: '', post: '', shown: 'pre' };
  if (b) NOTES[b] = { pre: 'pre text', live: 'Second unit run 12-2 in Q2', post: '', shown: 'live' };
  if (c) NOTES[c] = { pre: '', live: '', post: 'Closing lineup:\nPG, SG, SF, PF, C\n— switched everything\n— zone in the 4th\nlast line', shown: 'post' };
}

type Variant = 'notes' | 'empty' | 'hidden';

async function open(browser: Browser, base: string, date: string, variant: Variant, viewport: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ date, notes }) => {
      (window as unknown as { __ckOpenDate?: string }).__ckOpenDate = date;
      if (notes) localStorage.setItem('ck:notes:v1', notes);
    },
    { date, notes: variant === 'empty' ? null : JSON.stringify(NOTES) },
  );
  await page.clock.setFixedTime(NOW);
  await page.goto(`${base}?view=league&layout=slate`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card')).toHaveCount(nights[date]!.length);
  await page.evaluate(() => document.fonts.ready);
  // every logo loaded and decoded (over the network, against a live site, they arrive after the cards)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  // the version corner differs between the builds by design; nothing else is hidden
  await page.addStyleTag({ content: '[data-testid="site-version"] { visibility: hidden !important; }' });
  await page.mouse.move(0, 0);
  if (variant === 'hidden') {
    await page.getByTestId('notes-hide').click();
    await page.mouse.move(0, 0);
  }
  return page;
}

/**
 * The Slate on screen. Against a live site (E2E_BASE_URL) the logos' discs are masked and the logos compared by file and
 * size instead: there the current build's logos come over the network and the reference's from a local server, and on
 * every card the logo came out rasterized up to 38 levels apart at 1280 (the same files: the copies, which embed them, are
 * byte-identical). Locally, nothing is masked.
 */
const LIVE = !!process.env.E2E_BASE_URL;
/**
 * Round 21 (item 7): the current top bar has two rows, so its Slate starts lower — and Chromium rasterizes the same card
 * up to 1 level apart (logo discs more) at another y. The screen is taken with the top bar out of the layout in both
 * builds, so the Slate fills the same box in both; the bar is put back for the copies (their button is in it).
 */
const shoot = async (page: Page) => {
  const off = await page.addStyleTag({ content: '[data-testid="top-bar"] { display: none !important; }' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = await page.locator('.ck-slate').screenshot({ animations: 'disabled', caret: 'hide', ...(LIVE ? { mask: [page.locator('.ck-slate .ck-logo-backing')], maskColor: '#ff00ff' } : {}) });
  await off.evaluate((e) => (e as Element).remove());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return png;
};
const logos = (page: Page) => page.locator('.ck-slate img').evaluateAll((is) => is.map((i) => [new URL((i as HTMLImageElement).src).pathname.split('/').pop(), i.getBoundingClientRect().width, i.getBoundingClientRect().height, (i as HTMLImageElement).naturalWidth > 0]));

/** How many pixels of two PNGs (base64) differ, or the size mismatch; pixels inside `skip` boxes don't count. */
const diff = (page: Page, a: string, b: string, skip: { x: number; y: number; w: number; h: number }[] = []) =>
  page.evaluate(
    async ({ a, b, skip }) => {
      const read = async (s: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext('2d')!;
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [p, q] = [await read(a), await read(b)];
      if (p.width !== q.width || p.height !== q.height) return `size ${p.width}×${p.height} vs ${q.width}×${q.height}`;
      let n = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        if (p.data[i] === q.data[i] && p.data[i + 1] === q.data[i + 1] && p.data[i + 2] === q.data[i + 2] && p.data[i + 3] === q.data[i + 3]) continue;
        const [x, y] = [(i / 4) % p.width, Math.floor(i / 4 / p.width)];
        if (!skip.some((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h)) n++;
      }
      return n;
    },
    { a, b, skip },
  );

/**
 * The 10 × 10 px corners of every card and note box on the Slate (in the Slate's screenshot), skipped against the live
 * site only: there their rounded, antialiased edges came out up to 2 levels apart on 7–17 px between two page loads of
 * identical markup (round 10). Locally everything must match exactly.
 */
const corners = (page: Page) =>
  page.locator('.ck-slate').evaluate((slate) => {
    const o = slate.getBoundingClientRect();
    return [...slate.querySelectorAll('.ck-slate-card, .ck-gnote')].flatMap((e) => {
      const r = e.getBoundingClientRect();
      const [x0, y0, x1, y1] = [Math.floor(r.left - o.left), Math.floor(r.top - o.top), Math.ceil(r.right - o.left), Math.ceil(r.bottom - o.top)];
      return [[x0, y0], [x1 - 10, y0], [x0, y1 - 10], [x1 - 10, y1 - 10]].map(([x, y]) => ({ x: x!, y: y!, w: 10, h: 10 }));
    });
  });

for (const variant of ['notes', 'empty', 'hidden'] as Variant[]) {
  test(`Slate on screen and its copies = v${REF.version}, pixel for pixel (${variant === 'notes' ? 'with notes' : variant === 'empty' ? 'no notes' : 'Hide all notes'})`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const viewport = info.project.use.viewport!;
    for (const n of SIZES) {
      const date = dayWith(n);
      // contexts made here don't get the project's baseURL: the current build's address is spelled out
      const old = await open(browser, new URL(APP, ref!.base).href, date, variant, viewport);
      const cur = await open(browser, new URL(APP, info.project.use.baseURL).href, date, variant, viewport);
      const screens = [await shoot(old), await shoot(cur)];
      const same = screens[0]!.equals(screens[1]!);
      if (!same) screens.forEach((b, k) => writeFileSync(`test-output/slate-same-${viewport.width}-${n}-${variant}-${k ? 'current' : 'ref'}.png`, b));
      expect(await logos(cur)).toEqual(await logos(old));
      const left = same ? 0 : await diff(cur, screens[0]!.toString('base64'), screens[1]!.toString('base64'), LIVE ? await corners(cur) : []);
      expect(left, `screen, ${n} games, ${variant}: differing pixels${LIVE ? ' outside the rounded corners' : ''}`).toBe(0);
      const copies: [Awaited<ReturnType<typeof copySlate>>, Awaited<ReturnType<typeof copySlate>>] = [await copySlate(old, 'copy-view', `same-ref-${n}-${variant}-${viewport.width}`), await copySlate(cur, 'copy-view', `same-cur-${n}-${variant}-${viewport.width}`)];
      const sameCopy = copies[0].png === copies[1].png;
      expect(sameCopy || (await diff(cur, copies[0].png, copies[1].png)), `copy, ${n} games, ${variant}: differing pixels`).toBe(true);
      expect(copies[1].stage.cards.length).toBe(nights[date]!.length);
      console.log(`[same] ${viewport.width} ${n} games ${variant}: screen ${screens[1]!.length} B identical=${same ? 'yes' : 'outside the corners (live)'}, copy ${copies[1].px.width}×${copies[1].px.height} identical=${sameCopy}`);
      await Promise.all([old.context().close(), cur.context().close()]);
    }
  });
}
