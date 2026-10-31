// Slate copies in e2e (round 7, shared since round 9): click a copy button, read the PNG back from the clipboard, measure
// the capture stage while it is on screen, count transparent / opaque pixels; readPng samples regions of the image.

import { writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

const OUT = 'test-output/copy-images';

/** Copies via `button`, returns the PNG's facts and the stage measured while it was on screen. */
export async function copySlate(page: Page, testId: 'copy-view' | 'copy-selection', name: string) {
  await page.evaluate(() => {
    const w = window as unknown as { __slate?: unknown };
    w.__slate = undefined;
    const obs = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>('.ck-capture .ck-slate-copy');
      if (root && !w.__slate) {
        const r0 = root.getBoundingClientRect();
        const card = root.querySelector('.ck-slate-name')!;
        w.__slate = {
          width: root.offsetWidth,
          height: root.offsetHeight,
          cols: getComputedStyle(root).gridTemplateColumns.split(' ').length,
          nameFont: parseFloat(getComputedStyle(card).fontSize),
          cards: [...root.querySelectorAll('.ck-slate-card')].map((c) => {
            const r = c.getBoundingClientRect();
            return { id: c.getAttribute('data-game-id'), x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height };
          }),
        };
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  const button = page.getByTestId(testId);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const t0 = Date.now();
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
  const ms = Date.now() - t0;
  const stage = (await page.evaluate(() => (window as unknown as { __slate: unknown }).__slate)) as { width: number; height: number; cols: number; nameFont: number; cards: { id: string; x: number; y: number; w: number; h: number }[] };
  const ratio = Number((await button.getAttribute('data-captured'))!.split('@')[1]);
  const png = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'))!;
    const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, 'base64'));
  // pixels: alpha 0 everywhere outside the cards (2 px margin for antialiased edges and rounded corners), opaque inside
  const px = await page.evaluate(
    async ({ png, stage, ratio }) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const inCard = (x: number, y: number, m: number) => stage.cards.some((k) => x >= (k.x - m) * ratio && x < (k.x + k.w + m) * ratio && y >= (k.y - m) * ratio && y < (k.y + k.h + m) * ratio);
      let outside = 0;
      let outsideOpaque = 0;
      let inside = 0;
      let insideClear = 0;
      for (let y = 0; y < height; y += 3)
        for (let x = 0; x < width; x += 3) {
          const a = data[(y * width + x) * 4 + 3]!;
          if (!inCard(x, y, 2)) {
            outside++;
            if (a !== 0) outsideOpaque++;
          } else if (inCard(x, y, -12)) {
            inside++;
            if (a !== 255) insideClear++;
          }
        }
      return { width, height, outside, outsideOpaque, inside, insideClear };
    },
    { png, stage, ratio },
  );
  return { ms, stage, ratio, px, png };
}


/** The average RGBA of each region (image px) of a PNG (base64); with `distinct`, two more: how many colours it holds and the largest distance of a pixel from the average. */
export const readPng = (page: Page, png: string, regions: { x: number; y: number; w: number; h: number }[], distinct = false) =>
  page.evaluate(
    async ({ png, regions, distinct }) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return regions.map((r) => {
        const w = Math.max(1, Math.round(r.w));
        const h = Math.max(1, Math.round(r.h));
        const d = ctx.getImageData(Math.round(r.x), Math.round(r.y), w, h).data;
        const sum = [0, 0, 0, 0];
        const seen = new Set<string>();
        for (let i = 0; i < d.length; i += 4) {
          for (let k = 0; k < 4; k++) sum[k]! += d[i + k]!;
          if (distinct) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
        }
        const n = d.length / 4;
        const avg = sum.map((v) => Math.round(v / n));
        // and how far the farthest pixel is from the average (any channel)
        let dev = 0;
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) dev = Math.max(dev, Math.abs(d[i + k]! - avg[k]!));
        return distinct ? [...avg, seen.size, dev] : avg;
      });
    },
    { png, regions, distinct },
  );
