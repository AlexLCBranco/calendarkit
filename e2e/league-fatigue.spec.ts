// Fatigue on the tricodes in the league views (round 4, item 6), in a real browser at 1280 and 1920: the marks take
// no width (week-view lines stay 119 px in 2-week mode, nothing overflows its line or column), the plane clears the
// "@" and the TV pill, the colours (yellow fill / ring, purple underline), the tooltip for that team on hover and
// focus, and the legend under the week grid and the League List. Prints the line widths.

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-game-id]'));
  await page.evaluate(() => document.fonts.ready);
}

/** Geometry of every mark in the page: overflow, plane vs "@" / TV pill / the other tricode, colours. */
const geometry = (page: Page, lineSel: string) =>
  page.evaluate((lineSel) => {
    const bad: string[] = [];
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const ink = (e: Element) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect();
    };
    const widths = new Set<string>();
    let marks = 0;
    for (const line of document.querySelectorAll<HTMLElement>(lineSel)) {
      widths.add(line.getBoundingClientRect().width.toFixed(2));
      if (line.scrollWidth > line.clientWidth + 0.5) bad.push(`${line.dataset.gameId}: line overflows`);
      for (const m of line.querySelectorAll<HTMLElement>('.ck-fm')) {
        marks++;
        const col = m.closest('.ck-mtri, .ck-team')!.getBoundingClientRect();
        const box = m.getBoundingClientRect();
        if (box.left < col.left - 0.5 || box.right > col.right + 0.5) bad.push(`${line.dataset.gameId} ${m.textContent}: outside its column`);
        const plane = m.querySelector('.ck-fm-plane');
        if (plane) {
          const p = plane.getBoundingClientRect();
          const others = [...line.querySelectorAll('.ck-at, .ck-vsat, .ck-tv-pill, .ck-tv')].map(ink).concat([...line.querySelectorAll('.ck-fm')].filter((o) => o !== m).map((o) => o.getBoundingClientRect()));
          if (others.some((o) => o.width && hit(p, o))) bad.push(`${line.dataset.gameId} ${m.textContent}: plane overlaps the "@", the TV pill or the other tricode`);
        }
        const cs = getComputedStyle(m);
        if (m.classList.contains('ck-fm-n2') && cs.backgroundColor !== 'rgb(245, 224, 66)') bad.push(`fill ${cs.backgroundColor}`);
        if (m.classList.contains('ck-fm-n1') && cs.outlineColor !== 'rgb(245, 224, 66)') bad.push(`ring ${cs.outlineColor}`);
        if (m.classList.contains('ck-fm-tif') && !/rgb\((76, 61, 117|124, 77, 204)\)/.test(cs.textDecorationColor)) bad.push(`underline ${cs.textDecorationColor}`);
      }
    }
    return { bad, widths: [...widths], marks };
  }, lineSel);

for (const [name, search] of [
  ['week view, 2 weeks', '?view=league&layout=calendar&date=2027-01-03&weeks=2'],
  ['week view, 1 week', '?view=league&layout=calendar&date=2027-01-03'],
  ['League List', '?view=league&layout=list&date=2027-01-07'],
] as const) {
  test(`${name}: marks take no width, plane clear of "@" / TV / tricodes, colours, tooltip, legend`, async ({ page }, info) => {
    await open(page, search);
    const list = name === 'League List';
    const r = await geometry(page, list ? '[data-testid="league-list"] .ck-card' : '.ck-month-game');
    console.log(`[league-fatigue] ${info.project.name} ${name}: ${r.marks} marks, line widths ${r.widths.join(', ')}`);
    expect(r.marks).toBeGreaterThan(10);
    expect(r.bad).toEqual([]);
    if (name === 'week view, 2 weeks') expect(r.widths).toEqual(['119.00']);
    // tooltip for that team, on hover and on focus
    const tip = page.getByTestId('tooltip');
    const scope = list ? '[data-day="2027-01-07"] ' : '';
    const mark = page.locator(`${scope}.ck-fm-n2`).first();
    await mark.hover();
    await expect(tip).toHaveText((await mark.getAttribute('data-tip'))!.replace(/\n/g, ' '));
    expect(await mark.getAttribute('data-tip')).toMatch(/^[A-Z]{3} — 2\/2 · (HH|HA|AH|AA) \(2nd night of a back-to-back\)\n/);
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.mouse.move(2, 2);
    const plain = page.locator(`${scope}.ck-fm:not(.ck-fm-n1):not(.ck-fm-n2):not(.ck-fm-tif)`).first();
    await plain.focus();
    await expect(tip).toHaveText(/^[A-Z]{3} — rested( Record going in: \d+-\d+)?$/);
    // legend: visible, inside the window, under the grid / list
    const legend = page.getByTestId('fatigue-legend');
    await expect(legend).toHaveText('■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4');
    const lb = (await legend.boundingBox())!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const above = (await page.locator(list ? '[data-testid="league-list"]' : '.ck-week-grid').boundingBox())!;
    expect(lb.y).toBeGreaterThanOrEqual(above.y + above.height - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0);
  });
}
