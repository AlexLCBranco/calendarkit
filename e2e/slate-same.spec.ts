// Round 10 (1.4): the Slate drawn from its self-contained part (src/slate/) is pixel for pixel the v1.27.0 Slate — on
// screen and in its copied images — measured in the same run against that build (scripts/perf-ref.ts, served with the
// same snapshot). At 1280 × 900 (desktop) and 1920 × 1080 (desktop-xl); days of 1, 5, 12 and 15 games; with notes, with
// no notes at all, and with notes but "Hide all notes". Move REF on purpose only when the Slate is meant to change.

import { readFileSync } from 'node:fs';
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
  await page.addStyleTag({ content: '[data-testid="site-version"] { visibility: hidden !important; }' });
  await page.mouse.move(0, 0);
  if (variant === 'hidden') {
    await page.getByTestId('notes-hide').click();
    await page.mouse.move(0, 0);
  }
}

/** How many pixels of two PNGs (base64) differ, or the size mismatch. */
const diff = (page: Page, a: string, b: string) =>
  page.evaluate(
    async ({ a, b }) => {
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
      for (let i = 0; i < p.data.length; i += 4) if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2] || p.data[i + 3] !== q.data[i + 3]) n++;
      return n;
    },
    { a, b },
  );

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
        screens = [await old.locator('.ck-slate').screenshot({ animations: 'disabled', caret: 'hide' }), await cur.locator('.ck-slate').screenshot({ animations: 'disabled', caret: 'hide' })];
        if (screens[0]!.equals(screens[1]!)) break;
      }
      const same = tries < 3;
      expect(same || (await diff(cur, screens[0]!.toString('base64'), screens[1]!.toString('base64'))), `screen, ${n} games, ${variant}: differing pixels (3 tries)`).toBe(true);
      const copies: [Awaited<ReturnType<typeof copySlate>>, Awaited<ReturnType<typeof copySlate>>] = [await copySlate(old, 'copy-view', `same-ref-${n}-${variant}-${viewport.width}`), await copySlate(cur, 'copy-view', `same-cur-${n}-${variant}-${viewport.width}`)];
      const sameCopy = copies[0].png === copies[1].png;
      expect(sameCopy || (await diff(cur, copies[0].png, copies[1].png)), `copy, ${n} games, ${variant}: differing pixels`).toBe(true);
      expect(copies[1].stage.cards.length).toBe(n);
      console.log(`[same] ${viewport.width} ${n} games ${variant}: screen ${screens[1]!.length} B identical=${same} (try ${tries + 1}), copy ${copies[1].px.width}×${copies[1].px.height} identical=${sameCopy}`);
      await Promise.all([old.context().close(), cur.context().close()]);
    }
  });
}
