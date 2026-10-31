// Round 10 (1.4): the Slate drawn from its self-contained part (src/slate/) is pixel for pixel the v1.27.0 Slate — on
// screen and in its copied images — measured in the same run against that build (scripts/perf-ref.ts, served with the
// same snapshot). At 1280 × 900 (desktop) and 1920 × 1080 (desktop-xl); days of 1, 5, 12 and 15 games; with notes, with
// no notes at all, and with notes but "Hide all notes". Move REF on purpose only when the Slate is meant to change.

import { readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { APP } from './app';
import { serveRef } from './refbuild';
import { copySlate } from './slatecopy';

const REF = { commit: 'b99390c0ad92b119318447f45694da3fa46cf8e2', version: '1.27.0' };
const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [1, 5, 12, 15];

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

let ref: { base: string; server: Server } | undefined;
test.beforeAll(async ({}, info) => {
  if (!['desktop', 'desktop-xl'].includes(info.project.name)) return;
  test.setTimeout(120_000); // the first run builds the reference
  ref = await serveRef(REF.commit);
});
test.afterAll(() => ref?.server.close());

// the snapshot's regular-season / Cup nights, read here (not through the app)
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] } };
const nights: Record<string, string[]> = {};
for (const d of raw.leagueSchedule.gameDates) for (const g of d.games) if (/^00[2456]/.test(g.gameId)) (nights[g.gameDateEst.slice(0, 10)] ??= []).push(g.gameId);
const dayWith = (n: number) => Object.keys(nights).sort().find((d) => nights[d]!.length === n)!;

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

/** Reloads a page opened by `open` and waits as it did. */
async function reopen(page: Page, variant: Variant) {
  await page.reload();
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // every logo loaded and decoded (over the network, against a live site, they arrive after the cards)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.addStyleTag({ content: '[data-testid="site-version"] { visibility: hidden !important; }' });
  await page.mouse.move(0, 0);
  if (variant === 'hidden') {
    await page.getByTestId('notes-hide').click();
    await page.mouse.move(0, 0);
  }
}

/**
 * The Slate on screen. Against a live site (E2E_BASE_URL) the logos' discs are masked and the logos compared by file and
 * size instead: there the current build's logos come over the network and the reference's from a local server, and on
 * every card the logo came out rasterized up to 38 levels apart at 1280 (the same files: the copies, which embed them, are
 * byte-identical). Locally, nothing is masked.
 */
const LIVE = !!process.env.E2E_BASE_URL;
const shoot = (page: Page) => page.locator('.ck-slate').screenshot({ animations: 'disabled', caret: 'hide', ...(LIVE ? { mask: [page.locator('.ck-slate .ck-logo-backing')], maskColor: '#ff00ff' } : {}) });
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
 * The 10 × 10 px corners of every card and note box on the Slate (in the Slate's screenshot): their rounded, antialiased
 * edges blend with what is behind them, and against the live site (1280) came out up to 2 levels apart on 7–17 px
 * between two page loads of identical markup. Everything else must match exactly.
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
      const old = await open(browser, ref!.base + '/', date, variant, viewport);
      const cur = await open(browser, new URL(APP, info.project.use.baseURL).href, date, variant, viewport);
      // up to 3 tries, the pages reloaded before the last: a team logo (an SVG <img>) is now and then rasterized a level
      // apart on one page load (CI, 2026-10-31: 7 px of a 1280 screen, once in 24) — a real change differs every time
      let screens: Buffer[] = [];
      let tries = 0;
      for (; tries < 3; tries++) {
        if (tries === 2) for (const p of [old, cur]) await reopen(p, variant);
        screens = [await shoot(old), await shoot(cur)];
        if (screens[0]!.equals(screens[1]!)) break;
      }
      const same = tries < 3;
      if (!same) screens.forEach((b, k) => writeFileSync(`test-output/slate-same-${viewport.width}-${n}-${variant}-${k ? 'current' : 'ref'}.png`, b));
      expect(await logos(cur)).toEqual(await logos(old));
      const left = same ? 0 : await diff(cur, screens[0]!.toString('base64'), screens[1]!.toString('base64'), await corners(cur));
      expect(left, `screen, ${n} games, ${variant}: differing pixels outside the cards' and note boxes' rounded corners (3 tries)`).toBe(0);
      const copies: [Awaited<ReturnType<typeof copySlate>>, Awaited<ReturnType<typeof copySlate>>] = [await copySlate(old, 'copy-view', `same-ref-${n}-${variant}-${viewport.width}`), await copySlate(cur, 'copy-view', `same-cur-${n}-${variant}-${viewport.width}`)];
      const sameCopy = copies[0].png === copies[1].png;
      expect(sameCopy || (await diff(cur, copies[0].png, copies[1].png)), `copy, ${n} games, ${variant}: differing pixels`).toBe(true);
      expect(copies[1].stage.cards.length).toBe(n);
      console.log(`[same] ${viewport.width} ${n} games ${variant}: screen ${screens[1]!.length} B identical=${same ? `yes (try ${tries + 1})` : 'outside the corners'}, copy ${copies[1].px.width}×${copies[1].px.height} identical=${sameCopy}`);
      await Promise.all([old.context().close(), cur.context().close()]);
    }
  });
}
